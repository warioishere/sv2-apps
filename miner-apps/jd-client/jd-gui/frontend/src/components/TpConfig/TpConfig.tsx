import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api.service';
import './TpConfig.css';

interface TpConfigData {
  bitcoin_source: 'integrated-mainnet' | 'integrated-testnet' | 'host-custom';
  custom_path?: string;
  network: 'mainnet' | 'testnet' | 'signet' | 'regtest';
  listen_address: string;
  fee_check_interval: number;
  min_fee_rate: number;
  log_level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
}

interface TpStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  config_file?: string;
}

interface PathValidationResult {
  valid: boolean;
  exists?: boolean;
  error?: string;
}

export function TpConfig() {
  const [config, setConfig] = useState<TpConfigData>({
    bitcoin_source: 'integrated-testnet',
    network: 'testnet',
    listen_address: '0.0.0.0:48442',
    fee_check_interval: 30,
    min_fee_rate: 1000,
    log_level: 'info',
  });

  const [status, setStatus] = useState<TpStatus>({ running: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pathValidation, setPathValidation] = useState<PathValidationResult | null>(null);
  const [validatingPath, setValidatingPath] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'raw' | 'logs'>('form');
  const [rawConfig, setRawConfig] = useState<string>('');
  const [logs, setLogs] = useState<string>('');

  // Auto-detect Bitcoin Core network on mount
  useEffect(() => {
    const detectBitcoinNetwork = async () => {
      try {
        const response = await fetch('/api/bitcoin/status');
        const bitcoinStatus = await response.json();
        if (bitcoinStatus.running && bitcoinStatus.network) {
          const detectedNetwork = bitcoinStatus.network === 'testnet' ? 'testnet' : 'mainnet';
          const bitcoinSource = detectedNetwork === 'mainnet' ? 'integrated-mainnet' : 'integrated-testnet';
          console.log(`🔍 TpConfig: Auto-detected Bitcoin Core running on ${bitcoinStatus.network}, setting to ${bitcoinSource}`);
          setConfig(prev => ({
            ...prev,
            bitcoin_source: bitcoinSource,
            network: detectedNetwork
          }));
        }
      } catch (error) {
        console.error('Failed to detect Bitcoin Core network:', error);
      }
    };

    detectBitcoinNetwork();
  }, []);

  useEffect(() => {
    loadCurrentConfig();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh logs when running and logs tab is active
  useEffect(() => {
    if (status.running && activeTab === 'logs') {
      fetchLogs();
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [status.running, activeTab]);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/tp/logs?count=100');
      const result = await response.json();
      if (result.logs && Array.isArray(result.logs)) {
        const logsText = result.logs.map((log: any) => log.message).join('\n');
        setLogs(logsText);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  // Load raw config when switching to raw tab
  useEffect(() => {
    if (activeTab === 'raw' && !rawConfig) {
      loadRawConfig();
    }
  }, [activeTab]);

  // Validate custom path when it changes
  useEffect(() => {
    if (config.bitcoin_source === 'host-custom' && config.custom_path) {
      validatePath(config.custom_path);
    } else {
      setPathValidation(null);
    }
  }, [config.custom_path, config.bitcoin_source]);

  const fetchStatus = async () => {
    try {
      const data = await apiService.getTpStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch TP status:', error);
    }
  };

  const loadCurrentConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tp/config/current');
      const result = await response.json();
      if (result.success && result.config) {
        // Parse the raw config and update form fields
        const parsedConfig = parseConfigFromRaw(result.config);
        console.log('📄 TpConfig: Loaded saved config:', parsedConfig);
        setConfig(prev => ({ ...prev, ...parsedConfig }));
      } else {
        console.log('⚠️ TpConfig: No saved config found, using defaults/auto-detected network');
      }
    } catch (error) {
      console.error('Failed to load current config:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseConfigFromRaw = (rawConfig: string): Partial<TpConfigData> => {
    const lines = rawConfig.split('\n');
    const parsed: any = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;

      const [key, value] = trimmed.split('=').map(s => s.trim());

      if (key === 'datadir') {
        // Parse datadir to determine bitcoin_source
        if (value.includes('/bitcoin-ipc-mainnet')) {
          parsed.bitcoin_source = 'integrated-mainnet';
          parsed.network = 'mainnet';
        } else if (value.includes('/bitcoin-ipc-testnet')) {
          parsed.bitcoin_source = 'integrated-testnet';
          parsed.network = 'testnet';
        } else {
          parsed.bitcoin_source = 'host-custom';
          parsed.custom_path = value;
        }
      } else if (key === 'chain') {
        parsed.network = value === 'testnet' ? 'testnet' : value;
      } else if (key === 'sv2bind') {
        parsed.listen_address = value;
      } else if (key === 'sv2interval') {
        parsed.fee_check_interval = parseInt(value) || 30;
      } else if (key === 'sv2feedelta') {
        parsed.min_fee_rate = parseInt(value) || 1000;
      } else if (key === 'loglevel' && value.includes(':')) {
        const level = value.split(':')[1].trim();
        parsed.log_level = level;
      }
    }

    return parsed;
  };

  const loadRawConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/tp/config/current');
      const result = await response.json();
      if (result.success && result.config) {
        setRawConfig(result.config);

        // Parse and update form fields
        const parsedConfig = parseConfigFromRaw(result.config);
        setConfig(prev => ({ ...prev, ...parsedConfig }));
      } else {
        setMessage({ type: 'error', text: result.message || 'Configuration file not found' });
      }
    } catch (error) {
      console.error('Failed to load raw config:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration file' });
    } finally {
      setLoading(false);
    }
  };

  const saveRawConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/tp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: rawConfig }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Configuration saved successfully! File: ${result.path || '/app/config/sv2-tp/sv2-tp.conf'}`,
        });
        // Reload config to update form fields
        await loadCurrentConfig();
      } else {
        setMessage({
          type: 'error',
          text: `Failed to save configuration: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error saving configuration: ${(error as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const validatePath = async (path: string) => {
    setValidatingPath(true);
    try {
      const response = await fetch('/api/tp/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const result = await response.json();
      setPathValidation(result);
    } catch (error) {
      setPathValidation({
        valid: false,
        error: 'Failed to validate path',
      });
    } finally {
      setValidatingPath(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Generate Bitcoin Core style config (key=value format)
      const bitcoinCoreConfig = generateBitcoinCoreConfig();

      // Save config
      const response = await fetch('/api/tp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: bitcoinCoreConfig }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Configuration saved successfully! File: ${result.path || '/app/config/sv2-tp/sv2-tp.conf'}`,
        });
        // Reload config to ensure consistency between tabs
        await loadCurrentConfig();
        if (activeTab === 'raw') {
          await loadRawConfig();
        }
      } else {
        setMessage({
          type: 'error',
          text: `Failed to save configuration: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error saving configuration: ${(error as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirm('Restore configuration to defaults based on running Bitcoin Core network?')) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/tp/config/restore', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: `${result.message} (${result.chain})` });
        setRawConfig(result.config);
        // Reload form fields from restored config
        await loadCurrentConfig();
      } else {
        setMessage({ type: 'error', text: `Failed to restore: ${result.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error restoring config: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await apiService.startTp();
      if (result.success) {
        setMessage({ type: 'success', text: 'Template Provider started successfully!' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: `Failed to start: ${result.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error starting Template Provider: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const generateBitcoinCoreConfig = (): string => {
    // Determine Bitcoin Core data directory based on source
    let bitcoinDataDir: string;
    let chain: string;

    switch (config.bitcoin_source) {
      case 'integrated-mainnet':
        bitcoinDataDir = '/bitcoin-ipc-mainnet';
        chain = 'main';
        break;
      case 'integrated-testnet':
        bitcoinDataDir = '/bitcoin-ipc-testnet';
        chain = 'test';
        break;
      case 'host-custom':
        bitcoinDataDir = config.custom_path || '/host-bitcoin/mainnet';
        // Convert network names to chain values
        chain = config.network === 'mainnet' ? 'main' : config.network === 'testnet' ? 'test' : config.network;
        break;
      default:
        bitcoinDataDir = '/bitcoin-ipc-testnet';
        chain = 'test';
    }

    return `# Stratum V2 Template Provider Configuration
# Generated by JD-Client GUI
# Network: ${config.network}

# Bitcoin Core data directory (where node.sock IPC socket is located)
datadir=${bitcoinDataDir}

# Network (main, test, signet, regtest)
chain=${chain}

# Connect to Bitcoin Core via IPC (Unix socket)
ipcconnect=unix

# Template Provider listening address (where JD-Client connects)
sv2bind=${config.listen_address}

# Stratum V2 interval (seconds) - how often to check for new templates
sv2interval=${config.fee_check_interval}

# Fee delta (sats/vB) - minimum fee rate threshold
sv2feedelta=${config.min_fee_rate}

# Logging (printtoconsole avoids needing writable datadir for sv2-debug.log)
printtoconsole=1
debug=sv2
loglevel=sv2:${config.log_level}
debug=ipc
`;
  };

  const getBitcoinSourcePath = (): string => {
    switch (config.bitcoin_source) {
      case 'integrated-mainnet':
        return '/bitcoin-ipc-mainnet';
      case 'integrated-testnet':
        return '/bitcoin-ipc-testnet';
      case 'host-custom':
        return config.custom_path || '(not set)';
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await apiService.stopTp();
      if (result.success) {
        setMessage({ type: 'success', text: 'Template Provider stopped successfully!' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: `Failed to stop: ${result.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error stopping Template Provider: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      const result = await apiService.restartTp();
      if (result.success) {
        setMessage({ type: 'success', text: 'Template Provider restarted successfully!' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: `Failed to restart: ${result.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error restarting Template Provider: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tp-config">
      <div className="tp-config-header">
        <h2>Template Provider</h2>
        <div className={`status-badge ${status.running ? 'running' : 'stopped'}`}>
          {status.running ? 'Running' : 'Stopped'}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="control-buttons">
        <button
          onClick={handleStart}
          disabled={status.running || loading}
          className="btn btn-success"
        >
          {loading ? 'Starting...' : 'Start'}
        </button>

        <button
          onClick={handleStop}
          disabled={!status.running || loading}
          className="btn btn-danger"
        >
          {loading ? 'Stopping...' : 'Stop'}
        </button>

        <button
          onClick={handleRestart}
          disabled={loading}
          className="btn btn-warning"
        >
          {loading ? 'Restarting...' : 'Restart'}
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
          <button className="message-close" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          Form View
        </button>
        <button
          className={`tab ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw Configuration (sv2-tp.conf)
        </button>
        <button
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => { setActiveTab('logs'); fetchLogs(); }}
        >
          Logs
        </button>
      </div>

      {activeTab === 'raw' && (
        <div className="config-editor-section">
          <div className="config-header">
            <h3>sv2-tp.conf Editor</h3>
            <div className="config-header-buttons">
              <button
                className="btn btn-secondary"
                onClick={handleRestoreDefaults}
                disabled={loading || status.running}
              >
                Restore Defaults
              </button>
              <button
                className="btn btn-primary"
                onClick={saveRawConfig}
                disabled={saving || status.running}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
          <textarea
            className="config-editor"
            value={rawConfig}
            onChange={(e) => setRawConfig(e.target.value)}
            placeholder="Loading sv2-tp.conf..."
            spellCheck={false}
            disabled={status.running}
          />
          <p className="config-note">
            {status.running
              ? 'Template Provider is running. Stop it to modify configuration.'
              : 'Note: Template Provider must be restarted for configuration changes to take effect.'}
          </p>
        </div>
      )}

      {activeTab === 'form' && (
      <div className="config-form">
        {/* Bitcoin Core Source */}
        <div className="form-section">
          <h3>Bitcoin Core Source</h3>
          <p className="section-description">
            Select where sv2-tp should connect to Bitcoin Core for block templates.
          </p>

          <div className="radio-group">
            <label className={`radio-option ${config.bitcoin_source === 'integrated-testnet' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="bitcoin_source"
                value="integrated-testnet"
                checked={config.bitcoin_source === 'integrated-testnet'}
                onChange={(e) => setConfig({ ...config, bitcoin_source: e.target.value as any, network: 'testnet' })}
                disabled={status.running}
              />
              <div className="radio-content">
                <div className="radio-title">Integrated Docker Container (Testnet4)</div>
                <div className="radio-subtitle">Path: /bitcoin-ipc-testnet/node.sock</div>
                <div className="radio-description">
                  Connect to the testnet4 Bitcoin Core container managed by this GUI.
                  Recommended for testing.
                </div>
              </div>
            </label>

            <label className={`radio-option ${config.bitcoin_source === 'integrated-mainnet' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="bitcoin_source"
                value="integrated-mainnet"
                checked={config.bitcoin_source === 'integrated-mainnet'}
                onChange={(e) => setConfig({ ...config, bitcoin_source: e.target.value as any, network: 'mainnet' })}
                disabled={status.running}
              />
              <div className="radio-content">
                <div className="radio-title">Integrated Docker Container (Mainnet)</div>
                <div className="radio-subtitle">Path: /bitcoin-ipc-mainnet/node.sock</div>
                <div className="radio-description">
                  Connect to the mainnet Bitcoin Core container managed by this GUI.
                  For production use.
                </div>
              </div>
            </label>

            <label className={`radio-option ${config.bitcoin_source === 'host-custom' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="bitcoin_source"
                value="host-custom"
                checked={config.bitcoin_source === 'host-custom'}
                onChange={(e) => setConfig({ ...config, bitcoin_source: e.target.value as any })}
                disabled={status.running}
              />
              <div className="radio-content">
                <div className="radio-title">Existing on Host</div>
                <div className="radio-subtitle">Custom path to existing Bitcoin Core IPC socket</div>
                <div className="radio-description">
                  Connect to an existing Bitcoin Core installation on the host machine.
                </div>
              </div>
            </label>
          </div>

          {config.bitcoin_source === 'host-custom' && (
            <div className="custom-path-input">
              <label htmlFor="custom-path">Bitcoin Core IPC Socket Path:</label>
              <input
                id="custom-path"
                type="text"
                className="form-input"
                placeholder="/host-bitcoin/mainnet/node.sock"
                value={config.custom_path || ''}
                onChange={(e) => setConfig({ ...config, custom_path: e.target.value })}
                disabled={status.running}
              />
              {validatingPath && <span className="validating">Validating...</span>}
              {pathValidation && !validatingPath && (
                <div className={`validation-result ${pathValidation.valid ? 'valid' : 'invalid'}`}>
                  {pathValidation.valid ? (
                    <span>Socket exists and is accessible</span>
                  ) : (
                    <span>{pathValidation.error || 'Socket not found or not accessible'}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Network */}
        <div className="form-section">
          <h3>Network</h3>
          <p className="section-description">
            Bitcoin network to use. Should match your Bitcoin Core configuration.
          </p>
          <select
            className="form-select"
            value={config.network}
            onChange={(e) => setConfig({ ...config, network: e.target.value as any })}
            disabled={status.running || config.bitcoin_source !== 'host-custom'}
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
            <option value="signet">Signet</option>
            <option value="regtest">Regtest</option>
          </select>
          {config.bitcoin_source !== 'host-custom' && (
            <p className="field-note">Network is automatically set based on Bitcoin Core source.</p>
          )}
        </div>

        {/* Listen Address */}
        <div className="form-section">
          <h3>Listen Address</h3>
          <p className="section-description">
            Address and port where sv2-tp listens for JD-Client connections.
          </p>
          <input
            type="text"
            className="form-input"
            value={config.listen_address}
            onChange={(e) => setConfig({ ...config, listen_address: e.target.value })}
            disabled={status.running}
            placeholder="0.0.0.0:48442"
          />
          <p className="field-note">
            JD-Client will connect to this address. Default: 0.0.0.0:48442
          </p>
        </div>

        {/* Fee Settings */}
        <div className="form-section">
          <h3>Fee Settings</h3>
          <p className="section-description">
            Configure how often to check fees and minimum fee rate.
          </p>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="fee-interval">Fee Check Interval (seconds):</label>
              <input
                id="fee-interval"
                type="number"
                className="form-input"
                value={config.fee_check_interval}
                onChange={(e) => setConfig({ ...config, fee_check_interval: parseInt(e.target.value) || 30 })}
                disabled={status.running}
                min="1"
                max="3600"
              />
              <p className="field-note">How often to check Bitcoin Core for updated fees.</p>
            </div>

            <div className="form-field">
              <label htmlFor="min-fee">Minimum Fee Rate (sats/vB):</label>
              <input
                id="min-fee"
                type="number"
                className="form-input"
                value={config.min_fee_rate}
                onChange={(e) => setConfig({ ...config, min_fee_rate: parseInt(e.target.value) || 1000 })}
                disabled={status.running}
                min="1"
              />
              <p className="field-note">Minimum fee rate to include in block templates.</p>
            </div>
          </div>
        </div>

        {/* Log Level */}
        <div className="form-section">
          <h3>Log Level</h3>
          <p className="section-description">
            Set the verbosity of Template Provider logs.
          </p>
          <select
            className="form-select"
            value={config.log_level}
            onChange={(e) => setConfig({ ...config, log_level: e.target.value as any })}
            disabled={status.running}
          >
            <option value="trace">Trace (Very Verbose)</option>
            <option value="debug">Debug (Verbose)</option>
            <option value="info">Info (Default)</option>
            <option value="warn">Warn (Minimal)</option>
            <option value="error">Error (Critical Only)</option>
          </select>
        </div>

        {/* Configuration Preview */}
        <div className="form-section config-preview">
          <h3>Configuration Preview</h3>
          <div className="preview-box">
            <div className="preview-item">
              <span className="preview-label">Bitcoin Core Socket:</span>
              <span className="preview-value">{getBitcoinSourcePath()}</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Network:</span>
              <span className="preview-value">{config.network}</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Listen Address:</span>
              <span className="preview-value">{config.listen_address}</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Fee Check Interval:</span>
              <span className="preview-value">{config.fee_check_interval}s</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Min Fee Rate:</span>
              <span className="preview-value">{config.min_fee_rate} sats/vB</span>
            </div>
            <div className="preview-item">
              <span className="preview-label">Log Level:</span>
              <span className="preview-value">{config.log_level}</span>
            </div>
          </div>
        </div>

        {/* Save / Restore Buttons */}
        <div className="form-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={handleSave}
            disabled={saving || status.running}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleRestoreDefaults}
            disabled={loading || status.running}
          >
            Restore Defaults
          </button>
          {status.running && (
            <div className="running-notice">
              Template Provider is running. Stop it to modify configuration.
            </div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'logs' && (
        <div className="logs-section">
          <div className="logs-header">
            <h3>Template Provider Logs</h3>
            <button
              className="btn btn-secondary"
              onClick={fetchLogs}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="logs-container">
            <pre className="logs-content">{logs || (status.running ? 'No logs yet...' : 'Template Provider is not running.')}</pre>
          </div>
        </div>
      )}

      <div className="info-box">
        <h4>About Template Provider Configuration</h4>
        <p>
          The Template Provider (sv2-tp) connects to Bitcoin Core and provides block templates
          to JD-Client. It supports both local IPC (Unix socket) and remote RPC connections.
        </p>
        <ul>
          <li>IPC connections are faster and more secure than RPC</li>
          <li>Integrated containers are pre-configured with IPC enabled</li>
          <li>Custom paths allow connection to existing Bitcoin Core installations</li>
          <li>The listen address should be accessible to JD-Client (default: 127.0.0.1:48442)</li>
        </ul>
      </div>
    </div>
  );
}
