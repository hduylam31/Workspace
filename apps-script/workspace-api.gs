/**
 * AN KHANG PM WORKSPACE — Apps Script API
 *
 * Deploy: Extensions → Apps Script → Deploy → New Deployment
 *         Type: Web App · Execute as: Me · Access: Anyone
 *
 * Sheets sử dụng (cấu hình qua SHEET_NAMES bên dưới):
 *   "Dự án"          — A=ID · B=Tên dự án · C=Trạng thái · D=Loại · E=Owner · F=Thành viên khác · G=Deadline
 *   "Role to Task"   — A=ID · B=Vai trò · C=Tên Task
 *   "Role to Project"— A=ID dự án · B=Tên dự án · C=Thành viên · D=Vai trò · E=Task
 *   [Tên thành viên] — Sheet My Tasks cá nhân (Đức Anh, Khánh, Tuyền, Trình, Trang, Mai...)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CẤU HÌNH — Đổi tên sheet nếu cần
// ═══════════════════════════════════════════════════════════════════════════════

var SHEET_NAMES = {
  DU_AN:            'Dự án',
  ROLE_TO_TASK:     'Role to Task',
  ROLE_TO_PROJECT:  'Role to Project',
};

// Cột trong "Dự án": 0-based index
var DU_AN_COL = {
  ID:       0,  // A
  PROJECT:  1,  // B
  STATUS:   2,  // C
  TYPE:     3,  // D
  OWNER:    4,  // E
  MEMBERS:  5,  // F
  DEADLINE: 6,  // G
};

// Cột trong "Role to Project": 0-based index
var R2P_COL = {
  PROJECT_ID:   0,  // A
  PROJECT_NAME: 1,  // B
  MEMBER:       2,  // C
  ROLE:         3,  // D
  TASKS:        4,  // E
};

// Cột trong sheet cá nhân (My Tasks): 0-based index
var MY_TASKS_COL = {
  ID:       0,  // A
  PROJECT:  1,  // B
  STATUS:   2,  // C
  TYPE:     3,  // D
  OWNER:    4,  // E (chính là tên member)
  ROLE:     5,  // F — vai trò của member trong dự án này
  TASKS:    6,  // G — danh sách đầu việc
  DEADLINE: 7,  // H
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  var params = e.parameter || {};
  var action  = params.action || '';
  try {
    var result = handleGet(action, params);
    return ok(result);
  } catch (err) {
    return fail(err.message || String(err));
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(_) {}
  var action = body.action || '';
  try {
    var result = handlePost(action, body);
    return ok(result);
  } catch (err) {
    return fail(err.message || String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET HANDLERS — Đọc dữ liệu
// ═══════════════════════════════════════════════════════════════════════════════

function handleGet(action, params) {
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var duAnName   = params.duAnSheet          || SHEET_NAMES.DU_AN;
  var r2tName    = params.roleToTaskSheet    || SHEET_NAMES.ROLE_TO_TASK;
  var r2pName    = params.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;

  switch (action) {
    case 'ping':
      return { status: 'ok', version: '2.0' };

    // Đọc toàn bộ "Dự án" (kèm merge Role to Project)
    case 'getDuAn':
      return getDuAn(ss, duAnName, r2pName);

    // Đọc "Role to Task"
    case 'getRoleToTask':
      return getRoleToTask(ss, r2tName);

    // Đọc "Role to Project" (toàn bộ hoặc filter theo projectId)
    case 'getRoleToProject':
      return getRoleToProject(ss, r2pName, params.projectId || null);

    // My Tasks của 1 member
    case 'getMyTasks':
      if (!params.member) throw new Error('Thiếu member');
      return getMyTasks(ss, params.member);

    default:
      throw new Error('Action không hỗ trợ: ' + action);
  }
}

// ── getDuAn ──────────────────────────────────────────────────────────────────
function getDuAn(ss, duAnName, r2pName) {
  var sheet = ss.getSheetByName(duAnName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + duAnName);

  var data  = sheet.getDataRange().getValues();
  var rows  = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id  = String(row[DU_AN_COL.ID] || '').trim();
    if (!id) continue;
    rows.push({
      id:          id,
      project:     String(row[DU_AN_COL.PROJECT]  || '').trim(),
      status:      String(row[DU_AN_COL.STATUS]   || '').trim(),
      task:        String(row[DU_AN_COL.TYPE]     || 'Task').trim(),
      owner:       String(row[DU_AN_COL.OWNER]    || '').trim(),
      members:     String(row[DU_AN_COL.MEMBERS]  || '').trim(),
      deadline:    formatDate(row[DU_AN_COL.DEADLINE]),
      sourceRow:   i + 1,
    });
  }

  // Merge với Role to Project để lấy assignments (picked status)
  var assignments = getRoleToProject(ss, r2pName, null);
  var byProject   = {};
  assignments.forEach(function(a) {
    if (!byProject[a.projectId]) byProject[a.projectId] = [];
    byProject[a.projectId].push(a);
  });

  rows.forEach(function(row) {
    var list = byProject[row.id] || [];
    row.itTaskId = list.length > 0 ? 'PICKED' : null;
    row.assignments = list;
  });

  return rows;
}

// ── getRoleToTask ─────────────────────────────────────────────────────────────
function getRoleToTask(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var data   = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var taskName = String(row[2] || '').trim();
    if (!taskName) continue;
    result.push({
      id:       String(row[0] || '').trim(),
      role:     String(row[1] || '').trim(),
      taskName: taskName,
      stt:      i,
    });
  }
  return result;
}

// ── getRoleToProject ──────────────────────────────────────────────────────────
function getRoleToProject(ss, sheetName, filterProjectId) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data   = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row       = data[i];
    var projectId = String(row[R2P_COL.PROJECT_ID] || '').trim();
    if (!projectId) continue;
    if (filterProjectId && projectId !== filterProjectId) continue;

    var tasksRaw = String(row[R2P_COL.TASKS] || '').trim();
    var tasks    = tasksRaw
      ? tasksRaw.split(/[\n,;]+/).map(function(t){ return t.trim(); }).filter(Boolean)
      : [];

    result.push({
      projectId:   projectId,
      projectName: String(row[R2P_COL.PROJECT_NAME] || '').trim(),
      member:      String(row[R2P_COL.MEMBER]       || '').trim(),
      role:        String(row[R2P_COL.ROLE]         || '').trim(),
      tasks:       tasks,
      sourceRow:   i + 2,
    });
  }
  return result;
}

// ── getMyTasks ────────────────────────────────────────────────────────────────
function getMyTasks(ss, memberName) {
  var sheet = ss.getSheetByName(memberName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data   = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id  = String(row[MY_TASKS_COL.ID] || '').trim();
    if (!id) continue;
    result.push({
      id:        id,
      project:   String(row[MY_TASKS_COL.PROJECT]  || '').trim(),
      status:    String(row[MY_TASKS_COL.STATUS]   || '').trim(),
      task:      String(row[MY_TASKS_COL.TYPE]     || '').trim(),
      owner:     String(row[MY_TASKS_COL.OWNER]    || '').trim(),
      role:      String(row[MY_TASKS_COL.ROLE]     || '').trim(),
      tasks:     String(row[MY_TASKS_COL.TASKS]    || '').trim(),
      deadline:  formatDate(row[MY_TASKS_COL.DEADLINE]),
      sourceRow: i + 2,
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLERS — Ghi dữ liệu
// ═══════════════════════════════════════════════════════════════════════════════

function handlePost(action, body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  switch (action) {

    // ── pickProject ───────────────────────────────────────────────────────────
    // Ghi assignments vào "Role to Project" + ghi vào My Tasks từng thành viên
    // body: { roleToProjectSheet, assignments: [{ projectId, projectName, member, role, tasks[] }] }
    case 'pickProject':
      return pickProject(ss, body);

    // ── appendDuAn ────────────────────────────────────────────────────────────
    // Thêm dự án mới vào "Dự án"
    // body: { duAnSheet, row: [id, name, status, type, owner, members, deadline] }
    case 'appendDuAn':
      return appendDuAn(ss, body);

    // ── updateDuAn ────────────────────────────────────────────────────────────
    // Cập nhật 1 dòng trong "Dự án"
    // body: { duAnSheet, rowIndex, values: [...] }
    case 'updateDuAn':
      return updateDuAn(ss, body);

    // ── deleteRoleToProject ───────────────────────────────────────────────────
    // Xóa tất cả assignments của 1 dự án khỏi "Role to Project"
    // body: { roleToProjectSheet, projectId }
    case 'deleteRoleToProject':
      return deleteRoleToProject(ss, body);

    default:
      throw new Error('Action không hỗ trợ: ' + action);
  }
}

// ── pickProject ───────────────────────────────────────────────────────────────
function pickProject(ss, body) {
  var r2pName     = body.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;
  var assignments = body.assignments || [];
  if (!assignments.length) throw new Error('Không có assignments');

  var r2pSheet = ss.getSheetByName(r2pName);
  if (!r2pSheet) throw new Error('Không tìm thấy sheet: ' + r2pName);

  // Ghi vào "Role to Project"
  var r2pRows = assignments.map(function(a) {
    return [
      a.projectId   || '',
      a.projectName || '',
      a.member      || '',
      a.role        || '',
      Array.isArray(a.tasks) ? a.tasks.join('\n') : (a.tasks || ''),
    ];
  });

  if (r2pRows.length > 0) {
    r2pSheet.getRange(r2pSheet.getLastRow() + 1, 1, r2pRows.length, 5)
            .setValues(r2pRows);
  }

  // Ghi vào My Tasks của từng thành viên
  var writtenMembers = [];
  assignments.forEach(function(a) {
    if (!a.member) return;
    var memberSheet = ss.getSheetByName(a.member);
    if (!memberSheet) return; // bỏ qua nếu sheet chưa tồn tại

    var myTaskRow = [
      a.projectId   || '',
      a.projectName || '',
      'In Progress',          // Status mặc định khi mới pick
      'Task',
      a.member,
      a.role        || '',
      Array.isArray(a.tasks) ? a.tasks.join('\n') : (a.tasks || ''),
      a.deadline    || '',
    ];
    memberSheet.getRange(memberSheet.getLastRow() + 1, 1, 1, myTaskRow.length)
               .setValues([myTaskRow]);
    writtenMembers.push(a.member);
  });

  return {
    written:        r2pRows.length,
    writtenMembers: writtenMembers,
  };
}

// ── appendDuAn ────────────────────────────────────────────────────────────────
function appendDuAn(ss, body) {
  var sheetName = body.duAnSheet || SHEET_NAMES.DU_AN;
  var row       = body.row;
  if (!row || !row.length) throw new Error('Thiếu row data');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  // Auto-generate ID nếu trống
  if (!row[0]) {
    var lastRow = sheet.getLastRow();
    row[0] = 'DA' + String(lastRow).padStart(3, '0');
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return { id: row[0], added: true };
}

// ── updateDuAn ────────────────────────────────────────────────────────────────
function updateDuAn(ss, body) {
  var sheetName = body.duAnSheet || SHEET_NAMES.DU_AN;
  var rowIndex  = Number(body.rowIndex);
  var values    = body.values;
  if (!rowIndex || !values || !values.length) throw new Error('Thiếu rowIndex hoặc values');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  return { updated: true };
}

// ── deleteRoleToProject ───────────────────────────────────────────────────────
function deleteRoleToProject(ss, body) {
  var sheetName = body.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;
  var projectId = body.projectId;
  if (!projectId) throw new Error('Thiếu projectId');

  var sheet   = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: 0 };

  var data    = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deleted = 0;

  // Xóa từ dưới lên để index không bị lệch
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0] || '').trim() === projectId) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return { deleted: deleted };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var d = val;
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = d.getFullYear();
    return yy + '-' + mm + '-' + dd;
  }
  var s = String(val).trim();
  if (!s || s === '-') return null;
  // dd/mm hoặc dd/mm/yyyy
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    var year = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026';
    return year + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return s;
}

function ok(data) {
  var payload = JSON.stringify({ success: true, data: data, error: null, timestamp: new Date().toISOString() });
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}

function fail(msg) {
  var payload = JSON.stringify({ success: false, data: null, error: msg, timestamp: new Date().toISOString() });
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}
