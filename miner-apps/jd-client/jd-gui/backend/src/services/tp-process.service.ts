import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

interface ProcessStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  startTime?: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export class TpProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private logBuffer: LogEntry[] = [];
  private readonly maxLogLines = 1000;
  private startTime: number | null = null;
  private readonly binaryPath: string;
  private readonly configPath: string;

  constructor(binaryPath: string = '/app/sv2-tp', configPath: string = '/app/config/sv2-tp/sv2-tp.conf') {
    super();
    this.binaryPath = binaryPath;
    this.configPath = configPath;
  }

  start(): Promise<{ success: boolean; pid?: number; error?: string }> {
    return new Promise((resolve) => {
      if (this.process) {
        resolve({ success: false, error: 'Process already running' });
        return;
      }

      // Check if config exists
      if (!fs.existsSync(this.configPath)) {
        resolve({ success: false, error: 'Configuration file not found' });
        return;
      }

      // sv2-tp writes multiple files to datadir (debug log, PID file, key files).
      // The Bitcoin Core IPC volume is mounted read-only, so we create a writable
      // datadir with a symlink to the actual node.sock IPC socket.
      let configContent = '';
      try {
        configContent = fs.readFileSync(this.configPath, 'utf-8');
      } catch (e) {
        // ignore
      }
      const datadirMatch = configContent.match(/^datadir=(.+)$/m);
      const realDatadir = datadirMatch ? datadirMatch[1].trim() : '/bitcoin-ipc-mainnet';
      const writableDatadir = '/app/data/sv2-tp/datadir';

      // Detect which network from config (testnet4=1, signet=1, regtest=1, or mainnet default)
      const isTestnet4 = /^testnet4=1$/m.test(configContent);
      const isSignet = /^signet=1$/m.test(configContent);
      const isRegtest = /^regtest=1$/m.test(configContent);
      const chainSubdir = isTestnet4 ? 'testnet4' : isSignet ? 'signet' : isRegtest ? 'regtest' : '';

      try {
        if (!fs.existsSync(writableDatadir)) {
          fs.mkdirSync(writableDatadir, { recursive: true });
        }

        // sv2-tp uses datadir/<chain>/ as working dir for non-mainnet chains
        // Symlink node.sock in the directory sv2-tp will actually use
        const socketDir = chainSubdir ? path.join(writableDatadir, chainSubdir) : writableDatadir;
        if (!fs.existsSync(socketDir)) {
          fs.mkdirSync(socketDir, { recursive: true });
        }

        const symlinkPath = path.join(socketDir, 'node.sock');
        const realSocket = path.join(realDatadir, 'node.sock');
        if (fs.existsSync(realSocket)) {
          try { fs.unlinkSync(symlinkPath); } catch (_) { /* doesn't exist */ }
          fs.symlinkSync(realSocket, symlinkPath);
          logger.info(`Symlinked ${symlinkPath} -> ${realSocket}`);
        }

        // Also symlink at root for mainnet compatibility (remove stale if switching)
        if (chainSubdir) {
          const rootSymlink = path.join(writableDatadir, 'node.sock');
          try { fs.unlinkSync(rootSymlink); } catch (_) { /* doesn't exist */ }
        }
      } catch (e) {
        logger.warn(`Writable datadir setup: ${(e as Error).message}`);
      }

      const args = [
        `-conf=${this.configPath}`,
        '-printtoconsole',
        `-datadir=${writableDatadir}`,
      ];

      logger.info(`Starting sv2-tp: ${this.binaryPath} ${args.join(' ')}`);

      try {
        this.process = spawn(this.binaryPath, args, {
          cwd: '/app',
          env: {
            ...process.env,
          },
        });

        this.startTime = Date.now();

        this.process.stdout?.on('data', (data) => {
          this.handleLogData(data.toString(), 'info');
        });

        this.process.stderr?.on('data', (data) => {
          this.handleLogData(data.toString(), 'error');
        });

        this.process.on('error', (err) => {
          logger.error(`Process error: ${err.message}`);
          this.emit('error', err);
        });

        this.process.on('exit', (code, signal) => {
          logger.info(`Process exited with code ${code}, signal ${signal}`);
          this.emit('exit', { code, signal });
          this.cleanup();
        });

        // Wait a bit to ensure process started successfully
        setTimeout(() => {
          if (this.process && this.process.pid) {
            resolve({ success: true, pid: this.process.pid });
          } else {
            resolve({ success: false, error: 'Process failed to start' });
          }
        }, 500);
      } catch (err) {
        const error = err as Error;
        logger.error(`Failed to start process: ${error.message}`);
        resolve({ success: false, error: error.message });
      }
    });
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.process) {
      return { success: false, error: 'Process not running' };
    }

    return new Promise((resolve) => {
      const pid = this.process!.pid;
      logger.info(`Stopping sv2-tp (PID: ${pid})`);

      // Graceful shutdown with SIGINT
      this.process!.kill('SIGINT');

      const timeout = setTimeout(() => {
        if (this.process) {
          logger.warn('Graceful shutdown timeout, sending SIGKILL');
          this.process.kill('SIGKILL');
        }
      }, 10000);

      const exitHandler = () => {
        clearTimeout(timeout);
        resolve({ success: true });
      };

      this.process!.once('exit', exitHandler);
    });
  }

  async restart(): Promise<{ success: boolean; pid?: number; error?: string }> {
    if (this.isRunning()) {
      const stopResult = await this.stop();
      if (!stopResult.success) {
        return { success: false, error: stopResult.error };
      }
      // Wait for process to fully stop
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return this.start();
  }

  isRunning(): boolean {
    return this.process !== null && this.process.pid !== undefined;
  }

  getStatus(): ProcessStatus {
    if (!this.isRunning()) {
      return { running: false };
    }

    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    return {
      running: true,
      pid: this.process!.pid,
      uptime: Math.floor(uptime / 1000),
      startTime: this.startTime || undefined,
    };
  }

  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  private handleLogData(data: string, defaultLevel: string = 'info') {
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const level = this.parseLogLevel(line) || defaultLevel;
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: line,
      };

      this.logBuffer.push(logEntry);

      // Maintain circular buffer
      if (this.logBuffer.length > this.maxLogLines) {
        this.logBuffer.shift();
      }

      this.emit('log', logEntry);
      logger.info(`[TP] ${line}`);
    }
  }

  private parseLogLevel(line: string): string | null {
    // Parse tracing format: "2024-01-01T12:00:00.000Z INFO ..."
    const tracingMatch = line.match(/\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+/i);
    if (tracingMatch) {
      return tracingMatch[1].toLowerCase();
    }

    // Parse other common formats
    if (line.toLowerCase().includes('error')) return 'error';
    if (line.toLowerCase().includes('warn')) return 'warn';
    if (line.toLowerCase().includes('debug')) return 'debug';

    return null;
  }

  private cleanup() {
    this.process = null;
    this.startTime = null;
  }
}

// Singleton instance
export const tpProcessManager = new TpProcessManager();
