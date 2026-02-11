import { db } from '../database/schema';
import { instanceManager, InstanceStatus } from '../services/instance.service';
import { logger } from '../utils/logger';
import cron from 'node-cron';

export interface HealthCheckResult {
  check_type: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  message: string;
  timestamp: string;
}

export class HealthCheckService {
  private cronJob: cron.ScheduledTask | null = null;

  // Start periodic health checks (every 5 minutes)
  startPeriodicChecks() {
    if (this.cronJob) {
      logger.warn('Health checks already running');
      return;
    }

    this.cronJob = cron.schedule('*/5 * * * *', () => {
      this.runAllHealthChecks();
    });

    logger.info('Health check service started (runs every 5 minutes)');
  }

  // Stop periodic health checks
  stopPeriodicChecks() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Health check service stopped');
    }
  }

  // Run health checks for all running instances
  async runAllHealthChecks() {
    const instances = instanceManager.getAllInstances();
    const runningInstances = instances.filter(i => i !== null && i.status === 'running');

    logger.info(`Running health checks for ${runningInstances.length} instance(s)`);

    for (const instance of runningInstances) {
      if (instance && instance.id) {
        await this.checkInstance(instance.id);
      }
    }
  }

  // Check a specific instance
  async checkInstance(instanceId: string): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    // Check 1: Process is running
    const processCheck = this.checkProcessHealth(instanceId);
    results.push(processCheck);
    this.recordHealthCheck(instanceId, processCheck);

    // Check 2: No recent errors in logs
    const logCheck = this.checkLogHealth(instanceId);
    results.push(logCheck);
    this.recordHealthCheck(instanceId, logCheck);

    // Check 3: Memory usage (if available)
    const memoryCheck = await this.checkMemoryUsage(instanceId);
    if (memoryCheck) {
      results.push(memoryCheck);
      this.recordHealthCheck(instanceId, memoryCheck);
    }

    return results;
  }

  // Check if process is running
  private checkProcessHealth(instanceId: string): HealthCheckResult {
    const status = instanceManager.getInstanceStatus(instanceId);

    if (!status) {
      return {
        check_type: 'process',
        status: 'unhealthy',
        message: 'Instance not found',
        timestamp: new Date().toISOString(),
      };
    }

    if (status.status === 'running' && status.pid) {
      return {
        check_type: 'process',
        status: 'healthy',
        message: `Process running with PID ${status.pid}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      check_type: 'process',
      status: 'unhealthy',
      message: 'Process not running',
      timestamp: new Date().toISOString(),
    };
  }

  // Check recent logs for errors
  private checkLogHealth(instanceId: string): HealthCheckResult {
    const logs = instanceManager.getInstanceLogs(instanceId, 50);

    const errorCount = logs.filter(log => log.level === 'error').length;
    const warnCount = logs.filter(log => log.level === 'warn').length;

    if (errorCount > 10) {
      return {
        check_type: 'logs',
        status: 'unhealthy',
        message: `High error count: ${errorCount} errors in recent logs`,
        timestamp: new Date().toISOString(),
      };
    }

    if (errorCount > 5 || warnCount > 20) {
      return {
        check_type: 'logs',
        status: 'warning',
        message: `${errorCount} errors, ${warnCount} warnings in recent logs`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      check_type: 'logs',
      status: 'healthy',
      message: 'No concerning log patterns',
      timestamp: new Date().toISOString(),
    };
  }

  // Check memory usage (if monitoring endpoint is available)
  private async checkMemoryUsage(instanceId: string): Promise<HealthCheckResult | null> {
    // This would require parsing jd-client monitoring data
    // For now, we'll return null (not implemented)
    // In production, you'd fetch from the monitoring endpoint
    return null;
  }

  // Record health check result in database
  private recordHealthCheck(instanceId: string, result: HealthCheckResult): void {
    const stmt = db.prepare(`
      INSERT INTO health_checks (instance_id, check_type, status, message)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(instanceId, result.check_type, result.status, result.message);
  }

  // Get health check history
  getHealthHistory(instanceId: string, limit: number = 50): HealthCheckResult[] {
    const stmt = db.prepare(`
      SELECT check_type, status, message, timestamp
      FROM health_checks
      WHERE instance_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(instanceId, limit) as HealthCheckResult[];
  }

  // Get latest health status
  getLatestHealthStatus(instanceId: string): Record<string, HealthCheckResult> {
    const stmt = db.prepare(`
      SELECT
        check_type,
        status,
        message,
        MAX(timestamp) as timestamp
      FROM health_checks
      WHERE instance_id = ?
      GROUP BY check_type
    `);

    const results = stmt.all(instanceId) as HealthCheckResult[];

    const statusMap: Record<string, HealthCheckResult> = {};
    for (const result of results) {
      statusMap[result.check_type] = result;
    }

    return statusMap;
  }

  // Clean up old health checks (keep last 7 days)
  cleanupOldHealthChecks(daysToKeep: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const stmt = db.prepare(`
      DELETE FROM health_checks
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old health check records`);
    }

    return deletedCount;
  }

  // Get overall health score (0-100)
  getOverallHealthScore(instanceId: string): number {
    const latestChecks = this.getLatestHealthStatus(instanceId);
    const checkTypes = Object.keys(latestChecks);

    if (checkTypes.length === 0) {
      return 0;
    }

    let score = 0;
    for (const checkType of checkTypes) {
      const check = latestChecks[checkType];
      if (check.status === 'healthy') {
        score += 100;
      } else if (check.status === 'warning') {
        score += 50;
      }
      // unhealthy = 0 points
    }

    return Math.round(score / checkTypes.length);
  }
}

export const healthService = new HealthCheckService();
