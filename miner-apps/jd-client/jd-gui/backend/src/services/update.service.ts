import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { db } from '../database/schema';

interface UpdateStatus {
  inProgress: boolean;
  stage: 'idle' | 'checking' | 'pulling' | 'building' | 'restarting' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  currentVersion?: string;
  availableVersion?: string;
}

export class UpdateService extends EventEmitter {
  private status: UpdateStatus = {
    inProgress: false,
    stage: 'idle',
    progress: 0,
    message: 'Ready to check for updates',
  };

  private readonly repoPath = process.env.SV2_APPS_PATH || '/repo';
  private readonly guiPath = path.join(this.repoPath, 'miner-apps/jd-client/jd-gui');
  private readonly backupPath = '/app/backups';

  constructor() {
    super();
    this.ensureBackupDirectory();
  }

  private ensureBackupDirectory() {
    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  // Check if updates are available
  async checkForUpdates(): Promise<{ available: boolean; current: string; latest: string }> {
    try {
      this.updateStatus('checking', 10, 'Checking for updates...');

      // Verify repository exists
      if (!fs.existsSync(path.join(this.repoPath, '.git'))) {
        throw new Error(`Repository not found at ${this.repoPath}. Please ensure the repo is cloned.`);
      }

      // Get current commit hash
      const currentHash = await this.execCommand('git', ['rev-parse', '--short', 'HEAD'], this.repoPath);

      // Fetch latest from remote
      await this.execCommand('git', ['fetch', 'origin', 'main'], this.repoPath);

      // Get latest remote commit hash
      const latestHash = await this.execCommand('git', ['rev-parse', '--short', 'origin/main'], this.repoPath);

      const available = currentHash.trim() !== latestHash.trim();

      this.status.currentVersion = currentHash.trim();
      this.status.availableVersion = latestHash.trim();
      this.updateStatus('idle', 0, available ? 'Update available' : 'Already up to date');

      return {
        available,
        current: currentHash.trim(),
        latest: latestHash.trim(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to check for updates: ${err.message}`);
      this.updateStatus('error', 0, `Failed to check for updates: ${err.message}`);
      throw error;
    }
  }

  // Trigger full update process
  async performUpdate(): Promise<void> {
    if (this.status.inProgress) {
      throw new Error('Update already in progress');
    }

    this.status.inProgress = true;

    try {
      // Stage 1: Git pull
      this.updateStatus('pulling', 20, 'Pulling latest code from repository...');
      await this.gitPull();

      // Stage 2: Backup current binary
      this.updateStatus('building', 40, 'Backing up current binary...');
      await this.backupBinary();

      // Stage 3: Docker rebuild
      this.updateStatus('building', 50, 'Building new Docker image (this may take several minutes)...');
      await this.dockerRebuild();

      // Stage 4: Restart container
      this.updateStatus('restarting', 90, 'Restarting container with new version...');
      await this.restartContainer();

      // Save update record
      this.recordUpdate();

      // Complete
      this.updateStatus('complete', 100, 'Update completed successfully! Restarting...');

      // The container will restart and this process will be killed
      setTimeout(() => {
        process.exit(0); // Graceful exit to allow container restart
      }, 2000);

    } catch (error) {
      const err = error as Error;
      logger.error(`Update failed: ${err.message}`);
      this.updateStatus('error', 0, `Update failed: ${err.message}`);
      this.status.inProgress = false;
      throw error;
    }
  }

  private async gitPull(): Promise<void> {
    logger.info('Pulling latest code from git...');
    const output = await this.execCommand('git', ['pull', 'origin', 'main'], this.repoPath);
    logger.info(`Git pull output: ${output}`);
    this.emit('update-log', `Git: ${output}`);
  }

  private async backupBinary(): Promise<void> {
    const binaryPath = '/app/jd_client_sv2';
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupFile = path.join(this.backupPath, `jd_client_sv2_${timestamp}.backup`);

    if (fs.existsSync(binaryPath)) {
      fs.copyFileSync(binaryPath, backupFile);
      logger.info(`Binary backed up to ${backupFile}`);
      this.emit('update-log', `Backup created: ${backupFile}`);
    }
  }

  private async dockerRebuild(): Promise<void> {
    logger.info('Starting Docker rebuild...');
    this.emit('update-log', 'Starting Docker build...');

    return new Promise((resolve, reject) => {
      const buildProcess = spawn('docker', ['compose', 'build', '--no-cache'], {
        cwd: this.guiPath,
        env: process.env,
      });

      let output = '';

      buildProcess.stdout?.on('data', (data) => {
        const message = data.toString();
        output += message;
        logger.info(`[BUILD] ${message.trim()}`);
        this.emit('update-log', message);

        // Update progress based on build stages
        if (message.includes('Step')) {
          const match = message.match(/Step (\d+)\/(\d+)/);
          if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            const progress = 50 + Math.floor((current / total) * 40); // 50-90%
            this.updateStatus('building', progress, `Building: Step ${current}/${total}`);
          }
        }
      });

      buildProcess.stderr?.on('data', (data) => {
        const message = data.toString();
        output += message;
        logger.info(`[BUILD] ${message.trim()}`);
        this.emit('update-log', message);
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('Docker build completed successfully');
          this.emit('update-log', '✅ Build completed successfully');
          resolve();
        } else {
          const error = `Docker build failed with code ${code}`;
          logger.error(error);
          this.emit('update-log', `❌ ${error}`);
          reject(new Error(error));
        }
      });

      buildProcess.on('error', (error) => {
        logger.error(`Build process error: ${error.message}`);
        this.emit('update-log', `❌ Error: ${error.message}`);
        reject(error);
      });
    });
  }

  private async restartContainer(): Promise<void> {
    logger.info('Restarting container...');
    this.emit('update-log', 'Restarting container...');
    await this.execCommand('docker', ['compose', 'up', '-d', '--force-recreate'], this.guiPath);
  }

  private recordUpdate(): void {
    if (this.status.availableVersion) {
      try {
        db.prepare(`
          INSERT INTO updates (version, installed, installed_at, changelog)
          VALUES (?, 1, CURRENT_TIMESTAMP, ?)
        `).run(this.status.availableVersion, 'Automated update via GUI');
      } catch (error) {
        logger.error(`Failed to record update: ${(error as Error).message}`);
      }
    }
  }

  // Rollback to previous backup
  async rollback(): Promise<{ success: boolean; message: string }> {
    try {
      const backups = fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith('jd_client_sv2_') && f.endsWith('.backup'))
        .sort()
        .reverse();

      if (backups.length === 0) {
        return { success: false, message: 'No backup found' };
      }

      const latestBackup = path.join(this.backupPath, backups[0]);
      const binaryPath = '/app/jd_client_sv2';

      fs.copyFileSync(latestBackup, binaryPath);
      logger.info(`Rolled back to backup: ${backups[0]}`);

      return {
        success: true,
        message: `Rolled back to ${backups[0]}. Please restart jd-client.`,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to rollback: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  private async execCommand(command: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd });
      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${errorOutput}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  private updateStatus(stage: UpdateStatus['stage'], progress: number, message: string): void {
    this.status.stage = stage;
    this.status.progress = progress;
    this.status.message = message;
    this.emit('status-update', this.status);
    logger.info(`Update status: [${stage}] ${progress}% - ${message}`);
  }

  // Get update history
  getUpdateHistory(): any[] {
    try {
      return db.prepare(`
        SELECT * FROM updates ORDER BY created_at DESC LIMIT 10
      `).all();
    } catch (error) {
      return [];
    }
  }
}

export const updateService = new UpdateService();
