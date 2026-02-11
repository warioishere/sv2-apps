import { db } from '../database/schema';
import { logger } from '../utils/logger';

export interface MetricData {
  id: number;
  instance_id: string;
  metric_type: string;
  value: number;
  timestamp: string;
}

export interface MetricSummary {
  metric_type: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export interface TimeSeriesData {
  timestamp: string;
  value: number;
}

export class MetricsService {
  // Record a metric
  recordMetric(instanceId: string, metricType: string, value: number): void {
    const stmt = db.prepare(`
      INSERT INTO metrics (instance_id, metric_type, value)
      VALUES (?, ?, ?)
    `);

    stmt.run(instanceId, metricType, value);
  }

  // Get metrics for an instance
  getInstanceMetrics(instanceId: string, metricType?: string, limit: number = 100): MetricData[] {
    let query = `
      SELECT * FROM metrics
      WHERE instance_id = ?
    `;

    const params: any[] = [instanceId];

    if (metricType) {
      query += ` AND metric_type = ?`;
      params.push(metricType);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const stmt = db.prepare(query);
    return stmt.all(...params) as MetricData[];
  }

  // Get metric summary for an instance
  getMetricSummary(instanceId: string, metricType: string, since?: Date): MetricSummary | null {
    let query = `
      SELECT
        metric_type,
        COUNT(*) as count,
        SUM(value) as sum,
        AVG(value) as avg,
        MIN(value) as min,
        MAX(value) as max
      FROM metrics
      WHERE instance_id = ? AND metric_type = ?
    `;

    const params: any[] = [instanceId, metricType];

    if (since) {
      query += ` AND timestamp >= ?`;
      params.push(since.toISOString());
    }

    query += ` GROUP BY metric_type`;

    const stmt = db.prepare(query);
    return stmt.get(...params) as MetricSummary | null;
  }

  // Get time series data for charting
  getTimeSeries(
    instanceId: string,
    metricType: string,
    interval: 'minute' | 'hour' | 'day',
    limit: number = 50
  ): TimeSeriesData[] {
    let groupBy: string;

    switch (interval) {
      case 'minute':
        groupBy = `strftime('%Y-%m-%d %H:%M', timestamp)`;
        break;
      case 'hour':
        groupBy = `strftime('%Y-%m-%d %H', timestamp)`;
        break;
      case 'day':
        groupBy = `strftime('%Y-%m-%d', timestamp)`;
        break;
    }

    const query = `
      SELECT
        ${groupBy} as timestamp,
        AVG(value) as value
      FROM metrics
      WHERE instance_id = ? AND metric_type = ?
      GROUP BY ${groupBy}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const stmt = db.prepare(query);
    const results = stmt.all(instanceId, metricType, limit) as TimeSeriesData[];

    return results.reverse(); // Oldest first for charts
  }

  // Get all metric types for an instance
  getMetricTypes(instanceId: string): string[] {
    const stmt = db.prepare(`
      SELECT DISTINCT metric_type
      FROM metrics
      WHERE instance_id = ?
      ORDER BY metric_type
    `);

    const results = stmt.all(instanceId) as { metric_type: string }[];
    return results.map(r => r.metric_type);
  }

  // Clean up old metrics (keep last 7 days)
  cleanupOldMetrics(daysToKeep: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const stmt = db.prepare(`
      DELETE FROM metrics
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old metric records`);
    }

    return deletedCount;
  }

  // Get latest metrics for dashboard
  getLatestMetrics(instanceId: string): Record<string, number> {
    const stmt = db.prepare(`
      SELECT
        metric_type,
        value,
        MAX(timestamp) as latest_timestamp
      FROM metrics
      WHERE instance_id = ?
      GROUP BY metric_type
    `);

    const results = stmt.all(instanceId) as { metric_type: string; value: number }[];

    const metrics: Record<string, number> = {};
    for (const row of results) {
      metrics[row.metric_type] = row.value;
    }

    return metrics;
  }

  // Calculate uptime percentage
  getUptimePercentage(instanceId: string, hours: number = 24): number {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    // Get health check data
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_checks
      FROM health_checks
      WHERE instance_id = ? AND timestamp >= ?
    `);

    const result = stmt.get(instanceId, since.toISOString()) as {
      total_checks: number;
      healthy_checks: number;
    };

    if (result.total_checks === 0) {
      return 0;
    }

    return (result.healthy_checks / result.total_checks) * 100;
  }
}

export const metricsService = new MetricsService();
