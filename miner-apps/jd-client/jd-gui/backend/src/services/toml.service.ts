import { logger } from '../utils/logger';

export interface ConfigInput {
  listening_address: string;
  max_supported_version: number;
  min_supported_version: number;
  authority_public_key: string;
  authority_secret_key: string;
  cert_validity_sec: number;
  user_identity: string;
  shares_per_minute: number;
  share_batch_size: number;
  mode: 'FULLTEMPLATE' | 'COINBASEONLY';
  jdc_signature: string;
  coinbase_reward_script: string;
  upstreams: UpstreamConfig[];
  template_provider_type: 'Sv2Tp' | 'BitcoinCoreIpc';
  sv2_tp?: Sv2TpConfig;
  bitcoin_core_ipc?: BitcoinCoreIpcConfig;
  monitoring_address?: string;
  send_payout_address_to_pool?: boolean;
  supported_extensions?: number[];
  required_extensions?: number[];
  // GUI-only setting (not written to TOML)
  report_downstream_miners?: boolean;
}

export interface UpstreamConfig {
  authority_pubkey: string;
  pool_address: string;
  jd_address?: string;
}

export interface Sv2TpConfig {
  address: string;
  public_key?: string;
}

export interface BitcoinCoreIpcConfig {
  network: 'mainnet' | 'testnet4' | 'signet' | 'regtest';
  fee_threshold: number;
  min_interval: number;
  data_dir?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class TomlService {
  generateToml(config: ConfigInput): string {
    const sections: string[] = [];

    // Basic listening configuration
    sections.push(`listening_address = "${config.listening_address}"`);
    sections.push(`max_supported_version = ${config.max_supported_version}`);
    sections.push(`min_supported_version = ${config.min_supported_version}`);
    sections.push('');

    // Authority keys
    sections.push(`authority_public_key = "${config.authority_public_key}"`);
    sections.push(`authority_secret_key = "${config.authority_secret_key}"`);
    sections.push(`cert_validity_sec = ${config.cert_validity_sec}`);
    sections.push('');

    // Mining configuration
    sections.push(`user_identity = "${config.user_identity}"`);
    sections.push(`shares_per_minute = ${config.shares_per_minute}`);
    sections.push(`share_batch_size = ${config.share_batch_size}`);
    sections.push(`mode = "${config.mode}"`);
    sections.push(`jdc_signature = "${config.jdc_signature}"`);
    sections.push(`coinbase_reward_script = "${config.coinbase_reward_script}"`);

    // Solo mining pool support (optional)
    if (config.send_payout_address_to_pool !== undefined) {
      sections.push(`send_payout_address_to_pool = ${config.send_payout_address_to_pool}`);
    }
    sections.push('');

    // Monitoring (optional)
    if (config.monitoring_address) {
      sections.push(`monitoring_address = "${config.monitoring_address}"`);
      sections.push('');
    }

    // Protocol extensions (with defaults)
    const supportedExtensions = config.supported_extensions || [0x0002];
    const requiredExtensions = config.required_extensions || [];

    sections.push('supported_extensions = [');
    supportedExtensions.forEach(ext => {
      sections.push(`    ${ext},`);
    });
    sections.push(']');
    sections.push('');

    sections.push('required_extensions = [');
    requiredExtensions.forEach(ext => {
      sections.push(`    ${ext},`);
    });
    sections.push(']');
    sections.push('');

    // Upstreams
    for (let i = 0; i < config.upstreams.length; i++) {
      const upstream = config.upstreams[i];
      sections.push('[[upstreams]]');
      sections.push(`authority_pubkey = "${upstream.authority_pubkey}"`);

      // Split pool_address into address and port
      const [poolHost, poolPort] = upstream.pool_address.split(':');
      sections.push(`pool_address = "${poolHost}"`);
      sections.push(`pool_port = ${poolPort}`);

      // Split jd_address into address and port if provided
      if (upstream.jd_address) {
        const [jdHost, jdPort] = upstream.jd_address.split(':');
        sections.push(`jds_address = "${jdHost}"`);
        sections.push(`jds_port = ${jdPort}`);
      }
      sections.push('');
    }

    // Template provider
    if (config.template_provider_type === 'Sv2Tp' && config.sv2_tp) {
      sections.push('[template_provider_type.Sv2Tp]');
      sections.push(`address = "${config.sv2_tp.address}"`);
      if (config.sv2_tp.public_key) {
        sections.push(`public_key = "${config.sv2_tp.public_key}"`);
      }
    } else if (config.template_provider_type === 'BitcoinCoreIpc' && config.bitcoin_core_ipc) {
      sections.push('[template_provider_type.BitcoinCoreIpc]');
      sections.push(`network = "${config.bitcoin_core_ipc.network}"`);
      sections.push(`fee_threshold = ${config.bitcoin_core_ipc.fee_threshold}`);
      sections.push(`min_interval = ${config.bitcoin_core_ipc.min_interval}`);
      if (config.bitcoin_core_ipc.data_dir) {
        sections.push(`data_dir = "${config.bitcoin_core_ipc.data_dir}"`);
      }
    }

    return sections.join('\n');
  }

  validateConfig(config: ConfigInput): ValidationResult {
    const errors: string[] = [];

    // Validate listening address
    if (!this.isValidSocketAddress(config.listening_address)) {
      errors.push('Invalid listening_address format (expected host:port)');
    }

    // Validate versions
    if (config.max_supported_version < config.min_supported_version) {
      errors.push('max_supported_version must be >= min_supported_version');
    }

    // Validate keys (basic format check)
    if (!config.authority_public_key || config.authority_public_key.length < 20) {
      errors.push('Invalid authority_public_key');
    }
    if (!config.authority_secret_key || config.authority_secret_key.length < 20) {
      errors.push('Invalid authority_secret_key');
    }

    // Validate user identity
    if (!config.user_identity || config.user_identity.trim().length === 0) {
      errors.push('user_identity is required');
    }

    // Validate mining parameters
    if (config.shares_per_minute <= 0) {
      errors.push('shares_per_minute must be positive');
    }
    if (config.share_batch_size <= 0) {
      errors.push('share_batch_size must be positive');
    }

    // Validate mode
    if (!['FULLTEMPLATE', 'COINBASEONLY'].includes(config.mode)) {
      errors.push('mode must be "FULLTEMPLATE" or "COINBASEONLY"');
    }

    // Validate jdc_signature (any non-empty string)
    if (!config.jdc_signature || config.jdc_signature.trim().length === 0) {
      errors.push('jdc_signature is required');
    }

    // Validate coinbase_reward_script (hex string or addr(...) format)
    if (!config.coinbase_reward_script) {
      errors.push('coinbase_reward_script is required');
    } else {
      const isHex = /^[0-9a-fA-F]+$/.test(config.coinbase_reward_script);
      const isAddr = /^addr\(.+\)$/.test(config.coinbase_reward_script);
      if (!isHex && !isAddr) {
        errors.push('coinbase_reward_script must be a hex string or addr(...) format');
      }
    }

    // Validate upstreams
    if (!config.upstreams || config.upstreams.length === 0) {
      errors.push('At least one upstream is required');
    } else {
      config.upstreams.forEach((upstream, idx) => {
        if (!this.isValidSocketAddress(upstream.pool_address)) {
          errors.push(`Upstream ${idx + 1}: Invalid pool_address format`);
        }
        if (!upstream.authority_pubkey || upstream.authority_pubkey.length < 20) {
          errors.push(`Upstream ${idx + 1}: Invalid authority_pubkey`);
        }
        if (upstream.jd_address && !this.isValidSocketAddress(upstream.jd_address)) {
          errors.push(`Upstream ${idx + 1}: Invalid jd_address format`);
        }
      });
    }

    // Validate template provider
    if (config.template_provider_type === 'Sv2Tp') {
      if (!config.sv2_tp) {
        errors.push('Sv2Tp configuration is required');
      } else {
        if (!this.isValidSocketAddress(config.sv2_tp.address)) {
          errors.push('Sv2Tp: Invalid address format');
        }
      }
    } else if (config.template_provider_type === 'BitcoinCoreIpc') {
      if (!config.bitcoin_core_ipc) {
        errors.push('BitcoinCoreIpc configuration is required');
      } else {
        const validNetworks = ['mainnet', 'testnet4', 'signet', 'regtest'];
        if (!validNetworks.includes(config.bitcoin_core_ipc.network)) {
          errors.push('BitcoinCoreIpc: Invalid network (must be mainnet, testnet4, signet, or regtest)');
        }
        if (config.bitcoin_core_ipc.fee_threshold < 0) {
          errors.push('BitcoinCoreIpc: fee_threshold must be non-negative');
        }
        if (config.bitcoin_core_ipc.min_interval <= 0) {
          errors.push('BitcoinCoreIpc: min_interval must be positive');
        }
      }
    } else {
      errors.push('Invalid template_provider_type');
    }

    // Validate monitoring address (optional)
    if (config.monitoring_address && !this.isValidSocketAddress(config.monitoring_address)) {
      errors.push('Invalid monitoring_address format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private isValidSocketAddress(address: string): boolean {
    // Format: host:port or ip:port
    const pattern = /^([a-zA-Z0-9.-]+):(\d{1,5})$/;
    const match = address.match(pattern);
    if (!match) return false;

    const port = parseInt(match[2], 10);
    return port > 0 && port <= 65535;
  }
}

export const tomlService = new TomlService();
