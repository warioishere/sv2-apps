import { Request, Response } from 'express';
import { monitoringService } from '../services/monitoring.service';

export class MonitoringController {
  async getDashboard(req: Request, res: Response) {
    try {
      const dashboard = monitoringService.getDashboard();
      res.json(dashboard);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }

  async getMiners(req: Request, res: Response) {
    try {
      const miners = monitoringService.getEnrichedMiners();
      res.json({ miners, count: miners.length });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }

  async getGlobalHashrate(req: Request, res: Response) {
    try {
      const history = monitoringService.getGlobalHashrateHistory();
      res.json({ history });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }

  async getMinerHashrate(req: Request, res: Response) {
    try {
      const { userIdentity } = req.params;
      const history = monitoringService.getMinerHashrateHistory(userIdentity);
      res.json({ history });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
}

export const monitoringController = new MonitoringController();
