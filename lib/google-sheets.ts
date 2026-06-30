import type { TaskRow, ITTaskRow, DailyReport } from './types';

export interface SheetsConfig {
  // ── Spreadsheet chính ──────────────────────────────────────────
  spreadsheetId: string;
  apiKey: string;
  selectedSheets: string[];    // Sheet cá nhân (My Tasks)

  // ── Apps Script Web App (write) ────────────────────────────────
  appsScriptUrl?: string;        // URL deploy Apps Script Web App

  // ── Pick Task sheets ───────────────────────────────────────────
  duAnSheet?: string;            // "Dự án"         — danh sách dự án (A:G)
  roleToTaskSheet?: string;      // "Role to Task"  — master task theo vai trò (A:C)
  roleToProjectSheet?: string;   // "Role to Project" — phân công member (A:E)

  // ── Other sheets ───────────────────────────────────────────────
  masterDataSheet?: string;      // Data System — projects, statuses, members
  reportSheet?: string;          // Báo cáo

  // ── Backward compat (cũ) ───────────────────────────────────────
  poolSheet?: string;            // deprecated → dùng duAnSheet
  roleTaskSheet?: string;        // deprecated → dùng roleToTaskSheet

  // ── Spreadsheet IT Tracker (riêng biệt) ───────────────────────
  itTrackerSpreadsheetId?: string;
  itTrackerApiKey?: string;
  itTrackerSheets?: string[];
  itTrackerSheet?: string;       // deprecated — backward compat
}

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// ─── Giá trị mặc định (KHÔNG gồm API Key) ────────────────────────────────────
// Dùng để tự điền sẵn form Kết nối — API Key vẫn phải nhập tay 1 lần,
// sau đó được lưu vào localStorage của trình duyệt đó cho các lần sau.
export const DEFAULT_FORM_VALUES = {
  spreadsheetId:      '1R62GTNaWOn4zMbm_Po_MdXfwB3lLnwCJhJm07zeZNUk',
  selectedSheets:     ['Đức Anh', 'Khánh', 'Tuyền', 'Trang', 'Trình', 'Mai'],
  masterDataSheet:    'Data System',
  reportSheet:        'Báo cáo',
  duAnSheet:          'Dự án',
  roleToTaskSheet:    'Role to Task',
  roleToProjectSheet: 'Role to Project',
  itTrackerSpreadsheetId: '1UE90IF07JY0B-Gj93I9XJzHG5y14wGemPoBbrAjUm9s',
};

// Lấy danh sách tên sheets trong spreadsheet
export async function fetchSheetNames(spreadsheetId: string, apiKey: string): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return (json.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
}

