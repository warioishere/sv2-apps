import React, { useState, useEffect, useRef } from 'react';
import './UpdateManager.css';

interface UpdateStatus {
  inProgress: boolean;
  stage: 'idle' | 'checking' | 'pulling' | 'building' | 'restarting' | 'complete' | 'error';
  progress: number;
  message: string;
  currentVersion?: string;
  availableVersion?: string;
}

export function UpdateManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>({
    inProgress: false,
    stage: 'idle',
    progress: 0,
    message: 'Ready to check for updates'
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/updates/check');
      const data = await response.json();

      setUpdateAvailable(data.available);
      setCurrentVersion(data.current);
      setLatestVersion(data.latest);

      if (data.available) {
        setStatus({
          ...status,
          message: `Update available: ${data.latest}`,
          currentVersion: data.current,
          availableVersion: data.latest
        });
      } else {
        setStatus({
          ...status,
          message: 'You are running the latest version'
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setStatus({
        ...status,
        stage: 'error',
        message: 'Failed to check for updates'
      });
    } finally {
      setChecking(false);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/update/stream`);

    ws.onopen = () => {
      console.log('Update stream connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status') {
        setStatus(data.data);
      } else if (data.type === 'log') {
        setLogs(prev => [...prev, data.message]);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Update stream disconnected');
      wsRef.current = null;
    };

    wsRef.current = ws;
  };

  const performUpdate = async () => {
    try {
      // Clear logs and connect WebSocket
      setLogs([]);
      setShowLogs(true);
      connectWebSocket();

      // Trigger update
      const response = await fetch('/api/updates/perform', {
        method: 'POST'
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to start update');
      }
    } catch (error) {
      console.error('Failed to perform update:', error);
      setStatus({
        ...status,
        stage: 'error',
        message: `Update failed: ${(error as Error).message}`
      });
    }
  };

  const rollback = async () => {
    if (!confirm('Are you sure you want to rollback to the previous version?')) {
      return;
    }

    try {
      const response = await fetch('/api/updates/rollback', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        alert(data.message);
      } else {
        alert(`Rollback failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Rollback failed: ${(error as Error).message}`);
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'checking': return 'Checking for updates...';
      case 'pulling': return 'Pulling latest code...';
      case 'building': return 'Building Docker image...';
      case 'restarting': return 'Restarting container...';
      case 'complete': return 'Update complete!';
      case 'error': return 'Update failed';
      default: return 'Ready';
    }
  };

  const getProgressColor = () => {
    if (status.stage === 'error') return '#ef4444';
    if (status.stage === 'complete') return '#22c55e';
    return '#3b82f6';
  };

  return (
    <div className="update-manager">
      <div className="update-header">
        <h2>Software Updates</h2>
        <p className="update-description">
          Keep your JD-Client up to date with the latest features and fixes
        </p>
      </div>

      <div className="update-info">
        <div className="version-info">
          <div className="version-box">
            <label>Current Version</label>
            <div className="version-value">{currentVersion || 'Loading...'}</div>
          </div>
          {updateAvailable && (
            <div className="version-box highlight">
              <label>Available Version</label>
              <div className="version-value">{latestVersion}</div>
            </div>
          )}
        </div>

        {updateAvailable && !status.inProgress && (
          <div className="update-available">
            <span className="update-badge">New version available!</span>
            <p>A new version of JD-Client is available. Update to get the latest features and fixes.</p>
          </div>
        )}

        {!updateAvailable && !checking && currentVersion && !status.inProgress && (
          <div className="update-current">
            <span className="update-badge-success">✓ Up to date</span>
            <p>You are running the latest version. No updates available.</p>
          </div>
        )}
      </div>

      <div className="update-controls">
        <button
          onClick={checkForUpdates}
          disabled={checking || status.inProgress}
          className="btn btn-secondary"
        >
          {checking ? 'Checking...' : '🔄 Check for Updates'}
        </button>

        {updateAvailable && (
          <button
            onClick={performUpdate}
            disabled={status.inProgress}
            className="btn btn-primary"
          >
            ⬆️ Update Now
          </button>
        )}

        <button
          onClick={rollback}
          disabled={status.inProgress}
          className="btn btn-secondary"
          title="Restore previous binary backup"
        >
          ⬅️ Rollback
        </button>
      </div>

      {status.inProgress && (
        <div className="update-progress">
          <div className="progress-info">
            <span className="progress-stage">{getStageLabel(status.stage)}</span>
            <span className="progress-percent">{status.progress}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${status.progress}%`,
                backgroundColor: getProgressColor()
              }}
            />
          </div>
          <div className="progress-message">{status.message}</div>
        </div>
      )}

      {showLogs && logs.length > 0 && (
        <div className="update-logs">
          <div className="logs-header">
            <h3>Update Logs</h3>
            <button
              onClick={() => setShowLogs(false)}
              className="btn-close"
            >
              ✕
            </button>
          </div>
          <div className="logs-content" ref={logsContainerRef}>
            {logs.map((log, index) => (
              <div key={index} className="log-line">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {status.stage === 'complete' && (
        <div className="update-complete">
          <div className="complete-icon">✅</div>
          <h3>Update Complete!</h3>
          <p>The container is restarting with the new version. Please wait a moment and refresh the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Refresh Page
          </button>
        </div>
      )}

      {status.stage === 'error' && (
        <div className="update-error">
          <div className="error-icon">❌</div>
          <h3>Update Failed</h3>
          <p>{status.message}</p>
          <button
            onClick={checkForUpdates}
            className="btn btn-secondary"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
