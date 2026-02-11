import * as fs from 'fs';
import * as path from 'path';
import * as TOML from '@iarna/toml';
import { logger } from '../utils/logger';
import { ConfigInput } from './toml.service';

interface ConfigExample {
  id: string;
  name: string;
  network: 'mainnet' | 'testnet4' | 'signet';
  infrastructure: 'local' | 'hosted';
  templateProvider: 'Sv2Tp' | 'BitcoinCoreIpc';
  description: string;
  filePath: string;
}

export class ConfigExamplesService {
  private readonly examplesBasePath = process.env.CONFIG_EXAMPLES_PATH || '/app/config-examples';
  private examples: ConfigExample[] = [];

  constructor() {
    this.loadExamples();
  }

  private loadExamples() {
    const networks = ['mainnet', 'testnet4', 'signet'];

    for (const network of networks) {
      const networkPath = path.join(this.examplesBasePath, network);

      if (!fs.existsSync(networkPath)) {
        continue;
      }

      const files = fs.readdirSync(networkPath).filter(f => f.endsWith('.toml'));

      for (const file of files) {
        const filePath = path.join(networkPath, file);

        // Parse filename to extract metadata
        const isHosted = file.includes('hosted-infra');
        const isLocal = file.includes('local-infra');
        const isBitcoinCore = file.includes('bitcoin-core-ipc');

        const example: ConfigExample = {
          id: `${network}-${file.replace('.toml', '')}`,
          name: this.generateName(network, isHosted, isBitcoinCore),
          network: network as 'mainnet' | 'testnet4' | 'signet',
          infrastructure: isHosted ? 'hosted' : 'local',
          templateProvider: isBitcoinCore ? 'BitcoinCoreIpc' : 'Sv2Tp',
          description: this.generateDescription(network, isHosted, isBitcoinCore),
          filePath,
        };

        this.examples.push(example);
      }
    }

    logger.info(`Loaded ${this.examples.length} config examples`);
  }

  private generateName(network: string, isHosted: boolean, isBitcoinCore: boolean): string {
    const networkName = network.charAt(0).toUpperCase() + network.slice(1);
    const infra = isHosted ? 'Hosted' : 'Local';
    const tp = isBitcoinCore ? 'Bitcoin Core' : 'Sv2 TP';

    return `${networkName} - ${infra} - ${tp}`;
  }

  private generateDescription(network: string, isHosted: boolean, isBitcoinCore: boolean): string {
    const networkDesc = network === 'mainnet' ? 'production Bitcoin network' :
                       network === 'testnet4' ? 'Bitcoin Testnet4' : 'Bitcoin Signet';
    const infraDesc = isHosted ? 'hosted infrastructure (pool + JDS)' : 'local infrastructure';
    const tpDesc = isBitcoinCore ? 'Bitcoin Core IPC for template generation' : 'Sv2 Template Provider';

    return `Config for ${networkDesc} using ${infraDesc} with ${tpDesc}`;
  }

  // Get list of all examples
  getAllExamples(): ConfigExample[] {
    return this.examples.map(ex => ({
      id: ex.id,
      name: ex.name,
      network: ex.network,
      infrastructure: ex.infrastructure,
      templateProvider: ex.templateProvider,
      description: ex.description,
      filePath: '', // Don't expose file path in list
    }));
  }

