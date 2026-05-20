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

/** Chạy promise, trả về giá trị hoặc fallback nếu lỗi */
async function safeGet<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try { return await promise; } catch { return fallback; }
}

export function useDataSystem(): DataSystem {
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(ALL_STATUSES);
  const [roles, setRoles]       = useState<string[]>(ALL_ROLES);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (cache.ts && now - cache.ts < CACHE_TTL && cache.projects.length) {
      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
      return;
    }

    setLoading(true);
    const config  = loadSheetsConfig();
    const mdSheet = config?.masterDataSheet || 'Data System';

    async function load() {
      try {
        if (config?.appsScriptUrl) {
          // Apps Script — mỗi call độc lập, lỗi riêng fall back riêng
          const [p, s, r] = await Promise.all([
            safeGet(api.getProjects(mdSheet).then(list => list.map(x => x.name)), []),
            safeGet(api.getStatuses(mdSheet), []),
            safeGet(api.getRoles(mdSheet),    []),
          ]);
          cache.projects = p.length ? p : [];
          cache.statuses = s.length ? s : ALL_STATUSES;
          cache.roles    = r.length ? r : ALL_ROLES;

        } else if (config?.spreadsheetId && config?.apiKey) {
          // API Key trực tiếp — đọc thẳng cột A, I, F của sheet Data System
          const [p, s, r] = await Promise.all([
            safeGet(fetchDataSystemProjects(config.spreadsheetId, config.apiKey, mdSheet), []),
            safeGet(fetchDataSystemStatuses(config.spreadsheetId, config.apiKey, mdSheet), []),
            safeGet(fetchDataSystemRoles(config.spreadsheetId, config.apiKey, mdSheet),    []),
          ]);
          cache.projects = p.length ? p : [];
          cache.statuses = s.length ? s : ALL_STATUSES;
          cache.roles    = r.length ? r : ALL_ROLES;

        } else {
          // Chưa kết nối — mock
          const list = await safeGet(api.getProjects(), []);
          cache.projects = list.map(x => x.name);
          cache.statuses = ALL_STATUSES;
          cache.roles    = ALL_ROLES;
        }

        cache.ts = Date.now();
      } finally {
        // Luôn cập nhật state dù thành công hay lỗi từng phần
        setProjects(cache.projects);
        setStatuses(cache.statuses.length ? cache.statuses : ALL_STATUSES);
        setRoles(cache.roles.length    ? cache.roles    : ALL_ROLES);
        setLoading(false);
      }
    }

    load();
  }, []);

  return { projects, statuses, roles, loading };
}
