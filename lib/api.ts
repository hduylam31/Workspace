import { ALL_STATUSES } from './config';
import {
  loadSheetsConfig,
  fetchAllITTrackerSheets,
  fetchSheetNames,
  fetchReportSheet,
  fetchRoleToTaskSheet,
  fetchDuAnSheet,
  fetchRoleToProjectSheet,
  mergeProjectAssignments,
} from './google-sheets';
import type { TaskRow, ITTaskRow, DashboardData, DailyReport, RoleTask } from './types';

async function apiFetch<T>(action: string): Promise<T> {
  if (action === 'getStatuses') return ALL_STATUSES as T;
  return [] as T;
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
  if (!cfg?.spreadsheetId || !cfg?.apiKey || !sheetName) return [];

  try {
    const projects    = await fetchDuAnSheet(cfg.spreadsheetId, cfg.apiKey, sheetName);
    const r2pSheet    = cfg.roleToProjectSheet;
    if (!r2pSheet) return projects;

    const assignments = await fetchRoleToProjectSheet(cfg.spreadsheetId, cfg.apiKey, r2pSheet);
    return mergeProjectAssignments(projects, assignments);
  } catch {
    return [];
  }
}

export async function getRoleTasksFromSheet(): Promise<RoleTask[]> {
  const cfg = loadSheetsConfig();
  const sheetName = cfg?.roleToTaskSheet || cfg?.roleTaskSheet;
  if (!cfg?.spreadsheetId || !cfg?.apiKey || !sheetName) return [];
  try {
    return await fetchRoleToTaskSheet(cfg.spreadsheetId, cfg.apiKey, sheetName);
  } catch {
    return [];
  }
}

