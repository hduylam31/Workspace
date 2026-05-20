/**
 * AN KHANG PM WORKSPACE — API Handler
 * Dán toàn bộ code này vào cuối file Apps Script hiện tại của Workspace An Khang 2026
 * Sau đó Deploy → New Deployment → Web App
 *   Execute as: Me
 *   Who has access: Anyone
 */

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

const API_CONFIG = {
  MEMBER_SHEETS: ['Đức Anh', 'Khánh', 'Tuyền', 'Trang', 'Trình', 'Mai'],
  MEMBER_PREFIX: {
    'Đức Anh': 'DA',
    'Khánh':   'KH',
    'Tuyền':   'TY',
    'Trang':   'TR',
    'Trình':   'TI',
    'Mai':     'MA',
  },
  // Cột trong sheet cá nhân (1-indexed)
  COL: {
    ID:         1,  // A
    PROJECT:    2,  // B — Tên dự án
    TASK:       3,  // C
    OWNER:      4,  // D
    DETAIL:     5,  // E — Chi tiết
    LINK:       6,  // F
    STATUS:     7,  // G
    START_DATE: 8,  // H — Bắt đầu
    END_DATE:   9,  // I — Kết thúc
    NOTE:       10, // J — Ghi chú
    ROLE:       11, // K — Vai trò (PO, DA, PMC, PD...)
  },
  CACHE_TTL: 300, // 5 phút
};

// ─── HTTP HANDLERS ────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || '';
    const p = e.parameter || {};

    switch (action) {
      case 'getOverview':  return jsonOk(apiGetOverview());
      case 'getMyTasks':   return jsonOk(apiGetMyTasks(p.member));
      case 'getProjects':  return jsonOk(apiGetProjects(p.masterDataSheet));
      case 'getStatuses':  return jsonOk(apiGetStatuses(p.masterDataSheet));
      case 'getRoles':     return jsonOk(apiGetRoles(p.masterDataSheet));
      case 'getMembers':   return jsonOk(apiGetMembers());
      case 'getDashboard': return jsonOk(apiGetDashboard());
      case 'ping':         return jsonOk({ status: 'ok', time: new Date().toISOString() });
      default:             return jsonError('Unknown action: ' + action);
    }
  } catch (err) {
    return jsonError(err.toString());
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';

    switch (action) {
      case 'addTask':          return jsonOk(apiAddTask(body));
      case 'updateTaskStatus': return jsonOk(apiUpdateTaskStatus(body));
      case 'updateTask':       return jsonOk(apiUpdateTask(body));
      default:                 return jsonError('Unknown action: ' + action);
    }
  } catch (err) {
    return jsonError(err.toString());
  }
}

// ─── READ FUNCTIONS ───────────────────────────────────────────────────────────

function apiGetOverview() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('overview');
  if (cached) return JSON.parse(cached);

  const all = [];
  API_CONFIG.MEMBER_SHEETS.forEach(function(sheetName) {
    const rows = readSheetTasks(sheetName);
    rows.forEach(function(r) { all.push(r); });
  });

  cache.put('overview', JSON.stringify(all), API_CONFIG.CACHE_TTL);
  return all;
}

function apiGetMyTasks(member) {
  if (!member) return [];
  const cache = CacheService.getScriptCache();
  const key = 'tasks_' + member;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const rows = readSheetTasks(member);
  cache.put(key, JSON.stringify(rows), API_CONFIG.CACHE_TTL);
  return rows;
}

function apiGetProjects(masterDataSheet) {
  // Cột A = Tên dự án
  const names = readColumn_(masterDataSheet || 'Data System', 1); // col A = index 1
  if (!names.length) {
    // Fallback: lấy từ tất cả task
    const tasks = apiGetOverview();
    const unique = [];
    const seen = {};
    tasks.forEach(function(t) {
      if (t.project && !seen[t.project]) { seen[t.project] = true; unique.push(t.project); }
    });
    return unique.map(function(p, i) { return { id: String(i), name: p }; });
  }
  return names.map(function(name, i) { return { id: String(i), name: name }; });
}

function apiGetStatuses(masterDataSheet) {
  // Cột I = Trạng thái
  return readColumn_(masterDataSheet || 'Data System', 9); // col I = index 9
}

function apiGetRoles(masterDataSheet) {
  // Cột F = Vai trò — unique values
  const all = readColumn_(masterDataSheet || 'Data System', 6); // col F = index 6
  const seen = {};
  return all.filter(function(v) {
    if (seen[v]) return false;
    seen[v] = true;
    return true;
  });
}

