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
  report_downstream_miners?: boolean;
}

export interface UpstreamConfig {
  authority_pubkey: string;
  pool_address: string;
  jd_address?: string;
  propagate_upstream_target?: boolean;
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

export interface ProcessStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  startTime?: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  toml?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
