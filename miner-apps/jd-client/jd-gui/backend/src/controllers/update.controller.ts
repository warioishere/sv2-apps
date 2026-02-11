import { Request, Response } from 'express';
import { updateService } from '../services/update.service';
import { logger } from '../utils/logger';

export class UpdateController {
  // Check for updates
  async checkForUpdates(req: Request, res: Response) {
    try {
      const result = await updateService.checkForUpdates();

      res.json({
        available: result.available,
        current: result.current,
        latest: result.latest,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error checking for updates: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Trigger update
  async performUpdate(req: Request, res: Response) {
    try {
      // Start update in background
      updateService.performUpdate().catch(error => {
        logger.error(`Update failed: ${error.message}`);
      });

      res.json({
        success: true,
        message: 'Update started. Connect to WebSocket /api/update/stream for progress.',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error starting update: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get update status
  async getStatus(req: Request, res: Response) {
    try {
      const status = updateService.getStatus();
      res.json(status);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting update status: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Rollback update
  async rollback(req: Request, res: Response) {
    try {
      const result = await updateService.rollback();

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error rolling back update: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get update history
  async getHistory(req: Request, res: Response) {
    try {
      const history = updateService.getUpdateHistory();
      res.json({ history });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting update history: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const updateController = new UpdateController();
