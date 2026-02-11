import { useState, useEffect, useRef } from 'react';
import { LogEntry } from '../types/config.types';

interface WebSocketMessage {
  type: 'log' | 'status' | 'exit' | 'error';
  timestamp?: string;
  level?: string;
  message?: string;
  running?: boolean;
  pid?: number;
  uptime?: number;
  code?: number;
  signal?: string;
}

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/jdc/logs`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);

        if (data.type === 'log' && data.timestamp && data.level && data.message) {
          const logEntry: LogEntry = {
            timestamp: data.timestamp,
            level: data.level,
            message: data.message,
          };

          setLogs((prevLogs) => {
            const newLogs = [...prevLogs, logEntry];
            // Keep last 500 logs
            return newLogs.slice(-500);
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  return { logs, isConnected, clearLogs };
}
