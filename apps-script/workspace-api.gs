/**
 * AN KHANG PM WORKSPACE — Master Script
 *
 * Gồm 2 phần:
 *   PHẦN 1: Dashboard sync (onEdit, runAllTransfers, processTransfer...)  ← giữ nguyên của bạn
 *   PHẦN 2: Web App API (doGet, doPost, CRUD task / báo cáo / pool task)  ← mới / mở rộng
 *
 * Deploy → New Deployment → Web App · Execute as: Me · Who has access: Anyone
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PHẦN 1 — DASHBOARD SYNC (giữ nguyên)
// ═══════════════════════════════════════════════════════════════════════════════

function onEdit(e) {
  try {
    const sheetName = e.source.getActiveSheet().getName();
    const watch = ['Đức Anh', 'Khánh', 'Trình', 'Tuyền', 'Trang'];
    if (watch.includes(sheetName)) {
      SpreadsheetApp.flush();
      Utilities.sleep(500);
      runAllTransfers();
    }
  } catch (err) { Logger.log('onEdit error: ' + err); }
}

function runAllTransfers() {
  processTransfer('Trang đệm', 'Tiến độ Team An Khang', true);
  processTransfer('Trang đệm Stakeholder', 'Trang đệm Stakeholder', false);
}

function processTransfer(sourceName, destName, shouldFormat) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(sourceName);
  const dest = ss.getSheetByName(destName);
  if (!src || !dest) return;

  let sourceValues = [];
  let attempt = 0;
  while (attempt < 6) {
    sourceValues = src.getDataRange().getValues();
    if (sourceValues.length > 0 && sourceValues[0][0] !== '') break;
    Utilities.sleep(500);
    attempt++;
  }

  clearDestSheet(dest);
  if (!sourceValues || sourceValues.length === 0 || sourceValues[0][0] === '') return;

  dest.getRange(2, 1, sourceValues.length, sourceValues[0].length).setValues(sourceValues);

  if (shouldFormat) {
    const lastRow = dest.getLastRow();
    if (lastRow >= 2) {
      dest.getRange(2, 1, lastRow - 1, dest.getLastColumn()).sort([
        { column: 1, ascending: true },
        { column: 10, ascending: false },
      ]);
      applyFormatting(dest);
      SpreadsheetApp.flush();
      mergeColumn(dest, 3); // C
      mergeColumn(dest, 4); // D
    }
  }
}

function clearDestSheet(dest) {
  const lastRow = dest.getLastRow();
  const lastCol = dest.getLastColumn() || 1;
  if (lastRow >= 2) {
    const range = dest.getRange(2, 1, lastRow, lastCol);
    try {
      range.breakApart();
      range.clearContent();
      range.clearFormat();
    } catch (e) {}
  }
}

function applyFormatting(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  sheet.getRange('C2:D' + lastRow)
       .setFontFamily('Inter').setFontSize(11).setFontWeight('bold')
       .setWrap(true).setVerticalAlignment('top');
  sheet.getRange('C2:C' + lastRow).setBackground('#f7fff7');

  sheet.getRange('E2:K' + lastRow)
       .setFontFamily('Inter').setFontSize(11).setFontWeight('normal')
       .setWrap(true).setVerticalAlignment('top');

  sheet.getRange('I2:J' + lastRow).setNumberFormat('dd/mm');

  const linkRange = sheet.getRange(2, 7, lastRow - 1, 1);
  const richTextValues = linkRange.getValues().map(function(row) {
    var b = SpreadsheetApp.newRichTextValue();
    var v = row[0];
    if (typeof v === 'string' && v.toLowerCase().startsWith('http')) {
      b.setText('Link').setLinkUrl(v);
    } else {
      b.setText(v ? String(v) : '');
    }
    return [b.build()];
  });
  linkRange.setRichTextValues(richTextValues);
}

function mergeColumn(sheet, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, colIndex, lastRow - 1).getValues().flat();

  let start = 0;
  while (start < values.length) {
    let end = start + 1;
    if (!values[start] || values[start] === '') { start++; continue; }
    while (end < values.length && values[end] === values[start]) end++;
    if (end - start > 1) {
      try { sheet.getRange(start + 2, colIndex, end - start, 1).mergeVertically(); } catch (e) {}
    }
    start = end;
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tiến độ')
    .addItem('Cập nhật Tiến độ', 'runAllTransfers')
    .addToUi();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHẦN 2 — WEB APP API
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

var API_CONFIG = {
  MEMBER_SHEETS: ['Đức Anh', 'Khánh', 'Tuyền', 'Trang', 'Trình', 'Mai'],
  MEMBER_PREFIX: {
    'Đức Anh': 'DA',
    'Khánh':   'KH',
    'Tuyền':   'TY',
    'Trang':   'TR',
    'Trình':   'TI',
    'Mai':     'MA',
  },
  // Cột sheet task cá nhân — A:J (1-indexed)
  // A=ID(formula) B=Dự án C=Task D=Owner(formula) E=Vai trò F=Chi tiết G=Link H=Status I=Bắt đầu J=Kết thúc
  // QUAN TRỌNG: Cột A (ID) và D (Owner) được sinh bằng ARRAYFORMULA — KHÔNG ghi đè
  COL: {
    ID:         1,  // A — ARRAYFORMULA tự sinh
    PROJECT:    2,  // B
    TASK:       3,  // C
    OWNER:      4,  // D — ARRAYFORMULA tự sinh (fallback: ghi trực tiếp)
    ROLE:       5,  // E — Vai trò (multi-select, vd: "PO, DA")
    DETAIL:     6,  // F — Chi tiết
    LINK:       7,  // G — Link
    STATUS:     8,  // H
    START_DATE: 9,  // I — Bắt đầu
    END_DATE:   10, // J — Kết thúc
  },
  // Cột sheet Pool Task — CẤU TRÚC KHÁC sheet cá nhân (không có cột Status)
  // A=ID  B=Tên dự án  C=Task  D=Owner  E=Vai trò  F=Chi tiết  G=Link  H=Bắt đầu  I=Kết thúc
  POOL_COL: {
    ID:         1,  // A
    PROJECT:    2,  // B
    TASK:       3,  // C
    OWNER:      4,  // D — cột người pick
    ROLE:       5,  // E
    DETAIL:     6,  // F
    LINK:       7,  // G
    START_DATE: 8,  // H — Bắt đầu (không có Status)
    END_DATE:   9,  // I — Kết thúc
  },
  // Cột sheet Báo cáo — A:L
  // A=ID · B=Thành viên · C=Vai trò · D=Kỳ BC · E=Ngày
  // F=Dự án · G=Trạng thái · H=% Hoàn thành · I=Đã làm · J=Sẽ làm · K=Blockers · L=SubmittedAt
  REPORT_COL: {
    ID:           1,  // A
    MEMBER:       2,  // B
    ROLE:         3,  // C — Vai trò (multi: "PO, DA")
    PERIOD:       4,  // D — 'day'|'week'|'month'
    DATE:         5,  // E — yyyy-MM-dd
    PROJECT:      6,  // F
    STATUS:       7,  // G — 'on-track'|'delayed'|'need-support'
    PROGRESS:     8,  // H — 0–100
    TODAY_WORK:   9,  // I
    TOMORROW_PLAN:10, // J
    BLOCKERS:    11,  // K
    SUBMITTED_AT:12,  // L
  },
  CACHE_TTL: 300, // giây
};

// ─── HTTP HANDLERS ────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || '';
    var p = e.parameter || {};
    switch (action) {
      case 'getOverview':  return jsonOk(apiGetOverview());
      case 'getMyTasks':   return jsonOk(apiGetMyTasks(p.member));
      case 'getProjects':  return jsonOk(apiGetProjects(p.masterDataSheet));
      case 'getStatuses':  return jsonOk(apiGetStatuses(p.masterDataSheet));
      case 'getRoles':     return jsonOk(apiGetRoles(p.masterDataSheet));
      case 'getMembers':   return jsonOk(apiGetMembers());
      case 'getDashboard': return jsonOk(apiGetDashboard());
      case 'getReports':   return jsonOk(apiGetReports(p.reportSheet, p.member, p.date));
      case 'getPoolTasks': return jsonOk(apiGetPoolTasks(p.poolSheet));
      case 'ping':         return jsonOk({ status: 'ok', time: new Date().toISOString() });
      default:             return jsonError('Unknown action: ' + action);
    }
  } catch (err) { return jsonError(err.toString()); }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    switch (action) {
      // Task
      case 'addTask':          return jsonOk(apiAddTask(body));
      case 'updateTask':       return jsonOk(apiUpdateTask(body));
      case 'updateTaskStatus': return jsonOk(apiUpdateTaskStatus(body));
      case 'deleteTask':       return jsonOk(apiDeleteTask(body));
      // Báo cáo
      case 'saveReport':       return jsonOk(apiSaveReport(body));
      case 'updateReport':     return jsonOk(apiUpdateReport(body));
      case 'deleteReport':     return jsonOk(apiDeleteReport(body));
      // Pool Task
      case 'addPoolTask':      return jsonOk(apiAddPoolTask(body));
      case 'updatePoolTask':   return jsonOk(apiUpdatePoolTask(body));
      case 'deletePoolTask':   return jsonOk(apiDeletePoolTask(body));
      case 'pickPoolTask':     return jsonOk(apiPickPoolTask(body));
      default: return jsonError('Unknown action: ' + action);
    }
  } catch (err) { return jsonError(err.toString()); }
}

// ─── READ — TASK ──────────────────────────────────────────────────────────────

function apiGetOverview() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('overview');
  if (cached) return JSON.parse(cached);

  var all = [];
  API_CONFIG.MEMBER_SHEETS.forEach(function(sheetName) {
    readSheetTasks(sheetName).forEach(function(r) { all.push(r); });
  });
  cache.put('overview', JSON.stringify(all), API_CONFIG.CACHE_TTL);
  return all;
}

function apiGetMyTasks(member) {
  if (!member) return [];
  var cache = CacheService.getScriptCache();
  var key = 'tasks_' + member;
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  var rows = readSheetTasks(member);
  cache.put(key, JSON.stringify(rows), API_CONFIG.CACHE_TTL);
  return rows;
}

function apiGetProjects(masterDataSheet) {
  var names = readColumn_(masterDataSheet || 'Data System', 1); // cột A
  if (!names.length) {
    // Fallback: lấy unique từ tất cả task
    var tasks = apiGetOverview();
    var seen = {}, unique = [];
    tasks.forEach(function(t) {
      if (t.project && !seen[t.project]) { seen[t.project] = true; unique.push(t.project); }
    });
    return unique.map(function(p, i) { return { id: String(i), name: p }; });
  }
  return names.map(function(name, i) { return { id: String(i), name: name }; });
}

function apiGetStatuses(masterDataSheet) {
  return readColumn_(masterDataSheet || 'Data System', 9); // cột I
}

function apiGetRoles(masterDataSheet) {
  var all = readColumn_(masterDataSheet || 'Data System', 6); // cột F
  var seen = {};
  return all.filter(function(v) {
    if (seen[v]) return false;
    seen[v] = true; return true;
  });
}

function apiGetMembers(masterDataSheet) {
  // Đọc cột "Thành viên" từ Data System (auto-detect header)
  var sheetName = masterDataSheet || 'Data System';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName(sheetName);
  if (ds) {
    var headers = ds.getRange(1, 1, 1, ds.getLastColumn()).getValues()[0];
    var colIdx  = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i] || '').trim().toLowerCase();
      if (h === 'thành viên' || h === 'thanh vien' || h === 'members') { colIdx = i + 1; break; }
    }
    if (colIdx > 0) {
      var names = readColumn_(sheetName, colIdx);
      if (names.length) return names.map(function(name, idx) { return { id: String(idx), name: name }; });
    }
  }
  // Fallback: dùng MEMBER_SHEETS config
  return API_CONFIG.MEMBER_SHEETS.map(function(name, i) { return { id: String(i), name: name }; });
}

function apiGetDashboard() {
  var tasks = apiGetOverview();
  var now = new Date();
  var thisMonth = now.getMonth(), thisYear = now.getFullYear();

  var activeSt = ['Add Sprint','Add Xtask','In progress','Đang dev','Nghiệm thu','Chuẩn bị làm','Định kỳ'];
  var doneSt   = ['Done','Golive','Go live','Xong mô tả'];

  var byMember = API_CONFIG.MEMBER_SHEETS.map(function(member) {
    var mt = tasks.filter(function(t) { return t.owner === member; });
    var counts = {};
    mt.forEach(function(t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    return { member: member, counts: counts };
  });

  var projectMap = {};
  tasks.forEach(function(t) { if (t.project) projectMap[t.project] = (projectMap[t.project] || 0) + 1; });
  var byProject = Object.keys(projectMap)
    .sort(function(a, b) { return projectMap[b] - projectMap[a]; })
    .slice(0, 7)
    .map(function(p) { return { project: p, count: projectMap[p] }; });

  return {
    totalActive:     tasks.filter(function(t) { return activeSt.includes(t.status); }).length,
    goLiveThisMonth: tasks.filter(function(t) {
      if (!doneSt.includes(t.status) || !t.endDate) return false;
      var d = new Date(t.endDate);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length,
    inProgress: tasks.filter(function(t) {
      return ['In progress','Đang dev','Add Sprint','Add Xtask'].includes(t.status);
    }).length,
    overdue: tasks.filter(function(t) {
      if (doneSt.includes(t.status) || !t.endDate) return false;
      return new Date(t.endDate) < now;
    }).length,
    byMember: byMember,
    byProject: byProject,
    byMonth: [],
    roadmap: [],
  };
}

// ─── READ — BÁO CÁO ──────────────────────────────────────────────────────────

/** Map kỳ báo cáo tiếng Việt → enum */
function normalizePeriod_(v) {
  if (!v) return 'day';
  var s = String(v).toLowerCase().trim();
  if (s === 'tuần' || s === 'tuan' || s === 'week') return 'week';
  if (s === 'tháng' || s === 'thang' || s === 'month') return 'month';
  return 'day';
}

