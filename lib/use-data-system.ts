'use client';
import { useState, useEffect } from 'react';
import { api } from './api';
import {
  loadSheetsConfig,
  fetchDataSystemProjects,
  fetchDataSystemStatuses,
  fetchDataSystemRoles,
  fetchDataSystemMembers,
} from './google-sheets';
import { ALL_STATUSES, ALL_ROLES, MEMBERS, nameToMemberItem, type MemberItem } from './config';

interface DataSystem {
  projects: string[];
  statuses: string[];
  roles: string[];
  members: MemberItem[];   // Thành viên từ Data System (fallback → MEMBERS config)
  loading: boolean;
}

// Cache module-level — tránh gọi lại khi re-render
const cache: { projects: string[]; statuses: string[]; roles: string[]; members: MemberItem[]; ts: number } = {
  projects: [], statuses: [], roles: [], members: [], ts: 0,
};
const CACHE_TTL = 5 * 60 * 1000;

async function safe<T>(p: Promise<T>, fb: T): Promise<T> {
  try { return await p; } catch { return fb; }
}

export function useDataSystem(): DataSystem {
  const [projects, setProjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(ALL_STATUSES);
  const [roles, setRoles]       = useState<string[]>(ALL_ROLES);
  const [members, setMembers]   = useState<MemberItem[]>(MEMBERS);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    // Dùng cache nếu còn hạn và có dữ liệu
    const now = Date.now();
    if (cache.ts && now - cache.ts < CACHE_TTL && cache.projects.length) {
      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
      setMembers(cache.members);
      return;
    }

    const config  = loadSheetsConfig();
    const mdSheet = config?.masterDataSheet || 'Data System';

    // Chưa kết nối → dùng mock
    if (!config?.spreadsheetId || !config?.apiKey) {
      api.getProjects().then(list => setProjects(list.map(x => x.name))).catch(() => {});
      return;
    }

    // Có API Key → đọc thẳng sheet Data System
    setLoading(true);

    Promise.all([
      safe(fetchDataSystemProjects(config.spreadsheetId, config.apiKey, mdSheet), []),
      safe(fetchDataSystemStatuses(config.spreadsheetId, config.apiKey, mdSheet), []),
      safe(fetchDataSystemRoles(config.spreadsheetId, config.apiKey, mdSheet),    []),
      safe(fetchDataSystemMembers(config.spreadsheetId, config.apiKey, mdSheet),  []),
    ]).then(([p, s, r, m]) => {
      const memberItems = (m as string[]).length
        ? (m as string[]).map((name, i) => nameToMemberItem(name, i))
        : MEMBERS;

      cache.projects = p as string[];
      cache.statuses = (s as string[]).length ? s as string[] : ALL_STATUSES;
      cache.roles    = (r as string[]).length ? r as string[] : ALL_ROLES;
      cache.members  = memberItems;
      cache.ts       = Date.now();

      setProjects(cache.projects);
      setStatuses(cache.statuses);
      setRoles(cache.roles);
      setMembers(cache.members);
    }).catch(() => {
      // Giữ fallback đã set trong useState
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  return { projects, statuses, roles, members, loading };
}
