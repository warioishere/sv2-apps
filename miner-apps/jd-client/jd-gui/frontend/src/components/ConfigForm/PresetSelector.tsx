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
          <summary>Which preset should I choose?</summary>
          <div className="preset-help">
            <p style={{ padding: '12px', background: '#f3f4f6', borderLeft: '3px solid #6b7280', borderRadius: '4px', fontSize: '13px', marginBottom: '16px' }}>
              <strong>For automated setup, use the Setup Wizard tab instead.</strong><br/>
              Presets are for manual configuration only.
            </p>

            <h4>Available Presets:</h4>

            <ul style={{ fontSize: '13px', lineHeight: '1.6' }}>
              <li style={{ marginBottom: '12px' }}>
                <strong>[Network] - Hosted - Sv2 TP</strong>
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>Architecture: JD-Client → Public Template Provider → Public Pool/JDS</li>
                  <li>Use for: Quick testing with hosted infrastructure</li>
                  <li>Bitcoin Core not required</li>
                </ul>
              </li>

              <li style={{ marginBottom: '12px' }}>
                <strong>[Network] - Local - Sv2 TP</strong>
                <ul style={{ marginTop: '4px', fontSize: '12px' }}>
                  <li>Architecture: JD-Client → sv2-tp → Bitcoin Core (IPC)</li>
                  <li>Use for: This GUI's full stack with integrated or own Bitcoin Core</li>
                  <li>sv2-tp handles the Bitcoin Core IPC connection</li>
                </ul>
              </li>
            </ul>

            <h4 style={{ marginTop: '20px' }}>Network Options:</h4>
            <ul style={{ fontSize: '12px' }}>
              <li><strong>Mainnet</strong> - Production Bitcoin network</li>
              <li><strong>Testnet4</strong> - Bitcoin test network (free test coins)</li>
              <li><strong>Signet</strong> - Predictable test network</li>
            </ul>

            <p style={{ padding: '12px', background: '#fef3c7', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '13px', marginTop: '16px' }}>
              <strong>If you have your own Bitcoin Core node built with --enable-multiprocess:</strong><br/>
              Use preset: <strong>[Network] - Local - Sv2 TP</strong><br/>
              This configures JD-Client to connect to sv2-tp, which you'll configure separately to connect to your Bitcoin Core.
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
