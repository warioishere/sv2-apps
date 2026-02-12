import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { tomlService, ConfigInput } from '../services/toml.service';

interface BitcoinCoreDetectionResult {
  detected: boolean;
  network?: string;
  path?: string;
  dataDir?: string;
  version?: string;
  versionValid?: boolean;
  ipcEnabled?: boolean;
  recommendations?: string[];
  setupInstructions?: string[];
}

/**
 * Detects local Bitcoin Core installation by checking for node.sock files
 *
 * IMPORTANT: sv2-tp (Template Provider) requires Bitcoin Core with IPC support.
 * Standard Bitcoin Core binaries do NOT have IPC enabled by default.
 * Bitcoin Core must be built with --enable-multiprocess flag.
 */
export async function detectBitcoinCore(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Detecting Bitcoin Core installation with IPC support...');

    // First check for built-in Docker container IPC paths (our custom build)
    const containerPaths = [
      { network: 'mainnet', path: '/bitcoin-ipc-mainnet/node.sock', dataDir: '/bitcoin-ipc-mainnet' },
      { network: 'testnet4', path: '/bitcoin-ipc-testnet/node.sock', dataDir: '/bitcoin-ipc-testnet' },
    ];

    for (const container of containerPaths) {
      if (fs.existsSync(container.path)) {
        logger.info(`Found built-in Bitcoin Core container with IPC at ${container.path}`);
        const result: BitcoinCoreDetectionResult = {
          detected: true,
          network: container.network,
          path: container.path,
          dataDir: container.dataDir,
          version: '30.2',
          versionValid: true,
          ipcEnabled: true,
          recommendations: ['✅ Using integrated Bitcoin Core with IPC support (sv2-bitcoin-core-ipc)'],
        };
        res.json(result);
        return;
      }
    }

    const homeDir = os.homedir();
    const bitcoinDataDir = path.join(homeDir, '.bitcoin');

    // Check for different networks
    const networks = [
      { name: 'mainnet', sockPath: path.join(bitcoinDataDir, 'node.sock'), dataDir: bitcoinDataDir },
      { name: 'testnet4', sockPath: path.join(bitcoinDataDir, 'testnet4', 'node.sock'), dataDir: path.join(bitcoinDataDir, 'testnet4') },
      { name: 'signet', sockPath: path.join(bitcoinDataDir, 'signet', 'node.sock'), dataDir: path.join(bitcoinDataDir, 'signet') },
      { name: 'regtest', sockPath: path.join(bitcoinDataDir, 'regtest', 'node.sock'), dataDir: path.join(bitcoinDataDir, 'regtest') },
    ];

    for (const network of networks) {
      if (fs.existsSync(network.sockPath)) {
        const stat = fs.statSync(network.sockPath);

        // Check if it's a socket file
        if (stat.isSocket()) {
          logger.info(`Found Bitcoin Core on ${network.name} at ${network.sockPath}`);

          // Try to detect version from debug.log
          let version: string | undefined;
          let versionValid = false;
          const recommendations: string[] = [];
          const setupInstructions: string[] = [];

          const debugLogPath = path.join(path.dirname(network.sockPath), 'debug.log');
          if (fs.existsSync(debugLogPath)) {
            try {
              const logContent = fs.readFileSync(debugLogPath, 'utf-8');
              const versionMatch = logContent.match(/Bitcoin Core version v?(\d+\.\d+\.\d+)/);
              if (versionMatch) {
                version = versionMatch[1];
                const [major] = version.split('.').map(Number);
                versionValid = major >= 30;

                if (!versionValid) {
                  recommendations.push(`⚠️ Bitcoin Core ${version} detected. Version 30.0+ required for optimal Stratum V2 support.`);
                  setupInstructions.push('Upgrade to Bitcoin Core 30.0 or later: https://bitcoincore.org/en/download/');
                }
              }
            } catch (err) {
              logger.warn('Could not read debug.log for version detection');
            }
          }

          // IPC is enabled if socket exists
          const ipcEnabled = true;

          // Add recommendations
          if (versionValid && ipcEnabled) {
            recommendations.push('✅ Bitcoin Core with IPC support detected!');
            recommendations.push('ℹ️ Ensure Bitcoin Core was built with --enable-multiprocess flag.');
          } else if (!versionValid) {
            recommendations.push('Consider using the built-in Bitcoin Core container (v30.2) for hassle-free setup.');
          }

          // Add setup instructions
          setupInstructions.push(
            'To ensure IPC is enabled, start bitcoind with:',
            `  bitcoind -${network.name === 'mainnet' ? '' : network.name + ' '}-ipcbind=unix`,
            '',
            'Or add to bitcoin.conf:',
            `  ipcbind=unix`
          );

          const result: BitcoinCoreDetectionResult = {
            detected: true,
            network: network.name,
            path: network.sockPath,
            dataDir: network.dataDir,
            version,
            versionValid,
            ipcEnabled,
            recommendations,
            setupInstructions,
          };

          res.json(result);
          return;
        }
      }
    }

    // Not found
    logger.info('No Bitcoin Core installation with IPC support detected');
    const result: BitcoinCoreDetectionResult = {
      detected: false,
      recommendations: [
        '⚠️ No Bitcoin Core with IPC support found.',
        'ℹ️ sv2-tp (Template Provider) requires Bitcoin Core built with --enable-multiprocess flag.',
        '✅ Use the integrated Bitcoin Core option (recommended) - it includes IPC support.',
        '⚠️ Standard Bitcoin Core binaries do NOT have IPC enabled.',
      ],
      setupInstructions: [
        'Option 1 (Recommended): Use integrated Bitcoin Core with IPC support',
        'Option 2: Build Bitcoin Core with: make -C depends MULTIPROCESS=1 && ./configure --enable-multiprocess && make',
        'See: https://github.com/bitcoin/bitcoin/blob/master/doc/multiprocess.md',
      ],
    };
    res.json(result);

  } catch (error) {
    const err = error as Error;
    logger.error(`Bitcoin Core detection failed: ${err.message}`);
    res.status(500).json({
      success: false,
      message: `Detection failed: ${err.message}`,
    });
  }
}

