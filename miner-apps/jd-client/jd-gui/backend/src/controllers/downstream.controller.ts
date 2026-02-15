import { Request, Response } from 'express';
import { downstreamTracker } from '../services/downstream-tracker.service';

export class DownstreamController {
  async getMiners(req: Request, res: Response) {
    try {
      const miners = downstreamTracker.getConnectedMiners();
      res.json({ miners, count: miners.length });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
}

export const downstreamController = new DownstreamController();