/** Map trạng thái tiếng Việt → enum */
function normalizeReportStatus_(v) {
  if (!v) return 'on-track';
  var s = String(v).toLowerCase().trim();
  if (s.indexOf('chậm') >= 0 || s === 'delayed') return 'delayed';
  if (s.indexOf('hỗ trợ') >= 0 || s === 'need-support') return 'need-support';
  return 'on-track';
}

/** Parse ngày từ sheet (serial / dd/MM/yyyy / dd/MM / ISO) → "yyyy-MM-dd" */
function parseReportDate_(val) {
  if (!val) return '';
  var num = Number(val);
  // Google Sheets serial number
  if (!isNaN(num) && num > 1000) {
    var d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  // dd/MM/yyyy hoặc dd/MM
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    var day = m[1].length === 1 ? '0' + m[1] : m[1];
    var mon = m[2].length === 1 ? '0' + m[2] : m[2];
    var yr  = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : new Date().getFullYear().toString();
    return yr + '-' + mon + '-' + day;
  }
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function apiGetReports(reportSheet, member, date) {
  var sheetName = reportSheet || 'Báo cáo';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var C = API_CONFIG.REPORT_COL;
  var data = sheet.getRange(2, 1, lastRow - 1, 12).getValues(); // A:L (12 cột)
  return data
    .filter(function(row) {
      var id = String(row[C.ID - 1] || '').trim();
      if (!id || id === 'ID') return false;
      if (member && String(row[C.MEMBER - 1] || '').trim() !== member) return false;
      if (date) {
        var rowDate = parseReportDate_(row[C.DATE - 1]);
        if (rowDate !== date) return false;
      }
      return true;
    })
    .map(function(row) {
      var blockers = String(row[C.BLOCKERS - 1] || '').trim();
      var bLow = blockers.toLowerCase();
      return {
        id:           String(row[C.ID - 1]    || '').trim(),
        member:       String(row[C.MEMBER - 1] || '').trim(),
        role:         String(row[C.ROLE - 1]   || '').trim() || null,
        reportPeriod: normalizePeriod_(row[C.PERIOD - 1]),
        date:         parseReportDate_(row[C.DATE - 1]),
        project:      String(row[C.PROJECT - 1]       || '').trim(),
        reportStatus: normalizeReportStatus_(row[C.STATUS - 1]),
        progress:     Number(row[C.PROGRESS - 1])     || 0,
        todayWork:    String(row[C.TODAY_WORK - 1]    || '').trim(),
        tomorrowPlan: String(row[C.TOMORROW_PLAN - 1] || '').trim(),
        blockers:     (bLow === 'không có' || bLow === 'khong co' || bLow === '-') ? null : (blockers || null),
        submittedAt:  String(row[C.SUBMITTED_AT - 1]  || '').trim(),
      };
    });
}

// ─── READ — POOL TASK ─────────────────────────────────────────────────────────

/**
 * Đọc Pool sheet với cấu trúc riêng (A:I, không có cột Status):
 * A=ID  B=Project  C=Task  D=Owner  E=Role  F=Detail  G=Link  H=Start  I=End
 */
function readPoolSheetTasks_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var PC = API_CONFIG.POOL_COL;
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); // A:I (9 cột)
  return data
    .filter(function(row) {
      var id = String(row[PC.ID - 1] || '').trim();
      return id !== '' && id !== 'ID';
    })
    .map(function(row, idx) {
      return {
        id:          String(row[PC.ID - 1]         || '').trim(),
        project:     String(row[PC.PROJECT - 1]    || '').trim(),
        task:        String(row[PC.TASK - 1]        || '').trim(),
        owner:       String(row[PC.OWNER - 1]       || '').trim(),  // giữ nguyên owner
        role:        String(row[PC.ROLE - 1]        || '').trim() || null,
        detail:      String(row[PC.DETAIL - 1]      || '').trim() || null,
        link:        String(row[PC.LINK - 1]        || '').trim() || null,
        status:      'Chuẩn bị làm',  // Pool không có cột Status
        startDate:   parseSheetDate(row[PC.START_DATE - 1]),  // H
        endDate:     parseSheetDate(row[PC.END_DATE - 1]),    // I
        note:        null,
        sourceSheet: sheetName,
        sourceRow:   idx + 2,
        itTaskId:    null,
        lastModified: new Date().toISOString(),
      };
    });
}

