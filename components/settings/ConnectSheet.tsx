'use client';
import { useState, useEffect } from 'react';
import { X, Link2, Loader2, CheckCircle, AlertCircle, ChevronDown, Trash2, Zap } from 'lucide-react';
import {
  fetchSheetNames,
  saveSheetsConfig,
  loadSheetsConfig,
  clearSheetsConfig,
  testAppsScriptConnection,
  type SheetsConfig,
} from '@/lib/google-sheets';

interface Props {
  onClose: () => void;
  onConnect: (config: SheetsConfig) => void;
}

const PERSONAL_SHEETS = ['Đức Anh', 'Khánh', 'Tuyền', 'Trang', 'Trình', 'Mai'];

export default function ConnectSheet({ onClose, onConnect }: Props) {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [step, setStep] = useState<'input' | 'select' | 'done'>('input');
  const [loading, setLoading] = useState(false);
  const [testingScript, setTestingScript] = useState(false);
  const [scriptOk, setScriptOk] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [showApiHelp, setShowApiHelp] = useState(false);
  const [showScriptHelp, setShowScriptHelp] = useState(false);

  useEffect(() => {
    const saved = loadSheetsConfig();
    if (saved) {
      setSpreadsheetId(saved.spreadsheetId);
      setApiKey(saved.apiKey);
      setAppsScriptUrl(saved.appsScriptUrl ?? '');
      setSelectedSheets(saved.selectedSheets);
      setStep('done');
    }
  }, []);

  async function handleTestScript() {
    if (!appsScriptUrl.trim()) return;
    setTestingScript(true);
    setScriptOk(null);
    try {
      const ok = await testAppsScriptConnection(appsScriptUrl.trim());
      setScriptOk(ok);
    } catch {
      setScriptOk(false);
    } finally {
      setTestingScript(false);
    }
  }

  function extractId(input: string): string {
    // Accept full URL or just the ID
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  }

  async function handleConnect() {
    setError('');
    setLoading(true);
    const id = extractId(spreadsheetId);
    try {
      const sheets = await fetchSheetNames(id, apiKey.trim());
      setAvailableSheets(sheets);
      // Pre-select sheets matching known member names
      const preSelected = sheets.filter(s => PERSONAL_SHEETS.includes(s));
      setSelectedSheets(preSelected.length ? preSelected : sheets.slice(0, 3));
      setSpreadsheetId(id);
      setStep('select');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('API key') ? 'API Key không hợp lệ hoặc chưa bật Sheets API.'
        : msg.includes('404') ? 'Không tìm thấy Spreadsheet. Kiểm tra ID hoặc quyền truy cập.'
        : msg.includes('403') ? 'Không có quyền truy cập. Đảm bảo sheet đã share "Anyone with link".'
        : msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    const config: SheetsConfig = {
      spreadsheetId,
      apiKey: apiKey.trim(),
      selectedSheets,
      appsScriptUrl: appsScriptUrl.trim() || undefined,
    };
    saveSheetsConfig(config);
    onConnect(config);
    setStep('done');
  }

  function handleDisconnect() {
    clearSheetsConfig();
    setSpreadsheetId('');
    setApiKey('');
    setAppsScriptUrl('');
    setScriptOk(null);
    setSelectedSheets([]);
    setAvailableSheets([]);
    setStep('input');
  }

  function toggleSheet(name: string) {
    setSelectedSheets(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Kết nối Google Sheets</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {step === 'done' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle size={20} className="text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-green-800 text-sm">Đã kết nối Google Sheets</p>
                  <p className="text-xs text-green-600 mt-0.5 font-mono break-all">{spreadsheetId}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Sheets đang đọc ({selectedSheets.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSheets.map(s => (
                    <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{s}</span>
                  ))}
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                appsScriptUrl
                  ? 'bg-purple-50 border-purple-200 text-purple-800'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
                <Zap size={16} className={appsScriptUrl ? 'text-purple-600' : 'text-gray-400'} />
                <span>
                  {appsScriptUrl
                    ? '✅ Apps Script URL đã cấu hình — Thêm/Sửa task sẽ lưu xuống Sheets'
                    : '⚠️ Chưa có Apps Script URL — Thêm/Sửa task chỉ lưu tạm trong trình duyệt'}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Đổi cấu hình
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Ngắt kết nối
                </button>
              </div>
            </div>
          ) : step === 'select' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Tìm thấy <strong>{availableSheets.length}</strong> sheets. Chọn các sheet cá nhân để đọc task:
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {availableSheets.map(sheet => {
                  const isPersonal = PERSONAL_SHEETS.includes(sheet);
                  return (
                    <label
                      key={sheet}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSheets.includes(sheet)}
                        onChange={() => toggleSheet(sheet)}
                        className="rounded text-green-600 w-4 h-4"
                      />
                      <span className="text-sm text-gray-800 flex-1">{sheet}</span>
                      {isPersonal && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Member</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                💡 Cột đọc: A=ID · B=Tên dự án · C=Task · D=Owner · E=Chi tiết · F=Link · G=Status · H=Bắt đầu · I=Kết thúc · J=Ghi chú
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleSave}
                  disabled={selectedSheets.length === 0}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Lưu & kết nối ({selectedSheets.length} sheets)
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Hướng dẫn */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-1">
                <p className="font-medium">Yêu cầu trước khi kết nối:</p>
                <p>1. Google Sheet đã được share → <strong>Anyone with the link can view</strong></p>
                <p>2. Có Google Sheets API Key từ Google Cloud Console</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Spreadsheet ID hoặc URL
                </label>
                <input
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... hoặc ID"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
                />
                <p className="text-xs text-gray-400 mt-1">Paste link Google Sheet hoặc chỉ phần ID</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Google Sheets API Key</label>
                  <button
                    onClick={() => setShowApiHelp(!showApiHelp)}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                  >
                    Cách lấy API Key <ChevronDown size={12} className={showApiHelp ? 'rotate-180' : ''} />
                  </button>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 font-mono"
                />
                {showApiHelp && (
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 space-y-1.5">
                    <p className="font-medium text-gray-700">Lấy API Key miễn phí:</p>
                    <p>1. Vào <strong>console.cloud.google.com</strong></p>
                    <p>2. Tạo project (hoặc chọn project có sẵn)</p>
                    <p>3. APIs & Services → Enable APIs → bật <strong>Google Sheets API</strong></p>
                    <p>4. Credentials → Create Credentials → <strong>API Key</strong></p>
                    <p>5. (Tuỳ chọn) Restrict key: chỉ cho phép Sheets API + domain của bạn</p>
                  </div>
                )}
              </div>

              {/* Apps Script URL */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Zap size={14} className="text-purple-500" />
                    Apps Script URL <span className="text-gray-400 font-normal">(để ghi task)</span>
                  </label>
                  <button
                    onClick={() => setShowScriptHelp(!showScriptHelp)}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                  >
                    Hướng dẫn deploy <ChevronDown size={12} className={showScriptHelp ? 'rotate-180' : ''} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={appsScriptUrl}
                    onChange={e => { setAppsScriptUrl(e.target.value); setScriptOk(null); }}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 font-mono"
                  />
                  {appsScriptUrl.trim() && (
                    <button
                      onClick={handleTestScript}
                      disabled={testingScript}
                      className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50 shrink-0"
                    >
                      {testingScript ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
                    </button>
                  )}
                </div>
                {scriptOk === true && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle size={12} /> Kết nối Apps Script thành công!
                  </p>
                )}
                {scriptOk === false && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> Không kết nối được — kiểm tra URL và quyền Deploy
                  </p>
                )}
                {showScriptHelp && (
                  <div className="mt-2 p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-800 space-y-1.5">
                    <p className="font-medium">Deploy Apps Script Web App:</p>
                    <p>1. Mở file <strong>Workspace An Khang 2026</strong> → Extensions → Apps Script</p>
                    <p>2. Dán nội dung file <code className="bg-purple-100 px-1 rounded">apps-script/workspace-api.gs</code> vào cuối editor</p>
                    <p>3. Click <strong>Deploy → New deployment</strong></p>
                    <p>4. Type: <strong>Web app</strong> · Execute as: <strong>Me</strong> · Access: <strong>Anyone</strong></p>
                    <p>5. Deploy → copy URL → dán vào ô trên</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={loading || !spreadsheetId.trim() || !apiKey.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Đang kết nối...</> : 'Kết nối & lấy danh sách sheets'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
