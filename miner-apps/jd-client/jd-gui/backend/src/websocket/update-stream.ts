import { Server } from 'http';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { updateService } from '../services/update.service';

export function setupUpdateStreaming(server: Server): void {
  const wss = new WebSocket.Server({
    server,
    path: '/api/update/stream'
  });

  wss.on('connection', (ws: WebSocket) => {
    logger.info('Update stream WebSocket client connected');

    // Send current status immediately
    const currentStatus = updateService.getStatus();
    ws.send(JSON.stringify({
      type: 'status',
      data: currentStatus
    }));

    // Listen for status updates
    const statusHandler = (status: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'status',
          data: status
        }));
      }
    };

    // Listen for build logs
    const logHandler = (message: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'log',
          message: message.trim()
        }));
      }
    };

    // Attach event listeners
    updateService.on('status-update', statusHandler);
    updateService.on('update-log', logHandler);

    // Handle client disconnect
    ws.on('close', () => {
      logger.info('Update stream WebSocket client disconnected');
      updateService.off('status-update', statusHandler);
      updateService.off('update-log', logHandler);
    });

    ws.on('error', (error) => {
      logger.error(`Update stream WebSocket error: ${error.message}`);
    });
  });

  logger.info('Update stream WebSocket server initialized on /api/update/stream');
}
