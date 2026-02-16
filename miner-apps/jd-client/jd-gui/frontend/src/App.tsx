import React, { useState, useEffect } from 'react';
import { StatusPanel } from './components/StatusPanel/StatusPanel';
import { ConfigForm } from './components/ConfigForm/ConfigForm';
import { SetupWizard } from './components/SetupWizard/SetupWizard';
import { UpdateManager } from './components/UpdateManager/UpdateManager';
import { TpConfig } from './components/TpConfig/TpConfig';
import { BitcoinCore } from './components/BitcoinCore/BitcoinCore';
import { Monitoring } from './components/Monitoring/Monitoring';
import './App.css';

type View = 'wizard' | 'status' | 'monitoring' | 'config' | 'bitcoin-core' | 'template-provider' | 'updates';

function App() {
  const [currentView, setCurrentView] = useState<View>('status');
  const [configExists, setConfigExists] = useState<boolean>(false);
  const [checkingConfig, setCheckingConfig] = useState<boolean>(true);

  // Check if configuration exists on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          setConfigExists(true);
        } else {
          setConfigExists(false);
          setCurrentView('wizard');
        }
      } catch (error) {
        console.error('Failed to check config:', error);
        setConfigExists(false);
        setCurrentView('wizard');
      } finally {
        setCheckingConfig(false);
      }
    };

    checkConfig();
  }, []);

  // Handle URL hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as View;
      if (hash && ['wizard', 'status', 'monitoring', 'config', 'bitcoin-core', 'template-provider', 'updates'].includes(hash)) {
        setCurrentView(hash);
      }
    };

    // Check hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
          className={currentView === 'monitoring' ? 'active' : ''}
          onClick={() => setCurrentView('monitoring')}
        >
          Monitoring
        </button>
        <button
          className={currentView === 'updates' ? 'active' : ''}
          onClick={() => setCurrentView('updates')}
        >
          Updates
        </button>
      </nav>

      <main className="app-main">
        {checkingConfig ? (
          <div className="loading-screen">
            <h2>Loading...</h2>
            <p>Checking configuration...</p>
          </div>
        ) : (
          <>
            {currentView === 'wizard' && <SetupWizard />}
            {currentView === 'status' && <StatusPanel />}
            {currentView === 'monitoring' && <Monitoring />}
            {currentView === 'config' && <ConfigForm />}
            {currentView === 'bitcoin-core' && <BitcoinCore />}
            {currentView === 'template-provider' && <TpConfig />}
            {currentView === 'updates' && <UpdateManager />}
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>JD-Client Web GUI Manager v0.1.1</p>
      </footer>
    </div>
  );
}

export default App;
