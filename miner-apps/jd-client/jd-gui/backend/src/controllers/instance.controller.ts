import { Request, Response } from 'express';
import { instanceManager } from '../services/instance.service';
import { logger } from '../utils/logger';

export class InstanceController {
  // Get all instances
  async getAllInstances(req: Request, res: Response) {
    try {
      const instances = instanceManager.getAllInstances();
      res.json({ instances });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting instances: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get instance status
  async getInstanceStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const status = instanceManager.getInstanceStatus(id);

      if (!status) {
        return res.status(404).json({ success: false, error: 'Instance not found' });
      }

      res.json(status);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting instance status: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Create instance
  async createInstance(req: Request, res: Response) {
    try {
      const { name, config_id } = req.body;

      if (!name || !config_id) {
        return res.status(400).json({
          success: false,
          error: 'name and config_id are required',
        });
      }

      const instanceId = instanceManager.createInstance(name, config_id);

      res.json({
        success: true,
        instance_id: instanceId,
        message: 'Instance created successfully',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error creating instance: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Start instance
  async startInstance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await instanceManager.startInstance(id);

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'Instance started successfully',
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error starting instance: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stop instance
  async stopInstance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await instanceManager.stopInstance(id);

      if (result.success) {
        res.json({ success: true, message: 'Instance stopped successfully' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error stopping instance: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Restart instance
  async restartInstance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await instanceManager.restartInstance(id);

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'Instance restarted successfully',
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error restarting instance: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Delete instance
  async deleteInstance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await instanceManager.deleteInstance(id);

      res.json({ success: true, message: 'Instance deleted successfully' });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error deleting instance: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get instance logs
  async getInstanceLogs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const count = parseInt(req.query.count as string) || 100;

      const logs = instanceManager.getInstanceLogs(id, count);
      res.json({ logs });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting instance logs: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const instanceController = new InstanceController();
