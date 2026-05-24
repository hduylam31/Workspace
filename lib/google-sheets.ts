import type { TaskRow, ITTaskRow, DailyReport } from './types';

export interface SheetsConfig {
  // ── Spreadsheet chính (My Tasks, Pool, Reports, Master Data) ──
  spreadsheetId: string;
  apiKey: string;
  selectedSheets: string[];
  appsScriptUrl?: string;    // URL Web App để ghi dữ liệu
  masterDataSheet?: string;  // Sheet chứa Master Data
  reportSheet?: string;      // Sheet Báo cáo → Overview write-only
  poolSheet?: string;        // Sheet Pool → Pick Task read/write

  // ── Spreadsheet IT Tracker (riêng biệt) ──
  itTrackerSpreadsheetId?: string;
  itTrackerApiKey?: string;
  itTrackerSheets?: string[];   // nhiều sheet (04/2026, 05/2026, ...)
  itTrackerSheet?: string;      // deprecated — backward compat
}

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Lấy danh sách tên sheets trong spreadsheet
export async function fetchSheetNames(spreadsheetId: string, apiKey: string): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?key=${apiKey}&fields=sheets.properties.title`;
  const res = await fetch(url);
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
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  // Tìm header row (dòng có "ID" hoặc bỏ qua dòng 1 nếu là header)
  const dataRows = rows.filter((row, idx) => {
    if (idx === 0) return false; // bỏ header
    const id = String(row[0] ?? '').trim();
    return id !== '' && id !== 'ID';
  });

  return dataRows.map((row, idx) => mapRow(row, sheetName, idx + 2));
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
  // 0=A ID·formula  1=B Dự án  2=C Task  3=D Owner·formula
  // 4=E Vai trò(multi)  5=F Chi tiết  6=G Link  7=H Status  8=I Bắt đầu  9=J Kết thúc
  return {
    id:           get(0) ?? `${sheetName.slice(0, 2)}${rowIndex}`,
    project:      get(1) ?? '',
    task:         get(2) ?? '',
    owner:        get(3) ?? sheetName,
    role:         get(4),          // E — Vai trò (multi-select, dạng "PO, DA")
    detail:       get(5),          // F — Chi tiết
    link:         get(6),          // G — Link
    status:       (get(7) as TaskRow['status']) ?? 'Chuẩn bị đưa vào làm', // H
    startDate:    parseDate(row[8]), // I — Bắt đầu
    endDate:      parseDate(row[9]), // J — Kết thúc
    note:         null,            // Không có cột Ghi chú trong sheet
    sourceSheet:  sheetName,
    sourceRow:    rowIndex,
    itTaskId:     null,
    lastModified: new Date().toISOString(),
  };
}

// ─── WRITE via Apps Script Web App (qua Next.js proxy để tránh CORS) ────────
//
// Browser gọi thẳng script.google.com bị CORS block do redirect cross-origin.
// Giải pháp: route qua /api/script (same-origin) → server-side fetch không bị CORS.

const PROXY_URL = '/api/script';

export async function appsScriptPost<T>(appsScriptUrl: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-script-url': appsScriptUrl,   // server dùng header này để forward request
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(errText);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Apps Script error');
  return json.data as T;
}

export async function appsScriptGet<T>(appsScriptUrl: string, params: Record<string, string>): Promise<T> {
  const searchParams = new URLSearchParams(params).toString();
  const proxyUrl = searchParams ? `${PROXY_URL}?${searchParams}` : PROXY_URL;
  const res = await fetch(proxyUrl, {
    headers: { 'x-script-url': appsScriptUrl },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Apps Script error');
  return json.data as T;
}

export async function testAppsScriptConnection(url: string): Promise<boolean> {
  const data = await appsScriptGet<{ status: string }>(url, { action: 'ping' });
  return data.status === 'ok';
}

// ─── Đọc Data System (Projects + Statuses + Roles) trực tiếp qua API ────────

// ─── Hàm gọi Sheets API dùng chung ──────────────────────────────────────────
async function fetchColumn(
  spreadsheetId: string,
  apiKey: string,
  range: string,
): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url);
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

// Cột F — Vai trò (unique values)
export async function fetchDataSystemRoles(
  spreadsheetId: string,
  apiKey: string,
  sheetName = 'Data System',
): Promise<string[]> {
  const all = await fetchColumn(spreadsheetId, apiKey, `${sheetName}!F2:F`);
  return [...new Set(all)]; // bỏ trùng
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
  const res = await fetch(url);
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
// Cấu trúc KHÁC sheet cá nhân — không có cột Status:
// A=ID  B=Tên dự án  C=Task  D=Owner  E=Vai trò  F=Chi tiết  G=Link  H=Bắt đầu  I=Kết thúc
export async function fetchPoolSheet(
  spreadsheetId: string,
  apiKey: string,
  sheetName: string,
): Promise<TaskRow[]> {
  const range = encodeURIComponent(`${sheetName}!A:I`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  const rows: unknown[][] = json.values ?? [];

  const dataRows = rows.filter((row, idx) => {
    if (idx === 0) return false; // bỏ header
    const id = String(row[0] ?? '').trim();
    return id !== '' && id !== 'ID';
  });

  return dataRows.map((row, idx) => {
    const get = (i: number) =>
      (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '')
        ? String(row[i]).trim()
        : null;

    // 0=A ID  1=B Project  2=C Task  3=D Owner  4=E Role
    // 5=F Detail  6=G Link  7=H Bắt đầu  8=I Kết thúc
    return {
      id:           get(0) ?? `${sheetName.slice(0, 2)}${idx + 2}`,
      project:      get(1) ?? '',
      task:         get(2) ?? '',
      owner:        get(3) ?? '',          // giữ nguyên — rỗng = chưa pick, có tên = đã pick
      role:         get(4),
      detail:       get(5),
      link:         get(6),
      status:       'Chuẩn bị làm' as TaskRow['status'], // Pool không có cột Status
      startDate:    parseSheetDate(row[7]), // H — Bắt đầu
      endDate:      parseSheetDate(row[8]), // I — Kết thúc
      note:         null,
      sourceSheet:  sheetName,
      sourceRow:    idx + 2,
      itTaskId:     null,
      lastModified: new Date().toISOString(),
    } satisfies TaskRow;
  });
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
  const res = await fetch(url);
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
      const rawDate = parseSheetDate(row[4]);   // E — Ngày báo cáo (serial / dd/mm / ISO)
      return {
        id:           get(0) ?? `R${idx + 2}`,  // A
        member:       get(1) ?? '',              // B
        role:         blankIfEmpty(get(2)),      // C
        reportPeriod: normalizePeriod(get(3)),   // D — "Tuần"→"week"
        date:         rawDate ?? new Date().toISOString().split('T')[0], // E
        project:      get(5) ?? '',              // F
        reportStatus: normalizeReportStatus(get(6)), // G — "Đúng tiến độ"→"on-track"
        progress:     Number(row[7]) || 0,       // H
        todayWork:    get(8) ?? '',              // I
        tomorrowPlan: get(9) ?? '',              // J
        blockers:     blankIfEmpty(get(10)),     // K — "Không có" → null
        submittedAt:  get(11) ?? new Date().toISOString(), // L
      } satisfies DailyReport;
    });
}
