import { useState, useEffect } from 'react';
import { apiService } from '../services/api.service';
import { ProcessStatus } from '../types/config.types';

export function useJdcStatus(pollingInterval: number = 5000) {
  const [status, setStatus] = useState<ProcessStatus>({ running: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const statusData = await apiService.getStatus();
        setStatus(statusData);
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval]);

  return { status, loading, error };
}
