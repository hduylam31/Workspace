import { CONFIG, ALL_STATUSES } from './config';
import { MOCK_TASKS, MOCK_IT_TASKS, MOCK_POOL_TASKS, MOCK_DASHBOARD } from './mock-data';
import {
  appsScriptPost, appsScriptGet, loadSheetsConfig,
  fetchAllITTrackerSheets, fetchPoolSheet, fetchReportSheet,
} from './google-sheets';
import type { TaskRow, ITTaskRow, DashboardData, DailyReport, ApiResponse } from './types';

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
    case 'getITTasks':   return MOCK_IT_TASKS as T;
    case 'getPoolTasks': return MOCK_POOL_TASKS as T;
    case 'getDashboard': return MOCK_DASHBOARD as T;
    case 'getProjects':  return [...new Set(MOCK_TASKS.map(t => t.project))].map((p, i) => ({ id: String(i), name: p })) as T;
    case 'getMembers':   return [...new Set(MOCK_TASKS.map(t => t.owner))].map((m, i) => ({ id: String(i), name: m })) as T;
    case 'getStatuses':  return ALL_STATUSES as T;
    case 'getRoles':     return ['PO', 'DA', 'PMC', 'PD'] as T;
    default:             return [] as T;
  }
}

// ─── Sheet-direct helpers (không qua Apps Script) ────────────────────────────

export async function getITTasksFromSheet(): Promise<ITTaskRow[]> {
  const cfg = loadSheetsConfig();
  // Hỗ trợ cả mảng itTrackerSheets (mới) lẫn itTrackerSheet (cũ)
  const sheets = cfg?.itTrackerSheets?.length
    ? cfg.itTrackerSheets
    : cfg?.itTrackerSheet
      ? [cfg.itTrackerSheet]
      : null;
  if (!sheets) return MOCK_IT_TASKS;
  // Dùng Spreadsheet IT Tracker riêng nếu có, fallback về spreadsheet chính
  const spreadsheetId = cfg?.itTrackerSpreadsheetId || cfg?.spreadsheetId;
  const apiKey        = cfg?.itTrackerApiKey        || cfg?.apiKey;
  if (!spreadsheetId || !apiKey) return MOCK_IT_TASKS;
  try {
    return await fetchAllITTrackerSheets(spreadsheetId, apiKey, sheets);
  } catch {
    return MOCK_IT_TASKS;
  }
}

export async function getReportsFromSheet(): Promise<DailyReport[]> {
  const cfg = loadSheetsConfig();
  const sheetName = cfg?.reportSheet ?? 'Báo cáo';
  if (!cfg?.spreadsheetId || !cfg?.apiKey) return [];
  try {
    return await fetchReportSheet(cfg.spreadsheetId, cfg.apiKey, sheetName);
  } catch {
    return [];
  }
}

export async function getPoolTasksFromSheet(): Promise<TaskRow[]> {
  const cfg = loadSheetsConfig();
  if (!cfg?.poolSheet) return MOCK_POOL_TASKS;
  try {
    return await fetchPoolSheet(cfg.spreadsheetId, cfg.apiKey, cfg.poolSheet);
  } catch {
    return MOCK_POOL_TASKS;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  // ── Read ──────────────────────────────────────────────────────────────────
  getOverview:  (params?: { week?: string }) =>
    apiFetch<TaskRow[]>('getOverview', params as Record<string, string>),

  getMyTasks:   (member: string) =>
    apiFetch<TaskRow[]>('getMyTasks', { member }),

  getITTasks:   () => getITTasksFromSheet(),

  getPoolTasks: () => getPoolTasksFromSheet(),

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

  /** Đọc báo cáo qua Apps Script (có filter) */
  getReports: (params?: { reportSheet?: string; member?: string; date?: string }) =>
    apiFetch<DailyReport[]>('getReports', params as Record<string, string>),

  // ── Task CRUD ────────────────────────────────────────────────────────────
  addTask: (data: Partial<TaskRow>) =>
    apiPost<TaskRow>('addTask', data as Record<string, unknown>),

  updateTask: (data: Partial<TaskRow> & { id: string }) =>
    apiPost<{ updated: boolean }>('updateTask', data as Record<string, unknown>),

  updateTaskStatus: (id: string, status: string, note?: string) =>
    apiPost<{ updated: boolean }>('updateTaskStatus', { id, status, ...(note ? { note } : {}) }),

  deleteTask: (id: string) =>
    apiPost<{ deleted: boolean }>('deleteTask', { id }),

  // ── Báo cáo CRUD ─────────────────────────────────────────────────────────
  /**
   * Upsert báo cáo: nếu truyền id đã tồn tại → update dòng cũ, không có → thêm mới.
   * Trả về { id, saved, action: 'created'|'updated', submittedAt }
   */
  saveReport: (report: DailyReport, reportSheet?: string) =>
    apiPost<{ id: string; saved: boolean; action: 'created' | 'updated'; submittedAt: string }>(
      'saveReport',
      { ...report, ...(reportSheet ? { reportSheet } : {}) } as Record<string, unknown>
    ),

  updateReport: (id: string, data: Partial<DailyReport>, reportSheet?: string) =>
    apiPost<{ updated: boolean }>(
      'updateReport',
      { id, ...data, ...(reportSheet ? { reportSheet } : {}) } as Record<string, unknown>
    ),

  deleteReport: (id: string, reportSheet?: string) =>
    apiPost<{ deleted: boolean }>(
      'deleteReport',
      { id, ...(reportSheet ? { reportSheet } : {}) }
    ),

  // ── Pool Task CRUD ───────────────────────────────────────────────────────
  addPoolTask: (data: Partial<TaskRow>, poolSheet?: string) =>
    apiPost<{ id: string; added: boolean }>('addPoolTask', { ...data, ...(poolSheet ? { poolSheet } : {}) } as Record<string, unknown>),

  updatePoolTask: (data: Partial<TaskRow> & { id: string }, poolSheet?: string) =>
    apiPost<{ updated: boolean }>('updatePoolTask', { ...data, ...(poolSheet ? { poolSheet } : {}) } as Record<string, unknown>),

  deletePoolTask: (id: string, poolSheet?: string) =>
    apiPost<{ deleted: boolean }>('deletePoolTask', { id, ...(poolSheet ? { poolSheet } : {}) }),

  /** Member chọn task từ Pool — ghi owner vào Pool + copy sang sheet cá nhân */
  pickPoolTask: (id: string, member: string, poolSheet?: string) =>
    apiPost<{ picked: boolean; member: string }>('pickPoolTask', { id, member, ...(poolSheet ? { poolSheet } : {}) }),
};
