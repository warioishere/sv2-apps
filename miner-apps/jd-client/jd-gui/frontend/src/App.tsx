import React, { useState } from 'react';
import { StatusPanel } from './components/StatusPanel/StatusPanel';
import { ConfigForm } from './components/ConfigForm/ConfigForm';
import { LogViewer } from './components/LogViewer/LogViewer';
import { SetupWizard } from './components/SetupWizard/SetupWizard';
import { UpdateManager } from './components/UpdateManager/UpdateManager';
import { TemplateProviderPanel } from './components/TemplateProviderPanel/TemplateProviderPanel';
import './App.css';

type View = 'wizard' | 'config' | 'logs' | 'updates' | 'template-provider';

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
          🚀 Setup Wizard
        </button>
        <button
          className={currentView === 'config' ? 'active' : ''}
          onClick={() => setCurrentView('config')}
        >
          Configuration
        </button>
        <button
          className={currentView === 'logs' ? 'active' : ''}
          onClick={() => setCurrentView('logs')}
        >
          Logs
        </button>
        <button
          className={currentView === 'template-provider' ? 'active' : ''}
          onClick={() => setCurrentView('template-provider')}
        >
          📡 Template Provider
        </button>
        <button
          className={currentView === 'updates' ? 'active' : ''}
          onClick={() => setCurrentView('updates')}
        >
          ⬆️ Updates
        </button>
      </nav>

      <main className="app-main">
        <StatusPanel />

        {currentView === 'wizard' && <SetupWizard />}
        {currentView === 'config' && <ConfigForm />}
        {currentView === 'logs' && <LogViewer />}
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
