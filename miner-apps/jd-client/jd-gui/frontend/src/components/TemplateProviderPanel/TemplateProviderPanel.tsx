import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api.service';
import './TemplateProviderPanel.css';

interface TpStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  config_file?: string;
  listen_address?: string;
  connection_type?: string;
  connected_clients?: number;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export function TemplateProviderPanel() {
  const [status, setStatus] = useState<TpStatus>({ running: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  // Fetch status periodically
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect to WebSocket for logs
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/tp/logs-stream`);

    ws.onopen = () => {
      console.log('TP log stream connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'log') {
        setLogs((prev) => [...prev.slice(-499), {
          timestamp: data.timestamp,
          level: data.level,
          message: data.message,
        }]);
      } else if (data.type === 'status') {
        setStatus({
          running: data.running,
          pid: data.pid,
          uptime: data.uptime,
          config_file: data.config_file,
        });
      }
    };

    ws.onerror = (error) => {
      console.error('TP log stream error:', error);
    };

    ws.onclose = () => {
      console.log('TP log stream disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleLogsScroll = () => {
    if (!logsContainerRef.current) return;
    const el = logsContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const fetchStatus = async () => {
    try {
      const data = await apiService.getTpStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch TP status:', error);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await apiService.startTp();
      if (result.success) {
        await fetchStatus();
      } else {
        alert(`Failed to start: ${result.error}`);
      }
    } catch (error) {
      alert(`Error starting Template Provider: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await apiService.stopTp();
      if (result.success) {
        await fetchStatus();
      } else {
        alert(`Failed to stop: ${result.error}`);
      }
    } catch (error) {
      alert(`Error stopping Template Provider: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      const result = await apiService.restartTp();
      if (result.success) {
        await fetchStatus();
      } else {
        alert(`Failed to restart: ${result.error}`);
      }
    } catch (error) {
      alert(`Error restarting Template Provider: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const getLevelClass = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'error': return 'log-error';
      case 'warn': return 'log-warn';
      case 'info': return 'log-info';
      case 'debug': return 'log-debug';
      default: return '';
    }
  };

  const exportLogs = () => {
    const content = logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tp-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tp-panel">
      <div className="tp-header">
        <h2>📡 Template Provider</h2>
        <div className={`status-badge ${status.running ? 'running' : 'stopped'}`}>
          {status.running ? '🟢 Running' : '⚫ Stopped'}
        </div>
      </div>

      <div className="tp-info">
        {status.running && (
          <>
            <div className="info-item">
              <span className="info-label">PID:</span>
              <span className="info-value">{status.pid}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Uptime:</span>
              <span className="info-value">{formatUptime(status.uptime)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Config:</span>
              <span className="info-value">{status.config_file}</span>
            </div>
          </>
        )}
        {!status.running && (
          <p className="info-message">
            Template Provider is not running. Start it to distribute block templates to JD-Client.
          </p>
        )}
      </div>

      <div className="tp-controls">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={status.running || loading}
        >
          {loading ? '⏳ Starting...' : '▶️ Start TP'}
        </button>
        <button
          className="btn btn-danger"
          onClick={handleStop}
          disabled={!status.running || loading}
        >
          {loading ? '⏳ Stopping...' : '⏹️ Stop TP'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleRestart}
          disabled={!status.running || loading}
        >
          {loading ? '⏳ Restarting...' : '🔄 Restart TP'}
        </button>
      </div>

      <div className="tp-logs">
        <div className="logs-header">
          <h3>📋 Template Provider Logs</h3>
          <div className="logs-controls">
            <label>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
            <button className="btn btn-small" onClick={exportLogs}>
              💾 Export Logs
            </button>
          </div>
        </div>

        <div className="logs-content" ref={logsContainerRef} onScroll={handleLogsScroll}>
          {logs.length === 0 && <p className="no-logs">No logs yet. Start Template Provider to see logs.</p>}
          {logs.map((log, index) => (
            <div key={index} className={`log-entry ${getLevelClass(log.level)}`}>
              <span className="log-timestamp">{log.timestamp}</span>
              <span className="log-level">[{log.level.toUpperCase()}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tp-info-box">
        <h4>ℹ️ About Template Provider</h4>
        <p>
          The Template Provider connects to Bitcoin Core and distributes block templates to JD-Client.
          It supports both local IPC and remote RPC connections.
        </p>
        <ul>
          <li>✅ Distributes NewTemplate and SetNewPrevHash messages</li>
          <li>✅ Handles block submissions from JD-Client</li>
          <li>✅ Supports multiple simultaneous client connections</li>
          <li>✅ Configurable via Setup Wizard</li>
        </ul>
      </div>
    </div>
  );
}