function apiGetPoolTasks(poolSheet) {
  return readPoolSheetTasks_(poolSheet || 'Pick Task');
}

// ─── WRITE — TASK ─────────────────────────────────────────────────────────────

function apiAddTask(body) {
  var owner = body.owner || '', project = body.project || '', task = body.task || '';
  var status = body.status || 'Chuẩn bị làm';
  if (!owner || !project || !task) throw new Error('owner, project, task là bắt buộc');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(owner);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + owner);

  // Cột A (ID) và D (Owner) sinh bằng ARRAYFORMULA → để trống, công thức tự điền
  // Thứ tự: A(trống) · B=project · C=task · D(trống) · E=role · F=detail · G=link · H=status · I=startDate · J=endDate
  var C = API_CONFIG.COL;

  // Tim dong tiep theo dua vao cot B (Du an) — tranh ARRAYFORMULA o cot A lam sai lastRow
  var nextRow = firstEmptyRowInSheet_(sheet, C.PROJECT);

  // Ghi tung cot rieng — KHONG ghi A (ID formula) va D (Owner formula)
  sheet.getRange(nextRow, C.PROJECT).setValue(project);   // B
  sheet.getRange(nextRow, C.TASK).setValue(task);          // C
  sheet.getRange(nextRow, C.ROLE).setValue(body.role || '');    // E
  sheet.getRange(nextRow, C.DETAIL).setValue(body.detail || ''); // F
  sheet.getRange(nextRow, C.LINK).setValue(body.link || '');     // G
  sheet.getRange(nextRow, C.STATUS).setValue(status);            // H
  if (body.startDate) sheet.getRange(nextRow, C.START_DATE).setValue(formatDateForSheet(body.startDate)); // I
  if (body.endDate)   sheet.getRange(nextRow, C.END_DATE).setValue(formatDateForSheet(body.endDate));     // J

  SpreadsheetApp.flush(); // De ARRAYFORMULA tinh ID (cot A) va Owner (cot D)

  // Doc ID tu cot A sau khi ARRAYFORMULA chay xong
  var newId = String(sheet.getRange(nextRow, C.ID).getValue()).trim();

  // Fallback: neu sheet KHONG co ARRAYFORMULA, tu sinh ID va ghi Owner
  if (!newId) {
    newId = generateNextId(sheet, owner);
    sheet.getRange(nextRow, C.ID).setValue(newId);
    sheet.getRange(nextRow, C.OWNER).setValue(owner);
    SpreadsheetApp.flush();
  }
  var newRow = nextRow;

  invalidateCache(owner);
  try { runAllTransfers(); } catch(e) {}

  return {
    id: newId, owner: owner, project: project, task: task, status: status,
    startDate: body.startDate || null, endDate: body.endDate || null,
    detail: body.detail || null, link: body.link || null, note: null,
    role: body.role || null, sourceSheet: owner, sourceRow: newRow,
    itTaskId: null, lastModified: new Date().toISOString(),
  };
}

