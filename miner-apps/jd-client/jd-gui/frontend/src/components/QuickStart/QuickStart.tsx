import React from 'react';
import './QuickStart.css';

export function QuickStart() {
  return (
    <div className="quickstart">
      <h2>Quick Start Guide</h2>
      <div className="quickstart-content">
        <div className="step">
          <h3>1. Configure Your Settings</h3>
          <p>Use the Configuration tab to set up your JD-Client parameters.</p>
        </div>

        <div className="step">
          <h3>2. Generate Keys</h3>
          <p>Navigate to the Encryption tab and click "Generate New Keys" to create authority keys.</p>
        </div>

        <div className="step">
          <h3>3. Set Up Upstreams</h3>
          <p>Add your pool connections in the Upstreams tab.</p>
        </div>

        <div className="step">
          <h3>4. Choose Template Provider</h3>
          <p>Select either Bitcoin Core IPC or Stratum V2 Template Provider.</p>
        </div>

        <div className="step">
          <h3>5. Save and Start</h3>
          <p>Click "Save Configuration" and then use the Status panel to start your JD-Client.</p>
        </div>
      </div>
    </div>
  );
}
