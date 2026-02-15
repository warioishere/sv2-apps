import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../../services/api.service';
import './BitcoinCore.css';

interface BitcoinStatus {
  running: boolean;
  building?: boolean;
  message?: string;
  network?: 'mainnet' | 'testnet';
  container?: string;
  blockHeight?: number;
  connections?: number;
  initialSync?: boolean;
}

type ManagementMode = 'integrated' | 'external';

export function BitcoinCore() {
  const [mode, setMode] = useState<ManagementMode>('integrated');
  const [status, setStatus] = useState<BitcoinStatus>({ running: false });
  const [logs, setLogs] = useState<string>('');
  const [config, setConfig] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'config'>('logs');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string>('');

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status.running && activeTab === 'logs') {
      fetchLogs();
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [status.running, activeTab]);

  useEffect(() => {
    if (status.running && activeTab === 'config' && !config) {
      loadConfig();
    }
  }, [status.running, activeTab]);

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleLogsScroll = () => {
    if (!logsContainerRef.current) return;
    const el = logsContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const fetchStatus = async () => {
    try {
      const data = await apiService.getBitcoinCoreStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch Bitcoin Core status:', error);
    }
  };

  const fetchLogs = async () => {
    if (!status.network) return;
    try {
      const response = await fetch(`/api/bitcoin/logs?network=${status.network}&lines=100`);
      const data = await response.json();
      if (data.success && data.logs !== prevLogsRef.current) {
        prevLogsRef.current = data.logs;
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const loadConfig = async () => {
    if (!status.network) return;
    try {
      const response = await fetch(`/api/bitcoin/config?network=${status.network}`);
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage({ type: 'error', text: 'Failed to load bitcoin.conf' });
    }
  };

  const saveConfig = async () => {
    if (!status.network) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/bitcoin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: status.network, config }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: 'bitcoin.conf saved successfully. Restart Bitcoin Core for changes to take effect.',
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save config' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!status.network) return;
    setLoading(true);
    setMessage(null);

    try {
      const result = await apiService.stopBitcoinCore(status.network);
      if (result.success) {
        setMessage({ type: 'success', text: 'Bitcoin Core stopped successfully' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to stop Bitcoin Core' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!status.network) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/bitcoin/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: status.network }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Bitcoin Core restarted successfully' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to restart Bitcoin Core' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchNetwork = async () => {
    if (!status.network) return;
    const targetNetwork = status.network === 'mainnet' ? 'testnet' : 'mainnet';
    const confirmed = window.confirm(
      `Switch from ${status.network} to ${targetNetwork}? This will stop the current Bitcoin Core instance and start it on ${targetNetwork}.`
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);

    try {
      const stopResult = await apiService.stopBitcoinCore(status.network);
      if (!stopResult.success) {
        setMessage({ type: 'error', text: stopResult.message || 'Failed to stop current network' });
        setLoading(false);
        return;
      }

      const startResult = await apiService.startBitcoinCore(targetNetwork);
      if (startResult.success) {
        setMessage({
          type: 'success',
          text: startResult.building
            ? `Switched to ${targetNetwork}. Building Bitcoin Core (15-20 minutes).`
            : `Switched to ${targetNetwork} successfully`,
        });
        setLogs('');
        setConfig('');
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: startResult.message || `Failed to start ${targetNetwork}` });
        await fetchStatus();
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (network: 'mainnet' | 'testnet') => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await apiService.startBitcoinCore(network);
      if (result.success) {
        setMessage({
          type: 'success',
          text: result.building
            ? 'Building Bitcoin Core (15-20 minutes). Container will start automatically.'
            : 'Bitcoin Core started successfully',
        });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to start Bitcoin Core' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${(error as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bitcoin-core">
      <div className="bitcoin-core-header">
        <h2>Bitcoin Core Management</h2>
      </div>

      {/* Mode Selector */}
      <div className="mode-selector">
        <label className={`mode-option ${mode === 'integrated' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="mode"
            value="integrated"
            checked={mode === 'integrated'}
            onChange={() => setMode('integrated')}
          />
          <span>Integrated (Managed by this GUI)</span>
        </label>
        <label className={`mode-option ${mode === 'external' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="mode"
            value="external"
            checked={mode === 'external'}
            onChange={() => setMode('external')}
          />
          <span>External (Your own Bitcoin Core)</span>
        </label>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
          <button className="message-close" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      {mode === 'external' ? (
        <div className="external-mode">
          <div className="info-box">
            <h3>External Bitcoin Core</h3>
            <p>
              You are using your own Bitcoin Core installation. This GUI does not manage external
              Bitcoin Core instances.
            </p>
            <ul>
              <li>Configure sv2-tp to connect to your Bitcoin Core IPC socket</li>
              <li>Ensure Bitcoin Core is built with <code>--enable-multiprocess</code></li>
              <li>
                Manage your Bitcoin Core through its own interface (bitcoin-cli, RPC, etc.)
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="integrated-mode">
          {/* Status Section */}
          <div className="status-section">
            <div className="status-row">
              <div className="status-item">
                <span className="label">Status:</span>
                <span className={`value ${status.running ? 'running' : 'stopped'}`}>
                  {status.building
                    ? 'Building...'
                    : status.running
                    ? 'Running'
                    : 'Stopped'}
                </span>
              </div>
              {status.network && (
                <div className="status-item">
                  <span className="label">Network:</span>
                  <span className="value">{status.network}</span>
                </div>
              )}
              {status.blockHeight !== undefined && (
                <div className="status-item">
                  <span className="label">Block Height:</span>
                  <span className="value">{status.blockHeight.toLocaleString()}</span>
                </div>
              )}
              {status.initialSync !== undefined && (
                <div className="status-item">
                  <span className="label">Initial Sync:</span>
                  <span className="value">{status.initialSync ? 'In Progress' : 'Complete'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="controls">
            {!status.running && !status.building && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => handleStart('testnet')}
                  disabled={loading}
                >
                  Start Testnet
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleStart('mainnet')}
                  disabled={loading}
                >
                  Start Mainnet
                </button>
              </>
            )}
            {status.running && (
              <>
                <button
                  className="btn btn-warning"
                  onClick={handleRestart}
                  disabled={loading}
                >
                  Restart
                </button>
                <button
                  className="btn btn-switch"
                  onClick={handleSwitchNetwork}
                  disabled={loading}
                >
                  Switch to {status.network === 'mainnet' ? 'Testnet' : 'Mainnet'}
                </button>
                <button className="btn btn-danger" onClick={handleStop} disabled={loading}>
                  Stop
                </button>
              </>
            )}
            {status.building && (
              <div className="building-notice">
                {status.message || 'Building Bitcoin Core image...'}
              </div>
            )}
          </div>

          {/* Tabs */}
          {status.running && (
            <>
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('logs')}
                >
                  Logs
                </button>
                <button
                  className={`tab ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => setActiveTab('config')}
                >
                  Configuration (bitcoin.conf)
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'logs' && (
                  <div className="logs-section">
                    <div className="logs-header">
                      <h3>Live Logs</h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-small"
                          onClick={() => setAutoScroll(!autoScroll)}
                          style={{
                            backgroundColor: autoScroll ? '#28a745' : '#6c757d',
                            color: 'white'
                          }}
                        >
                          {autoScroll ? '⏸ Pause Auto-scroll' : '▶ Resume Auto-scroll'}
                        </button>
                        <button className="btn-small" onClick={fetchLogs} disabled={loading}>
                          🔄 Refresh
                        </button>
                      </div>
                    </div>
                    <div className="logs-container" ref={logsContainerRef} onScroll={handleLogsScroll}>
                      <pre className="logs">{logs || 'No logs available'}</pre>
                    </div>
                  </div>
                )}

                {activeTab === 'config' && (
                  <div className="config-section">
                    <div className="config-header">
                      <h3>bitcoin.conf Editor</h3>
                      <button
                        className="btn btn-primary"
                        onClick={saveConfig}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : 'Save Configuration'}
                      </button>
                    </div>
                    <textarea
                      className="config-editor"
                      value={config}
                      onChange={(e) => setConfig(e.target.value)}
                      placeholder="Loading bitcoin.conf..."
                      spellCheck={false}
                    />
                    <p className="config-note">
                      Note: Bitcoin Core must be restarted for configuration changes to take
                      effect.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