function apiUpdateTask(body) {
  var id = body.id || '';
  if (!id) throw new Error('id là bắt buộc');
  var result = findTaskById(id);
  if (!result) throw new Error('Không tìm thấy task ID: ' + id);

  var C = API_CONFIG.COL, s = result.sheet, r = result.rowIndex;
  // Không update A (ID) và D (Owner) — do formula quản lý
  if (body.project   !== undefined) s.getRange(r, C.PROJECT).setValue(body.project);
  if (body.task      !== undefined) s.getRange(r, C.TASK).setValue(body.task);
  if (body.role      !== undefined) s.getRange(r, C.ROLE).setValue(body.role || '');    // E
  if (body.detail    !== undefined) s.getRange(r, C.DETAIL).setValue(body.detail || ''); // F
  if (body.link      !== undefined) s.getRange(r, C.LINK).setValue(body.link || '');     // G
  if (body.status    !== undefined) s.getRange(r, C.STATUS).setValue(body.status);        // H
  if (body.startDate !== undefined) s.getRange(r, C.START_DATE).setValue(body.startDate ? formatDateForSheet(body.startDate) : ''); // I
  if (body.endDate   !== undefined) s.getRange(r, C.END_DATE).setValue(body.endDate   ? formatDateForSheet(body.endDate)   : ''); // J

  SpreadsheetApp.flush();
  invalidateCache(result.owner);
  try { runAllTransfers(); } catch(e) {}
  return { id: id, updated: true };
}

