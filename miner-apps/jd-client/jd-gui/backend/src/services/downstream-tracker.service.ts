import { LogEntry } from './process.service';
import { logger } from '../utils/logger';

export interface ConnectedMiner {
  downstreamId: number;
  vendor: string;
  hardwareVersion: string;
  firmware: string;
  deviceId: string;
  userIdentity: string;
  nominalHashRate: number;
  connectedAt: string;
}

interface PendingSetup {
  vendor: string;
  hardwareVersion: string;
  firmware: string;
  deviceId: string;
  receivedAt: number;
}

const PENDING_EXPIRY_MS = 30_000; // 30 seconds

// Regex for SetupConnection log lines
// Example: Received: SetupConnection(protocol: 0, ..., vendor: bitaxe, hardware_version: BM1370, firmware: , device_id: )
const SETUP_RE =
  /Received:\s*SetupConnection\(.*?vendor:\s*([^,)]+).*?hardware_version:\s*([^,)]+).*?firmware:\s*([^,)]*).*?device_id:\s*([^,)]*)\)/;

// Regex for OpenStandardMiningChannel log lines
// Example: Received: OpenStandardMiningChannel(..., user_identity: addr.worker1, nominal_hash_rate: 500000000000, ...) downstream_id=1
const CHANNEL_RE =
  /Received:\s*OpenStandardMiningChannel\(.*?user_identity:\s*([^,)]+).*?nominal_hash_rate:\s*([\d.eE+]+).*?downstream_id=(\d+)/;

// Regex for disconnect log lines
// Example: Downstream Some(3) disconnected
// Example: downstream_id=3 ... removing downstream
const DISCONNECT_RE =
  /(?:Downstream\s+Some\((\d+)\)\s+disconnected|downstream_id=(\d+).*?removing\s+downstream)/;

export class DownstreamTrackerService {
  private connectedMiners = new Map<number, ConnectedMiner>();
  private pendingQueue: PendingSetup[] = [];

  handleLogLine(logEntry: LogEntry): void {
    const line = logEntry.message;

    // Try SetupConnection
    const setupMatch = line.match(SETUP_RE);
    if (setupMatch) {
      this.pendingQueue.push({
        vendor: setupMatch[1].trim(),
        hardwareVersion: setupMatch[2].trim(),
        firmware: setupMatch[3].trim(),
        deviceId: setupMatch[4].trim(),
        receivedAt: Date.now(),
      });
      this.cleanExpiredPending();
      return;
    }

    // Try OpenStandardMiningChannel
    const channelMatch = line.match(CHANNEL_RE);
    if (channelMatch) {
      const userIdentity = channelMatch[1].trim();
      const nominalHashRate = parseFloat(channelMatch[2]);
      const downstreamId = parseInt(channelMatch[3], 10);

      this.cleanExpiredPending();
      const pending = this.pendingQueue.shift();

      const miner: ConnectedMiner = {
        downstreamId,
        vendor: pending?.vendor || 'unknown',
        hardwareVersion: pending?.hardwareVersion || '',
        firmware: pending?.firmware || '',
        deviceId: pending?.deviceId || '',
        userIdentity,
        nominalHashRate,
        connectedAt: new Date().toISOString(),
      };

      this.connectedMiners.set(downstreamId, miner);
      logger.info(`[DownstreamTracker] Miner connected: downstream_id=${downstreamId} vendor=${miner.vendor}`);
      return;
    }

    // Try disconnect
    const disconnectMatch = line.match(DISCONNECT_RE);
    if (disconnectMatch) {
      const downstreamId = parseInt(disconnectMatch[1] || disconnectMatch[2], 10);
      if (this.connectedMiners.has(downstreamId)) {
        const miner = this.connectedMiners.get(downstreamId);
        this.connectedMiners.delete(downstreamId);
        logger.info(`[DownstreamTracker] Miner disconnected: downstream_id=${downstreamId} vendor=${miner?.vendor}`);
      }
    }
  }

  getConnectedMiners(): ConnectedMiner[] {
    return Array.from(this.connectedMiners.values());
  }

  reset(): void {
    this.connectedMiners.clear();
    this.pendingQueue = [];
    logger.info('[DownstreamTracker] State reset');
  }

  private cleanExpiredPending(): void {
    const now = Date.now();
    this.pendingQueue = this.pendingQueue.filter(
      (p) => now - p.receivedAt < PENDING_EXPIRY_MS,
    );
  }
}

export const downstreamTracker = new DownstreamTrackerService();
