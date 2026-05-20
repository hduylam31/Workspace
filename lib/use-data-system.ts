'use client';
import { useState, useEffect } from 'react';
import { api } from './api';
import { loadSheetsConfig, fetchDataSystemProjects, fetchDataSystemStatuses, fetchDataSystemRoles } from './google-sheets';
import { ALL_STATUSES, ALL_ROLES } from './config';

interface DataSystem {
  projects: string[];
  statuses: string[];
  roles: string[];
  loading: boolean;
}

const cache: { projects: string[]; statuses: string[]; roles: string[]; ts: number } = {
  projects: [], statuses: [], roles: [], ts: 0,
};
const CACHE_TTL = 5 * 60 * 1000;

export function useDataSystem(): DataSystem {
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(ALL_STATUSES);
  const [roles, setRoles] = useState<string[]>(ALL_ROLES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (cache.ts && now - cache.ts < CACHE_TTL && cache.projects.length) {
      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
      return;
    }

    setLoading(true);
    const config = loadSheetsConfig();
    const mdSheet = config?.masterDataSheet || 'Data System';

    async function load() {
      try {
        if (config?.appsScriptUrl) {
          // Dùng Apps Script — truyền masterDataSheet qua param
          const [p, s, r] = await Promise.all([
            api.getProjects(mdSheet).then(list => list.map(x => x.name)),
            api.getStatuses(mdSheet),
            api.getRoles(mdSheet),
          ]);
          cache.projects = p;
          cache.statuses = s.length ? s : ALL_STATUSES;
          cache.roles    = r.length ? r : ALL_ROLES;
        } else if (config?.spreadsheetId && config?.apiKey) {
          // Dùng API Key trực tiếp
          const [p, s, r] = await Promise.all([
            fetchDataSystemProjects(config.spreadsheetId, config.apiKey, mdSheet),
            fetchDataSystemStatuses(config.spreadsheetId, config.apiKey, mdSheet),
            fetchDataSystemRoles(config.spreadsheetId, config.apiKey, mdSheet),
          ]);
          cache.projects = p;
          cache.statuses = s.length ? s : ALL_STATUSES;
          cache.roles    = r.length ? r : ALL_ROLES;
        } else {
          // Mock
          const list = await api.getProjects();
          cache.projects = list.map(x => x.name);
          cache.statuses = ALL_STATUSES;
          cache.roles    = ALL_ROLES;
        }
        cache.ts = Date.now();
        setProjects(cache.projects);
        setStatuses(cache.statuses);
        setRoles(cache.roles);
      } catch {
        setStatuses(ALL_STATUSES);
        setRoles(ALL_ROLES);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { projects, statuses, roles, loading };
}
