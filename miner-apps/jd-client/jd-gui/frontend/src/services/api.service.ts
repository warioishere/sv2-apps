import axios from 'axios';
import { ConfigInput, ProcessStatus, ValidationResult, LogEntry } from '../types/config.types';

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
}

export const apiService = new ApiService();
