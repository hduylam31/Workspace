import { ALL_STATUSES } from './config';
import { MOCK_TASKS, MOCK_IT_TASKS, MOCK_POOL_TASKS, MOCK_DASHBOARD, MOCK_ROLE_TASKS } from './mock-data';
import {
  loadSheetsConfig,
  fetchAllITTrackerSheets,
  fetchReportSheet,
  fetchRoleToTaskSheet,
  fetchDuAnSheet,
  fetchRoleToProjectSheet,
  mergeProjectAssignments,
} from './google-sheets';
import type { TaskRow, ITTaskRow, DashboardData, DailyReport, RoleTask } from './types';

// ─── Mock fallback ────────────────────────────────────────────────────────────

function getMockData<T>(action: string, params?: Record<string, string>): T {
  switch (action) {
    case 'getOverview':  return MOCK_TASKS as T;
    case 'getMyTasks':   return MOCK_TASKS.filter(t => t.owner === params?.member) as T;
    case 'getDashboard': return MOCK_DASHBOARD as T;
    case 'getProjects':  return [...new Set(MOCK_TASKS.map(t => t.project))].map((p, i) => ({ id: String(i), name: p })) as T;
    case 'getMembers':   return [...new Set(MOCK_TASKS.map(t => t.owner))].map((m, i) => ({ id: String(i), name: m })) as T;
    case 'getStatuses':  return ALL_STATUSES as T;
    case 'getRoles':     return ['PO', 'DA', 'PMC', 'PD'] as T;
    default:             return [] as T;
  }
}

async function apiFetch<T>(action: string, params?: Record<string, string>): Promise<T> {
  return getMockData<T>(action, params);
}

// ─── Write via /api/sheets (proxy → Apps Script) ─────────────────────────────

async function sheetsPost<T>(body: Record<string, unknown>): Promise<T> {
  const cfg = loadSheetsConfig();

  // Nếu chưa có Apps Script URL → trả về success giả (mock mode)
  if (!cfg?.appsScriptUrl) {
    console.info('[api] Mock write — chưa có Apps Script URL:', body.action);
    return { success: true } as T;
  }

  const res = await fetch('/api/sheets', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-script-url':  cfg.appsScriptUrl,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Apps Script error');
  return json.data as T ?? json as T;
}

// ─── Sheet-direct read helpers ────────────────────────────────────────────────

export async function getPoolTasksFromSheet(): Promise<TaskRow[]> {
  const cfg = loadSheetsConfig();
  // Hỗ trợ tên mới (duAnSheet) và tên cũ (poolSheet) để backward compat
  const sheetName = cfg?.duAnSheet || cfg?.poolSheet;
  if (!cfg?.spreadsheetId || !cfg?.apiKey || !sheetName) return MOCK_POOL_TASKS;

  try {
    const projects    = await fetchDuAnSheet(cfg.spreadsheetId, cfg.apiKey, sheetName);
    const r2pSheet    = cfg.roleToProjectSheet;
    if (!r2pSheet) return projects;

    const assignments = await fetchRoleToProjectSheet(cfg.spreadsheetId, cfg.apiKey, r2pSheet);
    return mergeProjectAssignments(projects, assignments);
  } catch {
    return MOCK_POOL_TASKS;
  }
}

export async function getRoleTasksFromSheet(): Promise<RoleTask[]> {
  const cfg = loadSheetsConfig();
  const sheetName = cfg?.roleToTaskSheet || cfg?.roleTaskSheet;
  if (!cfg?.spreadsheetId || !cfg?.apiKey || !sheetName) return MOCK_ROLE_TASKS;
  try {
    return await fetchRoleToTaskSheet(cfg.spreadsheetId, cfg.apiKey, sheetName);
  } catch {
    return MOCK_ROLE_TASKS;
  }
}

export async function getITTasksFromSheet(): Promise<ITTaskRow[]> {
  const cfg = loadSheetsConfig();
  const sheets = cfg?.itTrackerSheets?.length
    ? cfg.itTrackerSheets
    : cfg?.itTrackerSheet ? [cfg.itTrackerSheet] : null;
  if (!sheets) return MOCK_IT_TASKS;
  const spreadsheetId = cfg?.itTrackerSpreadsheetId || cfg?.spreadsheetId;
  const apiKey        = cfg?.itTrackerApiKey        || cfg?.apiKey;
  if (!spreadsheetId || !apiKey) return MOCK_IT_TASKS;
  try { return await fetchAllITTrackerSheets(spreadsheetId, apiKey, sheets); }
  catch { return MOCK_IT_TASKS; }
}