function apiUpdateTaskStatus(body) {
  var id = body.id || '', status = body.status || '';
  if (!id || !status) throw new Error('id và status là bắt buộc');
  var result = findTaskById(id);
  if (!result) throw new Error('Không tìm thấy task ID: ' + id);

  result.sheet.getRange(result.rowIndex, API_CONFIG.COL.STATUS).setValue(status);
  // NOTE column không còn trong sheet — bỏ qua
  SpreadsheetApp.flush();
  invalidateCache(result.owner);
  try { runAllTransfers(); } catch(e) {}
  return { id: id, status: status, updated: true };
}

function apiDeleteTask(body) {
  var id = body.id || '';
  if (!id) throw new Error('id là bắt buộc');
  var result = findTaskById(id);
  if (!result) throw new Error('Không tìm thấy task ID: ' + id);

  result.sheet.deleteRow(result.rowIndex);
  SpreadsheetApp.flush();
  invalidateCache(result.owner);
  try { runAllTransfers(); } catch(e) {}
  return { id: id, deleted: true };
}

// ─── WRITE — BÁO CÁO ─────────────────────────────────────────────────────────

/**
 * Upsert báo cáo:
 *   - Có id + tồn tại trong sheet → update dòng đó
 *   - Không có id / chưa tồn tại  → append dòng mới (tự sinh ID)
 */
function apiSaveReport(body) {
  var sheetName = body.reportSheet || 'Báo cáo';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var now = new Date();
  var id = body.id ? String(body.id).trim() : generateReportId(sheet, now);
  var C = API_CONFIG.REPORT_COL;
  // Thứ tự cột: A=ID · B=Member · C=Role · D=Period · E=Date
  //             F=Project · G=Status · H=Progress · I=TodayWork · J=TomorrowPlan · K=Blockers · L=SubmittedAt
  // Map enum → tên tiếng Việt để nhất quán với sheet hiện tại
  var periodVN = body.reportPeriod === 'week' ? 'Tuần' : body.reportPeriod === 'month' ? 'Tháng' : 'Ngày';
  var row = [
    id,                                                                                   // A
    body.member       || '',                                                               // B
    body.role         || '',                                                               // C
    periodVN,                                                                             // D — "Ngày"/"Tuần"/"Tháng"
    body.date         || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy'), // E
    body.project      || '',                                                               // F
    body.reportStatus || 'on-track',                                                      // G
    body.progress !== undefined ? Number(body.progress) : 0,                             // H
    body.todayWork    || '',                                                               // I
    body.tomorrowPlan || '',                                                               // J
    body.blockers     || '',                                                               // K
    now.toISOString(),                                                                     // L
  ];

  var existingRow = findRowByIdInSheet(sheet, C.ID, id);
  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('reports_' + sheetName);
  return { id: id, saved: true, action: existingRow ? 'updated' : 'created', submittedAt: now.toISOString() };
}

/** Partial update báo cáo theo ID */
function apiUpdateReport(body) {
  var id = body.id ? String(body.id).trim() : '';
  if (!id) throw new Error('id là bắt buộc');
  var sheetName = body.reportSheet || 'Báo cáo';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var C = API_CONFIG.REPORT_COL;
  var rowIndex = findRowByIdInSheet(sheet, C.ID, id);
  if (!rowIndex) throw new Error('Không tìm thấy báo cáo ID: ' + id);

  if (body.member       !== undefined) sheet.getRange(rowIndex, C.MEMBER).setValue(body.member || '');
  if (body.role         !== undefined) sheet.getRange(rowIndex, C.ROLE).setValue(body.role || '');
  if (body.reportPeriod !== undefined) sheet.getRange(rowIndex, C.PERIOD).setValue(body.reportPeriod);
  if (body.date         !== undefined) sheet.getRange(rowIndex, C.DATE).setValue(body.date);
  if (body.project      !== undefined) sheet.getRange(rowIndex, C.PROJECT).setValue(body.project || '');
  if (body.reportStatus !== undefined) sheet.getRange(rowIndex, C.STATUS).setValue(body.reportStatus);
  if (body.progress     !== undefined) sheet.getRange(rowIndex, C.PROGRESS).setValue(Number(body.progress));
  if (body.todayWork    !== undefined) sheet.getRange(rowIndex, C.TODAY_WORK).setValue(body.todayWork || '');
  if (body.tomorrowPlan !== undefined) sheet.getRange(rowIndex, C.TOMORROW_PLAN).setValue(body.tomorrowPlan || '');
  if (body.blockers     !== undefined) sheet.getRange(rowIndex, C.BLOCKERS).setValue(body.blockers || '');
  sheet.getRange(rowIndex, C.SUBMITTED_AT).setValue(new Date().toISOString());

  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('reports_' + sheetName);
  return { id: id, updated: true };
}

