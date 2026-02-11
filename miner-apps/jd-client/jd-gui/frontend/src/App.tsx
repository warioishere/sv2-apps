import React, { useState } from 'react';
import { StatusPanel } from './components/StatusPanel/StatusPanel';
import { ConfigForm } from './components/ConfigForm/ConfigForm';
import { SetupWizard } from './components/SetupWizard/SetupWizard';
import { UpdateManager } from './components/UpdateManager/UpdateManager';
import { TemplateProviderPanel } from './components/TemplateProviderPanel/TemplateProviderPanel';
import { BitcoinCore } from './components/BitcoinCore/BitcoinCore';
import './App.css';

type View = 'wizard' | 'status' | 'config' | 'bitcoin-core' | 'template-provider' | 'updates';

function App() {
  const [currentView, setCurrentView] = useState<View>('wizard');

  return (
    <div className="app">
      <header className="app-header">
        <h1>JD-Client Web GUI Manager</h1>
        <p>Stratum V2 Job Declarator Client Configuration & Monitoring</p>
      </header>

      <nav className="app-nav">
        <button
          className={currentView === 'wizard' ? 'active' : ''}
          onClick={() => setCurrentView('wizard')}
        >
          Setup Wizard
        </button>
        <button
          className={currentView === 'config' ? 'active' : ''}
          onClick={() => setCurrentView('config')}
        >
          Configuration
        </button>
        <button
          className={currentView === 'status' ? 'active' : ''}
          onClick={() => setCurrentView('status')}
        >
          JD-Client Status
        </button>
        <button
          className={currentView === 'bitcoin-core' ? 'active' : ''}
          onClick={() => setCurrentView('bitcoin-core')}
        >
          Bitcoin Core
        </button>
        <button
          className={currentView === 'template-provider' ? 'active' : ''}
          onClick={() => setCurrentView('template-provider')}
        >
          Template Provider
        </button>
        <button
          className={currentView === 'updates' ? 'active' : ''}
          onClick={() => setCurrentView('updates')}
        >
          Updates
        </button>
      </nav>

      <main className="app-main">
        {currentView === 'wizard' && <SetupWizard />}
        {currentView === 'status' && <StatusPanel />}
        {currentView === 'config' && <ConfigForm />}
        {currentView === 'bitcoin-core' && <BitcoinCore />}
        {currentView === 'template-provider' && <TemplateProviderPanel />}
        {currentView === 'updates' && <UpdateManager />}
      </main>

      <footer className="app-footer">
        <p>JD-Client Web GUI Manager v1.0.0</p>
      </footer>
    </div>
  );
}

export default App;
