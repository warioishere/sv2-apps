import axios from 'axios';
import { ConfigInput, ProcessStatus, ValidationResult, LogEntry, MonitoringDashboard, EnrichedMiner, HashrateDataPoint } from '../types/config.types';

const API_BASE = '/api';

class ApiService {
  // Config endpoints
  async validateConfig(config: ConfigInput): Promise<ValidationResult> {
    const response = await axios.post(`${API_BASE}/config/validate`, config);
    return response.data;
  }

  async saveConfig(config: ConfigInput): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await axios.post(`${API_BASE}/config`, config);
    return response.data;
  }

  async loadConfig(): Promise<{ success: boolean; toml?: string; error?: string }> {
    const response = await axios.get(`${API_BASE}/config`);
    return response.data;
  }

  // JDC control endpoints
  async startJdc(): Promise<{ success: boolean; pid?: number; error?: string }> {
    const response = await axios.post(`${API_BASE}/jdc/start`);
    return response.data;
  }

  async stopJdc(): Promise<{ success: boolean; error?: string }> {
    const response = await axios.post(`${API_BASE}/jdc/stop`);
    return response.data;
  }

  async restartJdc(): Promise<{ success: boolean; pid?: number; error?: string }> {
    const response = await axios.post(`${API_BASE}/jdc/restart`);
    return response.data;
  }

  async getStatus(): Promise<ProcessStatus> {
    const response = await axios.get(`${API_BASE}/jdc/status`);
    return response.data;
  }

  async getLogs(count: number = 100): Promise<{ logs: LogEntry[] }> {
    const response = await axios.get(`${API_BASE}/jdc/logs?count=${count}`);
    return response.data;
  }

  // Keys endpoint
  async generateKeys(): Promise<{ success: boolean; keys?: { public_key: string; secret_key: string }; error?: string }> {
    const response = await axios.post(`${API_BASE}/keys/generate`);
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string; uptime: number }> {
    const response = await axios.get(`${API_BASE}/health`);
    return response.data;
  }

  // Config Examples endpoints
  async getConfigExamples(): Promise<{ examples: any[] }> {
    const response = await axios.get(`${API_BASE}/config-examples`);
    return response.data;
  }

  async getConfigExample(id: string): Promise<{ success: boolean; config?: ConfigInput; error?: string }> {
    const response = await axios.get(`${API_BASE}/config-examples/${id}`);
    return response.data;
  }

  async getConfigExampleToml(id: string): Promise<string> {
    const response = await axios.get(`${API_BASE}/config-examples/${id}/toml`);
    return response.data;
  }

  // Wizard endpoints
  async detectBitcoinCore(): Promise<{
    detected: boolean;
    network?: string;
    path?: string;
    version?: string;
  }> {
    const response = await axios.get(`${API_BASE}/wizard/detect-bitcoin-core`);
    return response.data;
  }

  // Template Provider endpoints
  async startTp(): Promise<{ success: boolean; pid?: number; error?: string }> {
    const response = await axios.post(`${API_BASE}/tp/start`);
    return response.data;
  }

  async stopTp(): Promise<{ success: boolean; error?: string }> {
    const response = await axios.post(`${API_BASE}/tp/stop`);
    return response.data;
  }

  async restartTp(): Promise<{ success: boolean; pid?: number; error?: string }> {
    const response = await axios.post(`${API_BASE}/tp/restart`);
    return response.data;
  }

  async getTpStatus(): Promise<{
    running: boolean;
    pid?: number;
    uptime?: number;
    config_file?: string;
  }> {
    const response = await axios.get(`${API_BASE}/tp/status`);
    return response.data;
  }

  async getTpLogs(count: number = 100): Promise<{ logs: LogEntry[] }> {
    const response = await axios.get(`${API_BASE}/tp/logs?count=${count}`);
    return response.data;
  }

  // Bitcoin Core endpoints
  async getBitcoinCoreStatus(): Promise<{
    running: boolean;
    building?: boolean;
    message?: string;
    network?: 'mainnet' | 'testnet';
    container?: string;
    blockHeight?: number;
    connections?: number;
    initialSync?: boolean;
  }> {
    const response = await axios.get(`${API_BASE}/bitcoin/status`);
    return response.data;
  }

  async startBitcoinCore(network: 'mainnet' | 'testnet'): Promise<{
    success: boolean;
    message?: string;
    building?: boolean;
    error?: string;
  }> {
    const response = await axios.post(`${API_BASE}/bitcoin/start`, { network });
    return response.data;
  }

  async stopBitcoinCore(network: 'mainnet' | 'testnet'): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const response = await axios.post(`${API_BASE}/bitcoin/stop`, { network });
    return response.data;
  }

  async restartBitcoinCore(network: 'mainnet' | 'testnet'): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const response = await axios.post(`${API_BASE}/bitcoin/restart`, { network });
    return response.data;
  }

  async getBitcoinCoreLogs(network: 'mainnet' | 'testnet', lines: number = 100): Promise<{
    success: boolean;
    logs?: string;
    error?: string;
  }> {
    const response = await axios.get(`${API_BASE}/bitcoin/logs?network=${network}&lines=${lines}`);
    return response.data;
  }

  async getBitcoinConfig(network: 'mainnet' | 'testnet'): Promise<{
    success: boolean;
    config?: string;
    error?: string;
  }> {
    const response = await axios.get(`${API_BASE}/bitcoin/config?network=${network}`);
    return response.data;
  }

  async updateBitcoinConfig(network: 'mainnet' | 'testnet', config: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const response = await axios.post(`${API_BASE}/bitcoin/config`, { network, config });
    return response.data;
  }
  // Monitoring endpoints
  async getMonitoringDashboard(): Promise<MonitoringDashboard> {
    const response = await axios.get(`${API_BASE}/monitoring/dashboard`);
    return response.data;
  }

  async getMonitoringMiners(): Promise<{ miners: EnrichedMiner[]; count: number }> {
    const response = await axios.get(`${API_BASE}/monitoring/miners`);
    return response.data;
  }

  async getGlobalHashrateHistory(): Promise<{ history: HashrateDataPoint[] }> {
    const response = await axios.get(`${API_BASE}/monitoring/hashrate/global`);
    return response.data;
  }

  async getMinerHashrateHistory(userIdentity: string): Promise<{ history: HashrateDataPoint[] }> {
    const response = await axios.get(`${API_BASE}/monitoring/hashrate/${encodeURIComponent(userIdentity)}`);
    return response.data;
  }
}

export const apiService = new ApiService();
