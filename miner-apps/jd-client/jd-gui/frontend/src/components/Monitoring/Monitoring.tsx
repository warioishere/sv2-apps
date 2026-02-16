import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useMonitoring } from '../../hooks/useMonitoring';
import { apiService } from '../../services/api.service';
import { EnrichedMiner, HashrateDataPoint } from '../../types/config.types';
import './Monitoring.css';

function formatHashrate(h: number): string {
  if (h === 0) return '0 H/s';
  if (h >= 1e15) return (h / 1e15).toFixed(2) + ' PH/s';
  if (h >= 1e12) return (h / 1e12).toFixed(2) + ' TH/s';
  if (h >= 1e9) return (h / 1e9).toFixed(2) + ' GH/s';
  if (h >= 1e6) return (h / 1e6).toFixed(2) + ' MH/s';
  if (h >= 1e3) return (h / 1e3).toFixed(2) + ' KH/s';
  return h.toFixed(0) + ' H/s';
}

function formatUptime(secs: number): string {
  if (secs === 0) return '--';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(connectedAt: string): string {
  const diff = Date.now() - new Date(connectedAt).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatDifficulty(diff: number): string {
  if (diff === 0) return '0';
  if (diff >= 1e12) return (diff / 1e12).toFixed(2) + 'T';
  if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'G';
  if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
  if (diff >= 1e3) return (diff / 1e3).toFixed(2) + 'K';
  return diff.toFixed(0);
}

interface HashrateChartProps {
  data: HashrateDataPoint[];
  height?: number;
}

function HashrateChart({ data, height = 250 }: HashrateChartProps) {
  if (data.length < 2) {
    return <div className="chart-empty">Waiting for hashrate data...</div>;
  }

  const chartData = data.map(d => ({
    time: formatTime(d.timestamp),
    hashrate: d.hashrate,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="hashrateGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={(v) => formatHashrate(v)}
          width={80}
        />
        <Tooltip
          formatter={(value: number) => [formatHashrate(value), 'Hashrate']}
          contentStyle={{ fontSize: 13, borderRadius: 4 }}
        />
        <Area
          type="monotone"
          dataKey="hashrate"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#hashrateGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface MinerCardProps {
  miner: EnrichedMiner;
}

function MinerCard({ miner }: MinerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [minerHistory, setMinerHistory] = useState<HashrateDataPoint[]>([]);

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;

    const fetchHistory = async () => {
      try {
        const data = await apiService.getMinerHashrateHistory(miner.downstreamId);
        if (!cancelled) setMinerHistory(data.history);
      } catch {
        // ignore
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [expanded, miner.userIdentity]);

  const vendorDisplay = miner.vendor !== 'unknown' ? miner.vendor : 'Unknown Miner';

  return (
    <div className="miner-card">
      <div className="miner-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="miner-card-info">
          <span className="miner-card-title">
            {vendorDisplay}{miner.hardwareVersion ? ` ${miner.hardwareVersion}` : ''}
          </span>
          <span className="miner-card-subtitle">{miner.userIdentity}</span>
        </div>
        <div className="miner-card-stats">
          <div className="miner-stat">
            <div className="miner-stat-value">{formatHashrate(miner.currentHashrate)}</div>
            <div className="miner-stat-label">Hashrate</div>
          </div>
          <div className="miner-stat">
            <div className="miner-stat-value">{miner.sharesAccepted}</div>
            <div className="miner-stat-label">Shares</div>
          </div>
          <div className="miner-stat">
            <div className="miner-stat-value">{formatDifficulty(miner.bestDiff)}</div>
            <div className="miner-stat-label">Best Diff</div>
          </div>
          <span className={`miner-card-expand ${expanded ? 'open' : ''}`}>&#9660;</span>
        </div>
      </div>
      {expanded && (
        <div className="miner-card-details">
          <div className="miner-detail-grid">
            <div className="miner-detail-item">
              <span className="miner-detail-label">Firmware</span>
              <span className="miner-detail-value">{miner.firmware || '--'}</span>
            </div>
            <div className="miner-detail-item">
              <span className="miner-detail-label">Device ID</span>
              <span className="miner-detail-value">{miner.deviceId || '--'}</span>
            </div>
            <div className="miner-detail-item">
              <span className="miner-detail-label">Connected</span>
              <span className="miner-detail-value">{formatDuration(miner.connectedAt)}</span>
            </div>
            <div className="miner-detail-item">
              <span className="miner-detail-label">Share Work Sum</span>
              <span className="miner-detail-value">{formatDifficulty(miner.shareWorkSum)}</span>
            </div>
            <div className="miner-detail-item">
              <span className="miner-detail-label">Expected Shares/min</span>
              <span className="miner-detail-value">{miner.expectedSharesPerMinute.toFixed(2)}</span>
            </div>
          </div>
          <div className="miner-chart-section">
            <h4>Hashrate History</h4>
            <HashrateChart data={minerHistory} height={180} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Monitoring() {
  const { dashboard, miners, globalHashrate, loading, error } = useMonitoring();

  if (loading) {
    return (
      <div className="monitoring-loading">
        <p>Loading monitoring data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="monitoring-error">
        <p>Failed to load monitoring data: {error}</p>
      </div>
    );
  }

  return (
    <div className="monitoring">
      {/* Dashboard Cards */}
      <div className="monitoring-dashboard">
        <div className="dashboard-card">
          <div className="dashboard-card-label">Miners</div>
          <div className="dashboard-card-value">{dashboard?.minerCount ?? 0}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Total Hashrate</div>
          <div className="dashboard-card-value small">
            {formatHashrate(dashboard?.totalHashrate ?? 0)}
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Pool Status</div>
          <div className="dashboard-card-value">
            <span className={`pool-status ${dashboard?.poolStatus ?? 'unknown'}`}>
              {dashboard?.poolStatus ?? 'unknown'}
            </span>
          </div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Uptime</div>
          <div className="dashboard-card-value small">
            {formatUptime(dashboard?.uptimeSecs ?? 0)}
          </div>
        </div>
      </div>

      {/* Global Hashrate Chart */}
      <div className="monitoring-chart">
        <h3>Global Hashrate</h3>
        <HashrateChart data={globalHashrate} />
      </div>

      {/* Miner Cards */}
      <div className="monitoring-miners">
        <h3>Connected Miners ({miners.length})</h3>
        {miners.length === 0 ? (
          <div className="miners-empty">
            No miners connected. Connect a miner to your JD-Client to see it here.
          </div>
        ) : (
          <div className="miner-list">
            {miners.map((miner) => (
              <MinerCard key={miner.downstreamId} miner={miner} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
