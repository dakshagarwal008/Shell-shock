import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardData } from '../services/dashboardData.js';

export function useDashboardData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchDashboardData(controller.signal).then(result => {
      setData(result);
    }).catch(reason => {
      if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load dashboard data.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  return { data, error, loading, refresh };
}