  // Get raw TOML content
  getExampleToml(id: string): string | null {
    const example = this.examples.find(ex => ex.id === id);
    if (!example) {
      return null;
    }

    try {
      return fs.readFileSync(example.filePath, 'utf8');
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to read example ${id}: ${err.message}`);
      return null;
    }
  }

  // Parse TOML and convert to ConfigInput format
  getExampleConfig(id: string): ConfigInput | null {
    const tomlContent = this.getExampleToml(id);
    if (!tomlContent) {
      return null;
    }

    try {
      const parsed = TOML.parse(tomlContent);

      // Map TOML mode to ConfigInput mode
      let mode: 'aggregated' | 'independent' = 'independent';
      if (parsed.mode === 'FULLTEMPLATE') {
        mode = 'aggregated';
      } else if (parsed.mode === 'COINBASEONLY') {
        mode = 'independent';
      }

      // Convert parsed TOML to ConfigInput format
      const config: ConfigInput = {
        listening_address: parsed.listening_address as string,
        max_supported_version: parsed.max_supported_version as number,
        min_supported_version: parsed.min_supported_version as number,
        authority_public_key: parsed.authority_public_key as string,
        authority_secret_key: parsed.authority_secret_key as string,
        cert_validity_sec: parsed.cert_validity_sec as number,
        user_identity: parsed.user_identity as string || 'jdc-user',
        shares_per_minute: parsed.shares_per_minute as number || 60,
        share_batch_size: parsed.share_batch_size as number || 3,
        mode: mode,
        jdc_signature: parsed.jdc_signature as string,
        coinbase_reward_script: parsed.coinbase_reward_script as string,
        upstreams: [],
        template_provider_type: 'Sv2Tp', // Will be determined below
        monitoring_address: parsed.monitoring_address as string | undefined,
        supported_extensions: parsed.supported_extensions as number[] | undefined,
        required_extensions: parsed.required_extensions as number[] | undefined,
      };

      // Parse upstreams array - handle both formats
      if (Array.isArray(parsed.upstreams)) {
        config.upstreams = parsed.upstreams.map((upstream: any) => {
          // Handle format with separate address and port
          let pool_address = upstream.pool_address;
          let jd_address = upstream.jd_address;

          if (upstream.pool_port) {
            pool_address = `${upstream.pool_address}:${upstream.pool_port}`;
          }
          if (upstream.jds_address && upstream.jds_port) {
            jd_address = `${upstream.jds_address}:${upstream.jds_port}`;
          }

          return {
            authority_pubkey: upstream.authority_pubkey,
            pool_address: pool_address,
            jd_address: jd_address || undefined,
          };
        });
      }

      // Parse template provider - handle both formats
      if (parsed.template_provider_type) {
        const tpt = parsed.template_provider_type as any;

        if (tpt.Sv2Tp) {
          config.template_provider_type = 'Sv2Tp';
          config.sv2_tp = {
            address: tpt.Sv2Tp.address,
            public_key: tpt.Sv2Tp.public_key,
          };
        } else if (tpt.BitcoinCoreIpc) {
          config.template_provider_type = 'BitcoinCoreIpc';
          config.bitcoin_core_ipc = {
            network: tpt.BitcoinCoreIpc.network,
            fee_threshold: tpt.BitcoinCoreIpc.fee_threshold,
            min_interval: tpt.BitcoinCoreIpc.min_interval,
            data_dir: tpt.BitcoinCoreIpc.data_dir,
          };
        }
      } else if (parsed.template_provider) {
        // Fallback to old format
        const tp = parsed.template_provider as any;

        if (tp.type === 'Sv2Tp' && tp.Sv2Tp) {
          config.template_provider_type = 'Sv2Tp';
          config.sv2_tp = {
            address: tp.Sv2Tp.address,
            public_key: tp.Sv2Tp.public_key,
          };
        } else if (tp.type === 'BitcoinCoreIpc' && tp.BitcoinCoreIpc) {
          config.template_provider_type = 'BitcoinCoreIpc';
          config.bitcoin_core_ipc = {
            network: tp.BitcoinCoreIpc.network,
            fee_threshold: tp.BitcoinCoreIpc.fee_threshold,
            min_interval: tp.BitcoinCoreIpc.min_interval,
            data_dir: tp.BitcoinCoreIpc.data_dir,
          };
        }
      }

      return config;
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to parse example ${id}: ${err.message}`);
      return null;
    }
  }

  // Get examples filtered by criteria
  getExamplesByFilter(filters: {
    network?: string;
    infrastructure?: string;
    templateProvider?: string;
  }): ConfigExample[] {
    return this.examples.filter(ex => {
      if (filters.network && ex.network !== filters.network) return false;
      if (filters.infrastructure && ex.infrastructure !== filters.infrastructure) return false;
      if (filters.templateProvider && ex.templateProvider !== filters.templateProvider) return false;
      return true;
    });
  }
}

export const configExamplesService = new ConfigExamplesService();
