import { CONFIG } from './config';
import { MOCK_TASKS, MOCK_IT_TASKS, MOCK_DASHBOARD } from './mock-data';
import type { TaskRow, ITTaskRow, DashboardData, ApiResponse } from './types';

async function apiFetch<T>(action: string, params?: Record<string, string>): Promise<T> {
  if (CONFIG.USE_MOCK_DATA || !CONFIG.APPS_SCRIPT_URL) {
    return getMockData<T>(action, params);
  }

  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

async function apiPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (CONFIG.USE_MOCK_DATA || !CONFIG.APPS_SCRIPT_URL) {
    return { success: true } as T;
  }

  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

function getMockData<T>(action: string, params?: Record<string, string>): T {
  switch (action) {
    case 'getOverview':
      return MOCK_TASKS as T;
    case 'getMyTasks':
      return MOCK_TASKS.filter(t => t.owner === params?.member) as T;
    case 'getITTasks':
      return (params?.month
        ? MOCK_IT_TASKS.filter(t => t.month === params.month)
        : MOCK_IT_TASKS) as T;
    case 'getDashboard':
      return MOCK_DASHBOARD as T;
    case 'getProjects':
      return [...new Set(MOCK_TASKS.map(t => t.project))].map((p, i) => ({ id: String(i), name: p })) as T;
    case 'getMembers':
      return [...new Set(MOCK_TASKS.map(t => t.owner))].map((m, i) => ({ id: String(i), name: m })) as T;
    default:
      return [] as T;
  }
}

export const api = {
  getOverview: (params?: { week?: string }) =>
    apiFetch<TaskRow[]>('getOverview', params as Record<string, string>),
  getMyTasks: (member: string) =>
    apiFetch<TaskRow[]>('getMyTasks', { member }),
  getITTasks: (month?: string) =>
    apiFetch<ITTaskRow[]>('getITTasks', month ? { month } : undefined),
  getDashboard: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiFetch<DashboardData>('getDashboard', params as Record<string, string>),
  getProjects: () =>
    apiFetch<{ id: string; name: string }[]>('getProjects'),
  getMembers: () =>
    apiFetch<{ id: string; name: string }[]>('getMembers'),
  updateTaskStatus: (id: string, status: string, note?: string) =>
    apiPost('updateTaskStatus', { id, status, note }),
  addTask: (data: Partial<TaskRow>) =>
    apiPost('addTask', data as Record<string, unknown>),
};
