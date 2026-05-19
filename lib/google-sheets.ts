import type { TaskRow } from './types';

export interface SheetsConfig {
  spreadsheetId: string;
  apiKey: string;
  selectedSheets: string[];
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

function mapRow(row: unknown[], sheetName: string, rowIndex: number): TaskRow {
  const get = (i: number) => (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '')
    ? String(row[i]).trim()
    : null;

  const parseDate = (val: unknown): string | null => {
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
  };

  return {
    id:           get(0) ?? `${sheetName.slice(0, 2)}${rowIndex}`,
    project:      get(1) ?? '',
    task:         get(2) ?? '',
    owner:        get(3) ?? sheetName,
    detail:       get(4),
    link:         get(5),
    status:       (get(6) as TaskRow['status']) ?? 'Chuẩn bị làm',
    startDate:    parseDate(row[7]),
    endDate:      parseDate(row[8]),
    note:         get(9),
    sourceSheet:  sheetName,
    sourceRow:    rowIndex,
    itTaskId:     null,
    lastModified: new Date().toISOString(),
  };
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
