import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { apiLimiter } from './middleware/ratelimit.middleware';
import { setupLogStreaming } from './websocket/log-stream';
import { setupUpdateStreaming } from './websocket/update-stream';
import { setupTpLogStreaming } from './websocket/tp-log-stream';
import { processManager } from './services/process.service';
import { tpProcessManager } from './services/tp-process.service';
import { initializeDatabase } from './database/schema';
import { instanceManager } from './services/instance.service';
import { healthService } from './health/health.service';
import { metricsService } from './services/metrics.service';

// Phase 1 routes
import jdcRoutes from './routes/jdc.routes';
import configRoutes from './routes/config.routes';
import keysRoutes from './routes/keys.routes';

// Phase 2 routes
import instanceRoutes from './routes/instance.routes';
import savedConfigRoutes from './routes/saved-config.routes';
import metricsRoutes from './routes/metrics.routes';
import healthRoutes from './routes/health.routes';
import updateRoutes from './routes/update.routes';
import configExamplesRoutes from './routes/config-examples.routes';
import wizardRoutes from './routes/wizard.routes';
import tpRoutes from './routes/tp.routes';
import bitcoinRoutes from './routes/bitcoin.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database
initializeDatabase();
logger.info('Database initialized');

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['http://localhost:3000']
    : '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Phase 1 API Routes (backward compatible)
app.use('/api/jdc', jdcRoutes);
app.use('/api/config', configRoutes);
app.use('/api/keys', keysRoutes);

// Phase 2 API Routes
app.use('/api/instances', instanceRoutes);
app.use('/api/saved-configs', savedConfigRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/config-examples', configExamplesRoutes);
app.use('/api/wizard', wizardRoutes);
app.use('/api/tp', tpRoutes);
app.use('/api/bitcoin', bitcoinRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../public')));

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  }
});

// Error handling
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Setup WebSocket log streaming
setupLogStreaming(server, processManager);

// Setup WebSocket update streaming
setupUpdateStreaming(server);

// Setup Template Provider log streaming
setupTpLogStreaming(server, tpProcessManager);

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend served from: ${path.join(__dirname, '../public')}`);

  // Start health check service (runs every 5 minutes)
  healthService.startPeriodicChecks();
  logger.info('Health check service started');

  // Schedule periodic cleanup (daily at 3 AM)
  const scheduleCleanup = () => {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(27, 0, 0, 0); // Next 3 AM

    const timeUntil3AM = next3AM.getTime() - now.getTime();

    setTimeout(() => {
      logger.info('Running scheduled cleanup');
      metricsService.cleanupOldMetrics(7);
      healthService.cleanupOldHealthChecks(7);
      scheduleCleanup(); // Schedule next cleanup
    }, timeUntil3AM);
  };

  scheduleCleanup();
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);

  // Stop health check service
  healthService.stopPeriodicChecks();

  // Stop all instances
  logger.info('Stopping all instances');
  await instanceManager.stopAllInstances();

  // Stop legacy single instance if running
  if (processManager.isRunning()) {
    await processManager.stop();
  }

  // Stop Template Provider if running
  if (tpProcessManager.isRunning()) {
    logger.info('Stopping Template Provider');
    await tpProcessManager.stop();
  }

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
