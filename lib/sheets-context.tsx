'use client';
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { fetchAllSelectedSheets, loadSheetsConfig, type SheetsConfig } from './google-sheets';
import type { TaskRow } from './types';

interface SheetsContextValue {
  config: SheetsConfig | null;
  tasks: TaskRow[];
  loading: boolean;
  error: string;
  lastFetch: Date | null;
  setConfig: (cfg: SheetsConfig | null) => void;
  refresh: () => Promise<void>;
}

const SheetsContext = createContext<SheetsContextValue>({
  config: null, tasks: [], loading: false, error: '', lastFetch: null,
  setConfig: () => {}, refresh: async () => {},
});

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SheetsConfig | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async (cfg: SheetsConfig) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllSelectedSheets(cfg);
      setTasks(data);
      setLastFetch(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved config on mount
  useEffect(() => {
    const saved = loadSheetsConfig();
    if (saved) {
      setConfigState(saved);
      fetchData(saved);
    }
  }, [fetchData]);

  const setConfig = useCallback((cfg: SheetsConfig | null) => {
    setConfigState(cfg);
    if (cfg) fetchData(cfg);
    else setTasks([]);
  }, [fetchData]);

  const refresh = useCallback(async () => {
    if (config) await fetchData(config);
  }, [config, fetchData]);

  return (
    <SheetsContext.Provider value={{ config, tasks, loading, error, lastFetch, setConfig, refresh }}>
      {children}
    </SheetsContext.Provider>
  );
}

export const useSheetsData = () => useContext(SheetsContext);