/** Xóa dòng báo cáo theo ID */
function apiDeleteReport(body) {
  var id = body.id ? String(body.id).trim() : '';
  if (!id) throw new Error('id là bắt buộc');
  var sheetName = body.reportSheet || 'Báo cáo';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var rowIndex = findRowByIdInSheet(sheet, API_CONFIG.REPORT_COL.ID, id);
  if (!rowIndex) throw new Error('Không tìm thấy báo cáo ID: ' + id);

  sheet.deleteRow(rowIndex);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('reports_' + sheetName);
  return { id: id, deleted: true };
}

// ─── WRITE — POOL TASK ────────────────────────────────────────────────────────

function apiAddPoolTask(body) {
  var poolSheet = body.poolSheet || 'Pick Task';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(poolSheet);
  if (!sheet) throw new Error('Không tìm thấy sheet Pool: ' + poolSheet);

  var PC = API_CONFIG.POOL_COL;
  var newId = generatePoolId(sheet);
  var nextRow = sheet.getLastRow() + 1;

  // Ghi từng cột theo đúng cấu trúc Pool (A:I, không có Status)
  sheet.getRange(nextRow, PC.ID).setValue(newId);
  sheet.getRange(nextRow, PC.PROJECT).setValue(body.project || '');
  sheet.getRange(nextRow, PC.TASK).setValue(body.task || '');
  // PC.OWNER (D) để trống — chưa có người pick
  sheet.getRange(nextRow, PC.ROLE).setValue(body.role || '');
  sheet.getRange(nextRow, PC.DETAIL).setValue(body.detail || '');
  sheet.getRange(nextRow, PC.LINK).setValue(body.link || '');
  if (body.startDate) sheet.getRange(nextRow, PC.START_DATE).setValue(formatDateForSheet(body.startDate));
  if (body.endDate)   sheet.getRange(nextRow, PC.END_DATE).setValue(formatDateForSheet(body.endDate));

  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('pool_' + poolSheet);
  return { id: newId, added: true, sourceRow: nextRow };
}

function apiUpdatePoolTask(body) {
  var id = body.id ? String(body.id).trim() : '';
  if (!id) throw new Error('id là bắt buộc');
  var poolSheet = body.poolSheet || 'Pick Task';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(poolSheet);
  if (!sheet) throw new Error('Không tìm thấy sheet Pool: ' + poolSheet);

  var PC = API_CONFIG.POOL_COL;
  var rowIndex = findRowByIdInSheet(sheet, PC.ID, id);
  if (!rowIndex) throw new Error('Không tìm thấy pool task ID: ' + id);

  // Pool không có cột Status — chỉ update các cột thực tế
  if (body.project   !== undefined) sheet.getRange(rowIndex, PC.PROJECT).setValue(body.project);
  if (body.task      !== undefined) sheet.getRange(rowIndex, PC.TASK).setValue(body.task);
  if (body.owner     !== undefined) sheet.getRange(rowIndex, PC.OWNER).setValue(body.owner || '');
  if (body.role      !== undefined) sheet.getRange(rowIndex, PC.ROLE).setValue(body.role || '');
  if (body.detail    !== undefined) sheet.getRange(rowIndex, PC.DETAIL).setValue(body.detail || '');
  if (body.link      !== undefined) sheet.getRange(rowIndex, PC.LINK).setValue(body.link || '');
  if (body.startDate !== undefined) sheet.getRange(rowIndex, PC.START_DATE).setValue(body.startDate ? formatDateForSheet(body.startDate) : '');
  if (body.endDate   !== undefined) sheet.getRange(rowIndex, PC.END_DATE).setValue(body.endDate   ? formatDateForSheet(body.endDate)   : '');

  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('pool_' + poolSheet);
  return { id: id, updated: true };
}

function apiDeletePoolTask(body) {
  var id = body.id ? String(body.id).trim() : '';
  if (!id) throw new Error('id là bắt buộc');
  var poolSheet = body.poolSheet || 'Pick Task';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(poolSheet);
  if (!sheet) throw new Error('Không tìm thấy sheet Pool: ' + poolSheet);

  var rowIndex = findRowByIdInSheet(sheet, API_CONFIG.POOL_COL.ID, id);
  if (!rowIndex) throw new Error('Không tìm thấy pool task ID: ' + id);

  sheet.deleteRow(rowIndex);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('pool_' + poolSheet);
  return { id: id, deleted: true };
}

/**
 * Member "pick" task từ Pool:
 * 1. Ghi owner + đổi status → 'Đang làm' trong Pool
 * 2. Copy dòng sang sheet cá nhân của member (sinh ID mới)
 */
