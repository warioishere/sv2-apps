import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { JdClientProcessManager } from '../services/process.service';
import { logger } from '../utils/logger';

export function setupLogStreaming(server: Server, processManager: JdClientProcessManager) {
  const wss = new WebSocketServer({
    server,
    path: '/api/jdc/logs'
  });

  wss.on('connection', (ws: WebSocket) => {
    logger.info('WebSocket client connected');

    // Send recent logs on connection
    const recentLogs = processManager.getRecentLogs(100);
    for (const log of recentLogs) {
      ws.send(JSON.stringify({
        type: 'log',
        ...log
      }));
    }

    // Send initial status
    const status = processManager.getStatus();
    ws.send(JSON.stringify({
      type: 'status',
      ...status
    }));

    // Subscribe to new logs
    const logHandler = (logEntry: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'log',
          ...logEntry
        }));
      }
    };

    const exitHandler = (info: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'exit',
          code: info.code,
          signal: info.signal
        }));
      }
    };

    const errorHandler = (error: Error) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    };

    processManager.on('log', logHandler);
    processManager.on('exit', exitHandler);
    processManager.on('error', errorHandler);

    // Send periodic status updates
    const statusInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const status = processManager.getStatus();
        ws.send(JSON.stringify({
          type: 'status',
          ...status
        }));
      }
    }, 5000);

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
      processManager.off('log', logHandler);
      processManager.off('exit', exitHandler);
      processManager.off('error', errorHandler);
      clearInterval(statusInterval);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error: ${error.message}`);
    });
  });

  logger.info('WebSocket log streaming setup complete');
  return wss;
}
