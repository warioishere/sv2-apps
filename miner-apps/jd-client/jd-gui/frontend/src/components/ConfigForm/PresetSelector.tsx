import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api.service';
import { ConfigInput } from '../../types/config.types';

interface ConfigExample {
  id: string;
  name: string;
  network: string;
  infrastructure: string;
  templateProvider: string;
  description: string;
}

interface PresetSelectorProps {
  onLoadPreset: (config: ConfigInput) => void;
}

export function PresetSelector({ onLoadPreset }: PresetSelectorProps) {
  const [examples, setExamples] = useState<ConfigExample[]>([]);
  const [selectedExample, setSelectedExample] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExamples();
  }, []);

  const loadExamples = async () => {
    try {
      const response = await apiService.getConfigExamples();
      setExamples(response.examples || []);
    } catch (err) {
      const error = err as Error;
      setError(`Failed to load examples: ${error.message}`);
    }
  };

  const handleLoadPreset = async () => {
    if (!selectedExample) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getConfigExample(selectedExample);
      if (response.success && response.config) {
        onLoadPreset(response.config);
      } else {
        setError('Failed to load preset configuration');
      }
    } catch (err) {
      const error = err as Error;
      setError(`Failed to load preset: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="preset-selector">
      <div className="preset-header">
        <h3>Load from Preset</h3>
        <p className="preset-description">
          Start with a pre-configured example and customize as needed.
          All fields remain editable after loading.
        </p>
      </div>

      <div className="preset-guide">
        <details>
          <summary>ℹ️ Which preset should I choose?</summary>
          <div className="preset-help">
            <h4>Network:</h4>
            <ul>
              <li><strong>Testnet4</strong> - Recommended for learning/testing (free test coins, no real money)</li>
              <li><strong>Mainnet</strong> - Production Bitcoin mining (requires real setup and costs)</li>
              <li><strong>Signet</strong> - Controlled test network for developers</li>
            </ul>

            <h4>Infrastructure:</h4>
            <ul>
              <li><strong>Hosted</strong> - Use public pool/JDS servers (easiest, just connect and mine)</li>
              <li><strong>Local</strong> - Run your own pool/JDS infrastructure (advanced, requires additional setup)</li>
            </ul>

            <h4>Template Provider:</h4>
            <ul>
              <li>
                <strong>Sv2 TP</strong> - Stratum V2 Template Provider server
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>✅ Works over network (can be remote)</li>
                  <li>✅ Separate server process that connects to Bitcoin Core</li>
                  <li>✅ Easiest option - no Bitcoin Core setup required on your side</li>
                  <li>💡 Recommended for most users!</li>
                </ul>
              </li>
              <li>
                <strong>Bitcoin Core</strong> - Bitcoin Core IPC configuration
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>⚠️ Requires Bitcoin Core 30+ compiled with SV2 patches</li>
                  <li>⚠️ Official Bitcoin Core 30 has IPC but NOT full SV2 support</li>
                  <li>⚠️ Still experimental - use sv2-apps custom build</li>
                  <li>⚠️ Local machine only (IPC cannot work over network)</li>
                  <li>💡 Advanced users only</li>
                </ul>
              </li>
            </ul>

            <h4>If you have your own Bitcoin Core node:</h4>
            <ul>
              <li>
                <strong>Bitcoin Core on same machine as JD-Client:</strong>
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>⚠️ Still need separate Template Provider process</li>
                  <li>⚠️ Template Provider → [IPC] → Bitcoin Core (local)</li>
                  <li>⚠️ JD-Client → [network] → Template Provider</li>
                  <li>💡 Use "Sv2 TP" preset, run template provider locally</li>
                </ul>
              </li>
              <li>
                <strong>Bitcoin Core on another machine:</strong>
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>❌ IPC does NOT work over network</li>
                  <li>✅ Run Template Provider on same machine as Bitcoin Core</li>
                  <li>✅ Template Provider uses IPC to connect to Bitcoin Core locally</li>
                  <li>✅ JD-Client connects to Template Provider over network</li>
                  <li>💡 Use "Sv2 TP" preset</li>
                </ul>
              </li>
            </ul>

            <p style={{ marginTop: '16px', padding: '12px', background: '#fef3c7', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '13px' }}>
              <strong>⚠️ Note:</strong> Bitcoin Core 30 official binary has experimental IPC interface but NOT full Stratum V2 support.
              For production use, you need either: (1) Custom Bitcoin Core build with SV2 patches, or (2) Hosted template provider service.
            </p>

            <p className="preset-recommendation">
              <strong>👉 Recommended for beginners:</strong> "Testnet4 - Hosted - Sv2 TP"<br/>
              <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
                (No Bitcoin Core needed - uses public test infrastructure)
              </span>
            </p>
          </div>
        </details>
      </div>

      <div className="preset-controls">
        <select
          value={selectedExample}
          onChange={(e) => setSelectedExample(e.target.value)}
          disabled={loading}
          className="preset-dropdown"
        >
          <option value="">-- Select a configuration example --</option>
          {examples.map((example) => (
            <option key={example.id} value={example.id}>
              {example.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleLoadPreset}
          disabled={!selectedExample || loading}
          className="btn btn-primary"
        >
          {loading ? 'Loading...' : 'Load Preset'}
        </button>
      </div>

      {selectedExample && (
        <div className="preset-info">
          {examples.find(ex => ex.id === selectedExample)?.description}
        </div>
      )}

      {error && (
        <div className="preset-error">
          {error}
        </div>
      )}
    </div>
  );
}
