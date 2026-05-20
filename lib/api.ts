import { CONFIG, ALL_STATUSES } from './config';
import { MOCK_TASKS, MOCK_IT_TASKS, MOCK_DASHBOARD } from './mock-data';
import { appsScriptPost, appsScriptGet, loadSheetsConfig } from './google-sheets';
import type { TaskRow, ITTaskRow, DashboardData, ApiResponse } from './types';

// ─── Lấy Apps Script URL từ config đã lưu ────────────────────────────────────

function getAppsScriptUrl(): string | null {
  if (CONFIG.APPS_SCRIPT_URL) return CONFIG.APPS_SCRIPT_URL;
  const saved = loadSheetsConfig();
  return saved?.appsScriptUrl ?? null;
}

// ─── Mock data fallback ───────────────────────────────────────────────────────

async function apiFetch<T>(action: string, params?: Record<string, string>): Promise<T> {
  const scriptUrl = getAppsScriptUrl();
  if (scriptUrl) {
    return appsScriptGet<T>(scriptUrl, { action, ...(params ?? {}) });
  }

  if (CONFIG.USE_MOCK_DATA || !CONFIG.APPS_SCRIPT_URL) {
    return getMockData<T>(action, params);
  }

  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

async function apiPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const scriptUrl = getAppsScriptUrl();
  if (scriptUrl) {
    return appsScriptPost<T>(scriptUrl, { action, ...body });
  }
  // Mock mode — trả về thành công giả
  return { success: true } as T;
}

function getMockData<T>(action: string, params?: Record<string, string>): T {
  switch (action) {
    case 'getOverview':  return MOCK_TASKS as T;
    case 'getMyTasks':   return MOCK_TASKS.filter(t => t.owner === params?.member) as T;
    case 'getITTasks':   return (params?.month ? MOCK_IT_TASKS.filter(t => t.month === params.month) : MOCK_IT_TASKS) as T;
    case 'getDashboard': return MOCK_DASHBOARD as T;
    case 'getProjects':  return [...new Set(MOCK_TASKS.map(t => t.project))].map((p, i) => ({ id: String(i), name: p })) as T;
    case 'getMembers':   return [...new Set(MOCK_TASKS.map(t => t.owner))].map((m, i) => ({ id: String(i), name: m })) as T;
    case 'getStatuses':  return ALL_STATUSES as T;
    case 'getRoles':     return ['PO', 'DA', 'PMC', 'PD'] as T;
    default:             return [] as T;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  getOverview:  (params?: { week?: string }) =>
    apiFetch<TaskRow[]>('getOverview', params as Record<string, string>),

  getMyTasks:   (member: string) =>
    apiFetch<TaskRow[]>('getMyTasks', { member }),

  getITTasks:   (month?: string) =>
    apiFetch<ITTaskRow[]>('getITTasks', month ? { month } : undefined),

  getDashboard: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiFetch<DashboardData>('getDashboard', params as Record<string, string>),

  getProjects:  (masterDataSheet?: string) =>
    apiFetch<{ id: string; name: string }[]>('getProjects', masterDataSheet ? { masterDataSheet } : undefined),

  getMembers:   () =>
    apiFetch<{ id: string; name: string }[]>('getMembers'),

  getStatuses: (masterDataSheet?: string) =>
    apiFetch<string[]>('getStatuses', masterDataSheet ? { masterDataSheet } : undefined),

  getRoles: (masterDataSheet?: string) =>
    apiFetch<string[]>('getRoles', masterDataSheet ? { masterDataSheet } : undefined),

  updateTaskStatus: (id: string, status: string, note?: string) =>
    apiPost<{ updated: boolean }>('updateTaskStatus', { id, status, ...(note ? { note } : {}) }),

  addTask: (data: Partial<TaskRow>) =>
    apiPost<TaskRow>('addTask', data as Record<string, unknown>),

  updateTask: (data: Partial<TaskRow> & { id: string }) =>
    apiPost<{ updated: boolean }>('updateTask', data as Record<string, unknown>),
};
