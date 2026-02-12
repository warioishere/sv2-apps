import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api.service';
import './SetupWizard.css';

interface WizardState {
  bitcoinCoreType: 'existing' | 'integrated' | null;
  network: 'mainnet' | 'testnet4' | null;
  poolAddress: string;
  poolPort: string;
  jdsAddress: string;
  jdsPort: string;
  authorityPubkey: string;
  userIdentity: string;
  coinbaseAddress: string;
}

interface DetectionResult {
  detected: boolean;
  network?: string;
  path?: string;
  version?: string;
  versionValid?: boolean;
  ipcEnabled?: boolean;
  recommendations?: string[];
  setupInstructions?: string[];
}

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

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    bitcoinCoreType: null,
    network: null,
    poolAddress: '',
    poolPort: '43333',
    jdsAddress: '',
    jdsPort: '43334',
    authorityPubkey: '',
    userIdentity: 'jdc_user',
    coinbaseAddress: '',
  });

  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [bitcoinStatus, setBitcoinStatus] = useState<BitcoinCoreStatus | null>(null);
  const [startingBitcoin, setStartingBitcoin] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [bitcoinLogs, setBitcoinLogs] = useState<string[]>([]);
  const [showBitcoinLogs, setShowBitcoinLogs] = useState(false);
  const [liveLogsEnabled, setLiveLogsEnabled] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Check for existing configuration on mount and pre-fill wizard
  useEffect(() => {
    const checkExistingConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.config) {
            setExistingConfig(result);

            // Pre-fill wizard with existing values
            const config = result.config;
            setState(prev => ({
              ...prev,
              poolAddress: config.upstreams?.[0]?.pool_address?.split(':')[0] || prev.poolAddress,
              poolPort: config.upstreams?.[0]?.pool_address?.split(':')[1] || prev.poolPort,
              jdsAddress: config.upstreams?.[0]?.jd_address?.split(':')[0] || prev.jdsAddress,
              jdsPort: config.upstreams?.[0]?.jd_address?.split(':')[1] || prev.jdsPort,
              authorityPubkey: config.upstreams?.[0]?.authority_pubkey || prev.authorityPubkey,
              userIdentity: config.user_identity || prev.userIdentity,
              coinbaseAddress: extractAddressFromScript(config.coinbase_reward_script) || prev.coinbaseAddress,
            }));

            console.log('✅ Wizard pre-filled with existing config:', config);
          }
        }
      } catch (error) {
        console.error('Failed to check existing config:', error);
      } finally {
        setCheckingExisting(false);
      }
    };

    checkExistingConfig();
  }, []);

  // Helper to extract Bitcoin address from addr() format
  const extractAddressFromScript = (script: string): string => {
    if (!script) return '';
    const match = script.match(/addr\(([^)]+)\)/);
    return match ? match[1] : script;
  };

  // Auto-detect Bitcoin Core when user selects existing
  useEffect(() => {
    if (state.bitcoinCoreType === 'existing' && step === 0) {
      detectBitcoinCore();
    }
  }, [state.bitcoinCoreType, step]);

  const detectBitcoinCore = async () => {
    setDetecting(true);
    try {
      const result = await apiService.detectBitcoinCore();
      setDetectionResult(result);
      if (result.detected && result.network) {
        setState(prev => ({ ...prev, network: result.network as 'mainnet' | 'testnet4' }));
      }
    } catch (error) {
      console.error('Detection failed:', error);
      setDetectionResult({ detected: false });
    } finally {
      setDetecting(false);
    }
  };

  const checkBitcoinStatus = async () => {
    try {
      const response = await fetch('/api/bitcoin/status');
      const status = await response.json();
      setBitcoinStatus(status);
    } catch (error) {
      console.error('Failed to check Bitcoin status:', error);
    }
  };

  const startBitcoinCore = async () => {
    setStartingBitcoin(true);
    setShowBitcoinLogs(true);
    try {
      const response = await fetch('/api/bitcoin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: selectedNetwork }),
      });
      const result = await response.json();
      if (result.success) {
        setState(prev => ({
          ...prev,
          bitcoinCoreType: 'integrated',
          network: selectedNetwork === 'testnet' ? 'testnet4' : 'mainnet'
        }));
        setTimeout(checkBitcoinStatus, 2000);
        setTimeout(fetchBitcoinLogs, 3000);
        const statusInterval = setInterval(checkBitcoinStatus, 5000);
        const logsInterval = setInterval(fetchBitcoinLogs, 10000);
        (window as any).bitcoinStatusInterval = statusInterval;
        (window as any).bitcoinLogsInterval = logsInterval;
      }
    } catch (error) {
      console.error('Failed to start Bitcoin Core:', error);
      alert('Failed to start Bitcoin Core. Check logs for details.');
    } finally {
      setStartingBitcoin(false);
    }
  };

  const fetchBitcoinLogs = async () => {
    if (!bitcoinStatus?.network) return;
    try {
      const response = await fetch(`/api/bitcoin/logs?network=${bitcoinStatus.network}&lines=50`);
      const result = await response.json();
      if (result.success && result.logs) {
        setBitcoinLogs(result.logs.split('\n').filter((line: string) => line.trim()));
      }
    } catch (error) {
      console.error('Failed to fetch Bitcoin logs:', error);
    }
  };

  const stopBitcoinCore = async () => {
    if (!bitcoinStatus?.network) return;
    try {
      const response = await fetch('/api/bitcoin/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: bitcoinStatus.network }),
      });
      const result = await response.json();
      if (result.success) {
        if ((window as any).bitcoinStatusInterval) {
          clearInterval((window as any).bitcoinStatusInterval);
        }
        if ((window as any).bitcoinLogsInterval) {
          clearInterval((window as any).bitcoinLogsInterval);
        }
        setBitcoinStatus(null);
        setDetectionResult(null);
        setShowBitcoinLogs(false);
        setBitcoinLogs([]);
        setState(prev => ({ ...prev, bitcoinCoreType: null, network: null }));
      }
    } catch (error) {
      console.error('Failed to stop Bitcoin Core:', error);
      alert('Failed to stop Bitcoin Core.');
    }
  };

  useEffect(() => {
    checkBitcoinStatus();
    const interval = setInterval(checkBitcoinStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-set network when bitcoinStatus is detected
  useEffect(() => {
    if (bitcoinStatus?.running && bitcoinStatus.network && !state.network) {
      const detectedNetwork = bitcoinStatus.network === 'testnet' ? 'testnet4' : 'mainnet';
      console.log(`Auto-detected running Bitcoin Core on ${bitcoinStatus.network}, setting wizard network to ${detectedNetwork}`);
      setState(prev => ({
        ...prev,
        network: detectedNetwork,
        bitcoinCoreType: prev.bitcoinCoreType || 'integrated'
      }));
    }
  }, [bitcoinStatus?.running, bitcoinStatus?.network]);

  useEffect(() => {
    if (showBitcoinLogs) {
      setLiveLogsEnabled(true);
    }
  }, [showBitcoinLogs]);

  useEffect(() => {
    if (liveLogsEnabled && showBitcoinLogs && bitcoinStatus?.running) {
      fetchBitcoinLogs();
      const interval = setInterval(fetchBitcoinLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [liveLogsEnabled, showBitcoinLogs, bitcoinStatus?.running]);

  const handleAutoConfigure = async () => {
    setConfiguring(true);
    try {
      // Get network directly from bitcoinStatus - EXACTLY like BitcoinCore component does
      if (!bitcoinStatus?.network) {
        alert('⚠️ Bitcoin Core network not detected! Please ensure Bitcoin Core is running and synced.');
        setConfiguring(false);
        return;
      }

      // Use the network from Bitcoin Core status - trust the API!
      const finalNetwork = bitcoinStatus.network === 'testnet' ? 'testnet4' : 'mainnet';

      // Determine Bitcoin Core data directory based on detected network
      const bitcoinCoreDataDir = bitcoinStatus.network === 'mainnet'
        ? '/bitcoin-ipc-mainnet'
        : '/bitcoin-ipc-testnet';

      console.log('🔍 Wizard saving config (using bitcoinStatus.network directly):', {
        'bitcoinStatus.network (SOURCE OF TRUTH)': bitcoinStatus.network,
        'finalNetwork (converted for wizard)': finalNetwork,
        'bitcoinCoreDataDir': bitcoinCoreDataDir,
      });

      // Generate full stack configuration (sv2-tp + JD-Client)
      const response = await fetch('/api/wizard/full-stack-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: finalNetwork,
          poolAddress: state.poolAddress,
          poolPort: parseInt(state.poolPort),
          jdsAddress: state.jdsAddress,
          jdsPort: parseInt(state.jdsPort),
          authorityPubkey: state.authorityPubkey,
          userIdentity: state.userIdentity,
          coinbaseAddress: state.coinbaseAddress,
          bitcoinCoreDataDir,
        }),
      });

      const result = await response.json();
      if (result.success && result.jdcConfig) {
        // Save JD-Client config
        await apiService.saveConfig(result.jdcConfig);

        alert('✅ Configuration saved!\n\n' +
              '📁 sv2-tp config: ' + result.tpConfigPath + '\n' +
              '📁 JD-Client config: /app/config/jdc.toml\n\n' +
              '🚀 Go to the Status panel to start Template Provider and JD-Client!\n\n' +
              '💡 Point your miners to: <this-server-ip>:34265');
        window.location.hash = '#status';
      }
    } catch (error) {
      console.error('Auto-configuration failed:', error);
      alert('❌ Auto-configuration failed. Please check your inputs and try again.');
    } finally {
      setConfiguring(false);
    }
  };

  const renderStep = () => {
    // Show existing config warning if config exists
    if (existingConfig && step === 0) {
      return (
        <div className="wizard-question">
          <h2>✏️ Configuration Already Exists</h2>
          <p className="question-help">
            A JD-Client configuration is already saved. The wizard is <strong>pre-filled with your current settings</strong>.
            You can make changes to specific settings and save, or use the Configuration tab for manual editing.
          </p>

          <div className="existing-config-notice" style={{
            padding: '1.5rem',
            background: '#d1ecf1',
            border: '2px solid #0c5460',
            borderRadius: '8px',
            marginTop: '2rem',
            marginBottom: '2rem'
          }}>
            <h3 style={{ marginTop: 0, color: '#0c5460' }}>✅ Your system is configured</h3>
            <p style={{ color: '#0c5460', marginBottom: '1rem' }}>
              Configuration file exists at <code>/app/config/jdc.toml</code><br/>
              <strong>The wizard has been pre-filled with your current settings.</strong>
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => window.location.hash = '#status'}
                style={{ flex: '1', minWidth: '200px' }}
              >
                📊 Go to Status Panel
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.location.hash = '#config'}
                style={{ flex: '1', minWidth: '200px' }}
              >
                ⚙️ Edit Configuration
              </button>
            </div>
          </div>

          <div style={{
            padding: '1.5rem',
            background: '#e7f3ff',
            border: '2px solid #0066cc',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <h4 style={{ marginTop: 0, color: '#004085' }}>✏️ Modify Configuration</h4>
            <p style={{ color: '#004085', marginBottom: '1rem' }}>
              The wizard is <strong>pre-filled with your current settings</strong>.
              You can step through and change only what you need (like switching mainnet/testnet, updating pool address, etc.)
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setExistingConfig(null)}
              style={{ width: '100%' }}
            >
              ✏️ Modify Settings in Wizard
            </button>
          </div>
        </div>
      );
    }

    switch (step) {
      case 0:
        return (
          <div className="wizard-question">
            <h2>🎯 Bitcoin Core Setup</h2>
            <p className="question-help">
              JD-Client needs Bitcoin Core 30.x to get block templates via IPC (Unix socket).
              Choose your setup:
            </p>

            <div className="options">
              <button
                className={`option-btn ${state.bitcoinCoreType === 'existing' ? 'selected' : ''}`}
                onClick={() => setState(prev => ({ ...prev, bitcoinCoreType: 'existing' }))}
                disabled={bitcoinStatus?.running}
              >
                <div className="option-title">🏠 I have Bitcoin Core 30.x running</div>
                <div className="option-subtitle">On this server with IPC enabled</div>
                <div className="option-desc">
                  This GUI will detect your Bitcoin Core installation and configure JD-Client to use it.
                  <br/><br/>
                  ⚠️ <strong>Requires Bitcoin Core 30+ built with <code>--enable-multiprocess</code></strong> and started with <code>-ipcbind=unix</code>.
                  Standard Bitcoin Core binaries do NOT have IPC support.
                </div>
              </button>
            </div>

            {detecting && <p className="detecting">🔍 Detecting local Bitcoin Core...</p>}

            {detectionResult?.detected && (
              <div className="detection-success">
                ✅ Found Bitcoin Core!
                <div className="detection-details">
                  <div>Network: <strong>{detectionResult.network}</strong></div>
                  <div>Socket: <code>{detectionResult.path}</code></div>
                  {detectionResult.version && (
                    <div>Version: <strong>{detectionResult.version}</strong> {detectionResult.versionValid ? '✅' : '⚠️'}</div>
                  )}
                  {detectionResult.recommendations && detectionResult.recommendations.length > 0 && (
                    <div className="recommendations">
                      {detectionResult.recommendations.map((rec, idx) => (
                        <div key={idx} className="recommendation">{rec}</div>
                      ))}
                    </div>
                  )}
                  {detectionResult.setupInstructions && !detectionResult.versionValid && (
                    <details className="setup-instructions">
                      <summary>📖 Setup Instructions</summary>
                      <pre>{detectionResult.setupInstructions.join('\n')}</pre>
                    </details>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep(1)}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  Continue with this Bitcoin Core →
                </button>
              </div>
            )}

            {detectionResult && !detectionResult.detected && (
              <div className="detection-fail">
                ⚠️ No local Bitcoin Core detected. Is it running with <code>-ipcbind=unix</code> enabled?
                <details className="setup-instructions" style={{ marginTop: '1rem' }}>
                  <summary>📖 How to enable IPC</summary>
                  <pre>{`Start bitcoind with:\n  bitcoind -ipcbind=unix\n\nOr add to bitcoin.conf:\n  ipcbind=unix`}</pre>
                </details>
              </div>
            )}

            <div className="bitcoin-core-container">
              <h3>🐳 Or use integrated Docker stack:</h3>
              <p className="integration-note">
                <strong>✨ Easiest option!</strong> Runs JD-Client + Bitcoin Core together in Docker.
                Bitcoin Core 30.2, pruned (550MB), IPC enabled automatically.
              </p>
              {bitcoinStatus?.building ? (
                <div className="bitcoin-building">
                  <div className="building-header">
                    <div className="spinner">⚙️</div>
                    <h3>Building Bitcoin Core IPC Image...</h3>
                  </div>
                  <p className="building-message">
                    {bitcoinStatus.message || 'Building Bitcoin Core with IPC support (takes ~15-20 minutes)'}
                  </p>
                  <div className="building-progress">
                    <div className="progress-info">
                      <strong>📦 What's happening:</strong>
                      <ul>
                        <li>✓ Cloning Bitcoin Core v30.2 source code</li>
                        <li>⚙️ Building with --enable-multiprocess flag</li>
                        <li>⚙️ Including Cap'n Proto and libmultiprocess</li>
                        <li>⏳ Creating IPC socket support</li>
                      </ul>
                    </div>
                    <p className="build-note">
                      💡 <strong>Tip:</strong> You can view detailed build logs with:<br/>
                      <code>docker logs -f sv2-bc-manager</code>
                    </p>
                  </div>
                  <p className="refresh-note">
                    Status will update automatically every 5 seconds...
                  </p>
                </div>
              ) : !bitcoinStatus?.running ? (
                <div className="bitcoin-start">
                  <label>
                    <input
                      type="radio"
                      checked={selectedNetwork === 'testnet'}
                      onChange={() => setSelectedNetwork('testnet')}
                    />
                    Testnet4 (Recommended for testing)
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={selectedNetwork === 'mainnet'}
                      onChange={() => setSelectedNetwork('mainnet')}
                    />
                    Mainnet (Production)
                  </label>
                  <button
                    className="btn-start-bitcoin"
                    onClick={startBitcoinCore}
                    disabled={startingBitcoin}
                  >
                    {startingBitcoin ? '⏳ Starting...' : '🚀 Start Bitcoin Core'}
                  </button>
                </div>
              ) : (
                <div className="bitcoin-running">
                  <div className="status-header">
                    ✅ Bitcoin Core {bitcoinStatus.network} is running
                    {bitcoinStatus.blockHeight && (
                      <div>Block Height: <strong>{bitcoinStatus.blockHeight.toLocaleString()}</strong></div>
                    )}
                    {bitcoinStatus.connections !== undefined && (
                      <div>Connections: <strong>{bitcoinStatus.connections}</strong></div>
                    )}
                  </div>

                  {bitcoinStatus.initialSync ? (
                    <div className="sync-status">
                      <div className="warning">⏳ Initial Block Download in progress...</div>
                      <p className="sync-note">
                        Bitcoin Core is downloading and verifying the blockchain. This can take several hours.
                        Please wait until sync is complete before continuing.
                      </p>
                    </div>
                  ) : (
                    <div className="sync-complete">
                      <div className="success">✅ Bitcoin Core is synced and ready!</div>
                      <button
                        className="btn-continue"
                        onClick={() => {
                          // Ensure network is set from bitcoinStatus
                          if (bitcoinStatus?.network && !state.network) {
                            setState(prev => ({
                              ...prev,
                              network: bitcoinStatus.network === 'testnet' ? 'testnet4' : 'mainnet',
                              bitcoinCoreType: 'integrated'
                            }));
                          }
                          setStep(1);
                        }}
                      >
                        Continue with Docker Bitcoin Core →
                      </button>
                    </div>
                  )}

                  <div className="bitcoin-controls">
                    <button className="btn-stop-bitcoin" onClick={stopBitcoinCore}>
                      🛑 Stop Bitcoin Core
                    </button>
                  </div>

                  <div className="bitcoin-controls-center">
                    <button
                      className="btn-toggle-logs"
                      onClick={() => setShowBitcoinLogs(!showBitcoinLogs)}
                    >
                      {showBitcoinLogs ? '📋 Hide Logs' : '📋 Show Logs'}
                    </button>
                  </div>

                  {showBitcoinLogs && (
                    <div className="bitcoin-logs">
                      <div className="logs-header">
                        <strong>Bitcoin Core Logs:</strong>
                        <label className="live-toggle">
                          <input
                            type="checkbox"
                            checked={liveLogsEnabled}
                            onChange={(e) => setLiveLogsEnabled(e.target.checked)}
                          />
                          <span>🔴 Live View</span>
                        </label>
                      </div>
                      <pre className="logs-content">
                        {bitcoinLogs.length > 0 ? bitcoinLogs.join('\n') : 'Loading logs...'}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="wizard-question">
            <h2>🌐 Pool & JD-Server Configuration</h2>
            <p className="question-help">
              Enter your Pool and JD-Server (Job Declarator Server) addresses. Miners will connect to JD-Client (port 34265),
              and JD-Client will forward to your pool infrastructure.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  🏊 Pool Address
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="pool.example.com or IP address"
                  value={state.poolAddress}
                  onChange={(e) => setState(prev => ({ ...prev, poolAddress: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  🏊 Pool Port
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="43333"
                  value={state.poolPort}
                  onChange={(e) => setState(prev => ({ ...prev, poolPort: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  📋 JD-Server Address
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="jds.example.com or IP address"
                  value={state.jdsAddress}
                  onChange={(e) => setState(prev => ({ ...prev, jdsAddress: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  📋 JD-Server Port
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="43334"
                  value={state.jdsPort}
                  onChange={(e) => setState(prev => ({ ...prev, jdsPort: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  🔑 Pool Authority Public Key (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Base58 encoded public key"
                  value={state.authorityPubkey}
                  onChange={(e) => setState(prev => ({ ...prev, authorityPubkey: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
                <small style={{ color: '#666', fontSize: '0.85rem' }}>
                  Leave empty if your pool doesn't require authentication
                </small>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(2)}
              disabled={!state.poolAddress || !state.jdsAddress}
              style={{ marginTop: '2rem', width: '100%' }}
            >
              Continue to User Settings →
            </button>
          </div>
        );

      case 2:
        return (
          <div className="wizard-question">
            <h2>👤 User Settings</h2>
            <p className="question-help">
              Configure your miner identity and where to receive mining rewards.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  👤 User Identity
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="jdc_user"
                  value={state.userIdentity}
                  onChange={(e) => setState(prev => ({ ...prev, userIdentity: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
                <small style={{ color: '#666', fontSize: '0.85rem' }}>
                  Your unique identifier for this mining setup
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  💰 Coinbase Reward Address
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="bc1q... (Bitcoin address)"
                  value={state.coinbaseAddress}
                  onChange={(e) => setState(prev => ({ ...prev, coinbaseAddress: e.target.value }))}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '2px solid #dee2e6' }}
                />
                <small style={{ color: '#666', fontSize: '0.85rem' }}>
                  Where you want to receive block rewards (if you mine a block)
                </small>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(3)}
              disabled={!state.userIdentity}
              style={{ marginTop: '2rem', width: '100%' }}
            >
              Review Configuration →
            </button>
          </div>
        );

      case 3:
        return (
          <div className="wizard-recommendation">
            <h2>📋 Review Your Configuration</h2>
            <p className="rec-description">
              Review your JD-Client setup before saving. Miners will connect to this JD-Client on port 34265.
            </p>

            <div className="architecture-diagram">
              <h3>📐 Your Architecture</h3>
              <pre>{`
┌─────────────────┐         ┌────────────────────────────┐
│     Miners      │  Sv2    │      This Server           │
│                 │ :34265  │                            │
│  ┌───────────┐  │────────►│  ┌──────────────────────┐  │
│  │Your Miner │  │         │  │     JD-Client        │  │
│  └───────────┘  │         │  │       (Rust)         │  │
│                 │         │  └──────────┬───────────┘  │
└─────────────────┘         │             │ Sv2          │
                            │             │ :48442       │
                            │  ┌──────────▼───────────┐  │
                            │  │     sv2-tp (C++)     │  │
                            │  │ Template Provider    │  │
                            │  └──────────┬───────────┘  │
                            │             │ IPC          │
                            │  ┌──────────▼───────────┐  │
                            │  │    Bitcoin Core      │  │
                            │  │      ${state.network}        │  │
                            │  └──────────────────────┘  │
                            └────────────────────────────┘
                                         │
                                         │ Sv2 TCP
                                         ▼
                            ┌────────────────────────────┐
                            │     Your Pool Infra        │
                            │                            │
                            │  Pool: ${state.poolAddress}:${state.poolPort}
                            │  JDS:  ${state.jdsAddress}:${state.jdsPort}
                            └────────────────────────────┘
`}</pre>
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#e7f3ff', border: '2px solid #2563eb', borderRadius: '8px', fontSize: '0.95rem' }}>
                <strong>💡 Why sv2-tp?</strong><br/>
                sv2-tp is a specialized C++ program that connects to Bitcoin Core via Unix socket (IPC) and distributes block templates to JD-Client.
                This is the recommended production setup. It's more reliable than connecting JD-Client directly to Bitcoin Core.
              </div>
            </div>

            <div className="setup-steps">
              <h3>✅ Configuration Summary</h3>
              {!bitcoinStatus?.network && (
                <div style={{
                  padding: '1rem',
                  background: '#f8d7da',
                  border: '2px solid #dc3545',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  color: '#721c24'
                }}>
                  <strong>⚠️ Warning:</strong> Bitcoin Core network not detected!
                  Please ensure Bitcoin Core is running. Current status: {bitcoinStatus?.running ? 'Running but network unknown' : 'Not running'}
                </div>
              )}
              <ol>
                <li><strong>Bitcoin Core:</strong> Docker container ({bitcoinStatus?.network || '⚠️ NOT DETECTED'})</li>
                <li><strong>Template Provider:</strong> sv2-tp (C++) - connects to Bitcoin Core via IPC</li>
                <li><strong>JD-Client:</strong> Connects to sv2-tp (127.0.0.1:48442)</li>
                <li><strong>Pool:</strong> {state.poolAddress}:{state.poolPort}</li>
                <li><strong>JD-Server:</strong> {state.jdsAddress}:{state.jdsPort}</li>
                <li><strong>User Identity:</strong> {state.userIdentity}</li>
                <li><strong>Coinbase Address:</strong> {state.coinbaseAddress || '(not set)'}</li>
                <li><strong>Miner Port:</strong> 34265 (Stratum V2)</li>
              </ol>
            </div>

            <div className="auto-config">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleAutoConfigure}
                disabled={configuring}
              >
                {configuring ? '⏳ Saving Configuration...' : '💾 Save & Configure JD-Client'}
              </button>
              <p className="auto-config-help">
                This will generate the TOML configuration and save it.
                After saving, go to the Status panel to start JD-Client!
              </p>
            </div>

            <div className="wizard-actions">
              <button className="btn btn-text" onClick={() => setStep(0)}>
                ↺ Start Over
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="setup-wizard">
      <div className="wizard-header">
        <h1>🚀 JD-Client Setup Wizard</h1>
        <p>Configure your JD-Client for solo mining with full transaction control</p>
        {!existingConfig && step < 3 && (
          <div className="wizard-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
            <div className="progress-text">Step {step + 1} of 4</div>
          </div>
        )}
      </div>

      <div className="wizard-content">
        {checkingExisting ? (
          <div className="loading-screen" style={{ padding: '3rem', textAlign: 'center' }}>
            <h2 style={{ color: '#3b82f6', marginBottom: '1rem' }}>Checking configuration...</h2>
            <p style={{ color: '#6b7280' }}>Please wait</p>
          </div>
        ) : (
          renderStep()
        )}
      </div>

      {!existingConfig && step > 0 && step < 3 && (
        <div className="wizard-navigation">
          <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
