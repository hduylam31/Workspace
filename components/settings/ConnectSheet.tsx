'use client';
import { useState, useEffect } from 'react';
import {
  X, Link2, Loader2, CheckCircle, AlertCircle,
  ChevronDown, Trash2, Database, Monitor,
} from 'lucide-react';
import {
  fetchSheetNames, saveSheetsConfig, loadSheetsConfig,
  clearSheetsConfig, type SheetsConfig,
} from '@/lib/google-sheets';

interface Props {
  onClose: () => void;
  onConnect: (config: SheetsConfig) => void;
}

const PERSONAL_SHEETS = ['Đức Anh', 'Khánh', 'Tuyền', 'Trang', 'Trình', 'Mai'];

// ─── Helper: radio picker list ────────────────────────────────────────────────
function SheetRadioPicker({
  name, label, desc, hint, value, onChange, sheets,
}: {
  name: string; label: string; desc: string; hint: string;
  value: string; onChange: (v: string) => void; sheets: string[];
}) {
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-xs text-gray-500">{desc}</p>
      <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto">
        <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border text-sm transition-colors ${
          value === '' ? 'bg-white border-gray-300 text-gray-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
          <input type="radio" name={name} value="" checked={value === ''} onChange={() => onChange('')} className="accent-gray-400" />
          <span className="italic">Không dùng</span>
        </label>
        {sheets.map(s => (
          <label key={s} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border text-sm transition-colors ${
            value === s ? 'bg-green-50 border-green-400 text-green-900 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}>
            <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} className="accent-green-500" />
            <span className="truncate">{s}</span>
            {value === s && <span className="ml-auto text-green-600 text-xs shrink-0">✓</span>}
          </label>
        ))}
      </div>
      {value && <p className="text-xs text-gray-400 leading-relaxed">{hint}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ConnectSheet({ onClose, onConnect }: Props) {
  // ── Spreadsheet chính ──
  const [spreadsheetId, setSpreadsheetId]     = useState('');
  const [apiKey, setApiKey]                   = useState('');
  const [masterDataSheet,    setMasterDataSheet]    = useState('');
  const [reportSheet,        setReportSheet]        = useState('');
  const [appsScriptUrl,      setAppsScriptUrl]      = useState('');
  const [duAnSheet,          setDuAnSheet]          = useState('Dự án');
  const [roleToTaskSheet,    setRoleToTaskSheet]    = useState('Role to Task');
  const [roleToProjectSheet, setRoleToProjectSheet] = useState('Role to Project');
  // backward compat
  const [poolSheet, setPoolSheet] = useState('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets]   = useState<string[]>([]);

  // ── Spreadsheet IT Tracker (riêng) ──
  const [itSpreadsheetId, setItSpreadsheetId] = useState('');
  const [itApiKey, setItApiKey]               = useState('');
  const [itSheets, setItSheets]               = useState<string[]>([]);
  const [itAvailableSheets, setItAvailableSheets] = useState<string[]>([]);
  const [itConnected, setItConnected]         = useState(false);
  const [itLoading, setItLoading]             = useState(false);
  const [itError, setItError]                 = useState('');
  const [showItSection, setShowItSection]     = useState(false);

  // ── UI state ──
  const [step, setStep]               = useState<'input' | 'select' | 'done'>('input');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [showApiHelp, setShowApiHelp] = useState(false);

  // ── Load saved config ──
  useEffect(() => {
    const saved = loadSheetsConfig();
    if (!saved) return;
    setSpreadsheetId(saved.spreadsheetId);
    setApiKey(saved.apiKey);
    setMasterDataSheet(saved.masterDataSheet ?? '');
    setReportSheet(saved.reportSheet ?? '');
    setAppsScriptUrl(saved.appsScriptUrl ?? '');
    setDuAnSheet(saved.duAnSheet ?? saved.poolSheet ?? 'Dự án');
    setRoleToTaskSheet(saved.roleToTaskSheet ?? saved.roleTaskSheet ?? 'Role to Task');
    setRoleToProjectSheet(saved.roleToProjectSheet ?? 'Role to Project');
    setPoolSheet(saved.poolSheet ?? '');
    setSelectedSheets(saved.selectedSheets);
    if (saved.itTrackerSpreadsheetId) {
      setItSpreadsheetId(saved.itTrackerSpreadsheetId);
      setItApiKey(saved.itTrackerApiKey ?? '');
      // Hỗ trợ cả itTrackerSheets (mới) lẫn itTrackerSheet (cũ)
      const savedItSheets = saved.itTrackerSheets?.length
        ? saved.itTrackerSheets
        : saved.itTrackerSheet ? [saved.itTrackerSheet] : [];
      setItSheets(savedItSheets);
      setItConnected(true);
      setShowItSection(true);
    }
    setStep('done');
  }, []);

  function extractId(input: string): string {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  }

  // ── Kết nối spreadsheet chính ──
  async function handleConnect() {
    setError('');
    setLoading(true);
    const id = extractId(spreadsheetId);
    try {
      const sheets = await fetchSheetNames(id, apiKey.trim());
      setAvailableSheets(sheets);
      const preSelected = sheets.filter(s => PERSONAL_SHEETS.includes(s));
      setSelectedSheets(preSelected.length ? preSelected : sheets.slice(0, 3));
      setMasterDataSheet(sheets.find(s =>
        s.toLowerCase().includes('master') || s.toLowerCase().includes('data system') || s.toLowerCase() === 'data'
      ) ?? '');
      setReportSheet(sheets.find(s =>
        s.toLowerCase().includes('báo cáo') || s.toLowerCase().includes('bao cao') || s.toLowerCase().includes('report')
      ) ?? '');
      setPoolSheet(sheets.find(s =>
        s.toLowerCase() === 'pool' || s.toLowerCase().includes('pool task')
      ) ?? '');
      setSpreadsheetId(id);
      setStep('select');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('API key') ? 'API Key không hợp lệ hoặc chưa bật Sheets API.' :
        msg.includes('404')     ? 'Không tìm thấy Spreadsheet. Kiểm tra ID hoặc quyền truy cập.' :
        msg.includes('403')     ? 'Không có quyền truy cập. Đảm bảo sheet đã share "Anyone with link".' :
        msg
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Kết nối IT Tracker spreadsheet riêng ──
  async function handleConnectIT() {
    setItError('');
    setItLoading(true);
    const id = extractId(itSpreadsheetId);
    try {
      const sheets = await fetchSheetNames(id, itApiKey.trim());
      setItAvailableSheets(sheets);
      // Auto-select tất cả sheets có dạng MM/YYYY (ví dụ 04/2026, 05/2026...)
      const monthSheets = sheets.filter(s => /^\d{2}\/\d{4}$/.test(s.trim()));
      if (monthSheets.length > 0) {
        setItSheets(monthSheets);
      } else {
        // Fallback: auto-detect tên sheet IT quen thuộc
        const autoIt = sheets.find(s =>
          s.toLowerCase().includes('it tracker') || s.toLowerCase().includes('it task') ||
          s.toLowerCase() === 'it' || s.toLowerCase().includes('sprint')
        ) ?? (sheets[0] ?? '');
        setItSheets(autoIt ? [autoIt] : []);
      }
      setItSpreadsheetId(id);
      setItConnected(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setItError(
        msg.includes('404') ? 'Không tìm thấy Spreadsheet IT Tracker.' :
        msg.includes('403') ? 'Không có quyền truy cập Spreadsheet IT Tracker.' :
        msg
      );
    } finally {
      setItLoading(false);
    }
  }

  function toggleItSheet(name: string) {
    setItSheets(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  }

  function handleSave() {
    const config: SheetsConfig = {
      spreadsheetId,
      apiKey:              apiKey.trim(),
      selectedSheets,
      appsScriptUrl:       appsScriptUrl.trim()       || undefined,
      masterDataSheet:     masterDataSheet.trim()    || undefined,
      reportSheet:         reportSheet.trim()        || undefined,
      duAnSheet:           duAnSheet.trim()          || 'Dự án',
      roleToTaskSheet:     roleToTaskSheet.trim()    || 'Role to Task',
      roleToProjectSheet:  roleToProjectSheet.trim() || 'Role to Project',
      itTrackerSpreadsheetId: itConnected && itSpreadsheetId.trim() ? itSpreadsheetId.trim() : undefined,
      itTrackerApiKey:        itConnected && itApiKey.trim()        ? itApiKey.trim()        : undefined,
      itTrackerSheets:        itConnected && itSheets.length        ? itSheets              : undefined,
    };
    saveSheetsConfig(config);
    onConnect(config);
    setStep('done');
  }

  function handleDisconnect() {
    clearSheetsConfig();
    setSpreadsheetId(''); setApiKey('');
    setAppsScriptUrl(''); setMasterDataSheet(''); setReportSheet('');
    setDuAnSheet('Dự án'); setRoleToTaskSheet('Role to Task'); setRoleToProjectSheet('Role to Project');
    setSelectedSheets([]); setAvailableSheets([]);
    setItSpreadsheetId(''); setItApiKey(''); setItSheets([]);
    setItAvailableSheets([]); setItConnected(false); setItError('');
    setStep('input');
  }

  function toggleSheet(name: string) {
    setSelectedSheets(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Kết nối Google Sheets</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* ══ DONE ══════════════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div className="space-y-3">
              {/* Main spreadsheet */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-green-600 shrink-0" />
                  <p className="font-semibold text-green-800 text-sm">Spreadsheet chính</p>
                </div>
                <p className="text-xs text-green-600 font-mono break-all mb-2">{spreadsheetId}</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSheets.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-white text-green-700 rounded-full text-xs font-medium border border-green-200">{s}</span>
                  ))}
                </div>
              </div>

              {/* IT Tracker spreadsheet */}
              <div className={`p-4 rounded-xl border ${
                itConnected && itSpreadsheetId
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Monitor size={15} className={itConnected && itSpreadsheetId ? 'text-indigo-600 shrink-0' : 'text-gray-400 shrink-0'} />
                  <p className={`font-semibold text-sm ${itConnected && itSpreadsheetId ? 'text-indigo-800' : 'text-gray-500'}`}>
                    Spreadsheet IT Tracker
                  </p>
                  {itConnected && itSpreadsheetId && <span className="ml-auto text-xs text-indigo-600 font-medium">✓ Đã kết nối</span>}
                </div>
                {itConnected && itSpreadsheetId ? (
                  <>
                    <p className="text-xs text-indigo-600 font-mono break-all">{itSpreadsheetId}</p>
                    {itSheets.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {itSheets.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-white text-indigo-700 rounded-full text-xs font-medium border border-indigo-200">{s}</span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">Chưa cấu hình — IT Tracker dùng dữ liệu mock</p>
                )}
              </div>

              {/* Functional sheets */}
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { icon: '📝', label: 'Sheet Báo cáo', value: reportSheet, desc: 'Overview → ghi báo cáo' },
                  { icon: '🎯', label: 'Sheet Dự án',          value: duAnSheet,          desc: 'Pick Task — danh sách dự án' },
                  { icon: '📋', label: 'Role to Task',          value: roleToTaskSheet,    desc: 'Master task theo vai trò' },
                  { icon: '🔗', label: 'Role to Project',       value: roleToProjectSheet, desc: 'Phân công member theo dự án' },
                  { icon: '⚙️', label: 'Sheet Master Data', value: masterDataSheet, desc: 'Danh sách dự án/trạng thái' },
                ].map(({ icon, label, value, desc }) => (
                  <div key={label} className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs ${
                    value ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 text-gray-400'
                  }`}>
                    <span>{icon}</span>
                    <span className="text-gray-600 font-medium">{label}:</span>
                    {value ? <span className="font-mono text-gray-700">{value}</span> : <span className="italic">Chưa cấu hình</span>}
                    <span className="ml-auto text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep('input')}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Đổi cấu hình
                </button>
                <button onClick={handleDisconnect}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50">
                  <Trash2 size={14} /> Ngắt kết nối
                </button>
              </div>
            </div>
          )}

          {/* ══ SELECT SHEETS ═════════════════════════════════════════════════ */}
          {step === 'select' && (
            <div className="space-y-4">

              {/* ── Spreadsheet chính: pickers ── */}
              <div className="flex items-center gap-2 px-1">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <p className="text-sm font-semibold text-gray-700">Spreadsheet chính · {availableSheets.length} sheets</p>
                <p className="text-xs text-gray-400 font-mono truncate ml-1">{spreadsheetId}</p>
              </div>

              {/* Master Data */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">⚙️ Sheet Master Data</p>
                </div>
                <p className="text-xs text-amber-700">Sheet chứa danh sách Dự án, Trạng thái và Vai trò</p>
                <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto">
                  {availableSheets.map(s => (
                    <label key={s} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border text-sm transition-colors ${
                      masterDataSheet === s ? 'bg-amber-100 border-amber-400 text-amber-900 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-amber-50'
                    }`}>
                      <input type="radio" name="master" value={s} checked={masterDataSheet === s} onChange={() => setMasterDataSheet(s)} className="accent-amber-500" />
                      <span className="truncate">{s}</span>
                      {masterDataSheet === s && <span className="ml-auto text-amber-600 text-xs shrink-0">✓</span>}
                    </label>
                  ))}
                </div>
              </div>

              {/* Báo cáo */}
              <SheetRadioPicker
                name="report" label="📝 Sheet Báo cáo" value={reportSheet} onChange={setReportSheet}
                sheets={availableSheets}
                desc="Overview ghi báo cáo hằng ngày xuống sheet này"
                hint="Cột: A=ID · B=Date · C=Period · D=Member · E=Project · F=Progress · G=Status · H=Đã làm · I=Kế hoạch · J=Blockers · K=SubmittedAt"
              />

              {/* Pick Task sheets */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  🎯 Pick Task sheets
                </p>
                <SheetRadioPicker
                  name="duAn" label="📁 Sheet Dự án" value={duAnSheet} onChange={setDuAnSheet}
                  sheets={availableSheets}
                  desc="Danh sách dự án — Pick Task đọc + ghi vào đây"
                  hint="Cột: A=ID · B=Tên dự án · C=Trạng thái · D=Loại · E=Owner · F=Thành viên khác · G=Deadline"
                />
                <SheetRadioPicker
                  name="roleToTask" label="📋 Role to Task" value={roleToTaskSheet} onChange={setRoleToTaskSheet}
                  sheets={availableSheets}
                  desc="Master data task theo vai trò (PO, PMC, PD, DA)"
                  hint="Cột: A=ID · B=Vai trò · C=Tên Task"
                />
                <SheetRadioPicker
                  name="roleToProject" label="🔗 Role to Project" value={roleToProjectSheet} onChange={setRoleToProjectSheet}
                  sheets={availableSheets}
                  desc="Phân công member + vai trò + task theo từng dự án (ghi khi pick)"
                  hint="Cột: A=ID dự án · B=Tên dự án · C=Thành viên · D=Vai trò · E=Task"
                />
              </div>

              {/* Task sheets cá nhân */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sheets task cá nhân <span className="text-gray-400 font-normal">({availableSheets.length} sheets)</span>
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {availableSheets.map(s => {
                    const isPersonal = PERSONAL_SHEETS.includes(s);
                    const isMaster = s === masterDataSheet;
                    const isFunc = s === reportSheet || s === duAnSheet || s === roleToTaskSheet || s === roleToProjectSheet;
                    return (
                      <label key={s} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                        isMaster || isFunc ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50'
                      }`}>
                        <input type="checkbox" checked={selectedSheets.includes(s)}
                          onChange={() => !isMaster && !isFunc && toggleSheet(s)}
                          disabled={isMaster || isFunc} className="rounded text-green-600 w-4 h-4" />
                        <span className="text-sm text-gray-800 flex-1">{s}</span>
                        {isMaster && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Master Data</span>}
                        {isFunc  && <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Đã dùng</span>}
                        {isPersonal && !isMaster && !isFunc && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Member</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  💡 A=ID · B=Dự án · C=Task · D=Owner · E=Chi tiết · F=Link · G=Status · H=Bắt đầu · I=Kết thúc · J=Ghi chú · K=Vai trò
                </p>
              </div>

              {/* ── IT Tracker spreadsheet riêng ── */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Monitor size={15} className="text-indigo-600" />
                  <p className="text-sm font-semibold text-indigo-800">💻 IT Tracker — Spreadsheet riêng</p>
                  {itConnected && (
                    <span className="ml-auto text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">✓ Đã kết nối</span>
                  )}
                </div>

                {!itConnected ? (
                  <div className="space-y-2.5">
                    <p className="text-xs text-gray-500">IT Tracker dùng một Google Sheet riêng biệt. Nhập ID và API Key của spreadsheet đó.</p>
                    <input value={itSpreadsheetId} onChange={e => setItSpreadsheetId(e.target.value)}
                      placeholder="Spreadsheet URL hoặc ID của IT Tracker"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
                    <input type="password" value={itApiKey} onChange={e => setItApiKey(e.target.value)}
                      placeholder="API Key (có thể dùng chung với spreadsheet chính)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-mono" />
                    {itError && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} /> {itError}
                      </p>
                    )}
                    <button onClick={handleConnectIT}
                      disabled={itLoading || !itSpreadsheetId.trim() || !itApiKey.trim()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {itLoading ? <><Loader2 size={14} className="animate-spin" /> Đang kết nối...</> : '🔗 Kết nối IT Tracker Spreadsheet'}
                    </button>
                    <p className="text-xs text-center text-gray-400">
                      Hoặc <button className="underline hover:text-gray-600" onClick={() => setItConnected(false)}>bỏ qua</button> — IT Tracker sẽ dùng dữ liệu mock
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <CheckCircle size={14} className="text-indigo-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-indigo-800">Đã kết nối · {itAvailableSheets.length} sheets</p>
                        <p className="text-xs text-indigo-600 font-mono truncate">{itSpreadsheetId}</p>
                      </div>
                      <button onClick={() => { setItConnected(false); setItAvailableSheets([]); setItSheets([]); }}
                        className="ml-auto text-xs text-red-500 hover:text-red-700 shrink-0">Đổi</button>
                    </div>
                    {/* Multi-select checkboxes cho IT Tracker sheets */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">Chọn sheets IT Tracker</p>
                        <div className="flex gap-2 text-xs">
                          <button
                            onClick={() => setItSheets([...itAvailableSheets])}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Chọn tất cả
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setItSheets([])}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Bỏ chọn
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Mỗi sheet là 1 tháng (04/2026, 05/2026...). Chọn nhiều sheet để hiển thị gộp.</p>
                      <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto">
                        {itAvailableSheets.map(s => {
                          const isSelected = itSheets.includes(s);
                          const isMonth = /^\d{2}\/\d{4}$/.test(s.trim());
                          return (
                            <label key={s} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border text-sm transition-colors ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-medium'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItSheet(s)}
                                className="rounded accent-indigo-500 w-4 h-4 shrink-0"
                              />
                              <span className="flex-1 truncate">{s}</span>
                              {isMonth && <span className="text-xs text-indigo-400 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">Tháng</span>}
                              {isSelected && <span className="text-indigo-600 text-xs shrink-0">✓</span>}
                            </label>
                          );
                        })}
                      </div>
                      {itSheets.length > 0 && (
                        <p className="text-xs text-indigo-600 font-medium">
                          ✓ Đã chọn {itSheets.length} sheet{itSheets.length > 1 ? 's' : ''}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        Cấu trúc mỗi sheet: Dòng 1=Tóm tắt · Dòng 2=Trống · Dòng 3=Header · Dòng 4+=Data
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep('input')} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Quay lại
                </button>
                <button onClick={handleSave} disabled={selectedSheets.length === 0}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  Lưu & kết nối ({selectedSheets.length} sheets{itConnected && itSheets.length > 0 ? ` + IT×${itSheets.length}` : ''})
                </button>
              </div>
            </div>
          )}

          {/* ══ INPUT ═════════════════════════════════════════════════════════ */}
          {step === 'input' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Spreadsheet chính (My Tasks, Pick Task, Báo cáo)</p>
                <p>• Share → <strong>Anyone with the link can view</strong></p>
                <p>• Cần Google Sheets API Key từ Google Cloud Console</p>
              </div>

              {/* Spreadsheet ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Spreadsheet ID hoặc URL</label>
                <input value={spreadsheetId} onChange={e => setSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... hoặc ID"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200" />
              </div>

              {/* API Key */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Google Sheets API Key</label>
                  <button onClick={() => setShowApiHelp(!showApiHelp)} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                    Cách lấy <ChevronDown size={12} className={showApiHelp ? 'rotate-180' : ''} />
                  </button>
                </div>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 font-mono" />
                {showApiHelp && (
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 space-y-1">
                    <p className="font-medium text-gray-700">Lấy API Key:</p>
                    <p>1. <strong>console.cloud.google.com</strong> → Tạo/chọn project</p>
                    <p>2. APIs & Services → Enable APIs → bật <strong>Google Sheets API</strong></p>
                    <p>3. Credentials → Create Credentials → <strong>API Key</strong></p>
                  </div>
                )}
              </div>

              {/* Apps Script URL */}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ⚡ Apps Script URL <span className="text-gray-400 font-normal">(để ghi dữ liệu)</span>
                </label>
                <input
                  value={appsScriptUrl}
                  onChange={e => setAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 font-mono"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Deploy <code className="bg-gray-100 px-1 rounded">apps-script/workspace-api.gs</code> →
                  Extensions → Apps Script → Deploy → Web App · Access: <strong>Anyone</strong>
                </p>
              </div>

              {/* ── IT Tracker — Spreadsheet riêng ── */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor size={15} className="text-indigo-600 shrink-0" />
                  <p className="text-sm font-semibold text-indigo-800">💻 IT Tracker — Spreadsheet riêng</p>
                  <span className="text-xs text-gray-400 font-normal ml-1">(tuỳ chọn)</span>
                  {itConnected && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                      <CheckCircle size={11} /> Đã kết nối
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  IT Tracker đọc dữ liệu từ một Google Spreadsheet <strong>khác</strong> với spreadsheet chính. Điền thông tin bên dưới để kết nối.
                </p>

                {itConnected ? (
                  /* Đã kết nối — hiện tóm tắt + nút đổi */
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-indigo-800">Đã kết nối Spreadsheet IT Tracker</p>
                        <p className="text-xs text-indigo-600 font-mono break-all mt-0.5">{itSpreadsheetId}</p>
                        {itAvailableSheets.length > 0 && (
                          <p className="text-xs text-indigo-500 mt-0.5">
                            {itAvailableSheets.length} sheets · {itSheets.length > 0 ? `Đã chọn ${itSheets.length} sheet` : 'Chọn sheets ở bước tiếp theo'}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => { setItConnected(false); setItAvailableSheets([]); setItSheets([]); }}
                        className="shrink-0 text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Đổi
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Chưa kết nối — form nhập */
                  <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2.5">
                    <div>
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Spreadsheet ID hoặc URL</label>
                      <input
                        value={itSpreadsheetId}
                        onChange={e => { setItSpreadsheetId(e.target.value); setItError(''); }}
                        placeholder="https://docs.google.com/spreadsheets/d/... hoặc ID"
                        className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-indigo-800">API Key</label>
                        <button
                          onClick={() => { setItApiKey(apiKey); }}
                          disabled={!apiKey.trim()}
                          className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Dùng chung API Key với spreadsheet chính"
                        >
                          Dùng chung key chính ↑
                        </button>
                      </div>
                      <input
                        type="password"
                        value={itApiKey}
                        onChange={e => { setItApiKey(e.target.value); setItError(''); }}
                        placeholder="AIzaSy... (có thể dùng chung với key chính)"
                        className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white font-mono"
                      />
                    </div>
                    {itError && (
                      <p className="text-xs text-red-600 flex items-center gap-1.5">
                        <AlertCircle size={12} /> {itError}
                      </p>
                    )}
                    <button
                      onClick={handleConnectIT}
                      disabled={itLoading || !itSpreadsheetId.trim() || !itApiKey.trim()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {itLoading
                        ? <><Loader2 size={14} className="animate-spin" /> Đang kết nối...</>
                        : <><Monitor size={14} /> Kết nối Spreadsheet IT Tracker</>
                      }
                    </button>
                    <p className="text-xs text-center text-indigo-400">
                      Bỏ trống nếu không dùng — IT Tracker sẽ hiển thị dữ liệu mock
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}

              <button onClick={handleConnect}
                disabled={loading || !spreadsheetId.trim() || !apiKey.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Đang kết nối...</>
                  : <>Tiếp theo — Chọn sheets {itConnected ? `(+ IT Tracker ✓${itSheets.length > 0 ? ` ×${itSheets.length}` : ''})` : ''}</>
                }
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
