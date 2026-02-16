import axios from 'axios';
import { logger } from '../utils/logger';
import { downstreamTracker } from './downstream-tracker.service';
import { configService } from '../database/config.service';
import { ConfigInput } from './toml.service';

const REPORT_INTERVAL_MS = 60_000; // 60 seconds

export class DownstreamReporterService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.intervalId) return;

    // Check if reporting is enabled in the active config
    if (!this.isEnabled()) {
      logger.info('[DownstreamReporter] Reporting disabled in config');
      return;
    }

    logger.info('[DownstreamReporter] Started (reporting every 60s)');
    this.intervalId = setInterval(() => this.sendReport(), REPORT_INTERVAL_MS);

    // Send first report after a short delay to allow miners to connect
    setTimeout(() => this.sendReport(), 10_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[DownstreamReporter] Stopped');
    }
  }

  private isEnabled(): boolean {
    const activeConfig = configService.getActiveConfiguration();
    if (!activeConfig) return false;
    const config = configService.parseConfig(activeConfig) as ConfigInput & { report_downstream_miners?: boolean };
    // Don't report when in solo mining mode - there's no pool to report to
    if (config.solo_mining_mode === true) return false;
    return config.report_downstream_miners === true;
  }

  private getReportUrl(): string | null {
    const activeConfig = configService.getActiveConfiguration();
    if (!activeConfig) return null;

    const config = configService.parseConfig(activeConfig);
    if (!config.upstreams || config.upstreams.length === 0) return null;

    const poolAddress = config.upstreams[0].pool_address;
    return `http://${poolAddress}/api/downstream-report`;
  }

  private getJdcUserIdentity(): string {
    const activeConfig = configService.getActiveConfiguration();
    if (!activeConfig) return 'unknown';

    const config = configService.parseConfig(activeConfig);
    return config.user_identity || 'unknown';
  }

  private async sendReport(): Promise<void> {
    // Re-check if still enabled (config may have changed)
    if (!this.isEnabled()) {
      this.stop();
      return;
    }

    const miners = downstreamTracker.getConnectedMiners();
    if (miners.length === 0) return;

    const url = this.getReportUrl();
    if (!url) {
      logger.warn('[DownstreamReporter] No pool address configured');
      return;
    }

    const payload = {
      schemaVersion: 1,
      jdcUserIdentity: this.getJdcUserIdentity(),
      timestamp: new Date().toISOString(),
      miners: miners.map((m) => ({
        vendor: m.vendor,
        hardwareVersion: m.hardwareVersion,
        firmware: m.firmware,
        deviceId: m.deviceId,
        nominalHashRate: m.nominalHashRate,
        userIdentity: m.userIdentity,
        connectedAt: m.connectedAt,
      })),
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      });

      logger.info(`[DownstreamReporter] Report sent: ${miners.length} miners, accepted=${response.data.accepted}`);
    } catch (err) {
      const error = err as Error;
      logger.warn(`[DownstreamReporter] Report failed: ${error.message}`);
    }
  }
}

export const downstreamReporter = new DownstreamReporterService();
