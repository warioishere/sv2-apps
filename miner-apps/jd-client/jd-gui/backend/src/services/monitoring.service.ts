import axios from 'axios';
import { logger } from '../utils/logger';
import { configService } from '../database/config.service';
import { downstreamTracker, ConnectedMiner } from './downstream-tracker.service';

export interface HashrateDataPoint {
  timestamp: string;
  hashrate: number;
}

// Internal data point tracking share_work_sum for hashrate calculation
interface ShareWorkDataPoint {
  timestamp: number; // Unix timestamp in ms
  shareWorkSum: number;
}

export interface EnrichedMiner {
  downstreamId: number;
  vendor: string;
  hardwareVersion: string;
  firmware: string;
  deviceId: string;
  userIdentity: string;
  nominalHashRate: number;
  connectedAt: string;
  clientId?: number;
  channelId?: number;
  sharesAccepted: number;
  bestDiff: number;
  currentHashrate: number;
  shareWorkSum: number;
  expectedSharesPerMinute: number;
}

export interface MonitoringDashboard {
  minerCount: number;
  totalHashrate: number;
  poolStatus: 'connected' | 'disconnected' | 'unknown';
  uptimeSecs: number;
  totalChannels: number;
  serverHashrate: number;
}

interface JdcGlobalResponse {
  server: {
    total_channels: number;
    extended_channels: number;
    standard_channels: number;
    total_hashrate: number;
  };
  clients: {
    total_clients: number;
    total_channels: number;
    extended_channels: number;
    standard_channels: number;
    total_hashrate: number;
  };
  uptime_secs: number;
}

interface JdcClientResponse {
  client_id: number;
  extended_channels_count: number;
  standard_channels_count: number;
  total_hashrate: number;
}

interface JdcClientsPageResponse {
  offset: number;
  limit: number;
  total: number;
  items: JdcClientResponse[];
}

interface JdcStandardChannel {
  channel_id: number;
  user_identity: string;
  nominal_hashrate: number;
  target_hex: string;
  expected_shares_per_minute: number;
  shares_accepted: number;
  share_work_sum: number;
  best_diff: number;
  last_share_sequence_number: number;
}

interface JdcClientChannelsResponse {
  client_id: number;
  total_extended: number;
  total_standard: number;
  extended_channels: any[];
  standard_channels: JdcStandardChannel[];
}

// Aggregated per-miner data from the monitoring API
interface MinerChannelData {
  clientId: number;
  channelId: number;
  userIdentity: string;
  currentHashrate: number;
  sharesAccepted: number;
  bestDiff: number;
  shareWorkSum: number;
  expectedSharesPerMinute: number;
}

const MAX_HISTORY_POINTS = 720; // 2 hours at 10s intervals
const POLL_INTERVAL_MS = 10_000;
const HASHRATE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes for hashrate calculation
const DIFFICULTY_1 = Math.pow(2, 32); // Bitcoin difficulty 1 target

class RingBuffer {
  private buffer: HashrateDataPoint[] = [];

  push(point: HashrateDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > MAX_HISTORY_POINTS) {
      this.buffer.shift();
    }
  }

  getAll(): HashrateDataPoint[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}

class ShareWorkRingBuffer {
  private buffer: ShareWorkDataPoint[] = [];

  push(point: ShareWorkDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > MAX_HISTORY_POINTS) {
      this.buffer.shift();
    }
  }

  // Calculate hashrate from share_work_sum delta over the last N milliseconds
  calculateHashrate(windowMs: number): number {
    if (this.buffer.length < 2) return 0;

    const now = Date.now();
    const windowStart = now - windowMs;

    // Find the oldest point within the window
    let startPoint = this.buffer[0];
    for (const point of this.buffer) {
      if (point.timestamp >= windowStart) {
        startPoint = point;
        break;
      }
    }

    // Get the most recent point
    const endPoint = this.buffer[this.buffer.length - 1];

    // Calculate time delta in seconds
    const timeDeltaSecs = (endPoint.timestamp - startPoint.timestamp) / 1000;
    if (timeDeltaSecs <= 0) return 0;

    // Calculate share work sum delta
    const shareWorkDelta = endPoint.shareWorkSum - startPoint.shareWorkSum;
    if (shareWorkDelta <= 0) return 0;

    // Hashrate = (share_work_sum_delta / time_seconds) * difficulty_1
    return (shareWorkDelta / timeDeltaSecs) * DIFFICULTY_1;
  }

  clear(): void {
    this.buffer = [];
  }
}

