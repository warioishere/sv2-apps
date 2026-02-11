import { Request, Response } from 'express';
import { metricsService } from '../services/metrics.service';
import { logger } from '../utils/logger';

export class MetricsController {
  // Get metrics for an instance
  async getInstanceMetrics(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const metricType = req.query.metric_type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;

      const metrics = metricsService.getInstanceMetrics(instanceId, metricType, limit);

      res.json({ metrics });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting metrics: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get metric summary
  async getMetricSummary(req: Request, res: Response) {
    try {
      const { instanceId, metricType } = req.params;
      const sinceStr = req.query.since as string | undefined;

      const since = sinceStr ? new Date(sinceStr) : undefined;
      const summary = metricsService.getMetricSummary(instanceId, metricType, since);

      if (!summary) {
        return res.status(404).json({
          success: false,
          error: 'No metrics found',
        });
      }

      res.json(summary);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting metric summary: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get time series data
  async getTimeSeries(req: Request, res: Response) {
    try {
      const { instanceId, metricType } = req.params;
      const interval = (req.query.interval as 'minute' | 'hour' | 'day') || 'hour';
      const limit = parseInt(req.query.limit as string) || 50;

      const timeSeries = metricsService.getTimeSeries(instanceId, metricType, interval, limit);

      res.json({ timeSeries });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting time series: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get latest metrics
  async getLatestMetrics(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const metrics = metricsService.getLatestMetrics(instanceId);

      res.json({ metrics });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting latest metrics: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get metric types
  async getMetricTypes(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const metricTypes = metricsService.getMetricTypes(instanceId);

      res.json({ metricTypes });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting metric types: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get uptime percentage
  async getUptimePercentage(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;

      const uptime = metricsService.getUptimePercentage(instanceId, hours);

      res.json({ uptime, hours });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting uptime: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const metricsController = new MetricsController();
