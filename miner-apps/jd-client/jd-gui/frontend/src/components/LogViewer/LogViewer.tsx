import React, { useState, useEffect, useRef } from 'react';
import { useLogStream } from '../../hooks/useLogStream';
import { LogEntry } from '../../types/config.types';
import './LogViewer.css';

type LogLevel = 'all' | 'info' | 'warn' | 'error' | 'debug';

export function LogViewer() {
  const { logs, isConnected, clearLogs } = useLogStream();
  const [filter, setFilter] = useState<LogLevel>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.level === filter;
  });

  const handleExport = () => {
    const logText = filteredLogs
      .map(log => `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jdc-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLogClassName = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'log-error';
      case 'warn':
        return 'log-warn';
      case 'info':
        return 'log-info';
      case 'debug':
        return 'log-debug';
      default:
        return '';
    }
  };

  return (
    <div className="log-viewer">
      <div className="log-header">
        <h2>Logs</h2>
        <div className="log-status">
          <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </div>

      <div className="log-controls">
        <div className="filter-group">
          <label>Filter:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value as LogLevel)}>
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
        </div>

        <button onClick={clearLogs} className="btn btn-secondary">
          Clear
        </button>

        <button onClick={handleExport} className="btn btn-primary">
          Export
        </button>
      </div>

      <div className="log-container" ref={logContainerRef}>
        {filteredLogs.length === 0 ? (
          <div className="log-empty">No logs to display</div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={index} className={`log-line ${getLogClassName(log.level)}`}>
              <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="log-level">[{log.level.toUpperCase()}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="log-footer">
        <span>{filteredLogs.length} log entries</span>
      </div>
    </div>
  );
}
