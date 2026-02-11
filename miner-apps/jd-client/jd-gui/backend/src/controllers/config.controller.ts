import { Request, Response } from 'express';
import { tomlService } from '../services/toml.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigController {
  async validate(req: Request, res: Response) {
    try {
      const config = req.body;
      const validation = tomlService.validateConfig(config);

      if (validation.valid) {
        const tomlPreview = tomlService.generateToml(config);
        res.json({
          valid: true,
          toml: tomlPreview
        });
      } else {
        res.status(400).json({
          valid: false,
          errors: validation.errors
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error validating config: ${err.message}`);
      res.status(500).json({
        valid: false,
        errors: [err.message]
      });
    }
  }

  async save(req: Request, res: Response) {
    try {
      const config = req.body;
      const validation = tomlService.validateConfig(config);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      const toml = tomlService.generateToml(config);
      const configPath = '/app/config/jdc.toml';
      const configDir = path.dirname(configPath);

      // Ensure config directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write config file
      fs.writeFileSync(configPath, toml, 'utf8');
      logger.info(`Config saved to ${configPath}`);

      res.json({
        success: true,
        message: 'Configuration saved successfully',
        path: configPath
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error saving config: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async load(req: Request, res: Response) {
    try {
      const configPath = '/app/config/jdc.toml';

      if (!fs.existsSync(configPath)) {
        return res.status(404).json({
          success: false,
          error: 'Configuration file not found'
        });
      }

      const toml = fs.readFileSync(configPath, 'utf8');
      res.json({
        success: true,
        toml
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error loading config: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
}

export const configController = new ConfigController();