// Đọc dữ liệu từ 1 sheet cá nhân, map sang TaskRow
export async function fetchSheetTasks(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<TaskRow[]> {
  // Cột A:J (10 cột) — cấu trúc thực tế:
  // A=ID(formula) · B=Dự án · C=Task · D=Owner(formula) · E=Vai trò · F=Chi tiết · G=Link · H=Status · I=Bắt đầu · J=Kết thúc
  const range = encodeURIComponent(`${sheetName}!A:J`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  // Map với row index thật trong sheet (1-based), bỏ header (idx=0 = row 1)
  return rows
    .map((row, idx) => ({ row, sheetRow: idx + 1 }))
    .filter(({ row, sheetRow }) => {
      if (sheetRow === 1) return false; // bỏ header
      const id = String(row[0] ?? '').trim();
      return id !== '' && id !== 'ID';
    })
    .map(({ row, sheetRow }) => mapRow(row, sheetName, sheetRow));
}

// Đọc toàn bộ các sheets đã chọn gộp lại
export async function fetchAllSelectedSheets(config: SheetsConfig): Promise<TaskRow[]> {
  const results = await Promise.all(
    config.selectedSheets.map(sheet =>
      fetchSheetTasks(config.spreadsheetId, config.apiKey, sheet).catch(() => [])
    )
  );
  return results.flat();
}

// Hàm parse ngày dùng chung (Google Sheets serial / dd/mm/yyyy / ISO)
function parseSheetDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '-') return null;
  // Google Sheets serial number (days since 1899-12-30)
  const num = Number(s);
  if (!isNaN(num) && num > 1000) {
    const date = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return date.toISOString().split('T')[0];
  }
  // dd/mm/yyyy hoặc dd/mm
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (ddmm) {
    const d = ddmm[1].padStart(2, '0');
    const m = ddmm[2].padStart(2, '0');
    const y = ddmm[3] ? (ddmm[3].length === 2 ? `20${ddmm[3]}` : ddmm[3]) : '2026';
    return `${y}-${m}-${d}`;
  }
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function mapRow(row: unknown[], sheetName: string, rowIndex: number): TaskRow {
  const get = (i: number) => (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '')
    ? String(row[i]).trim()
    : null;

  const parseDate = parseSheetDate;

  // Cột thực tế trong sheet (0-based index):
  // 0=A ID  1=B Tên dự án  2=C Task  3=D Vai trò  4=E Chi tiết  5=F Link  6=G Status  7=H Bắt đầu  8=I Kết thúc
  return {
    id:           get(0) ?? `${sheetName.slice(0, 2)}${rowIndex}`,
    project:      get(1) ?? '',
    task:         get(2) ?? '',
    owner:        sheetName,       // sheet name = tên thành viên
    role:         get(3),          // D — Vai trò
    detail:       get(4),          // E — Chi tiết
    link:         get(5),          // F — Link
    status:       (get(6) as TaskRow['status']) ?? 'Chuẩn bị đưa vào làm', // G
    startDate:    parseDate(row[7]), // H — Bắt đầu
    endDate:      parseDate(row[8]), // I — Kết thúc
    note:         null,
    sourceSheet:  sheetName,
    sourceRow:    rowIndex,
    itTaskId:     null,
    lastModified: new Date().toISOString(),
  };
}

// ─── WRITE (placeholder — sẽ viết lại) ──────────────────────────────────────
// Apps Script đã được xóa. Phần ghi dữ liệu sẽ được viết lại từ đầu.

// ─── Đọc Data System (Projects + Statuses + Roles) trực tiếp qua API ────────

// ─── Hàm gọi Sheets API dùng chung ──────────────────────────────────────────
async function fetchColumn(
  spreadsheetId: string,
  apiKey: string,
  range: string,
): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.values ?? [] as unknown[][])
    .map((r: unknown[]) => String(r[0] ?? '').trim())
    .filter(Boolean);
}

// Cột A — Tên dự án
export async function fetchDataSystemProjects(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  return fetchColumn(spreadsheetId, apiKey, `${sheetName}!A2:A`);
}

// Cột I — Trạng thái
export async function fetchDataSystemStatuses(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  return fetchColumn(spreadsheetId, apiKey, `${sheetName}!I2:I`);
}

// Cột "Vai trò" — auto-detect bằng header row
export async function fetchDataSystemRoles(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  const headerUrl = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const headerRes = await fetch(headerUrl);
  if (!headerRes.ok) return [];
  const headerJson = await headerRes.json();
  const headers: string[] = (headerJson.values?.[0] ?? []).map((h: unknown) =>
    String(h ?? '').trim().toLowerCase()
  );
  const colIdx = headers.findIndex(h =>
    h === 'vai trò' || h === 'vai tro' || h === 'role' || h === 'roles' || h === 'vai_trò'
  );
  if (colIdx === -1) return [];
  const colLetter = String.fromCharCode(65 + colIdx);
  const all = await fetchColumn(spreadsheetId, apiKey, `${sheetName}!${colLetter}2:${colLetter}`);
  return [...new Set(all)];
}