function apiGetMembers() {
  return API_CONFIG.MEMBER_SHEETS.map(function(name, i) {
    return { id: String(i), name: name };
  });
}

function apiGetDashboard() {
  const tasks = apiGetOverview();
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const activeSt = ['Add Sprint', 'Add Xtask', 'In progress', 'Đang dev', 'Nghiệm thu', 'Chuẩn bị làm', 'Định kỳ'];
  const doneSt   = ['Done', 'Golive', 'Go live', 'Xong mô tả'];

  const totalActive = tasks.filter(function(t) { return activeSt.includes(t.status); }).length;

  const goLiveThisMonth = tasks.filter(function(t) {
    if (!doneSt.includes(t.status)) return false;
    if (!t.endDate) return false;
    const d = new Date(t.endDate);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  const inProgress = tasks.filter(function(t) {
    return ['In progress', 'Đang dev', 'Add Sprint', 'Add Xtask'].includes(t.status);
  }).length;

  const overdue = tasks.filter(function(t) {
    if (doneSt.includes(t.status)) return false;
    if (!t.endDate) return false;
    return new Date(t.endDate) < now;
  }).length;

  // By member
  const byMember = API_CONFIG.MEMBER_SHEETS.map(function(member) {
    const mt = tasks.filter(function(t) { return t.owner === member; });
    const counts = {};
    mt.forEach(function(t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    return { member: member, counts: counts };
  });

  // By project
  const projectMap = {};
  tasks.forEach(function(t) {
    if (t.project) projectMap[t.project] = (projectMap[t.project] || 0) + 1;
  });
  const byProject = Object.keys(projectMap)
    .sort(function(a, b) { return projectMap[b] - projectMap[a]; })
    .slice(0, 7)
    .map(function(p) { return { project: p, count: projectMap[p] }; });

  return {
    totalActive: totalActive,
    goLiveThisMonth: goLiveThisMonth,
    inProgress: inProgress,
    overdue: overdue,
    byMember: byMember,
    byProject: byProject,
    byMonth: [],
    roadmap: [],
  };
}

// ─── WRITE FUNCTIONS ──────────────────────────────────────────────────────────

function apiAddTask(body) {
  const owner  = body.owner  || '';
  const project = body.project || '';
  const task   = body.task   || '';
  const status = body.status || 'Chuẩn bị làm';

  if (!owner || !project || !task) {
    throw new Error('owner, project, task là bắt buộc');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(owner);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + owner);

  // Tạo ID mới
  const newId = generateNextId(sheet, owner);

  // Format ngày dd/MM/yyyy cho Sheets
  const startDate = body.startDate ? formatDateForSheet(body.startDate) : '';
  const endDate   = body.endDate   ? formatDateForSheet(body.endDate)   : '';

  const newRow = [
    newId,
    project,
    task,
    owner,
    body.detail || '',
    body.link   || '',
    status,
    startDate,
    endDate,
    body.note   || '',
    body.role   || '',   // K — Vai trò
  ];

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  // Xóa cache + sync
  invalidateCache(owner);
  try { runAllTransfers(); } catch(e) {}

  return {
    id: newId,
    owner: owner,
    project: project,
    task: task,
    status: status,
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    detail: body.detail || null,
    link: body.link || null,
    note: body.note || null,
    sourceSheet: owner,
    sourceRow: sheet.getLastRow(),
    itTaskId: null,
    lastModified: new Date().toISOString(),
  };
}

function apiUpdateTaskStatus(body) {
  const id     = body.id     || '';
  const status = body.status || '';
  const note   = body.note;

  if (!id || !status) throw new Error('id và status là bắt buộc');

  const result = findTaskById(id);
  if (!result) throw new Error('Không tìm thấy task ID: ' + id);

  const { sheet, rowIndex, owner } = result;
  sheet.getRange(rowIndex, API_CONFIG.COL.STATUS).setValue(status);
  if (note !== undefined) {
    sheet.getRange(rowIndex, API_CONFIG.COL.NOTE).setValue(note || '');
  }
  SpreadsheetApp.flush();

  invalidateCache(owner);
  try { runAllTransfers(); } catch(e) {}

  return { id: id, status: status, updated: true };
}

function apiUpdateTask(body) {
  const id = body.id || '';
  if (!id) throw new Error('id là bắt buộc');

  const result = findTaskById(id);
  if (!result) throw new Error('Không tìm thấy task ID: ' + id);

  const { sheet, rowIndex, owner } = result;
  const C = API_CONFIG.COL;

  if (body.project    !== undefined) sheet.getRange(rowIndex, C.PROJECT).setValue(body.project);
  if (body.task       !== undefined) sheet.getRange(rowIndex, C.TASK).setValue(body.task);
  if (body.status     !== undefined) sheet.getRange(rowIndex, C.STATUS).setValue(body.status);
  if (body.detail     !== undefined) sheet.getRange(rowIndex, C.DETAIL).setValue(body.detail || '');
  if (body.link       !== undefined) sheet.getRange(rowIndex, C.LINK).setValue(body.link || '');
  if (body.note       !== undefined) sheet.getRange(rowIndex, C.NOTE).setValue(body.note || '');
  if (body.startDate  !== undefined) sheet.getRange(rowIndex, C.START_DATE).setValue(body.startDate ? formatDateForSheet(body.startDate) : '');
  if (body.endDate    !== undefined) sheet.getRange(rowIndex, C.END_DATE).setValue(body.endDate ? formatDateForSheet(body.endDate) : '');
  if (body.role       !== undefined) sheet.getRange(rowIndex, C.ROLE).setValue(body.role || '');

  SpreadsheetApp.flush();
  invalidateCache(owner);
  try { runAllTransfers(); } catch(e) {}

  return { id: id, updated: true };
}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function readSheetTasks(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues(); // A:K
  const C = API_CONFIG.COL;

  return data
    .filter(function(row) {
      const id = String(row[C.ID - 1] || '').trim();
      return id !== '' && id !== 'ID';
    })
    .map(function(row, idx) {
      return {
        id:           String(row[C.ID - 1]         || '').trim(),
        project:      String(row[C.PROJECT - 1]    || '').trim(),
        task:         String(row[C.TASK - 1]        || '').trim(),
        owner:        String(row[C.OWNER - 1]       || sheetName).trim(),
        detail:       String(row[C.DETAIL - 1]      || '').trim() || null,
        link:         String(row[C.LINK - 1]        || '').trim() || null,
        status:       String(row[C.STATUS - 1]      || 'Chuẩn bị làm').trim(),
        startDate:    parseSheetDate(row[C.START_DATE - 1]),
        endDate:      parseSheetDate(row[C.END_DATE - 1]),
        note:         String(row[C.NOTE - 1]        || '').trim() || null,
        role:         String(row[C.ROLE - 1]        || '').trim() || null,
        sourceSheet:  sheetName,
        sourceRow:    idx + 2,
        itTaskId:     null,
        lastModified: new Date().toISOString(),
      };
    });
}

function findTaskById(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < API_CONFIG.MEMBER_SHEETS.length; i++) {
    var sheetName = API_CONFIG.MEMBER_SHEETS[i];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    var ids = sheet.getRange(2, API_CONFIG.COL.ID, lastRow - 1, 1).getValues();
    for (var r = 0; r < ids.length; r++) {
      if (String(ids[r][0]).trim() === id) {
        return { sheet: sheet, rowIndex: r + 2, owner: sheetName };
      }
    }
  }
  return null;
}

function generateNextId(sheet, owner) {
  const prefix = API_CONFIG.MEMBER_PREFIX[owner] || owner.slice(0, 2).toUpperCase();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + '1';

  const ids = sheet.getRange(2, API_CONFIG.COL.ID, lastRow - 1, 1).getValues().flat();
  let max = 0;
  ids.forEach(function(id) {
    const s = String(id || '').trim();
    if (s.startsWith(prefix)) {
      const n = parseInt(s.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + (max + 1);
}

function parseSheetDate(val) {
  if (!val || val === '' || val === '-') return null;
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  if (!s || s === '-') return null;
  // dd/MM hoặc dd/MM/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026';
    return y + '-' + mo + '-' + d;
  }
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function formatDateForSheet(isoDate) {
  if (!isoDate) return '';
  // Trả về dạng dd/MM/yyyy
  const parts = String(isoDate).split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
  return isoDate;
}

function invalidateCache(owner) {
  const cache = CacheService.getScriptCache();
  cache.remove('overview');
  if (owner) cache.remove('tasks_' + owner);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Đọc 1 cột từ sheet, bỏ header (row 1), trả về mảng string không rỗng.
 * colIndex: 1-indexed (A=1, B=2, F=6, I=9...)
 */
function readColumn_(sheetName, colIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, colIndex, lastRow - 1, 1)
    .getValues()
    .map(function(r) { return String(r[0] || '').trim(); })
    .filter(Boolean);
}

function jsonOk(data) {
  const payload = JSON.stringify({
    success: true,
    data: data,
    error: null,
    timestamp: new Date().toISOString(),
  });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  const payload = JSON.stringify({
    success: false,
    data: null,
    error: msg,
    timestamp: new Date().toISOString(),
  });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
