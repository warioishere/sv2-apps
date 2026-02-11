import { Request, Response } from 'express';
import { configExamplesService } from '../services/config-examples.service';
import { logger } from '../utils/logger';

export class ConfigExamplesController {
  // Get all available examples
  async getAll(req: Request, res: Response) {
    try {
      const examples = configExamplesService.getAllExamples();
      res.json({ examples });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting examples: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get examples by filter
  async getByFilter(req: Request, res: Response) {
    try {
      const { network, infrastructure, templateProvider } = req.query;

      const examples = configExamplesService.getExamplesByFilter({
        network: network as string | undefined,
        infrastructure: infrastructure as string | undefined,
        templateProvider: templateProvider as string | undefined,
      });

      res.json({ examples });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error filtering examples: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get specific example (parsed as ConfigInput)
  async getExample(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const config = configExamplesService.getExampleConfig(id);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Example not found',
        });
      }

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting example: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get raw TOML content
  async getExampleToml(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const toml = configExamplesService.getExampleToml(id);

      if (!toml) {
        return res.status(404).json({
          success: false,
          error: 'Example not found',
        });
      }

      res.setHeader('Content-Type', 'text/plain');
      res.send(toml);
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting example TOML: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const configExamplesController = new ConfigExamplesController();
