import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import axios from 'axios';

// BC Manager API endpoint
const BC_MANAGER_URL = 'http://bc-manager:5001';

interface BitcoinCoreStatus {
  running: boolean;
  building?: boolean;
  message?: string;
  network?: 'mainnet' | 'testnet';
  container?: string;
  blockHeight?: number;
  connections?: number;
  initialSync?: boolean;
}

/**
 * Get status of Bitcoin Core containers
 */
export async function getBitcoinCoreStatus(req: Request, res: Response): Promise<void> {
  try {
    // Check both mainnet and testnet
    const [mainnetResponse, testnetResponse] = await Promise.allSettled([
      axios.get(`${BC_MANAGER_URL}/bitcoin/status?network=mainnet`),
      axios.get(`${BC_MANAGER_URL}/bitcoin/status?network=testnet`)
    ]);

    let status: BitcoinCoreStatus = { running: false };
    let activeNetwork: 'mainnet' | 'testnet' | null = null;

    // Check mainnet first
    if (mainnetResponse.status === 'fulfilled' && mainnetResponse.value.data.running) {
      status = {
        running: true,
        network: 'mainnet',
        container: 'sv2-bitcoin-mainnet'
      };
      activeNetwork = 'mainnet';
    }
    // Check if mainnet is building
    else if (mainnetResponse.status === 'fulfilled' && mainnetResponse.value.data.building) {
      status = {
        running: false,
        building: true,
        message: mainnetResponse.value.data.message || 'Building Bitcoin Core image...',
        network: 'mainnet',
        container: 'sv2-bitcoin-mainnet'
      };
      res.json(status);
      return;
    }
    // Then check testnet
    else if (testnetResponse.status === 'fulfilled' && testnetResponse.value.data.running) {
      status = {
        running: true,
        network: 'testnet',
        container: 'sv2-bitcoin-testnet'
      };
      activeNetwork = 'testnet';
    }
    // Check if testnet is building
    else if (testnetResponse.status === 'fulfilled' && testnetResponse.value.data.building) {
      status = {
        running: false,
        building: true,
        message: testnetResponse.value.data.message || 'Building Bitcoin Core image...',
        network: 'testnet',
        container: 'sv2-bitcoin-testnet'
      };
      res.json(status);
      return;
    }

    // If a network is running, get blockchain sync status
    if (activeNetwork) {
      try {
        const blockchainInfo = await axios.get(`${BC_MANAGER_URL}/bitcoin/blockchain-info?network=${activeNetwork}`);
        if (blockchainInfo.data.success) {
          status.blockHeight = blockchainInfo.data.blocks;
          status.initialSync = blockchainInfo.data.initial_block_download;
          status.connections = 0; // Can be enhanced by calling getnetworkinfo
        }
      } catch (error) {
        // Blockchain info not critical, just log and continue
        logger.warn(`Could not fetch blockchain info: ${error}`);
      }
    }

    res.json(status);
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to get Bitcoin Core status: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Start Bitcoin Core container
 */
export async function startBitcoinCore(req: Request, res: Response): Promise<void> {
  try {
    const { network } = req.body;

    if (!network || !['mainnet', 'testnet'].includes(network)) {
      res.status(400).json({ success: false, message: 'Invalid network. Must be mainnet or testnet' });
      return;
    }

    logger.info(`Requesting Bitcoin Core ${network} start via bc-manager...`);

    // Call bc-manager API
    const response = await axios.post(`${BC_MANAGER_URL}/bitcoin/start`, { network });

    if (response.data.success) {
      logger.info(`Bitcoin Core ${network} started successfully`);
      res.json(response.data);
    } else {
      logger.error(`Failed to start Bitcoin Core ${network}: ${response.data.error}`);
      res.status(500).json(response.data);
    }

  } catch (error) {
    const err = error as any;
    const errorMessage = err.response?.data?.error || err.message;
    logger.error(`Failed to start Bitcoin Core: ${errorMessage}`);
    res.status(500).json({ success: false, message: errorMessage });
  }
}

/**
 * Stop Bitcoin Core container
 */
export async function stopBitcoinCore(req: Request, res: Response): Promise<void> {
  try {
    const { network } = req.body;

    if (!network || !['mainnet', 'testnet'].includes(network)) {
      res.status(400).json({ success: false, message: 'Invalid network. Must be mainnet or testnet' });
      return;
    }

    logger.info(`Requesting Bitcoin Core ${network} stop via bc-manager...`);

    // Call bc-manager API
    const response = await axios.post(`${BC_MANAGER_URL}/bitcoin/stop`, { network });

    if (response.data.success) {
      logger.info(`Bitcoin Core ${network} stopped successfully`);
      res.json(response.data);
    } else {
      logger.error(`Failed to stop Bitcoin Core ${network}: ${response.data.error}`);
      res.status(500).json(response.data);
    }

  } catch (error) {
    const err = error as any;
    const errorMessage = err.response?.data?.error || err.message;
    logger.error(`Failed to stop Bitcoin Core: ${errorMessage}`);
    res.status(500).json({ success: false, message: errorMessage });
  }
}

/**
 * Get Bitcoin Core logs
 */
export async function getBitcoinCoreLogs(req: Request, res: Response): Promise<void> {
  try {
    const { network, lines = 100 } = req.query;

    if (!network || !['mainnet', 'testnet'].includes(network as string)) {
      res.status(400).json({ success: false, message: 'Invalid network. Must be mainnet or testnet' });
      return;
    }

    logger.info(`Fetching Bitcoin Core ${network} logs via bc-manager...`);

    // Call bc-manager API
    const response = await axios.get(`${BC_MANAGER_URL}/bitcoin/logs`, {
      params: { network, lines }
    });

    res.json(response.data);

  } catch (error) {
    const err = error as any;
    const errorMessage = err.response?.data?.error || err.message;
    logger.error(`Failed to get Bitcoin Core logs: ${errorMessage}`);
    res.status(500).json({ success: false, message: errorMessage });
  }
}
