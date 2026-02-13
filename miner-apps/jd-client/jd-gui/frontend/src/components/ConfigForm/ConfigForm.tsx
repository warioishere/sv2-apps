import React, { useState, useEffect } from 'react';
import { ConfigInput } from '../../types/config.types';
import { apiService } from '../../services/api.service';
import { PresetSelector } from './PresetSelector';
import './ConfigForm.css';
import './PresetSelector.css';

const defaultConfig: ConfigInput = {
  listening_address: '127.0.0.1:34255',
  max_supported_version: 2,
  min_supported_version: 2,
  authority_public_key: '',
  authority_secret_key: '',
  cert_validity_sec: 3600,
  user_identity: '',
  shares_per_minute: 60.0,
  share_batch_size: 3,
  mode: 'independent',
  jdc_signature: '00000000000000000000000000000000',
  coinbase_reward_script: '',
  upstreams: [
    {
      authority_pubkey: '',
      pool_address: '',
      jd_address: '',
    },
  ],
  template_provider_type: 'BitcoinCoreIpc',
  bitcoin_core_ipc: {
    network: 'testnet4',
    fee_threshold: 1000,
    min_interval: 30,
    data_dir: '',
  },
  monitoring_address: '',
  send_payout_address_to_pool: true,
};

type TabId = 'basic' | 'encryption' | 'mining' | 'upstreams' | 'template' | 'advanced';

