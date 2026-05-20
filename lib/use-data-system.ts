'use client';
import { useState, useEffect } from 'react';
import { api } from './api';
import {
  loadSheetsConfig,
  fetchDataSystemProjects,
  fetchDataSystemStatuses,
  fetchDataSystemRoles,
} from './google-sheets';
import { ALL_STATUSES, ALL_ROLES } from './config';

interface DataSystem {
  projects: string[];
  statuses: string[];
  roles: string[];
  loading: boolean;
}

// Cache module-level — tránh gọi lại khi re-render
const cache: { projects: string[]; statuses: string[]; roles: string[]; ts: number } = {
  projects: [], statuses: [], roles: [], ts: 0,
};
const CACHE_TTL = 5 * 60 * 1000;

async function safe<T>(p: Promise<T>, fb: T): Promise<T> {
  try { return await p; } catch { return fb; }
}

export function useDataSystem(): DataSystem {
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(ALL_STATUSES);
  const [roles, setRoles]       = useState<string[]>(ALL_ROLES);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    // Dùng cache nếu còn hạn và có dữ liệu
    const now = Date.now();
    if (cache.ts && now - cache.ts < CACHE_TTL && cache.projects.length) {
      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
      return;
    }

    const config  = loadSheetsConfig();
    const mdSheet = config?.masterDataSheet || 'Data System';

    // Chưa kết nối → dùng mock
    if (!config?.spreadsheetId || !config?.apiKey) {
      api.getProjects().then(list => setProjects(list.map(x => x.name))).catch(() => {});
      return;
    }

    // Có API Key → đọc thẳng sheet Data System (không cần Apps Script)
    // Master Data chỉ cần ĐỌC, không cần quyền ghi
    setLoading(true);

    Promise.all([
      safe(fetchDataSystemProjects(config.spreadsheetId, config.apiKey, mdSheet), []),
      safe(fetchDataSystemStatuses(config.spreadsheetId, config.apiKey, mdSheet), []),
      safe(fetchDataSystemRoles(config.spreadsheetId, config.apiKey, mdSheet),    []),
    ]).then(([p, s, r]) => {
      cache.projects = p;
      cache.statuses = s.length ? s : ALL_STATUSES;
      cache.roles    = r.length ? r : ALL_ROLES;
      cache.ts       = Date.now();

      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
    }).catch(() => {
      // Giữ fallback đã set trong useState
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  return { projects, statuses, roles, loading };
}
