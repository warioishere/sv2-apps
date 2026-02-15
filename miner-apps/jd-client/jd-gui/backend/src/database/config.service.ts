import { db } from './schema';
import { ConfigInput } from '../services/toml.service';
import { logger } from '../utils/logger';

interface SavedConfiguration {
  id: number;
  name: string;
  description?: string;
  config_json: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class ConfigurationService {
  // Save a new configuration
  saveConfiguration(name: string, config: ConfigInput, description?: string): number {
    const configJson = JSON.stringify(config);

    const stmt = db.prepare(`
      INSERT INTO configurations (name, description, config_json, is_active)
      VALUES (?, ?, ?, 0)
    `);

    try {
      const result = stmt.run(name, description || null, configJson);
      logger.info(`Configuration saved: ${name} (ID: ${result.lastInsertRowid})`);
      return result.lastInsertRowid as number;
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to save configuration: ${err.message}`);
      throw new Error(`Failed to save configuration: ${err.message}`);
    }
  }

  // Update an existing configuration
  updateConfiguration(id: number, config: ConfigInput, description?: string): void {
    const configJson = JSON.stringify(config);

    const stmt = db.prepare(`
      UPDATE configurations
      SET config_json = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(configJson, description || null, id);

    if (result.changes === 0) {
      throw new Error(`Configuration with ID ${id} not found`);
    }

    logger.info(`Configuration updated: ID ${id}`);
  }

  // Get all configurations
  getAllConfigurations(): SavedConfiguration[] {
    const stmt = db.prepare(`
      SELECT * FROM configurations
      ORDER BY created_at DESC
    `);

    return stmt.all() as SavedConfiguration[];
  }

  // Get a specific configuration
  getConfiguration(id: number): SavedConfiguration | null {
    const stmt = db.prepare(`
      SELECT * FROM configurations WHERE id = ?
    `);

    return stmt.get(id) as SavedConfiguration | null;
  }

  // Get configuration by name
  getConfigurationByName(name: string): SavedConfiguration | null {
    const stmt = db.prepare(`
      SELECT * FROM configurations WHERE name = ?
    `);

    return stmt.get(name) as SavedConfiguration | null;
  }

  // Delete a configuration
  deleteConfiguration(id: number): void {
    // Check if config is being used by any instance
    const instanceCheck = db.prepare(`
      SELECT COUNT(*) as count FROM instances WHERE config_id = ?
    `).get(id) as { count: number };

    if (instanceCheck.count > 0) {
      throw new Error('Cannot delete configuration: it is being used by one or more instances');
    }

    const stmt = db.prepare(`DELETE FROM configurations WHERE id = ?`);
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Configuration with ID ${id} not found`);
    }

    logger.info(`Configuration deleted: ID ${id}`);
  }

  // Set active configuration
  setActiveConfiguration(id: number): void {
    // First, deactivate all
    db.prepare(`UPDATE configurations SET is_active = 0`).run();

    // Then activate the selected one
    const stmt = db.prepare(`
      UPDATE configurations SET is_active = 1 WHERE id = ?
    `);

    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Configuration with ID ${id} not found`);
    }

    logger.info(`Active configuration set to ID ${id}`);
  }

  // Get active configuration
  getActiveConfiguration(): SavedConfiguration | null {
    const stmt = db.prepare(`
      SELECT * FROM configurations WHERE is_active = 1 LIMIT 1
    `);

    return stmt.get() as SavedConfiguration | null;
  }

  // Parse config JSON
  parseConfig(savedConfig: SavedConfiguration): ConfigInput {
    const config = JSON.parse(savedConfig.config_json) as ConfigInput;

    // Migrate old mode values to new ones
    if ((config.mode as any) === 'independent') {
      config.mode = 'COINBASEONLY';
    } else if ((config.mode as any) === 'aggregated') {
      config.mode = 'FULLTEMPLATE';
    }

    // Migrate old share_batch_size values (3 or 10) to new standard of 1
    if (config.share_batch_size === 3 || config.share_batch_size === 10) {
      config.share_batch_size = 1;
    }

    return config;
  }
}

export const configService = new ConfigurationService();
