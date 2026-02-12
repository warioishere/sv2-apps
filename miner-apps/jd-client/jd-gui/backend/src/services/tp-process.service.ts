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

      // sv2-tp tries to write sv2-debug.log in datadir, which may be read-only.
      // We always redirect to a writable location to avoid StartLogging failures.
      const writableLogDir = '/app/data/sv2-tp';
      const writableLogFile = path.join(writableLogDir, 'sv2-debug.log');
      try {
        if (!fs.existsSync(writableLogDir)) {
          fs.mkdirSync(writableLogDir, { recursive: true });
        }
        // Pre-create the log file so sv2-tp's fopen("a") succeeds
        fs.writeFileSync(writableLogFile, '', { flag: 'a' });
      } catch (e) {
        logger.warn(`Could not create writable log dir: ${(e as Error).message}`);
      }

      const args = [
        `-conf=${this.configPath}`,
        '-printtoconsole',
        `-debuglogfile=${writableLogFile}`,
        `-pid=${writableLogDir}/sv2-tp.pid`,
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