/**
 * Generates configurations for both sv2-tp and JD-Client
 */
export async function generateFullStackConfig(req: Request, res: Response): Promise<void> {
  try {
    const {
      network,
      poolAddress,
      poolPort,
      jdsAddress,
      jdsPort,
      authorityPubkey,
      userIdentity,
      coinbaseAddress,
      bitcoinCoreDataDir,
    } = req.body;

    logger.info(`Generating full stack config for ${network}...`);

    // Default ports
    const finalPoolPort = poolPort || 43333;
    const finalJdsPort = jdsPort || 43334;

    // ===== 1. Generate sv2-tp config =====
    // IMPORTANT: sv2-tp requires Bitcoin Core built with IPC/multiprocess support
    // Standard bitcoin/bitcoin Docker images do NOT support IPC
    // Use our custom sv2-bitcoin-core-ipc image instead

    // Determine Bitcoin Core data directory path
    const finalBitcoinCoreDataDir = bitcoinCoreDataDir ||
      (network === 'mainnet' ? '/bitcoin-ipc-mainnet' : '/bitcoin-ipc-testnet');

    // sv2-tp config format (Bitcoin Core style - key=value)
    const tpConfig = `# Stratum V2 Template Provider Configuration
# Network: ${network}
#
# REQUIREMENT: Bitcoin Core must be built with --enable-multiprocess (IPC support)
# Standard bitcoin/bitcoin images DO NOT have IPC support.
# This setup uses custom sv2-bitcoin-core-ipc image with multiprocess enabled.

# Bitcoin Core data directory (where node.sock IPC socket is located)
datadir=${finalBitcoinCoreDataDir}

# Network (main, test, signet, regtest)
chain=${network === 'mainnet' ? 'main' : network === 'testnet4' ? 'test' : network}

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

    // Save sv2-tp config (Bitcoin Core style uses .conf extension)
    const tpConfigPath = '/app/config/sv2-tp/sv2-tp.conf';
    const tpConfigDir = path.dirname(tpConfigPath);
    if (!fs.existsSync(tpConfigDir)) {
      fs.mkdirSync(tpConfigDir, { recursive: true });
    }
    fs.writeFileSync(tpConfigPath, tpConfig);
    logger.info(`sv2-tp config saved to ${tpConfigPath}`);

    // ===== 2. Generate JD-Client config =====
    // Wrap Bitcoin address in addr() format if provided
    const coinbaseScript = coinbaseAddress && coinbaseAddress.trim()
      ? `addr(${coinbaseAddress.trim()})`
      : '';

    const jdcConfig: ConfigInput = {
      listening_address: '0.0.0.0:34265',  // Miners connect here
      max_supported_version: 2,
      min_supported_version: 2,
      authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72', // Default key
      authority_secret_key: 'mkDLTBBRxdBv998612qipDYoTK3YUrqLe8uWw7gu3iXbSrn2n', // Default key
      cert_validity_sec: 3600,
      user_identity: userIdentity || 'jdc_user',
      shares_per_minute: 60.0,
      share_batch_size: 10,
      mode: 'independent',
      jdc_signature: 'JD-Client with Full Transaction Control',
      coinbase_reward_script: coinbaseScript,
      upstreams: [
        {
          authority_pubkey: authorityPubkey || '', // Pool's authority key
          pool_address: `${poolAddress}:${finalPoolPort}`,
          jd_address: `${jdsAddress}:${finalJdsPort}`,
        },
      ],
      template_provider_type: 'Sv2Tp',
      sv2_tp: {
        address: '127.0.0.1:48442',  // Connect to local sv2-tp
        public_key: '', // Optional
      },
      supported_extensions: [0x0002],
      required_extensions: [],
      monitoring_address: '0.0.0.0:9091',
    };

    res.json({
      success: true,
      tpConfig: tpConfig,
      tpConfigPath: tpConfigPath,
      jdcConfig: jdcConfig,
    });

  } catch (error) {
    const err = error as Error;
    logger.error(`Full stack config generation failed: ${err.message}`);
    res.status(500).json({
      success: false,
      message: `Config generation failed: ${err.message}`,
    });
  }
}
