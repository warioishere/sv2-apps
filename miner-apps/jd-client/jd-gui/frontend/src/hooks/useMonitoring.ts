import { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';
import { MonitoringDashboard, EnrichedMiner, HashrateDataPoint } from '../types/config.types';

export function useMonitoring(pollingInterval: number = 10000) {
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [miners, setMiners] = useState<EnrichedMiner[]>([]);
  const [globalHashrate, setGlobalHashrate] = useState<HashrateDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [dashData, minersData, hashrateData] = await Promise.all([
          apiService.getMonitoringDashboard(),
          apiService.getMonitoringMiners(),
          apiService.getGlobalHashrateHistory(),
        ]);
        setDashboard(dashData);
        setMiners(minersData.miners);
        setGlobalHashrate(hashrateData.history);
        setError(null);
      } catch (err) {
        const e = err as Error;
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval]);

  return { dashboard, miners, globalHashrate, loading, error };
}
