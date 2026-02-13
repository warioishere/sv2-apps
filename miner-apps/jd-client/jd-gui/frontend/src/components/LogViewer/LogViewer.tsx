import React, { useState, useEffect, useRef } from 'react';
import './LogViewer.css';

export function LogViewer() {
  const [logs, setLogs] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/jdc/logs?count=200');
      const result = await response.json();
      if (result.logs && Array.isArray(result.logs)) {
        setLogs(result.logs.map((log: any) => log.message).join('\n'));
      }
    } catch (error) {
      console.error('Failed to fetch JDC logs:', error);
    }
  };

  return (
    <div className="logs-section">
      <div className="logs-header">
        <h3>Live Logs</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn-small"
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              backgroundColor: autoScroll ? '#28a745' : '#6c757d',
              color: 'white'
            }}
          >
            {autoScroll ? '⏸ Pause Auto-scroll' : '▶ Resume Auto-scroll'}
          </button>
          <button className="btn-small" onClick={fetchLogs}>
            🔄 Refresh
          </button>
        </div>
      </div>
      <div className="logs-container">
        <pre className="logs">{logs || 'No logs available'}</pre>
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