function apiPickPoolTask(body) {
  var id = body.id ? String(body.id).trim() : '';
  var member = body.member ? String(body.member).trim() : '';
  if (!id || !member) throw new Error('id và member là bắt buộc');

  var poolSheet = body.poolSheet || 'Pick Task';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pool = ss.getSheetByName(poolSheet);
  if (!pool) throw new Error('Không tìm thấy sheet Pool: ' + poolSheet);

  var PC = API_CONFIG.POOL_COL;
  var rowIndex = findRowByIdInSheet(pool, PC.ID, id);
  if (!rowIndex) throw new Error('Không tìm thấy pool task ID: ' + id);

  // Pool cột (0-indexed): 0=A ID · 1=B Project · 2=C Task · 3=D Owner
  //   4=E Role · 5=F Detail · 6=G Link · 7=H Bắt đầu · 8=I Kết thúc
  var taskData = pool.getRange(rowIndex, 1, 1, 9).getValues()[0];

  // Cập nhật cột Owner (D) trong Pool
  pool.getRange(rowIndex, PC.OWNER).setValue(member);
  SpreadsheetApp.flush();

  // Copy sang sheet cá nhân — dùng setValue từng ô, không appendRow
  // (tránh xung đột với ARRAYFORMULA ở cột A và D của sheet cá nhân)
  var memberSheet = ss.getSheetByName(member);
  if (memberSheet) {
    var C = API_CONFIG.COL;
    var nextRow = firstEmptyRowInSheet_(memberSheet, C.PROJECT);
    memberSheet.getRange(nextRow, C.PROJECT).setValue(taskData[1]);                      // B — Project
    memberSheet.getRange(nextRow, C.TASK).setValue(taskData[2]);                          // C — Task
    // Bỏ qua A (ID formula) và D (Owner formula) — ARRAYFORMULA tự sinh
    memberSheet.getRange(nextRow, C.ROLE).setValue(taskData[4] || '');                   // E — Role
    memberSheet.getRange(nextRow, C.DETAIL).setValue(taskData[5] || '');                 // F — Detail
    memberSheet.getRange(nextRow, C.LINK).setValue(taskData[6] || '');                   // G — Link
    memberSheet.getRange(nextRow, C.STATUS).setValue('Backlog');                          // H — Status khi pick
    if (taskData[7]) memberSheet.getRange(nextRow, C.START_DATE).setValue(taskData[7]);  // I — Start (Pool H)
    if (taskData[8]) memberSheet.getRange(nextRow, C.END_DATE).setValue(taskData[8]);    // J — End   (Pool I)
    SpreadsheetApp.flush();
    invalidateCache(member);
  }

  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('pool_' + poolSheet);
  try { runAllTransfers(); } catch(e) {}
  return { id: id, picked: true, member: member };
}

// ─── HELPERS CHUNG ────────────────────────────────────────────────────────────

/** Đọc toàn bộ task của 1 sheet thành mảng object */
function readSheetTasks(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Đọc A:J (10 cột) — cấu trúc thực tế:
  // A=ID(formula) B=Dự án C=Task D=Owner(formula) E=Vai trò F=Chi tiết G=Link H=Status I=Bắt đầu J=Kết thúc
  var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var C = API_CONFIG.COL;
  return data
    .filter(function(row) {
      var id = String(row[C.ID - 1] || '').trim();
      return id !== '' && id !== 'ID';
    })
    .map(function(row, idx) {
      return {
        id:          String(row[C.ID - 1]         || '').trim(),
        project:     String(row[C.PROJECT - 1]    || '').trim(),
        task:        String(row[C.TASK - 1]        || '').trim(),
        owner:       String(row[C.OWNER - 1]       || sheetName).trim(),
        role:        String(row[C.ROLE - 1]        || '').trim() || null,       // E — multi-select
        detail:      String(row[C.DETAIL - 1]      || '').trim() || null,       // F
        link:        String(row[C.LINK - 1]        || '').trim() || null,       // G
        status:      String(row[C.STATUS - 1]      || 'Chuẩn bị làm').trim(),  // H
        startDate:   parseSheetDate(row[C.START_DATE - 1]),                     // I
        endDate:     parseSheetDate(row[C.END_DATE - 1]),                       // J
        note:        null,  // Không có cột Ghi chú
        sourceSheet: sheetName,
        sourceRow:   idx + 2,
        itTaskId:    null,
        lastModified: new Date().toISOString(),
      };
    });
}

/**
 * Tìm dòng theo ID trong 1 sheet cụ thể.
 * Trả về rowIndex (1-indexed) hoặc null nếu không có.
 */
function findRowByIdInSheet(sheet, colIndex, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0] || '').trim() === id) return r + 2;
  }
  return null;
}

/**
 * Tìm task theo ID trong tất cả MEMBER_SHEETS.
 * Trả về { sheet, rowIndex, owner } hoặc null.
 */
function findTaskById(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < API_CONFIG.MEMBER_SHEETS.length; i++) {
    var sheetName = API_CONFIG.MEMBER_SHEETS[i];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    var rowIndex = findRowByIdInSheet(sheet, API_CONFIG.COL.ID, id);
    if (rowIndex) return { sheet: sheet, rowIndex: rowIndex, owner: sheetName };
  }
  return null;
}

