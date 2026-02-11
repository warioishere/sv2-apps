import { Request, Response } from 'express';
import { processManager } from '../services/process.service';
import { logger } from '../utils/logger';

export class JdcController {
  async start(req: Request, res: Response) {
    try {
      logger.info('Received request to start jd-client');
      const result = await processManager.start();

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'JD-Client started successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error starting jd-client: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async stop(req: Request, res: Response) {
    try {
      logger.info('Received request to stop jd-client');
      const result = await processManager.stop();

      if (result.success) {
        res.json({
          success: true,
          message: 'JD-Client stopped successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error stopping jd-client: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async restart(req: Request, res: Response) {
    try {
      logger.info('Received request to restart jd-client');
      const result = await processManager.restart();

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'JD-Client restarted successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error restarting jd-client: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async getStatus(req: Request, res: Response) {
    try {
      const status = processManager.getStatus();
      res.json(status);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting status: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async getLogs(req: Request, res: Response) {
    try {
      const count = parseInt(req.query.count as string) || 100;
      const logs = processManager.getRecentLogs(count);
      res.json({ logs });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting logs: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
}

export const jdcController = new JdcController();