class MonitoringService {
  private pollTimer: NodeJS.Timeout | null = null;
  private globalHistory = new RingBuffer();
  private globalShareWorkHistory = new ShareWorkRingBuffer();
  private minerHistories = new Map<string, RingBuffer>();
  private minerShareWorkHistories = new Map<string, ShareWorkRingBuffer>();
  private lastGlobalData: JdcGlobalResponse | null = null;
  private lastChannelData = new Map<string, MinerChannelData>(); // keyed by user_identity
  private monitoringReachable = false;

  start(): void {
    if (this.pollTimer) return;
    logger.info('[MonitoringService] Starting monitoring polling');
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('[MonitoringService] Stopped monitoring polling');
  }

  private getMonitoringBaseUrl(): string | null {
    try {
      const activeConfig = configService.getActiveConfiguration();
      if (!activeConfig) return null;

      const config = configService.parseConfig(activeConfig);
      if (!config.monitoring_address) return null;

      let addr = config.monitoring_address;
      // Replace 0.0.0.0 with 127.0.0.1 for local access
      addr = addr.replace('0.0.0.0', '127.0.0.1');

      // Ensure it has a protocol
      if (!addr.startsWith('http')) {
        addr = `http://${addr}`;
      }

      return addr;
    } catch (error) {
      return null;
    }
  }

  private async poll(): Promise<void> {
    const baseUrl = this.getMonitoringBaseUrl();
    if (!baseUrl) {
      this.monitoringReachable = false;
      return;
    }

    const now = new Date().toISOString();

    try {
      // Fetch global stats
      const globalRes = await axios.get<JdcGlobalResponse>(`${baseUrl}/api/v1/global`, {
        timeout: 5000,
      });
      this.lastGlobalData = globalRes.data;
      this.monitoringReachable = true;

      // Fetch clients and their channels for per-miner data
      const newChannelData = new Map<string, MinerChannelData>();
      try {
        const clientsRes = await axios.get<JdcClientsPageResponse>(`${baseUrl}/api/v1/clients`, {
          timeout: 5000,
        });
        const clients = Array.isArray(clientsRes.data?.items) ? clientsRes.data.items : [];

        // Fetch channels for each client
        for (const client of clients) {
          try {
            const channelsRes = await axios.get<JdcClientChannelsResponse>(
              `${baseUrl}/api/v1/clients/${client.client_id}/channels`,
              { timeout: 5000 },
            );
            for (const ch of channelsRes.data?.standard_channels ?? []) {
              newChannelData.set(ch.user_identity, {
                clientId: client.client_id,
                channelId: ch.channel_id,
                userIdentity: ch.user_identity,
                currentHashrate: Math.max(0, client.total_hashrate ?? 0),
                sharesAccepted: ch.shares_accepted ?? 0,
                bestDiff: ch.best_diff ?? 0,
                shareWorkSum: ch.share_work_sum ?? 0,
                expectedSharesPerMinute: ch.expected_shares_per_minute ?? 0,
              });
            }
          } catch {
            // skip this client's channels
          }
        }
      } catch {
        // keep previous data on transient error
      }

      this.lastChannelData = newChannelData;

      const nowMs = Date.now();

      // Record per-miner share_work_sum and calculate hashrate
      let totalCalculatedHashrate = 0;
      for (const [identity, data] of this.lastChannelData) {
        // Track share_work_sum for hashrate calculation
        if (!this.minerShareWorkHistories.has(identity)) {
          this.minerShareWorkHistories.set(identity, new ShareWorkRingBuffer());
        }
        this.minerShareWorkHistories.get(identity)!.push({
          timestamp: nowMs,
          shareWorkSum: data.shareWorkSum,
        });

        // Calculate actual hashrate from share_work_sum deltas
        const calculatedHashrate = this.minerShareWorkHistories.get(identity)!.calculateHashrate(HASHRATE_WINDOW_MS);
        totalCalculatedHashrate += calculatedHashrate;

        // Store calculated hashrate in display history
        if (!this.minerHistories.has(identity)) {
          this.minerHistories.set(identity, new RingBuffer());
        }
        this.minerHistories.get(identity)!.push({
          timestamp: now,
          hashrate: calculatedHashrate,
        });

        // Update the channel data with calculated hashrate
        data.currentHashrate = calculatedHashrate;
      }

      // Record global calculated hashrate
      this.globalHistory.push({
        timestamp: now,
        hashrate: totalCalculatedHashrate,
      });

      // Clean up histories for miners no longer present
      for (const key of this.minerHistories.keys()) {
        if (!this.lastChannelData.has(key)) {
          this.minerHistories.delete(key);
          this.minerShareWorkHistories.delete(key);
        }
      }
    } catch (error) {
      this.monitoringReachable = false;
      this.lastGlobalData = null;
      this.lastChannelData.clear();
    }
  }

