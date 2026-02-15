import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LogViewer.css';

export const LogViewer = React.memo(function LogViewer() {
  const [logs, setLogs] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string>('');

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/jdc/logs?count=200');
      const result = await response.json();
      if (result.logs && Array.isArray(result.logs)) {
        const newLogs = result.logs.map((log: any) => log.message).join('\n');
        // Only update state if content actually changed
        if (newLogs !== prevLogsRef.current) {
          prevLogsRef.current = newLogs;
          setLogs(newLogs);
        }
      }
    } catch (error) {
      console.error('Failed to fetch JDC logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // Scroll to bottom only when logs change AND autoScroll is on
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      const el = containerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, autoScroll]);

  // When user manually scrolls, detect if they scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

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
      <div className="logs-container" ref={containerRef} onScroll={handleScroll}>
        <pre className="logs">{logs || 'No logs available'}</pre>
      </div>
    </div>
  );
});
