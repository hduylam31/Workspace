/**
 * AN KHANG PM WORKSPACE — Apps Script API v3
 * Compatible: Rhino + V8 runtime
 *
 * Sheet "Dự án"         : A=ID · B=Tên dự án · C=Trạng thái · D=Loại dự án · E=Owner · F=Thành viên khác · G=Deadline
 * Sheet "Role to Project": A=ID dự án · B=Tên dự án · C=Thành viên · D=Vai trò · E=Task
 * Sheet thành viên       : A=ID · B=Tên dự án · C=Task · D=Owner · E=Vai trò · F=Chi tiết · G=Link
 *                          H=Status · I=Bắt đầu · J=Kết thúc · K=Ghi chú · L=Tuần bắt đầu · M=Tuần kết thúc · N=Ẩn
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CẤU HÌNH
// ═══════════════════════════════════════════════════════════════════════════════

var SHEET_NAMES = {
  DU_AN:           'Dự án',
  ROLE_TO_TASK:    'Role to Task',
  ROLE_TO_PROJECT: 'Role to Project',
};

var DU_AN_COL = { ID:0, PROJECT:1, STATUS:2, TYPE:3, OWNER:4, MEMBERS:5, DEADLINE:6 };
var R2P_COL   = { PROJECT_ID:0, PROJECT_NAME:1, MEMBER:2, ROLE:3, TASKS:4 };
var MT_COL    = { ID:0, PROJECT:1, TASK:2, ROLE:3, DETAIL:4, LINK:5, STATUS:6, START:7, END:8 };
var TOTAL_MT_COLS = 9;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION — Chạy hàm này 1 lần trong editor để cấp quyền
// ═══════════════════════════════════════════════════════════════════════════════

function authorize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('OK — Đã có quyền. Spreadsheet: ' + ss.getName());
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    return ok(handleGet(params.action || '', params));
  } catch (err) {
    return fail(String(err));
  }
}

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch(pe) {
      return fail('JSON parse error: ' + String(pe));
    }
    Logger.log('doPost action=' + body.action);
    var result = handlePost(body.action || '', body);
    return ok(result);
  } catch (err) {
    Logger.log('doPost ERROR: ' + String(err));
    return fail(String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function handleGet(action, params) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var duAn = params.duAnSheet          || SHEET_NAMES.DU_AN;
  var r2t  = params.roleToTaskSheet    || SHEET_NAMES.ROLE_TO_TASK;
  var r2p  = params.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;

  if (action === 'ping')             return { status: 'ok', version: '3.1' };
  if (action === 'getDuAn')          return getDuAn(ss, duAn, r2p);
  if (action === 'getRoleToTask')    return getRoleToTask(ss, r2t);
  if (action === 'getRoleToProject') return getRoleToProject(ss, r2p, params.projectId || null);
  if (action === 'getMyTasks') {
    if (!params.member) throw new Error('Thiếu member');
    return getMyTasks(ss, params.member);
  }
  throw new Error('Action không hỗ trợ: ' + action);
}

function getDuAn(ss, duAnName, r2pName) {
  var sheet = ss.getSheetByName(duAnName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + duAnName);
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id  = String(row[DU_AN_COL.ID] || '').replace(/\s/g,'');
    if (!id) continue;
    rows.push({
      id:        id,
      project:   String(row[DU_AN_COL.PROJECT]  || ''),
      status:    String(row[DU_AN_COL.STATUS]   || ''),
      task:      String(row[DU_AN_COL.TYPE]     || 'Task'),
      owner:     String(row[DU_AN_COL.OWNER]    || ''),
      members:   String(row[DU_AN_COL.MEMBERS]  || ''),
      deadline:  formatDate(row[DU_AN_COL.DEADLINE]),
      sourceRow: i + 1,
    });
  }
  var assignments = getRoleToProject(ss, r2pName, null);
  var byProject = {};
  for (var a = 0; a < assignments.length; a++) {
    var asgn = assignments[a];
    if (!byProject[asgn.projectId]) byProject[asgn.projectId] = [];
    byProject[asgn.projectId].push(asgn);
  }
  for (var r = 0; r < rows.length; r++) {
    var list = byProject[rows[r].id] || [];
    rows[r].itTaskId    = list.length > 0 ? 'PICKED' : null;
    rows[r].assignments = list;
  }
  return rows;
}

function getRoleToTask(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);
  var data   = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var taskName = String(data[i][2] || '').replace(/^\s+|\s+$/g,'');
    if (!taskName) continue;
    result.push({ id: String(data[i][0]||''), role: String(data[i][1]||''), taskName: taskName, stt: i });
  }
  return result;
}

function getRoleToProject(ss, sheetName, filterProjectId) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data   = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row       = data[i];
    var projectId = String(row[R2P_COL.PROJECT_ID] || '').replace(/^\s+|\s+$/g,'');
    if (!projectId) continue;
    if (filterProjectId && projectId !== filterProjectId) continue;
    var tasksRaw = String(row[R2P_COL.TASKS] || '').replace(/^\s+|\s+$/g,'');
    var tasks    = [];
    if (tasksRaw) {
      var parts = tasksRaw.split(',');
      for (var p = 0; p < parts.length; p++) {
        var t = parts[p].replace(/^\s+|\s+$/g,'');
        if (t) tasks.push(t);
      }
    }
    result.push({
      projectId:   projectId,
      projectName: String(row[R2P_COL.PROJECT_NAME] || ''),
      member:      String(row[R2P_COL.MEMBER]       || ''),
      role:        String(row[R2P_COL.ROLE]         || ''),
      tasks:       tasks,
      sourceRow:   i + 2,
    });
  }
  return result;
}

function getMyTasks(ss, memberName) {
  var sheet = ss.getSheetByName(memberName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data   = sheet.getRange(2, 1, lastRow - 1, TOTAL_MT_COLS).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id  = String(row[MT_COL.ID] || '').replace(/^\s+|\s+$/g,'');
    if (!id) continue;
    result.push({
      id:          id,
      project:     String(row[MT_COL.PROJECT] || ''),
      task:        String(row[MT_COL.TASK]    || ''),
      role:        String(row[MT_COL.ROLE]    || ''),
      detail:      String(row[MT_COL.DETAIL]  || '') || null,
      link:        String(row[MT_COL.LINK]    || '') || null,
      status:      String(row[MT_COL.STATUS]  || ''),
      startDate:   formatDate(row[MT_COL.START]),
      endDate:     formatDate(row[MT_COL.END]),
      sourceSheet: memberName,
      sourceRow:   i + 2,
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function handlePost(action, body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (action === 'appendDuAn')          return appendDuAn(ss, body);
  if (action === 'updateDuAn')          return updateDuAn(ss, body);
  if (action === 'updateProjectFull')   return updateProjectFull(ss, body);
  if (action === 'pickProject')         return pickProject(ss, body);
  if (action === 'deleteRoleToProject') return deleteRoleToProject(ss, body);
  if (action === 'deletePoolFull')      return deletePoolFull(ss, body);
  if (action === 'updateMyTask')        return updateMyTask(ss, body);
  if (action === 'saveReport')         return saveReport(ss, body);
  if (action === 'updateReport')       return saveReport(ss, body); // alias
  if (action === 'deleteReport')       return deleteReport(ss, body);
  if (action === 'deleteMyTask')       return deleteMyTask(ss, body);
  throw new Error('Action không hỗ trợ: ' + action);
}

// ── appendDuAn ────────────────────────────────────────────────────────────────
function appendDuAn(ss, body) {
  var sheetName = body.duAnSheet || SHEET_NAMES.DU_AN;
  var row       = body.row;
  if (!row || !row.length) throw new Error('Thiếu row data');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  if (!row[DU_AN_COL.ID]) {
    row[DU_AN_COL.ID] = 'DA' + padLeft(String(sheet.getLastRow()), 3, '0');
  }

  var targetRow = sheet.getLastRow() + 1;

  // Ghi toàn bộ row — clear validation trước để bypass "Reject input"
  // (không restore vì restore với giá trị comma-separated cũng bị reject)
  var fullRange = sheet.getRange(targetRow, 1, 1, row.length);
  fullRange.clearDataValidations();
  SpreadsheetApp.flush();
  fullRange.setValues([row]);
  SpreadsheetApp.flush();
  return { id: row[DU_AN_COL.ID], added: true, targetRow: targetRow };
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

// ── updateProjectFull ─────────────────────────────────────────────────────────
// Update Dự án sheet (tìm theo ID), xóa + ghi lại Role to Project và member sheets
function updateProjectFull(ss, body) {
  var duAnName = body.duAnSheet          || SHEET_NAMES.DU_AN;
  var r2pName  = body.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;
  var row      = body.row;          // 7-cột: [id, project, status, type, owner, members, deadline]
  var assignments = body.assignments || []; // [{projectId, projectName, member, role, tasks:[]}]

  if (!row || !row.length) throw new Error('Thiếu row data');
  var projectId = String(row[DU_AN_COL.ID] || '').replace(/\s/g,'');
  if (!projectId) throw new Error('Thiếu project ID');

  // ── 1. Tìm và update hàng trong Dự án sheet ──────────────────────────────
  var duAnSheet = ss.getSheetByName(duAnName);
  if (!duAnSheet) throw new Error('Không tìm thấy sheet: ' + duAnName);
  var duAnData = duAnSheet.getDataRange().getValues();
  var duAnRowIndex = 0;
  for (var di = 1; di < duAnData.length; di++) {
    if (String(duAnData[di][DU_AN_COL.ID] || '').replace(/\s/g,'') === projectId) {
      duAnRowIndex = di + 1; break;
    }
  }
  if (!duAnRowIndex) throw new Error('Không tìm thấy dự án ID: ' + projectId);
  var duAnRange = duAnSheet.getRange(duAnRowIndex, 1, 1, row.length);
  duAnRange.clearDataValidations();
  SpreadsheetApp.flush();
  duAnRange.setValues([row]);
  SpreadsheetApp.flush();

  // ── 2. Xóa tất cả hàng cũ trong Role to Project theo projectId ───────────
  var r2pSheet = ss.getSheetByName(r2pName);
  if (r2pSheet) {
    var r2pLast = r2pSheet.getLastRow();
    if (r2pLast >= 2) {
      var r2pData = r2pSheet.getRange(2, 1, r2pLast - 1, 1).getValues();
      for (var ri = r2pData.length - 1; ri >= 0; ri--) {
        if (String(r2pData[ri][0] || '').replace(/\s/g,'') === projectId) {
          r2pSheet.deleteRow(ri + 2);
        }
      }
    }
  }

  // ── 3. Xóa task rows cũ trong từng member sheet theo projectId ────────────
  // Tìm members bị ảnh hưởng từ assignments cũ VÀ mới
  var allMembers = [];
  for (var ai2 = 0; ai2 < assignments.length; ai2++) {
    var nm = assignments[ai2].member;
    if (nm && indexOf(allMembers, nm) === -1) allMembers.push(nm);
  }
  for (var mi = 0; mi < allMembers.length; mi++) {
    var mSheet = ss.getSheetByName(allMembers[mi]);
    if (!mSheet) continue;
    var mLast = mSheet.getLastRow();
    if (mLast < 2) continue;
    var mData = mSheet.getRange(2, 1, mLast - 1, 1).getValues();
    for (var mri = mData.length - 1; mri >= 0; mri--) {
      var rowId = String(mData[mri][0] || '').replace(/\s/g,'');
      // Xóa nếu là task cũ của project (ID bắt đầu bằng projectId hoặc bằng đúng projectId)
      if (rowId === projectId || rowId.indexOf(projectId + '_') === 0 || rowId.indexOf(projectId) === 0) {
        mSheet.deleteRow(mri + 2);
      }
    }
  }
  SpreadsheetApp.flush();

  // ── 4. Ghi mới Role to Project + member sheets (gọi lại pickProject logic) ─
  if (assignments.length > 0) {
    pickProject(ss, { roleToProjectSheet: r2pName, assignments: assignments });
  }

  return { updated: true, projectId: projectId };
}

// ── pickProject ───────────────────────────────────────────────────────────────
function pickProject(ss, body) {
  var r2pName     = body.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;
  var assignments = body.assignments || [];
  Logger.log('pickProject: r2pName=' + r2pName + ' count=' + assignments.length);

  if (!assignments.length) throw new Error('Không có assignments');

  var r2pSheet = ss.getSheetByName(r2pName);
  if (!r2pSheet) throw new Error('Không tìm thấy sheet: ' + r2pName);

  // ── 1. Ghi vào "Role to Project" ─────────────────────────────────────────
  var r2pLastRow = r2pSheet.getLastRow() + 1;
  var r2pWritten = 0;
  for (var ai = 0; ai < assignments.length; ai++) {
    var a        = assignments[ai];
    var tasks    = Array.isArray(a.tasks) ? a.tasks : [];
    var tasksStr = tasks.join(', ');
    var r2pRow   = [
      a.projectId   || '',
      a.projectName || '',
      a.member      || '',
      a.role        || '',
      tasksStr,
    ];
    Logger.log('r2p row ' + r2pLastRow + ': ' + JSON.stringify(r2pRow));
    var r2pRange = r2pSheet.getRange(r2pLastRow, 1, 1, r2pRow.length);
    r2pRange.clearDataValidations();
    SpreadsheetApp.flush();
    r2pRange.setValues([r2pRow]);
    r2pLastRow++;
    r2pWritten++;
  }
  SpreadsheetApp.flush();

  // ── 2. Ghi vào sheet từng thành viên ─────────────────────────────────────
  var writtenCount   = 0;
  var writtenMembers = [];
  var errors         = [];

  for (var bi = 0; bi < assignments.length; bi++) {
    var b = assignments[bi];
    if (!b.member) continue;

    try {
      var memberSheet = ss.getSheetByName(b.member);
      if (!memberSheet) {
        Logger.log('Sheet không tồn tại: ' + b.member);
        errors.push('Sheet "' + b.member + '" không tồn tại');
        continue;
      }

      var tasks2    = Array.isArray(b.tasks) ? b.tasks : [];
      var deadline  = b.deadline || '';
      var weekEnd   = deadline ? getWeekNumber(new Date(deadline)) : 52;
      var taskList  = tasks2.length > 0 ? tasks2 : [''];
      for (var ti = 0; ti < taskList.length; ti++) {
        var rowData = [];
        for (var ri = 0; ri < TOTAL_MT_COLS; ri++) rowData.push('');

        rowData[MT_COL.ID]      = 'TASK' + new Date().getTime() + Math.floor(Math.random() * 1000);
        rowData[MT_COL.PROJECT] = b.projectName || '';
        rowData[MT_COL.TASK]    = taskList[ti];
        rowData[MT_COL.ROLE]    = b.role || '';
        rowData[MT_COL.STATUS]  = 'Backlog';
        rowData[MT_COL.END]     = deadline;

        memberSheet.appendRow(rowData);
        writtenCount++;
      }
      SpreadsheetApp.flush();

      if (indexOf(writtenMembers, b.member) === -1) writtenMembers.push(b.member);
    } catch(memberErr) {
      Logger.log('Lỗi member ' + b.member + ': ' + String(memberErr));
      errors.push(b.member + ': ' + String(memberErr));
    }
  }

  return {
    r2pRows:        r2pWritten,
    taskRows:       writtenCount,
    writtenMembers: writtenMembers,
    errors:         errors,
  };
}

// ── deleteRoleToProject ───────────────────────────────────────────────────────
function deleteRoleToProject(ss, body) {
  var sheetName = body.roleToProjectSheet || SHEET_NAMES.ROLE_TO_PROJECT;
  var projectId = body.projectId;
  if (!projectId) throw new Error('Thiếu projectId');
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: 0 };
  var data    = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0] || '').replace(/^\s+|\s+$/g,'') === projectId) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return { deleted: deleted };
}

// ── deletePoolFull ────────────────────────────────────────────────────────────
// Xóa 1 dự án: hàng trong "Dự án" + mọi hàng R2P + task trong sheet thành viên
function deletePoolFull(ss, body) {
  var projectId = String(body.id || '').replace(/\s/g, '');
  if (!projectId) throw new Error('Thiếu id');

  // 1. Xóa trong sheet "Dự án"
  var duAn = ss.getSheetByName(SHEET_NAMES.DU_AN);
  if (duAn) {
    var lr = duAn.getLastRow();
    if (lr >= 2) {
      var ids = duAn.getRange(2, 1, lr - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0] || '').replace(/\s/g,'') === projectId) {
          duAn.deleteRow(i + 2);
          break;
        }
      }
    }
  }

  // 2. Đọc Role to Project để biết thành viên liên quan trước khi xóa
  var r2p = ss.getSheetByName(SHEET_NAMES.ROLE_TO_PROJECT);
  var memberProjectRows = []; // { member, projectId }
  if (r2p) {
    var r2pLr = r2p.getLastRow();
    if (r2pLr >= 2) {
      var r2pData = r2p.getRange(2, 1, r2pLr - 1, 5).getValues();
      for (var j = r2pData.length - 1; j >= 0; j--) {
        var pid = String(r2pData[j][R2P_COL.PROJECT_ID] || '').replace(/\s/g,'');
        if (pid === projectId) {
          var memberName = String(r2pData[j][R2P_COL.MEMBER] || '').trim();
          if (memberName) memberProjectRows.push(memberName);
          r2p.deleteRow(j + 2);
        }
      }
    }
  }

  // 3. Xóa task trong sheet thành viên (tìm theo project ID ở cột A)
  // Loại trùng tên
  var uniqueMembers = [];
  for (var k = 0; k < memberProjectRows.length; k++) {
    var found = false;
    for (var m = 0; m < uniqueMembers.length; m++) {
      if (uniqueMembers[m] === memberProjectRows[k]) { found = true; break; }
    }
    if (!found) uniqueMembers.push(memberProjectRows[k]);
  }

  var deletedFromSheets = 0;
  for (var s = 0; s < uniqueMembers.length; s++) {
    var mSheet = ss.getSheetByName(uniqueMembers[s]);
    if (!mSheet) continue;
    var mLr = mSheet.getLastRow();
    if (mLr < 2) continue;
    var mData = mSheet.getRange(2, 1, mLr - 1, 1).getValues();
    for (var n = mData.length - 1; n >= 0; n--) {
      var rowPid = String(mData[n][0] || '').replace(/\s/g,'');
      // Task ID dạng TASK{timestamp}{rand} — xóa nếu bắt đầu bằng project ID hoặc khớp project ID
      if (rowPid === projectId || rowPid.indexOf(projectId) === 0) {
        mSheet.deleteRow(n + 2);
        deletedFromSheets++;
      }
    }
  }

  return { deleted: true, members: uniqueMembers.length, taskRows: deletedFromSheets };
}

// ── updateMyTask ──────────────────────────────────────────────────────────────
function updateMyTask(ss, body) {
  var memberSheet = ss.getSheetByName(body.member);
  if (!memberSheet) throw new Error('Không tìm thấy sheet: ' + body.member);
  var rowIndex = 0;
  var taskId   = String(body.taskId   || '').replace(/\s/g, '');
  var taskName = String(body.taskName || '').trim();

  // Luôn tìm theo ID + tên task để tránh nhầm hàng (nhiều task cùng project ID)
  if (taskId) {
    var lastRow = memberSheet.getLastRow();
    if (lastRow >= 2) {
      var allData = memberSheet.getRange(2, 1, lastRow - 1, TOTAL_MT_COLS).getValues();
      for (var i = 0; i < allData.length; i++) {
        var rowId   = String(allData[i][MT_COL.ID]  || '').replace(/\s/g, '');
        var rowTask = String(allData[i][MT_COL.TASK] || '').trim();
        var idMatch   = rowId === taskId;
        var nameMatch = !taskName || rowTask === taskName;
        if (idMatch && nameMatch) { rowIndex = i + 2; break; }
      }
    }
  }

  // Fallback: dùng rowIndex từ client nếu tìm không ra
  if (!rowIndex || rowIndex < 2) rowIndex = Number(body.rowIndex);
  if (!rowIndex || rowIndex < 2) throw new Error('Không tìm thấy task: ' + taskId + ' / ' + taskName);
  var fields = body.fields || {};
  var row    = memberSheet.getRange(rowIndex, 1, 1, TOTAL_MT_COLS).getValues()[0];
  if (fields.status    !== undefined) row[MT_COL.STATUS] = fields.status;
  if (fields.role      !== undefined) row[MT_COL.ROLE]   = fields.role;
  if (fields.detail    !== undefined) row[MT_COL.DETAIL] = fields.detail;
  if (fields.link      !== undefined) row[MT_COL.LINK]   = fields.link;
  if (fields.startDate !== undefined) row[MT_COL.START]  = fields.startDate;
  if (fields.endDate   !== undefined) row[MT_COL.END]    = fields.endDate;
  memberSheet.getRange(rowIndex, 1, 1, TOTAL_MT_COLS).setValues([row]);
  return { updated: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var d  = val;
    var dd = padLeft(String(d.getDate()), 2, '0');
    var mm = padLeft(String(d.getMonth() + 1), 2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }
  var s = String(val).replace(/^\s+|\s+$/g,'');
  if (!s || s === '-') return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    var year = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026';
    return year + '-' + padLeft(m[2], 2, '0') + '-' + padLeft(m[1], 2, '0');
  }
  return s;
}

function getWeekNumber(date) {
  var d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Thay thế String.padStart() — không có trong Rhino
function padLeft(str, len, ch) {
  str = String(str);
  while (str.length < len) str = ch + str;
  return str;
}

// ── saveReport ────────────────────────────────────────────────────────────────
// Cột: A=ID | B=Thành viên | C=Vai trò | D=Kỳ báo cáo | E=Ngày báo cáo
//      F=Tên Task | G=Dự án | H=Trạng thái task | I=Trạng thái tiến độ
//      J=Đã làm gì | K=Sẽ làm gì | L=Vướng mắc
function saveReport(ss, body) {
  var sheetName = body.reportSheet || 'Báo cáo';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);

  var id = String(body.id || ('RPT' + new Date().getTime())).replace(/\s/g,'');

  var periodLabel = body.reportPeriod === 'week' ? 'Tuần' : body.reportPeriod === 'month' ? 'Tháng' : 'Ngày';
  var statusLabel = body.reportStatus === 'delayed' ? 'Có chậm trễ' : body.reportStatus === 'need-support' ? 'Cần hỗ trợ' : 'Đúng tiến độ';

  // Ngày báo cáo → DD/MM/YYYY
  var dateLabel = '';
  if (body.date) {
    var parts = String(body.date).split('-');
    if (parts.length === 3) dateLabel = parts[2] + '/' + parts[1] + '/' + parts[0];
    else dateLabel = body.date;
  }

  var row = [
    id,
    body.member        || '',
    body.role          || '',
    periodLabel,
    dateLabel,
    body.taskName      || '',
    body.project       || '',
    body.taskStatus    || '',
    statusLabel,
    body.todayWork     || '',
    body.tomorrowPlan  || '',
    body.blockers      || 'Không có',
  ];

  // Tìm row cũ theo ID để update
  var lastRow = sheet.getLastRow();
  var existingRow = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').replace(/\s/g,'') === id) { existingRow = i + 2; break; }
    }
  }

  var now = new Date().toISOString();
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    return { id: id, saved: true, action: 'updated', submittedAt: now };
  } else {
    sheet.appendRow(row);
    return { id: id, saved: true, action: 'created', submittedAt: now };
  }
}

// ── deleteReport ──────────────────────────────────────────────────────────────
function deleteReport(ss, body) {
  var sheetName = body.reportSheet || 'Báo cáo';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);
  var id = String(body.id || '').replace(/\s/g,'');
  if (!id) throw new Error('Thiếu id');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').replace(/\s/g,'') === id) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// ── deleteMyTask ──────────────────────────────────────────────────────────────
function deleteMyTask(ss, body) {
  var memberName = String(body.member || '').trim();
  if (!memberName) throw new Error('Thiếu member');
  var sheet = ss.getSheetByName(memberName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + memberName);

  var taskId   = String(body.taskId   || '').replace(/\s/g, '');
  var taskName = String(body.taskName || '').trim();
  var lastRow  = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };

  var data = sheet.getRange(2, 1, lastRow - 1, TOTAL_MT_COLS).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var rowId   = String(data[i][MT_COL.ID]   || '').replace(/\s/g, '');
    var rowTask = String(data[i][MT_COL.TASK]  || '').trim();
    var idMatch   = taskId   ? rowId === taskId     : false;
    var nameMatch = taskName ? rowTask === taskName  : true;
    if (idMatch && nameMatch) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  // Fallback: tìm chỉ theo tên nếu không khớp ID
  if (taskName) {
    for (var j = data.length - 1; j >= 0; j--) {
      if (String(data[j][MT_COL.TASK] || '').trim() === taskName) {
        sheet.deleteRow(j + 2);
        return { deleted: true };
      }
    }
  }
  return { deleted: false };
}

// Thay thế Array.indexOf() — an toàn cho Rhino
function indexOf(arr, val) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === val) return i;
  }
  return -1;
}

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data, error: null, timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, data: null, error: String(msg), timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}