/** Sinh ID task cá nhân: PREFIX + số tăng dần (DA1, DA2...) */
function generateNextId(sheet, owner) {
  var prefix = API_CONFIG.MEMBER_PREFIX[owner] || owner.slice(0, 2).toUpperCase();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + '1';
  var ids = sheet.getRange(2, API_CONFIG.COL.ID, lastRow - 1, 1).getValues().flat();
  var max = 0;
  ids.forEach(function(id) {
    var s = String(id || '').trim();
    if (s.startsWith(prefix)) {
      var n = parseInt(s.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + (max + 1);
}

/** Sinh ID báo cáo: RPT-yyyyMMdd-HHmmss (unique theo giây) */
function generateReportId(sheet, now) {
  var base = 'RPT-'
    + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd')
    + '-'
    + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HHmmss');
  // Nếu trùng (hiếm), thêm random suffix
  return findRowByIdInSheet(sheet, API_CONFIG.REPORT_COL.ID, base)
    ? base + '-' + Math.floor(Math.random() * 1000)
    : base;
}

/** Sinh ID Pool Task: POOL-N */
function generatePoolId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'POOL-1';
  var ids = sheet.getRange(2, API_CONFIG.POOL_COL.ID, lastRow - 1, 1).getValues().flat();
  var max = 0;
  ids.forEach(function(id) {
    var s = String(id || '').trim();
    if (s.startsWith('POOL-')) {
      var n = parseInt(s.slice(5), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return 'POOL-' + (max + 1);
}

/** Parse ngày từ Google Sheets (Date object / serial / dd/mm/yyyy / ISO) → yyyy-MM-dd */
function parseSheetDate(val) {
  if (!val || val === '' || val === '-') return null;
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(val).trim();
  if (!s || s === '-') return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    var y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026';
    return y + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Format ISO date → dd/MM/yyyy cho Sheets */
function formatDateForSheet(isoDate) {
  if (!isoDate) return '';
  var parts = String(isoDate).split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : isoDate;
}

/** Đọc 1 cột từ sheet (bỏ dòng header), trả về mảng string không rỗng */
function readColumn_(sheetName, colIndex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, colIndex, lastRow - 1, 1)
    .getValues()
    .map(function(r) { return String(r[0] || '').trim(); })
    .filter(Boolean);
}

/** Xóa cache khi có thay đổi task */
function invalidateCache(owner) {
  var cache = CacheService.getScriptCache();
  cache.remove('overview');
  if (owner) cache.remove('tasks_' + owner);
}

/**
 * Tim dong trong dau tien trong mot cot (mac dinh cot B = PROJECT).
 * Dua vao cot du lieu thuc (khong phai ARRAYFORMULA) de tranh sai lastRow.
 * Tra ve so dong (1-indexed), toi thieu la 2 (bo dong header).
 */
function firstEmptyRowInSheet_(sheet, dataCol) {
  dataCol = dataCol || 2; // mac dinh cot B
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  // Doc tat ca gia tri cot dataCol tu dong 2 tro di
  var values = sheet.getRange(2, dataCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === '' || v === null || v === undefined) return i + 2;
  }
  return lastRow + 1; // Tat ca dong da co du lieu, them vao cuoi
}

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data, error: null, timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, data: null, error: msg, timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HÀM TEST — Chạy thủ công trong Editor để kiểm tra
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TEST 1: Kiểm tra script có chạy được không.
 * Chọn hàm này trong dropdown → Run → xem Execution Log.
 * Nếu thấy "✅ Script hoạt động bình thường" = script OK.
 */
function testPing() {
  Logger.log('✅ Script hoạt động bình thường');
  Logger.log('Spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log('User: ' + Session.getActiveUser().getEmail());
  Logger.log('Time: ' + new Date().toISOString());
}

/**
 * TEST 2: Kiểm tra quyền và các sheet có tồn tại không.
 * Chọn hàm này trong dropdown → Run → xem Execution Log.
 */
function testAuth() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log('✅ Có quyền đọc Spreadsheet: ' + ss.getName());
    Logger.log('Sheets có trong file:');
    ss.getSheets().forEach(function(s) {
      Logger.log('  - ' + s.getName() + ' (' + s.getLastRow() + ' dòng)');
    });
    Logger.log('MEMBER_SHEETS cần có:');
    API_CONFIG.MEMBER_SHEETS.forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      Logger.log('  ' + (sheet ? '✅' : '❌') + ' ' + name);
    });
  } catch (err) {
    Logger.log('❌ Lỗi: ' + err.toString());
  }
}

/**
 * TEST 3: Giả lập một doGet request (ping).
 * Chọn hàm này → Run → Execution Log sẽ in ra JSON response.
 * Nếu thấy {"success":true,...} = doGet hoạt động đúng.
 */
function testDoGetPing() {
  var fakeEvent = { parameter: { action: 'ping' }, postData: null };
  var result = doGet(fakeEvent);
  Logger.log('doGet ping result: ' + result.getContent());
}

/**
 * TEST 4: Giả lập doPost addTask.
 * Đổi sheetName thành tên sheet thật của bạn trước khi chạy.
 */
function testDoPostAddTask() {
  var fakeBody = {
    action: 'addTask',
    sheetName: 'Đức Anh', // ← đổi thành tên sheet thật
    project: '[TEST] Dự án demo',
    task: 'Task thử nghiệm từ script',
    status: 'Chuẩn bị làm',
    role: 'PO',
    detail: 'Chạy testDoPostAddTask lúc ' + new Date().toISOString(),
    link: '',
    startDate: '',
    endDate: '',
  };
  var fakeEvent = {
    postData: { contents: JSON.stringify(fakeBody) }
  };
  var result = doPost(fakeEvent);
  Logger.log('doPost addTask result: ' + result.getContent());
}

/**
 * TEST 5: Lấy URL deployment hiện tại (chỉ hoạt động nếu script được deploy).
 * Dùng để kiểm tra bạn đang dùng đúng URL chưa.
 */
function testGetDeploymentInfo() {
  try {
    var deployments = ScriptApp.getService().getUrl();
    Logger.log('Service URL: ' + deployments);
  } catch (err) {
    Logger.log('Không lấy được URL (cần deploy trước): ' + err.toString());
  }
  // Thông tin khác
  Logger.log('Script ID: ' + ScriptApp.getScriptId());
  Logger.log('Để lấy Web App URL: Deploy → Manage deployments → copy URL');
}