  getDashboard(): MonitoringDashboard {
    // Use getEnrichedMiners() to get the filtered (non-stale) miner count
    const enrichedMiners = this.getEnrichedMiners();

    // Pool status: connected = monitoring reachable (JDC is running and connected to pool)
    // disconnected = monitoring unreachable (JDC not running)
    // unknown = no monitoring address configured
    let poolStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    const baseUrl = this.getMonitoringBaseUrl();
    if (baseUrl) {
      poolStatus = this.monitoringReachable ? 'connected' : 'disconnected';
    }

    const serverHashrate = Math.max(0, this.lastGlobalData?.server?.total_hashrate ?? 0);
    const totalChannels = this.lastGlobalData?.server?.total_channels ?? 0;

    // Sum actual current hashrate from all miners
    let totalHashrate = 0;
    for (const channelData of this.lastChannelData.values()) {
      totalHashrate += channelData.currentHashrate;
    }

    return {
      minerCount: enrichedMiners.length,
      totalHashrate,
      poolStatus,
      uptimeSecs: this.lastGlobalData?.uptime_secs ?? 0,
      totalChannels,
      serverHashrate,
    };
  }

  getEnrichedMiners(): EnrichedMiner[] {
    const trackedMiners = downstreamTracker.getConnectedMiners();
    const now = Date.now();
    const STALE_THRESHOLD_MS = 30_000; // 30 seconds

    return trackedMiners
      .filter((miner: ConnectedMiner) => {
        // If the monitoring API has channel data for this miner, it's active
        if (this.lastChannelData.has(miner.userIdentity)) return true;
        // If recently connected, give it time to appear in monitoring API
        const connectedAge = now - new Date(miner.connectedAt).getTime();
        if (connectedAge < STALE_THRESHOLD_MS) return true;
        // Stale: no monitoring data and connected too long ago - remove from tracker
        downstreamTracker.removeMiner(miner.downstreamId);
        return false;
      })
      .map((miner: ConnectedMiner) => {
        const channelData = this.lastChannelData.get(miner.userIdentity);

        return {
          downstreamId: miner.downstreamId,
          vendor: miner.vendor,
          hardwareVersion: miner.hardwareVersion,
          firmware: miner.firmware,
          deviceId: miner.deviceId,
          userIdentity: miner.userIdentity,
          nominalHashRate: miner.nominalHashRate,
          connectedAt: miner.connectedAt,
          clientId: channelData?.clientId,
          channelId: channelData?.channelId,
          sharesAccepted: channelData?.sharesAccepted ?? 0,
          bestDiff: channelData?.bestDiff ?? 0,
          currentHashrate: channelData?.currentHashrate ?? 0,
          shareWorkSum: channelData?.shareWorkSum ?? 0,
          expectedSharesPerMinute: channelData?.expectedSharesPerMinute ?? 0,
        };
      });
  }

  getGlobalHashrateHistory(): HashrateDataPoint[] {
    return this.globalHistory.getAll();
  }

  getMinerHashrateHistory(userIdentity: string): HashrateDataPoint[] {
    const history = this.minerHistories.get(userIdentity);
    return history ? history.getAll() : [];
  }
}

export const monitoringService = new MonitoringService();