export function ConfigForm() {
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [config, setConfig] = useState<ConfigInput>(defaultConfig);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tomlPreview, setTomlPreview] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [bitcoinAddress, setBitcoinAddress] = useState<string>('');
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Load existing configuration on mount
  useEffect(() => {
    const loadExistingConfig = async () => {
      try {
        const response = await fetch('/api/saved-configs/active');
        if (response.ok) {
          const result = await response.json();
          if (result.config) {
            setConfig(result.config);
            // Extract Bitcoin address if present
            if (result.config.coinbase_reward_script) {
              const address = extractAddress(result.config.coinbase_reward_script);
              setBitcoinAddress(address);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load existing config:', error);
        // Keep default config if loading fails
      } finally {
        setLoadingConfig(false);
      }
    };

    loadExistingConfig();
  }, []);

  const updateConfig = (updates: Partial<ConfigInput>) => {
    setConfig({ ...config, ...updates });
  };

  // Helper: Extract Bitcoin address from addr() format
  const extractAddress = (script: string): string => {
    const match = script.match(/^addr\((.+)\)$/);
    return match ? match[1] : '';
  };

  // Helper: Wrap Bitcoin address with addr()
  const wrapAddress = (address: string): string => {
    return address.trim() ? `addr(${address.trim()})` : '';
  };

  // Handle Bitcoin address change
  const handleAddressChange = (address: string) => {
    setBitcoinAddress(address);
    updateConfig({ coinbase_reward_script: wrapAddress(address) });
  };

  const handleValidate = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await apiService.validateConfig(config);
      if (result.valid) {
        setValidationErrors([]);
        setTomlPreview(result.toml || '');
        setMessage({ type: 'success', text: 'Configuration is valid!' });
      } else {
        setValidationErrors(result.errors || []);
        setTomlPreview('');
        setMessage({ type: 'error', text: 'Validation failed. Please fix errors.' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await apiService.saveConfig(config);
      if (result.success) {
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save configuration' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKeys = async () => {
    try {
      const result = await apiService.generateKeys();
      if (result.success && result.keys) {
        updateConfig({
          authority_public_key: result.keys.public_key,
          authority_secret_key: result.keys.secret_key,
        });
        setMessage({ type: 'success', text: 'Keys generated successfully!' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleLoadPreset = (presetConfig: ConfigInput) => {
    setConfig(presetConfig);
    // Extract Bitcoin address from coinbase_reward_script if in addr() format
    const extractedAddress = extractAddress(presetConfig.coinbase_reward_script);
    setBitcoinAddress(extractedAddress);
    setMessage({ type: 'success', text: 'Preset loaded! You can now edit all fields as needed.' });
    setValidationErrors([]);
    setTomlPreview('');
  };

  const tabs = [
    { id: 'basic' as TabId, label: 'Basic Settings' },
    { id: 'encryption' as TabId, label: 'Encryption' },
    { id: 'mining' as TabId, label: 'Mining' },
    { id: 'upstreams' as TabId, label: 'Upstreams' },
    { id: 'template' as TabId, label: 'Template Provider' },
    { id: 'advanced' as TabId, label: 'Advanced' },
  ];

  if (loadingConfig) {
    return (
      <div className="config-form">
        <div className="loading-screen" style={{ padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ color: '#3b82f6', marginBottom: '1rem' }}>Loading configuration...</h2>
          <p style={{ color: '#6b7280' }}>Please wait</p>
        </div>
      </div>
    );
  }

  return (
    <div className="config-form">
      <h2>Configuration</h2>

      <PresetSelector onLoadPreset={handleLoadPreset} />

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'basic' && (
          <div className="form-section">
            <div className="form-group">
              <label>Listening Address</label>
              <input
                type="text"
                value={config.listening_address}
                onChange={(e) => updateConfig({ listening_address: e.target.value })}
                placeholder="127.0.0.1:34255"
              />
              <small>Address and port for incoming connections</small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Min Supported Version</label>
                <input
                  type="number"
                  value={config.min_supported_version}
                  onChange={(e) => updateConfig({ min_supported_version: parseInt(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label>Max Supported Version</label>
                <input
                  type="number"
                  value={config.max_supported_version}
                  onChange={(e) => updateConfig({ max_supported_version: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'encryption' && (
          <div className="form-section">
            <div className="form-group">
              <label>Authority Public Key</label>
              <input
                type="text"
                value={config.authority_public_key}
                onChange={(e) => updateConfig({ authority_public_key: e.target.value })}
                placeholder="Base58-encoded public key"
              />
            </div>

            <div className="form-group">
              <label>Authority Secret Key</label>
              <input
                type="password"
                value={config.authority_secret_key}
                onChange={(e) => updateConfig({ authority_secret_key: e.target.value })}
                placeholder="Base58-encoded secret key"
              />
            </div>

            <button onClick={handleGenerateKeys} className="btn btn-secondary">
              Generate New Keys
            </button>

            <div className="form-group">
              <label>Certificate Validity (seconds)</label>
              <input
                type="number"
                value={config.cert_validity_sec}
                onChange={(e) => updateConfig({ cert_validity_sec: parseInt(e.target.value) })}
              />
              <small>How long certificates are valid (default: 3600)</small>
            </div>
          </div>
        )}

        {activeTab === 'mining' && (
          <div className="form-section">
            <div className="form-group">
              <label>User Identity</label>
              <input
                type="text"
                value={config.user_identity}
                onChange={(e) => updateConfig({ user_identity: e.target.value })}
                placeholder="bc1q... (your Bitcoin address recommended)"
              />
              <small><strong>Recommended:</strong> Use your Bitcoin address as user identity for solo mining pools</small>
            </div>

            <div className="form-group">
              <label>JDC Signature</label>
              <input
                type="text"
                value={config.jdc_signature}
                onChange={(e) => updateConfig({ jdc_signature: e.target.value })}
                placeholder="Hex string"
              />
            </div>

            <div className="form-group">
              <label>Bitcoin Reward Address</label>
              <input
                type="text"
                value={bitcoinAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="bc1q... (mainnet) or tb1q... (testnet)"
              />
              <small>Your Bitcoin address for receiving mining rewards</small>
            </div>

            <div className="form-group">
              <label>Generated Script (auto-generated)</label>
              <input
                type="text"
                value={config.coinbase_reward_script}
                disabled
                className="disabled-field"
                placeholder="addr(...) - Generated automatically"
              />
              <small>This will be used in the TOML config (addr format)</small>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={config.send_payout_address_to_pool || false}
                  onChange={(e) => updateConfig({ send_payout_address_to_pool: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>Send payout address to pool (Solo Mining Pool Support)</span>
              </label>
              <small>Enable this for solo mining pools to receive rewards directly to your address</small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Shares Per Minute</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.shares_per_minute}
                  onChange={(e) => updateConfig({ shares_per_minute: parseFloat(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label>Share Batch Size</label>
                <input
                  type="number"
                  value={config.share_batch_size}
                  onChange={(e) => updateConfig({ share_batch_size: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mode</label>
              <select
                value={config.mode}
                onChange={(e) => updateConfig({ mode: e.target.value as 'aggregated' | 'independent' })}
              >
                <option value="independent">Independent</option>
                <option value="aggregated">Aggregated</option>
              </select>
              <small>Mining mode: independent or aggregated</small>
            </div>
          </div>
        )}

        {activeTab === 'upstreams' && (
          <div className="form-section">
            {config.upstreams.map((upstream, index) => (
              <div key={index} className="upstream-group">
                <h3>Upstream {index + 1}</h3>

                <div className="form-group">
                  <label>Pool Address</label>
                  <input
                    type="text"
                    value={upstream.pool_address}
                    onChange={(e) => {
                      const newUpstreams = [...config.upstreams];
                      newUpstreams[index].pool_address = e.target.value;
                      updateConfig({ upstreams: newUpstreams });
                    }}
                    placeholder="pool.example.com:3333"
                  />
                </div>

                <div className="form-group">
                  <label>Authority Public Key</label>
                  <input
                    type="text"
                    value={upstream.authority_pubkey}
                    onChange={(e) => {
                      const newUpstreams = [...config.upstreams];
                      newUpstreams[index].authority_pubkey = e.target.value;
                      updateConfig({ upstreams: newUpstreams });
                    }}
                    placeholder="Base58-encoded key"
                  />
                </div>

                <div className="form-group">
                  <label>JD Address (optional)</label>
                  <input
                    type="text"
                    value={upstream.jd_address || ''}
                    onChange={(e) => {
                      const newUpstreams = [...config.upstreams];
                      newUpstreams[index].jd_address = e.target.value;
                      updateConfig({ upstreams: newUpstreams });
                    }}
                    placeholder="jd.example.com:3334"
                  />
                </div>

                {config.upstreams.length > 1 && (
                  <button
                    onClick={() => {
                      const newUpstreams = config.upstreams.filter((_, i) => i !== index);
                      updateConfig({ upstreams: newUpstreams });
                    }}
                    className="btn btn-danger btn-sm"
                  >
                    Remove Upstream
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={() => {
                updateConfig({
                  upstreams: [
                    ...config.upstreams,
                    { authority_pubkey: '', pool_address: '', jd_address: '' },
                  ],
                });
              }}
              className="btn btn-secondary"
            >
              Add Upstream
            </button>
          </div>
        )}

        {activeTab === 'template' && (
          <div className="form-section">
            <div className="form-group">
              <label>Template Provider Type</label>
              <select
                value={config.template_provider_type}
                onChange={(e) => {
                  const type = e.target.value as 'Sv2Tp' | 'BitcoinCoreIpc';
                  updateConfig({
                    template_provider_type: type,
                    sv2_tp: type === 'Sv2Tp' ? { address: '' } : undefined,
                    bitcoin_core_ipc: type === 'BitcoinCoreIpc' ? {
                      network: 'testnet4',
                      fee_threshold: 1000,
                      min_interval: 30,
                    } : undefined,
                  });
                }}
              >
                <option value="Sv2Tp">SV2 Template Provider (sv2-tp) - Recommended</option>
                <option value="BitcoinCoreIpc">Bitcoin Core IPC (Direct) - Experimental</option>
              </select>
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#e7f3ff', border: '1px solid #2563eb', borderRadius: '6px', fontSize: '0.9rem', lineHeight: '1.5' }}>
                <strong>📚 How it works:</strong><br/>
                <strong style={{ color: '#2563eb' }}>Sv2Tp (Default):</strong> Miners → JD-Client → sv2-tp → Bitcoin Core (Unix socket)<br/>
                • Most reliable for production<br/>
                • sv2-tp handles template distribution efficiently<br/>
                • Configure sv2-tp in the "Template Provider" tab<br/><br/>
                <strong style={{ color: '#dc2626' }}>Bitcoin Core IPC:</strong> Miners → JD-Client → Bitcoin Core (direct)<br/>
                • Simpler but experimental<br/>
                • Bypasses sv2-tp<br/>
                • Requires Bitcoin Core 30+ with --enable-multiprocess
              </div>
            </div>

            {config.template_provider_type === 'Sv2Tp' && config.sv2_tp && (
              <>
                <div className="form-group">
                  <label>SV2 TP Address</label>
                  <input
                    type="text"
                    value={config.sv2_tp.address}
                    onChange={(e) => updateConfig({ sv2_tp: { ...config.sv2_tp!, address: e.target.value } })}
                    placeholder="tp.example.com:8442"
                  />
                </div>

                <div className="form-group">
                  <label>Public Key (optional)</label>
                  <input
                    type="text"
                    value={config.sv2_tp.public_key || ''}
                    onChange={(e) => updateConfig({ sv2_tp: { ...config.sv2_tp!, public_key: e.target.value } })}
                    placeholder="Base58-encoded public key"
                  />
                </div>
              </>
            )}

            {config.template_provider_type === 'BitcoinCoreIpc' && config.bitcoin_core_ipc && (
              <>
                <div className="form-group">
                  <label>Network</label>
                  <select
                    value={config.bitcoin_core_ipc.network}
                    onChange={(e) => updateConfig({
                      bitcoin_core_ipc: {
                        ...config.bitcoin_core_ipc!,
                        network: e.target.value as 'mainnet' | 'testnet4' | 'signet' | 'regtest',
                      },
                    })}
                  >
                    <option value="mainnet">Mainnet</option>
                    <option value="testnet4">Testnet4</option>
                    <option value="signet">Signet</option>
                    <option value="regtest">Regtest</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Fee Threshold (sats)</label>
                  <input
                    type="number"
                    value={config.bitcoin_core_ipc.fee_threshold}
                    onChange={(e) => updateConfig({
                      bitcoin_core_ipc: {
                        ...config.bitcoin_core_ipc!,
                        fee_threshold: parseInt(e.target.value),
                      },
                    })}
                  />
                </div>

                <div className="form-group">
                  <label>Min Interval (seconds)</label>
                  <input
                    type="number"
                    value={config.bitcoin_core_ipc.min_interval}
                    onChange={(e) => updateConfig({
                      bitcoin_core_ipc: {
                        ...config.bitcoin_core_ipc!,
                        min_interval: parseInt(e.target.value),
                      },
                    })}
                  />
                </div>

                <div className="form-group">
                  <label>Data Directory (optional)</label>
                  <input
                    type="text"
                    value={config.bitcoin_core_ipc.data_dir || ''}
                    onChange={(e) => updateConfig({
                      bitcoin_core_ipc: {
                        ...config.bitcoin_core_ipc!,
                        data_dir: e.target.value,
                      },
                    })}
                    placeholder="/path/to/bitcoin/data"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="form-section">
            <div className="form-group">
              <label>Monitoring Address (optional)</label>
              <input
                type="text"
                value={config.monitoring_address || ''}
                onChange={(e) => updateConfig({ monitoring_address: e.target.value })}
                placeholder="127.0.0.1:9091"
              />
              <small>Enable monitoring endpoint at this address</small>
            </div>
          </div>
        )}
      </div>

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h4>Validation Errors:</h4>
          <ul>
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {tomlPreview && (
        <div className="toml-preview">
          <h4>TOML Preview:</h4>
          <pre>{tomlPreview}</pre>
        </div>
      )}

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="form-actions">
        <button onClick={handleValidate} disabled={loading} className="btn btn-secondary">
          {loading ? 'Validating...' : 'Validate'}
        </button>

        <button onClick={handleSave} disabled={loading} className="btn btn-success">
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