export async function getReportsFromSheet(): Promise<DailyReport[]> {
  const cfg = loadSheetsConfig();
  const sheetName = cfg?.reportSheet ?? 'Báo cáo';
  if (!cfg?.spreadsheetId || !cfg?.apiKey) return [];
  try { return await fetchReportSheet(cfg.spreadsheetId, cfg.apiKey, sheetName); }
  catch { return []; }
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
  getRoleTasks: () => getRoleTasksFromSheet(),

  getDashboard: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiFetch<DashboardData>('getDashboard', params as Record<string, string>),

  getProjects:  (masterDataSheet?: string) =>
    apiFetch<{ id: string; name: string }[]>('getProjects', masterDataSheet ? { masterDataSheet } : undefined),

  getMembers:   () =>
    apiFetch<{ id: string; name: string }[]>('getMembers'),

  getStatuses:  (masterDataSheet?: string) =>
    apiFetch<string[]>('getStatuses', masterDataSheet ? { masterDataSheet } : undefined),

  getRoles:     (masterDataSheet?: string) =>
    apiFetch<string[]>('getRoles', masterDataSheet ? { masterDataSheet } : undefined),

  getReports:   (params?: { reportSheet?: string; member?: string; date?: string }) =>
    apiFetch<DailyReport[]>('getReports', params as Record<string, string>),

  // ── Task CRUD (stub) ─────────────────────────────────────────────────────
  addTask:          (data: Partial<TaskRow>) =>
    sheetsPost<TaskRow>({ action: 'addTask', ...data as Record<string, unknown> }),

  updateTask:       (data: Partial<TaskRow> & { id: string }) =>
    sheetsPost<{ updated: boolean }>({ action: 'updateTask', ...data as Record<string, unknown> }),

  updateTaskStatus: (id: string, status: string, note?: string) =>
    sheetsPost<{ updated: boolean }>({ action: 'updateTaskStatus', id, status, ...(note ? { note } : {}) }),

  deleteTask: (id: string) =>
    sheetsPost<{ deleted: boolean }>({ action: 'deleteTask', id }),

  // ── Báo cáo CRUD (stub) ──────────────────────────────────────────────────
  saveReport: (report: DailyReport, reportSheet?: string) =>
    sheetsPost<{ id: string; saved: boolean; action: 'created' | 'updated'; submittedAt: string }>(
      { action: 'saveReport', ...report as unknown as Record<string, unknown>, ...(reportSheet ? { reportSheet } : {}) }
    ),

  updateReport: (id: string, data: Partial<DailyReport>, reportSheet?: string) =>
    sheetsPost<{ updated: boolean }>(
      { action: 'updateReport', id, ...data as Record<string, unknown>, ...(reportSheet ? { reportSheet } : {}) }
    ),

  deleteReport: (id: string, reportSheet?: string) =>
    sheetsPost<{ deleted: boolean }>({ action: 'deleteReport', id, ...(reportSheet ? { reportSheet } : {}) }),

  // ── Pool Task (Dự án sheet) ───────────────────────────────────────────────
  /**
   * Thêm dự án mới vào "Dự án" sheet
   * row = [id, tênDuÁn, trạngThái, loại, owner, thànhViênKhác, deadline]
   */
  addPoolTask: (data: Partial<TaskRow>) => {
    const cfg = loadSheetsConfig();
    const duAnSheet = cfg?.duAnSheet || cfg?.poolSheet || 'Dự án';
    const row = [
      data.id ?? '',
      data.project ?? '',
      data.status ?? 'In Progress',
      data.task ?? 'Task',
      data.owner ?? '',
      data.role ?? '',
      data.endDate ?? '',
    ];
    return sheetsPost<{ success: boolean }>({ action: 'appendDuAn', duAnSheet, row });
  },

  /**
   * Cập nhật dự án trong "Dự án" sheet (theo sourceRow)
   */
  updatePoolTask: (data: Partial<TaskRow> & { id: string }) => {
    const cfg = loadSheetsConfig();
    const duAnSheet = cfg?.duAnSheet || cfg?.poolSheet || 'Dự án';
    const values = [
      data.id ?? '',
      data.project ?? '',
      data.status ?? '',
      data.task ?? '',
      data.owner ?? '',
      data.role ?? '',
      data.endDate ?? '',
    ];
    return sheetsPost<{ success: boolean }>({
      action: 'updateDuAn',
      duAnSheet,
      rowIndex: data.sourceRow ?? 2,
      values,
    });
  },

  deletePoolTask: (id: string) =>
    sheetsPost<{ deleted: boolean }>({ action: 'deletePoolTask', id }),

  /**
   * Owner pick → ghi assignments vào "Role to Project" cho TẤT CẢ thành viên.
   * assignments: [{ projectId, projectName, member, role, tasks }]
   */
  pickPoolTask: (
    id: string,
    member: string,
    poolSheet?: string,
    project?: string,
    assignments?: Array<{ member: string; role: string; tasks: string }>,
  ) => {
    const cfg = loadSheetsConfig();
    const roleToProjectSheet = cfg?.roleToProjectSheet || 'Role to Project';

    // Chuyển assignments sang format đúng cho API
    const r2pAssignments = assignments?.map(a => ({
      projectId:   id,
      projectName: project ?? '',
      member:      a.member,
      role:        a.role,
      tasks:       a.tasks ? a.tasks.split('; ').filter(Boolean) : [],
    })) ?? [];

    return sheetsPost<{ success: boolean; written: number }>({
      action: 'pickProject',
      roleToProjectSheet,
      assignments: r2pAssignments,
    });
  },
};
