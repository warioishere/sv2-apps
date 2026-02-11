import { Request, Response } from 'express';
import { configService } from '../database/config.service';
import { tomlService, ConfigInput } from '../services/toml.service';
import { logger } from '../utils/logger';

export class SavedConfigController {
  // Get all saved configurations
  async getAll(req: Request, res: Response) {
    try {
      const configs = configService.getAllConfigurations();
      res.json({ configurations: configs });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting configurations: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get a specific configuration
  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const config = configService.getConfiguration(id);

      if (!config) {
        return res.status(404).json({ success: false, error: 'Configuration not found' });
      }

      const parsedConfig = configService.parseConfig(config);

      res.json({
        ...config,
        config: parsedConfig,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Save a new configuration
  async save(req: Request, res: Response) {
    try {
      const { name, description, config } = req.body;

      if (!name || !config) {
        return res.status(400).json({
          success: false,
          error: 'name and config are required',
        });
      }

      // Validate config
      const validation = tomlService.validateConfig(config);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors,
        });
      }

      const configId = configService.saveConfiguration(name, config, description);

      res.json({
        success: true,
        config_id: configId,
        message: 'Configuration saved successfully',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error saving configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Update a configuration
  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const { config, description } = req.body;

      if (!config) {
        return res.status(400).json({
          success: false,
          error: 'config is required',
        });
      }

      // Validate config
      const validation = tomlService.validateConfig(config);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors,
        });
      }

      configService.updateConfiguration(id, config, description);

      res.json({
        success: true,
        message: 'Configuration updated successfully',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error updating configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Delete a configuration
  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      configService.deleteConfiguration(id);

      res.json({
        success: true,
        message: 'Configuration deleted successfully',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error deleting configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Set active configuration
  async setActive(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      configService.setActiveConfiguration(id);

      res.json({
        success: true,
        message: 'Active configuration set successfully',
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error setting active configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get active configuration
  async getActive(req: Request, res: Response) {
    try {
      const config = configService.getActiveConfiguration();

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'No active configuration',
        });
      }

      const parsedConfig = configService.parseConfig(config);

      res.json({
        ...config,
        config: parsedConfig,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting active configuration: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const savedConfigController = new SavedConfigController();
