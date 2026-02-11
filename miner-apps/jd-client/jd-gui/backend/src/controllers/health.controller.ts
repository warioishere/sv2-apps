import { Request, Response } from 'express';
import { healthService } from '../health/health.service';
import { logger } from '../utils/logger';

export class HealthController {
  // Run health checks for an instance
  async checkInstance(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const results = await healthService.checkInstance(instanceId);

      res.json({ results });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error checking instance health: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get health check history
  async getHistory(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const history = healthService.getHealthHistory(instanceId, limit);

      res.json({ history });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting health history: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get latest health status
  async getLatestStatus(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const status = healthService.getLatestHealthStatus(instanceId);

      res.json({ status });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting latest health status: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get overall health score
  async getHealthScore(req: Request, res: Response) {
    try {
      const { instanceId } = req.params;
      const score = healthService.getOverallHealthScore(instanceId);

      res.json({ score });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting health score: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const healthController = new HealthController();