// Cột "Thành viên" — auto-detect bằng cách đọc header row
export async function fetchDataSystemMembers(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  // Đọc dòng header để tìm cột "Thành viên"
  const headerUrl = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!1:1`)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const headerRes = await fetch(headerUrl);
  if (!headerRes.ok) return [];
  const headerJson = await headerRes.json();
  const headers: string[] = (headerJson.values?.[0] ?? []).map((h: unknown) =>
    String(h ?? '').trim().toLowerCase()
  );
  const colIdx = headers.findIndex(h =>
    h === 'thành viên' || h === 'thanh vien' || h === 'members' || h === 'thành_viên'
  );
  if (colIdx === -1) return [];
  // Đọc cột đó từ dòng 2 trở đi
  const colLetter = String.fromCharCode(65 + colIdx); // 0→A, 1→B, ...
  return fetchColumn(spreadsheetId, apiKey, `${sheetName}!${colLetter}2:${colLetter}`);
}

// LocalStorage helpers
const LS_KEY = 'ak_sheets_config';

export function loadSheetsConfig(): SheetsConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSheetsConfig(config: SheetsConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

export function clearSheetsConfig() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEY);
}

// ─── IT Tracker sheet ────────────────────────────────────────────────────────
// Cấu trúc mỗi sheet:
//   Row 1: Summary "Tháng 04/2026 | 9 task | Go live: 4 | Đang dev: 5"
//   Row 2: Trống
//   Row 3: Header xanh (Task ID | STT | Task | Priority | PRD Link | Design Link | Status | IT Review | Timeline | PM Note | IT Note)
//   Row 4+: Data
//
// Tháng = lấy từ tên tab sheet (vd: "04/2026"), không cần cột riêng.
export async function fetchITTrackerSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<ITTaskRow[]> {
  const range = encodeURIComponent(`${sheetName}!A:K`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  // Tháng lấy từ tên tab nếu có dạng MM/YYYY, fallback lấy từ dòng summary
  const monthFromTab = /^\d{2}\/\d{4}$/.test(sheetName.trim()) ? sheetName.trim() : null;
  const monthFromSummary = (() => {
    const s = String(rows[0]?.[0] ?? '').trim();
    const m = s.match(/(\d{2}\/\d{4})/);
    return m ? m[1] : null;
  })();
  const month = monthFromTab ?? monthFromSummary ?? '';

  const parseDate = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s === '-') return null;
    const num = Number(s);
    if (!isNaN(num) && num > 1000) {
      return new Date(Date.UTC(1899, 11, 30) + num * 86400000).toISOString().split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // dd/mm hoặc dd/mm/yyyy — nếu không có năm, lấy từ month
    const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (ddmm) {
      const d = ddmm[1].padStart(2, '0'), mo = ddmm[2].padStart(2, '0');
      const y = ddmm[3]
        ? (ddmm[3].length === 2 ? `20${ddmm[3]}` : ddmm[3])
        : (month.split('/')[1] ?? '2026');
      return `${y}-${mo}-${d}`;
    }
    return null;
  };

  return rows
    .filter((row, idx) => {
      if (idx < 3) return false;  // bỏ summary (0), trống (1), header (2)
      const cell = String(row[0] ?? '').trim();
      // bỏ dòng trống hoặc dòng header lọt xuống
      if (!cell || cell.toLowerCase() === 'task id') return false;
      return true;
    })
    .map(row => {
      const get = (i: number): string | null => {
        const v = String(row[i] ?? '').trim();
        return v === '' || v === '-' ? null : v;
      };
      const itReview = (() => {
        const v = String(row[7] ?? '').trim().toLowerCase();
        return v === 'true' || v === '1' || v === '✓' || v === 'yes';
      })();
      return {
        taskId:     get(0) ?? '',
        stt:        Number(row[1]) || 0,
        task:       get(2) ?? '',
        priority:   (get(3) as ITTaskRow['priority']) ?? 'Medium',
        prdLink:    get(4),
        designLink: get(5),
        status:     get(6) ?? '',
        itReview,
        timeline:   parseDate(row[8]),
        pmNote:     get(9),
        itNote:     get(10),
        month,
      } satisfies ITTaskRow;
    });
}

// Đọc nhiều sheet IT Tracker song song và gộp lại
export async function fetchAllITTrackerSheets(
  spreadsheetId: string,
  apiKey: string,
  sheetNames: string[],
): Promise<ITTaskRow[]> {
  const results = await Promise.allSettled(
    sheetNames.map(s => fetchITTrackerSheet(spreadsheetId, apiKey, s))
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// ─── Pool Task sheet ──────────────────────────────────────────────────────────
// Cấu trúc mới:
// A=ID  B=Tên dự án  C=Trạng thái  D=Loại dự án  E=Owner  F=Thành viên khác  G=Deadline  H=Vai trò Owner
export async function fetchPoolSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<TaskRow[]> {
  const range = encodeURIComponent(`${sheetName}!A:H`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  const dataRows = rows.filter((row, idx) => {
    if (idx === 0) return false; // bỏ header
    const id = String(row[0] ?? '').trim();
    return id !== '' && id.toLowerCase() !== 'id';
  });

  return dataRows.map((row, idx) => {
    const get = (i: number) =>
      (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '')
        ? String(row[i]).trim()
        : null;

    // A(0)=ID  B(1)=Tên dự án  C(2)=Trạng thái  D(3)=Loại dự án
    // E(4)=Owner  F(5)=Thành viên khác  G(6)=Deadline
    return {
      id:           get(0) ?? `pool_${idx + 2}`, // A — ID (DA001, DA002, ...)
      project:      get(1) ?? '',                // B — Tên dự án
      task:         get(3) ?? 'Task',            // D — Loại dự án (Task / Subtask)
      owner:        get(4) ?? '',                // E — Owner
      role:         get(5),                      // F — Thành viên khác (CSV)
      detail:       get(7),                      // H — Vai trò Owner (CSV, vd "PO, DA")
      link:         null,
      status:       (get(2) ?? 'In Progress') as TaskRow['status'], // C — Trạng thái
      startDate:    null,
      endDate:      parseSheetDate(row[6]),      // G — Deadline
      note:         null,
      sourceSheet:  sheetName,
      sourceRow:    idx + 2,
      itTaskId:     null,
      lastModified: new Date().toISOString(),
    } satisfies TaskRow;
  });
}

// Cột J — Trạng thái dự án (Done, In Progress, Backlog, ...)
export async function fetchDataSystemProjectStatuses(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  return fetchColumn(spreadsheetId, apiKey, `${sheetName}!J2:J`);
}

// ─── Report sheet (đọc) ───────────────────────────────────────────────────────
// Cột: A=ID · B=Thành viên · C=Vai trò · D=Kỳ BC · E=Ngày
//      F=Dự án · G=Trạng thái · H=% Hoàn thành · I=Đã làm · J=Sẽ làm · K=Blockers · L=SubmittedAt

/** Map tên kỳ tiếng Việt → giá trị enum */
function normalizePeriod(v: string | null): DailyReport['reportPeriod'] {
  if (!v) return 'day';
  const s = v.toLowerCase().trim();
  if (s === 'tuần' || s === 'week' || s === 'tuan') return 'week';
  if (s === 'tháng' || s === 'month' || s === 'thang') return 'month';
  return 'day';
}

/** Map trạng thái tiếng Việt → giá trị enum */
function normalizeReportStatus(v: string | null): DailyReport['reportStatus'] {
  if (!v) return 'on-track';
  const s = v.toLowerCase().trim();
  if (s.includes('chậm') || s.includes('delay') || s === 'delayed') return 'delayed';
  if (s.includes('hỗ trợ') || s.includes('support') || s === 'need-support') return 'need-support';
  return 'on-track';
}

/** Trả về "Không có" / "không có" / "-" → null */
function blankIfEmpty(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === 'không có' || s === 'khong co' || s === '-' || s === 'n/a') return null;
  return v.trim();
}

export async function fetchReportSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<DailyReport[]> {
  const range = encodeURIComponent(`${sheetName}!A:L`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];
  return rows
    .filter((row, idx) => idx > 0 && String(row[0] ?? '').trim() !== '')
    .map((row, idx) => {
      const get = (i: number) => {
        const v = String(row[i] ?? '').trim();
        return v === '' ? null : v;
      };
      // A=ID | B=Thành viên | C=Vai trò | D=Kỳ báo cáo | E=Ngày báo cáo
      // F=Tên Task | G=Dự án | H=Trạng thái task | I=Trạng thái tiến độ
      // J=Đã làm gì | K=Sẽ làm gì | L=Vướng mắc
      const rawDate = parseSheetDate(row[4]);
      return {
        id:           get(0) ?? `R${idx + 2}`,
        member:       get(1) ?? '',
        role:         blankIfEmpty(get(2)),
        reportPeriod: normalizePeriod(get(3)),
        date:         rawDate ?? new Date().toISOString().split('T')[0],
        taskName:     get(5) ?? '',
        project:      get(6) ?? '',
        taskStatus:   blankIfEmpty(get(7)),
        reportStatus: normalizeReportStatus(get(8)),
        todayWork:    get(9) ?? '',
        tomorrowPlan: get(10) ?? '',
        blockers:     blankIfEmpty(get(11)),
        submittedAt:  new Date().toISOString(),
      } satisfies DailyReport;
    });
}

// ─── Role Task sheet ──────────────────────────────────────────────────────────
// Cấu trúc: A=STT  B=Vai trò  C=Tên đầu việc
export async function fetchRoleTaskSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<import('./types').RoleTask[]> {
  const range = encodeURIComponent(`${sheetName}!A:C`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];
  return rows
    .filter((row, idx) => idx > 0 && String(row[2] ?? '').trim() !== '')
    .map(row => ({
      stt:      Number(row[0]) || 0,
      role:     String(row[1] ?? '').trim(),
      taskName: String(row[2] ?? '').trim(),
    }));
}

// ─── "Dự án" sheet (Pick Task pool) ──────────────────────────────────────────
// Cấu trúc: A=ID · B=Tên dự án · C=Trạng thái · D=Loại dự án · E=Owner · F=Thành viên khác · G=Deadline
export async function fetchDuAnSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<TaskRow[]> {
  const range = encodeURIComponent(`${sheetName}!A:G`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  return rows
    .filter((row, idx) => {
      if (idx === 0) return false;
      const id = String(row[0] ?? '').trim();
      return id !== '' && id.toLowerCase() !== 'id';
    })
    .map((row, idx) => {
      const get = (i: number) =>
        (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '')
          ? String(row[i]).trim()
          : null;
      return {
        id:           get(0) ?? `DA${idx + 2}`,
        project:      get(1) ?? '',
        status:       (get(2) ?? 'In Progress') as TaskRow['status'],
        task:         get(3) ?? 'Task',
        owner:        get(4) ?? '',
        role:         get(5),                    // Thành viên khác (tên, CSV)
        endDate:      parseSheetDate(row[6]),
        detail:       null,                      // Sẽ merge từ Role to Project
        link:         null,
        note:         null,
        startDate:    null,
        sourceSheet:  sheetName,
        sourceRow:    idx + 2,
        itTaskId:     null,                      // null = chưa pick
        lastModified: new Date().toISOString(),
      } satisfies TaskRow;
    });
}

// ─── "Role to Task" sheet (master task theo vai trò) ─────────────────────────
// Cấu trúc: A=ID · B=Vai trò · C=Tên Task
export async function fetchRoleToTaskSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<import('./types').RoleTask[]> {
  const range = encodeURIComponent(`${sheetName}!A:C`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];
  return rows
    .filter((row, idx) => idx > 0 && String(row[2] ?? '').trim() !== '')
    .map((row, idx) => ({
      stt:      idx + 1,
      role:     String(row[1] ?? '').trim(),
      taskName: String(row[2] ?? '').trim(),
    }));
}

// ─── "Role to Project" sheet (phân công member + role + task theo dự án) ──────
// Cấu trúc: A=ID dự án · B=Tên dự án · C=Thành viên · D=Vai trò · E=Task (multi, xuống dòng hoặc dấu phẩy)
export interface RoleToProjectRow {
  projectId:   string;
  projectName: string;
  member:      string;
  role:        string;
  tasks:       string[];
}

export async function fetchRoleToProjectSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<RoleToProjectRow[]> {
  const range = encodeURIComponent(`${sheetName}!A:E`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];
  return rows
    .filter((row, idx) => idx > 0 && String(row[0] ?? '').trim() !== '')
    .map(row => {
      const get = (i: number) => String(row[i] ?? '').trim();
      // Task cell: có thể là newline-separated hoặc comma-separated
      const tasksRaw = get(4);
      const tasks = tasksRaw
        ? tasksRaw.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean)
        : [];
      return {
        projectId:   get(0),
        projectName: get(1),
        member:      get(2),
        role:        get(3),
        tasks,
      };
    });
}

// ─── Merge "Dự án" + "Role to Project" → TaskRow[] ───────────────────────────
// Projects có assignment trong Role to Project → itTaskId = 'PICKED'
// detail = owner's roles+tasks encoded, role = other members' roles+tasks encoded
export function mergeProjectAssignments(
  projects: TaskRow[],
  assignments: RoleToProjectRow[],
): TaskRow[] {
  // Group assignments by projectId
  const byProject = new Map<string, RoleToProjectRow[]>();
  assignments.forEach(a => {
    if (!byProject.has(a.projectId)) byProject.set(a.projectId, []);
    byProject.get(a.projectId)!.push(a);
  });

  return projects.map(project => {
    const projectAssignments = byProject.get(project.id) ?? [];
    if (!projectAssignments.length) return project;

    // Owner assignments (cùng tên với owner)
    const ownerRows  = projectAssignments.filter(a => a.member === project.owner);
    // Other members
    const otherRows  = projectAssignments.filter(a => a.member !== project.owner);

    // Encode detail: "R1, R2|Task1; Task2"
    let detail: string | null = null;
    if (ownerRows.length > 0) {
      const roles = ownerRows.map(a => a.role).join(', ');
      const tasks = ownerRows.flatMap(a => a.tasks).join('; ');
      detail = tasks ? `${roles}|${tasks}` : roles;
    }

    // Encode role: "Name[R1, R2|Task1; Task2]; Name2[...]"
    let role: string | null = project.role; // giữ tên thành viên từ Dự án sheet
    if (otherRows.length > 0) {
      const memberMap = new Map<string, { roles: string[]; tasks: string[] }>();
      otherRows.forEach(a => {
        if (!memberMap.has(a.member)) memberMap.set(a.member, { roles: [], tasks: [] });
        const entry = memberMap.get(a.member)!;
        if (!entry.roles.includes(a.role)) entry.roles.push(a.role);
        entry.tasks.push(...a.tasks);
      });
      role = [...memberMap.entries()].map(([name, { roles, tasks }]) => {
        const inner = tasks.length
          ? `${roles.join(', ')}|${tasks.join('; ')}`
          : roles.join(', ');
        return `${name}[${inner}]`;
      }).join('; ');
    }

    return {
      ...project,
      detail,
      role,
      itTaskId: 'PICKED', // có assignment = đã pick
    };
  });
}