export async function getITTasksFromSheet(): Promise<ITTaskRow[]> {
  const cfg = loadSheetsConfig();
  const spreadsheetId = cfg?.itTrackerSpreadsheetId || cfg?.spreadsheetId;
  const apiKey        = cfg?.itTrackerApiKey        || cfg?.apiKey;
  if (!spreadsheetId || !apiKey) return [];

  let sheets = cfg?.itTrackerSheets?.length
    ? cfg.itTrackerSheets
    : cfg?.itTrackerSheet ? [cfg.itTrackerSheet] : null;

  // Chưa chọn sheet cụ thể → tự dò các sheet dạng "MM/YYYY" (mỗi sheet = 1 tháng)
  if (!sheets) {
    try {
      const names = await fetchSheetNames(spreadsheetId, apiKey);
      const monthSheets = names.filter(s => /^\d{2}\/\d{4}$/.test(s.trim()));
      sheets = monthSheets.length ? monthSheets : names;
    } catch { return []; }
  }
  if (!sheets.length) return [];

  try { return await fetchAllITTrackerSheets(spreadsheetId, apiKey, sheets); }
  catch { return []; }
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
  getOverview:  () => apiFetch<TaskRow[]>('getOverview'),

  getMyTasks:   () => apiFetch<TaskRow[]>('getMyTasks'),

  getITTasks:   () => getITTasksFromSheet(),
  getPoolTasks: () => getPoolTasksFromSheet(),
  getRoleTasks: () => getRoleTasksFromSheet(),

  getDashboard: (): Promise<DashboardData> => apiFetch<DashboardData>('getDashboard'),

  getProjects:  (): Promise<{ id: string; name: string }[]> => apiFetch<{ id: string; name: string }[]>('getProjects'),

  getMembers:   () =>
    apiFetch<{ id: string; name: string }[]>('getMembers'),

  getStatuses:  (): Promise<string[]> => apiFetch<string[]>('getStatuses'),

  getRoles:     (): Promise<string[]> => apiFetch<string[]>('getRoles'),

  getReports:   (): Promise<DailyReport[]> => apiFetch<DailyReport[]>('getReports'),

  // ── Task CRUD (stub) ─────────────────────────────────────────────────────
  addTask:          (data: Partial<TaskRow>) =>
    sheetsPost<TaskRow>({ action: 'addTask', ...data as Record<string, unknown> }),

  updateTask: (data: Partial<TaskRow> & { id: string }) =>
    sheetsPost<{ updated: boolean }>({
      action:    'updateMyTask',
      member:    data.sourceSheet ?? data.owner ?? '',
      rowIndex:  data.sourceRow   ?? 0,
      taskId:    data.id,
      taskName:  data.task ?? '',
      fields: {
        status:    data.status    ?? undefined,
        role:      data.role      ?? undefined,
        detail:    data.detail    ?? undefined,
        link:      data.link      ?? undefined,
        startDate: data.startDate ?? undefined,
        endDate:   data.endDate   ?? undefined,
      },
    }),

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

  deleteMyTask: (member: string, taskId: string, taskName: string) =>
    sheetsPost<{ deleted: boolean }>({ action: 'deleteMyTask', member, taskId, taskName }),

  // ── Pool Task (Dự án sheet) ───────────────────────────────────────────────
  /**
   * Thêm dự án mới vào "Dự án" sheet
   * row = [id, tênDuÁn, trạngThái, loại, owner, thànhViênKhác, deadline]
   */
  addPoolTask: (data: Partial<TaskRow>) => {
    const cfg = loadSheetsConfig();
    const duAnSheet = cfg?.duAnSheet || cfg?.poolSheet || 'Dự án';

    // F: xóa [...] trước, rồi split theo ";" để lấy tên (tránh ";" bên trong brackets)
    const membersForSheet = data.role
      ? data.role.replace(/\[[^\]]*\]/g, '').split(/;\s*/).map(p => p.trim()).filter(Boolean).join(', ')
      : '';

    // G: chuyển YYYY-MM-DD → DD/MM/YYYY cho đúng format sheet
    const deadlineForSheet = data.endDate
      ? (() => {
          const d = new Date(data.endDate + 'T00:00:00');
          return isNaN(d.getTime()) ? data.endDate :
            `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        })()
      : '';

    const row = [
      data.id ?? '',
      data.project ?? '',
      data.status ?? 'In Progress',
      data.task ?? 'Task',
      data.owner ?? '',
      membersForSheet,
      deadlineForSheet,
    ];
    console.log('[addPoolTask] row:', JSON.stringify(row));
    return sheetsPost<{ success: boolean }>({ action: 'appendDuAn', duAnSheet, row });
  },

  /**
   * Cập nhật dự án: tìm theo ID, ghi lại Dự án sheet + Role to Project + member sheets
   */
  updatePoolTask: (data: Partial<TaskRow> & { id: string }, assignments?: Array<{ member: string; role: string; tasks: string }>) => {
    const cfg = loadSheetsConfig();
    const duAnSheet          = cfg?.duAnSheet          || cfg?.poolSheet        || 'Dự án';
    const roleToProjectSheet = cfg?.roleToProjectSheet || 'Role to Project';

    // F: tên thành viên (comma-separated, bỏ [...])
    const membersForSheet = data.role
      ? data.role.replace(/\[[^\]]*\]/g, '').split(/;\s*/).map(p => p.trim()).filter(Boolean).join(', ')
      : '';

    // G: DD/MM/YYYY
    const deadlineForSheet = data.endDate
      ? (() => {
          const d = new Date(data.endDate + 'T00:00:00');
          return isNaN(d.getTime()) ? data.endDate :
            `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        })()
      : '';

    const row = [data.id, data.project ?? '', data.status ?? '', data.task ?? 'Task', data.owner ?? '', membersForSheet, deadlineForSheet];

    // Build assignments cho Role to Project + member sheets
    const r2pAssignments = (assignments ?? []).map(a => ({
      projectId:   data.id,
      projectName: data.project ?? '',
      member:      a.member,
      role:        a.role,
      tasks:       a.tasks ? a.tasks.split('; ').filter(Boolean) : [],
    }));

    return sheetsPost<{ updated: boolean }>({
      action: 'updateProjectFull',
      duAnSheet,
      roleToProjectSheet,
      row,
      assignments: r2pAssignments,
    });
  },

  deletePoolTask: (id: string) =>
    sheetsPost<{ deleted: boolean }>({ action: 'deletePoolFull', id }),

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
