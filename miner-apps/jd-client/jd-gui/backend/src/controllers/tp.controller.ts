import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { tpProcessManager } from '../services/tp-process.service';
import { logger } from '../utils/logger';

const TP_CONFIG_PATH = '/app/config/sv2-tp/sv2-tp.conf';

export class TpController {
  async start(req: Request, res: Response) {
    try {
      logger.info('Received request to start sv2-tp');

      // Check if config exists, create default if not
      if (!fs.existsSync(TP_CONFIG_PATH)) {
        logger.warn('sv2-tp config not found, creating default config with auto-detection');

        // Auto-detect Bitcoin Core location
        let bitcoinDataDir = '/bitcoin-ipc-mainnet';  // Default to integrated mainnet
        let network = 'mainnet';

        // Check available Bitcoin Core instances
        const detectionPaths = [
          { path: '/bitcoin-ipc-mainnet/node.sock', dataDir: '/bitcoin-ipc-mainnet', network: 'mainnet', source: 'Docker Mainnet' },
          { path: '/host-bitcoin/mainnet/node.sock', dataDir: '/host-bitcoin/mainnet', network: 'mainnet', source: 'Host Mainnet' },
          { path: '/bitcoin-ipc-testnet/node.sock', dataDir: '/bitcoin-ipc-testnet', network: 'testnet4', source: 'Docker Testnet4' },
          { path: '/host-bitcoin/testnet4/node.sock', dataDir: '/host-bitcoin/testnet4', network: 'testnet4', source: 'Host Testnet4' },
        ];

        for (const check of detectionPaths) {
          if (fs.existsSync(check.path)) {
            bitcoinDataDir = check.dataDir;
            network = check.network;
            logger.info(`Auto-detected Bitcoin Core: ${check.source} at ${check.path}`);
            break;
          }
        }

        const networkFlag = network === 'mainnet' ? '' : network === 'testnet4' ? 'testnet4=1' : `${network}=1`;
        const defaultConfig = `# Stratum V2 Template Provider Configuration
# Auto-generated configuration
# Network: ${network}

# Bitcoin Core data directory (where node.sock IPC socket is located)
datadir=${bitcoinDataDir}
${networkFlag ? '\n# Network selection\n' + networkFlag : ''}
# Connect to Bitcoin Core via IPC (Unix socket)
ipcconnect=unix

# Template Provider listening address (where JD-Client connects)
sv2bind=0.0.0.0:48442

# Stratum V2 interval (seconds) - how often to check for new templates
sv2interval=30

# Fee delta (sats/vB) - minimum fee rate threshold
sv2feedelta=1000

# Logging (printtoconsole avoids needing writable datadir for sv2-debug.log)
printtoconsole=1
debug=sv2
loglevel=sv2:info
debug=ipc
`;

        const configDir = path.dirname(TP_CONFIG_PATH);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(TP_CONFIG_PATH, defaultConfig);
        logger.info(`Created default sv2-tp config at ${TP_CONFIG_PATH} (${network})`);
      }

      const result = await tpProcessManager.start();

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'Template Provider started successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error starting sv2-tp: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async stop(req: Request, res: Response) {
    try {
      logger.info('Received request to stop sv2-tp');
      const result = await tpProcessManager.stop();

      if (result.success) {
        res.json({
          success: true,
          message: 'Template Provider stopped successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error stopping sv2-tp: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async restart(req: Request, res: Response) {
    try {
      logger.info('Received request to restart sv2-tp');
      const result = await tpProcessManager.restart();

      if (result.success) {
        res.json({
          success: true,
          pid: result.pid,
          message: 'Template Provider restarted successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error restarting sv2-tp: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async getStatus(req: Request, res: Response) {
    try {
      const status = tpProcessManager.getStatus();
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
      const logs = tpProcessManager.getRecentLogs(count);
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

  async getCurrentConfig(req: Request, res: Response) {
    try {
      if (fs.existsSync(TP_CONFIG_PATH)) {
        const config = fs.readFileSync(TP_CONFIG_PATH, 'utf-8');
        res.json({
          success: true,
          config,
          path: TP_CONFIG_PATH
        });
      } else {
        res.json({
          success: false,
          message: 'Configuration file not found'
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error reading config: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }

  async saveConfig(req: Request, res: Response) {
    try {
      const { config } = req.body;

      if (!config || typeof config !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid configuration provided'
        });
      }

      const configDir = path.dirname(TP_CONFIG_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(TP_CONFIG_PATH, config);
      logger.info(`Saved sv2-tp config to ${TP_CONFIG_PATH}`);

      res.json({
        success: true,
        message: 'Configuration saved successfully',
        path: TP_CONFIG_PATH
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

  async restoreDefaultConfig(req: Request, res: Response) {
    try {
      logger.info('Restoring default sv2-tp config based on running Bitcoin Core');

      // Detect which Bitcoin Core is running
      let bitcoinDataDir = '/bitcoin-ipc-mainnet';
      let chain = 'main';
      let network = 'mainnet';

      const detectionPaths = [
        { path: '/bitcoin-ipc-mainnet/node.sock', dataDir: '/bitcoin-ipc-mainnet', chain: 'main', network: 'mainnet' },
        { path: '/bitcoin-ipc-testnet/node.sock', dataDir: '/bitcoin-ipc-testnet', chain: 'test', network: 'testnet4' },
        { path: '/host-bitcoin/mainnet/node.sock', dataDir: '/host-bitcoin/mainnet', chain: 'main', network: 'mainnet' },
        { path: '/host-bitcoin/testnet4/node.sock', dataDir: '/host-bitcoin/testnet4', chain: 'test', network: 'testnet4' },
      ];

      for (const check of detectionPaths) {
        if (fs.existsSync(check.path)) {
          bitcoinDataDir = check.dataDir;
          chain = check.chain;
          network = check.network;
          logger.info(`Detected Bitcoin Core: ${network} at ${check.path}`);
          break;
        }
      }

      const networkFlag = network === 'mainnet' ? '' : network === 'testnet4' ? 'testnet4=1' : `${network}=1`;
      const defaultConfig = `# Stratum V2 Template Provider Configuration
# Auto-generated default configuration
# Network: ${network}

# Bitcoin Core data directory (where node.sock IPC socket is located)
datadir=${bitcoinDataDir}
${networkFlag ? '\n# Network selection\n' + networkFlag : ''}
# Connect to Bitcoin Core via IPC (Unix socket)
ipcconnect=unix

# Template Provider listening address (where JD-Client connects)
sv2bind=0.0.0.0:48442

# Stratum V2 interval (seconds) - how often to check for new templates
sv2interval=30

# Fee delta (sats/vB) - minimum fee rate threshold
sv2feedelta=1000

# Logging
printtoconsole=1
debug=sv2
loglevel=sv2:info
debug=ipc
`;

      const configDir = path.dirname(TP_CONFIG_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(TP_CONFIG_PATH, defaultConfig);
      logger.info(`Restored default sv2-tp config at ${TP_CONFIG_PATH} (${network})`);

      res.json({
        success: true,
        config: defaultConfig,
        network,
        chain,
        path: TP_CONFIG_PATH,
        message: `Configuration restored to defaults for ${network}`,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error restoring default config: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  async validatePath(req: Request, res: Response) {
    try {
      const { path: socketPath } = req.body;

      if (!socketPath || typeof socketPath !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Path is required'
        });
      }

      const exists = fs.existsSync(socketPath);
      let isSocket = false;

      if (exists) {
        const stat = fs.statSync(socketPath);
        isSocket = stat.isSocket();
      }

      res.json({
        success: true,
        exists,
        isSocket,
        valid: exists && isSocket
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error validating path: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
}

export const tpController = new TpController();
