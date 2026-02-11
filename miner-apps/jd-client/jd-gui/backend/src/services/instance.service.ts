import { EventEmitter } from 'events';
import { db } from '../database/schema';
import { JdClientProcessManager, LogEntry } from './process.service';
import { configService } from '../database/config.service';
import { tomlService, ConfigInput } from './toml.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface Instance {
  id: string;
  name: string;
  config_id: number;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  port?: number;
  started_at?: string;
  stopped_at?: string;
  created_at: string;
}

interface InstanceWithProcess extends Instance {
  processManager?: JdClientProcessManager;
}

export interface InstanceStatus {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  config_id: number;
  created_at: string;
  running?: boolean;
  pid?: number;
  uptime?: number;
  startTime?: number;
}

export class InstanceManager extends EventEmitter {
  private instances: Map<string, InstanceWithProcess> = new Map();
  private readonly configBasePath = '/app/config/instances';
  private readonly binaryPath = '/app/jd_client_sv2';

  constructor() {
    super();
    this.ensureConfigDirectory();
    this.loadInstancesFromDatabase();
  }

  private ensureConfigDirectory() {
    if (!fs.existsSync(this.configBasePath)) {
      fs.mkdirSync(this.configBasePath, { recursive: true });
    }
  }

  private loadInstancesFromDatabase() {
    const stmt = db.prepare(`SELECT * FROM instances`);
    const dbInstances = stmt.all() as Instance[];

    for (const instance of dbInstances) {
      this.instances.set(instance.id, instance);
      logger.info(`Loaded instance from DB: ${instance.name} (${instance.id})`);
    }
  }

  // Create a new instance
  createInstance(name: string, configId: number): string {
    // Validate that config exists
    const savedConfig = configService.getConfiguration(configId);
    if (!savedConfig) {
      throw new Error(`Configuration with ID ${configId} not found`);
    }

    // Check if instance name already exists
    const existingByName = this.getInstanceByName(name);
    if (existingByName) {
      throw new Error(`Instance with name "${name}" already exists`);
    }

    const instanceId = uuidv4();

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO instances (id, name, config_id, status, created_at)
      VALUES (?, ?, ?, 'stopped', CURRENT_TIMESTAMP)
    `);

    stmt.run(instanceId, name, configId);

    const instance: InstanceWithProcess = {
      id: instanceId,
      name,
      config_id: configId,
      status: 'stopped',
      created_at: new Date().toISOString(),
    };

    this.instances.set(instanceId, instance);
    logger.info(`Instance created: ${name} (${instanceId})`);

    return instanceId;
  }

  // Start an instance
  async startInstance(instanceId: string): Promise<{ success: boolean; pid?: number; error?: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    if (instance.processManager?.isRunning()) {
      return { success: false, error: 'Instance already running' };
    }

    // Load configuration
    const savedConfig = configService.getConfiguration(instance.config_id);
    if (!savedConfig) {
      return { success: false, error: 'Configuration not found' };
    }

    const config = configService.parseConfig(savedConfig);

    // Generate TOML file for this instance
    const toml = tomlService.generateToml(config);
    const configPath = path.join(this.configBasePath, `${instanceId}.toml`);
    fs.writeFileSync(configPath, toml, 'utf8');

    // Create process manager for this instance
    const processManager = new JdClientProcessManager(this.binaryPath, configPath);

    // Forward logs to instance-specific handler
    processManager.on('log', (logEntry) => {
      this.emit('instance-log', { instanceId, ...logEntry });
      this.recordMetric(instanceId, 'log_count', 1);
    });

    processManager.on('exit', (info) => {
      this.emit('instance-exit', { instanceId, ...info });
      this.updateInstanceStatus(instanceId, 'stopped');
    });

    processManager.on('error', (error) => {
      this.emit('instance-error', { instanceId, error });
      this.updateInstanceStatus(instanceId, 'error');
    });

    // Start the process
    const result = await processManager.start();

    if (result.success) {
      instance.processManager = processManager;
      instance.status = 'running';
      instance.pid = result.pid;

      // Update database
      db.prepare(`
        UPDATE instances
        SET status = 'running', pid = ?, started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(result.pid, instanceId);

      logger.info(`Instance started: ${instance.name} (PID: ${result.pid})`);
    }

    return result;
  }

  // Stop an instance
  async stopInstance(instanceId: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: 'Instance not found' };
    }

    if (!instance.processManager) {
      return { success: false, error: 'Instance not running' };
    }

    const result = await instance.processManager.stop();

    if (result.success) {
      instance.status = 'stopped';
      instance.processManager = undefined;
      instance.pid = undefined;

      // Update database
      db.prepare(`
        UPDATE instances
        SET status = 'stopped', pid = NULL, stopped_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(instanceId);

      logger.info(`Instance stopped: ${instance.name}`);
    }

    return result;
  }

  // Restart an instance
  async restartInstance(instanceId: string): Promise<{ success: boolean; pid?: number; error?: string }> {
    const stopResult = await this.stopInstance(instanceId);
    if (!stopResult.success) {
      return { success: false, error: stopResult.error };
    }

    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));

    return this.startInstance(instanceId);
  }

  // Delete an instance
  async deleteInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    // Stop if running
    if (instance.processManager?.isRunning()) {
      await this.stopInstance(instanceId);
    }

    // Delete config file
    const configPath = path.join(this.configBasePath, `${instanceId}.toml`);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    // Delete from database
    db.prepare(`DELETE FROM instances WHERE id = ?`).run(instanceId);

    // Remove from memory
    this.instances.delete(instanceId);

    logger.info(`Instance deleted: ${instance.name}`);
  }

  // Get instance status
  getInstanceStatus(instanceId: string): InstanceStatus | null {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return null;
    }

    const baseStatus: InstanceStatus = {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      config_id: instance.config_id,
      created_at: instance.created_at,
    };

    if (instance.processManager) {
      const processStatus = instance.processManager.getStatus();
      return {
        ...baseStatus,
        ...processStatus,
      };
    }

    return baseStatus;
  }

  // Get all instances
  getAllInstances(): (InstanceStatus | null)[] {
    return Array.from(this.instances.values()).map(instance => this.getInstanceStatus(instance.id));
  }

  // Get instance by name
  getInstanceByName(name: string): Instance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.name === name) {
        return instance;
      }
    }
    return undefined;
  }

  // Get logs for an instance
  getInstanceLogs(instanceId: string, count: number = 100): LogEntry[] {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.processManager) {
      return [];
    }

    return instance.processManager.getRecentLogs(count);
  }

  // Update instance status in DB
  private updateInstanceStatus(instanceId: string, status: 'running' | 'stopped' | 'error') {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = status;

      db.prepare(`
        UPDATE instances SET status = ? WHERE id = ?
      `).run(status, instanceId);
    }
  }

  // Record metric
  private recordMetric(instanceId: string, metricType: string, value: number) {
    db.prepare(`
      INSERT INTO metrics (instance_id, metric_type, value)
      VALUES (?, ?, ?)
    `).run(instanceId, metricType, value);
  }

  // Stop all instances (for graceful shutdown)
  async stopAllInstances() {
    const stopPromises = Array.from(this.instances.keys()).map(id => this.stopInstance(id));
    await Promise.all(stopPromises);
  }
}

export const instanceManager = new InstanceManager();
