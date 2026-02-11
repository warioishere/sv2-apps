import React, { useState } from 'react';
import { useJdcStatus } from '../../hooks/useJdcStatus';
import { apiService } from '../../services/api.service';
import { LogViewer } from '../LogViewer/LogViewer';
import './StatusPanel.css';

export function StatusPanel() {
  const { status, loading } = useJdcStatus();
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStart = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await apiService.startJdc();
      if (result.success) {
        setMessage({ type: 'success', text: 'JD-Client started successfully' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to start' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await apiService.stopJdc();
      if (result.success) {
        setMessage({ type: 'success', text: 'JD-Client stopped successfully' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to stop' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await apiService.restartJdc();
      if (result.success) {
        setMessage({ type: 'success', text: 'JD-Client restarted successfully' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to restart' });
      }
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const formatUptime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  return (
    <div className="status-panel">
      <h2>JD-Client Status</h2>

      <div className="status-info">
        <div className="status-item">
          <label>Status:</label>
          <span className={`status-badge ${status.running ? 'running' : 'stopped'}`}>
            {status.running ? 'Running' : 'Stopped'}
          </span>
        </div>

        {status.running && (
          <>
            <div className="status-item">
              <label>PID:</label>
              <span>{status.pid || 'N/A'}</span>
            </div>

            <div className="status-item">
              <label>Uptime:</label>
              <span>{formatUptime(status.uptime)}</span>
            </div>
          </>
        )}
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="control-buttons">
        <button
          onClick={handleStart}
          disabled={status.running || actionLoading || loading}
          className="btn btn-success"
        >
          {actionLoading ? 'Starting...' : 'Start'}
        </button>

        <button
          onClick={handleStop}
          disabled={!status.running || actionLoading || loading}
          className="btn btn-danger"
        >
          {actionLoading ? 'Stopping...' : 'Stop'}
        </button>

        <button
          onClick={handleRestart}
          disabled={actionLoading || loading}
          className="btn btn-warning"
        >
          {actionLoading ? 'Restarting...' : 'Restart'}
        </button>
      </div>

      <div className="logs-section">
        <LogViewer />
      </div>
    </div>
  );
}
