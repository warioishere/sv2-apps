import { Request, Response } from 'express';
import { tomlService } from '../services/toml.service';
import { configService } from '../database/config.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration Controller
 *
 * Manages JD-Client configuration with dual persistence:
 * 1. File System: /app/config/jdc.toml (for JD-Client process to read)
 * 2. SQLite Database: configurations table (for persistence across restarts)
 *
 * On startup, active configuration is restored from database to file system.
 */
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

      // Save to database for persistence
      try {
        const configName = config.user_identity || `config_${Date.now()}`;
        const description = `Auto-saved configuration from wizard/UI`;

        // Check if config with this name exists
        const existing = configService.getConfigurationByName(configName);

        if (existing) {
          // Update existing
          configService.updateConfiguration(existing.id, config, description);
          configService.setActiveConfiguration(existing.id);
          logger.info(`Config updated in database: ${configName} (ID: ${existing.id})`);
        } else {
          // Create new
          const configId = configService.saveConfiguration(configName, config, description);
          configService.setActiveConfiguration(configId);
          logger.info(`Config saved to database: ${configName} (ID: ${configId})`);
        }
      } catch (dbError) {
        const err = dbError as Error;
        logger.error(`Failed to save config to database: ${err.message}`);
        // Continue anyway - file was saved successfully
      }

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

  // Restore active configuration from database to file on startup
  restoreFromDatabase(): void {
    try {
      const activeConfig = configService.getActiveConfiguration();

      if (!activeConfig) {
        logger.info('No active configuration in database to restore');
        return;
      }

      const config = configService.parseConfig(activeConfig);
      const validation = tomlService.validateConfig(config);

      if (!validation.valid) {
        logger.warn(`Active config in database is invalid: ${validation.errors.join(', ')}`);
        return;
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
      logger.info(`Configuration restored from database: ${activeConfig.name} (ID: ${activeConfig.id})`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to restore configuration from database: ${err.message}`);
    }
  }
}

export const configController = new ConfigController();
