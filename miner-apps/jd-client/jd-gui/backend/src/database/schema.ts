import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

const DB_PATH = process.env.DB_PATH || '/app/data/jdc.db';

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export type DatabaseInstance = Database.Database;
export const db: DatabaseInstance = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
export function initializeDatabase() {
  logger.info('Initializing database schema');

  // Guard against multiple initializations
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='configurations'
  `).get();

  if (tableExists) {
    logger.info('Database already initialized');
    return;
  }

  // Configurations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      config_json TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Instances table
  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      config_id INTEGER NOT NULL,
      status TEXT DEFAULT 'stopped',
      pid INTEGER,
      port INTEGER,
      started_at DATETIME,
      stopped_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES configurations(id)
    )
  `);

  // Metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances(id)
    )
  `);

  // Health checks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      check_type TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances(id)
    )
  `);

  // Updates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      download_url TEXT,
      changelog TEXT,
      installed BOOLEAN DEFAULT 0,
      installed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_instance_timestamp
    ON metrics(instance_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_health_instance_timestamp
    ON health_checks(instance_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_instances_status
    ON instances(status);
  `);

  logger.info('Database schema initialized successfully');
}

// Initialize database immediately when this module is loaded
initializeDatabase();

// Close database on process exit
process.on('exit', () => {
  db.close();
});
