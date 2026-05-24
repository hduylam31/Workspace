'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, TrendingUp, AlertCircle, Clock,
  Search, X, ChevronDown, FileText, Calendar, RefreshCw, Trash2,
} from 'lucide-react';
import { useDataSystem } from '@/lib/use-data-system';
import { api, getReportsFromSheet } from '@/lib/api';
import { loadSheetsConfig } from '@/lib/google-sheets';
import MemberAvatar from '@/components/MemberAvatar';
import ReportForm from './ReportForm';
import type { DailyReport, ReportStatus } from '@/lib/types';

// ─── Date range helpers ────────────────────────────────────────────────────────
type DateRangeMode = 'day' | 'week' | 'month' | 'custom';

function getWeekRange(d = new Date()): [string, string] {
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));          // Monday
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]];
}

function getMonthRange(d = new Date()): [string, string] {
  const y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1).toISOString().split('T')[0];
  const last  = new Date(y, m + 1, 0).toISOString().split('T')[0];
  return [first, last];
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ReportStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  'on-track':     { label: 'Đúng tiến độ', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', icon: <TrendingUp size={12} /> },
  'delayed':      { label: 'Có chậm trễ',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', icon: <Clock size={12} /> },
  'need-support': { label: 'Cần hỗ trợ',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   icon: <AlertCircle size={12} /> },
};

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-gray-500 w-7 text-right">{value}%</span>
    </div>
  );
}

import type { ReportPeriod } from '@/lib/types';

// Week number từ ngày
function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Nhãn đầu nhóm (dùng trong date divider)
function formatPeriodHeader(dateStr: string, period: ReportPeriod): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (period === 'day') {
    return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (period === 'week') {
    const end = new Date(d); end.setDate(d.getDate() + 6);
    const wk  = getISOWeek(dateStr);
    const from = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const to   = end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return `Tuần ${wk} · ${from} – ${to}/${d.getFullYear()}`;
  }
  return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

// Badge nhỏ "Ngày / Tuần / Tháng" trên card
const PERIOD_BADGE: Record<ReportPeriod, string> = {
  day:   'Ngày',
  week:  'Tuần',
  month: 'Tháng',
};

// Nhãn label "đã làm / sẽ làm" theo kỳ
const PERIOD_DONE_LABEL: Record<ReportPeriod, string> = {
  day:   'Hôm nay đã làm',
  week:  'Tuần này đã làm',
  month: 'Tháng này đã làm',
};
const PERIOD_NEXT_LABEL: Record<ReportPeriod, string> = {
  day:   'Ngày mai sẽ làm',
  week:  'Tuần tới sẽ làm',
  month: 'Tháng tới sẽ làm',
};

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0];
}

/** Kiểm tra báo cáo có bao phủ ngày hôm nay không (hỗ trợ cả day / week / month) */
export function coversToday(r: DailyReport, today: string): boolean {
  if (r.reportPeriod === 'day') return r.date === today;
  if (r.reportPeriod === 'week') {
    const end = new Date(r.date + 'T00:00:00');
    end.setDate(end.getDate() + 6);
    return today >= r.date && today <= end.toISOString().split('T')[0];
  }
  // month
  return today.slice(0, 7) === r.date.slice(0, 7);
}

// Group key: ghép date + period để báo cáo ngày/tuần/tháng cùng ngày không bị lẫn
function groupKey(r: DailyReport) { return `${r.reportPeriod}::${r.date}`; }
function groupLabel(r: DailyReport) { return formatPeriodHeader(r.date, r.reportPeriod); }

// ─── Card báo cáo ─────────────────────────────────────────────────────────────
function ReportCard({ report, canEdit, onEdit, onDelete }: {
  report: DailyReport;
  canEdit: boolean;
  onEdit: (r: DailyReport) => void;
  onDelete?: (r: DailyReport) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CFG[report.reportStatus];

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-sm ${
      report.reportStatus === 'need-support' ? 'border-red-200' :
      report.reportStatus === 'delayed' ? 'border-amber-200' : 'border-gray-200'
    }`}>
      {/* Card header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <MemberAvatar name={report.member} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{report.member}</span>
            {report.role && report.role.split(',').map(r => r.trim()).filter(Boolean).map(r => (
              <span key={r} className="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-semibold">
                {r}
              </span>
            ))}
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full truncate max-w-[200px]">
              {report.project}
            </span>
            <StatusBadge status={report.reportStatus} />
          </div>
          <div className="mt-1.5">
            <ProgressBar value={report.progress} />
          </div>
        </div>
        {/* Period badge */}
        <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
          {PERIOD_BADGE[report.reportPeriod ?? 'day']}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {canEdit && (
            <button
              onClick={() => onEdit(report)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Chỉnh sửa"
            >
              <Edit2 size={14} />
            </button>
          )}
          {canEdit && onDelete && (
            <button
              onClick={() => onDelete(report)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Xóa báo cáo"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary line (collapsed) */}
      {!expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 line-clamp-2">
            <span className="font-medium text-gray-700">✅ </span>{report.todayWork}
          </p>
          {report.blockers && (
            <p className="text-xs text-amber-700 mt-0.5 line-clamp-1">
              <span className="font-medium">⚠️ </span>{report.blockers}
            </p>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              ✅ {PERIOD_DONE_LABEL[report.reportPeriod ?? 'day']}
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{report.todayWork}</p>
          </div>
          {report.tomorrowPlan && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                📋 {PERIOD_NEXT_LABEL[report.reportPeriod ?? 'day']}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{report.tomorrowPlan}</p>
            </div>
          )}
          {report.blockers && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">⚠️ Vướng mắc / Blockers</p>
              <p className="text-sm text-amber-800 whitespace-pre-line leading-relaxed">{report.blockers}</p>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Gửi lúc {new Date(report.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Module chính ─────────────────────────────────────────────────────────────
export default function DailyReportModule() {
  const { members } = useDataSystem();
  const [reports, setReports]       = useState<DailyReport[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [search, setSearch]         = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState<ReportStatus | ''>('');
  const [viewMode, setViewMode]     = useState<'mine' | 'all'>('mine');

  const reportSheet = useMemo(() => loadSheetsConfig()?.reportSheet ?? 'Báo cáo', []);
  const hasConfig   = useMemo(() => {
    const cfg = loadSheetsConfig();
    return !!(cfg?.spreadsheetId && cfg?.apiKey);
  }, []);

  // Tải báo cáo từ sheet
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReportsFromSheet();
      setReports(data);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Chọn thành viên đầu tiên khi members load xong
  useEffect(() => {
    if (!selectedMember && members.length > 0) setSelectedMember(members[0].name);
  }, [members, selectedMember]);

  // ── Date range filter ──
  const [rangeMode, setRangeMode]   = useState<DateRangeMode>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const today = new Date().toISOString().split('T')[0];
  const [weekFrom, weekTo]   = useMemo(() => getWeekRange(),   []);
  const [monthFrom, monthTo] = useMemo(() => getMonthRange(),  []);

  // Khoảng ngày đang áp dụng
  const [dateFrom, dateTo] = useMemo((): [string, string] => {
    if (rangeMode === 'day')    return [today, today];
    if (rangeMode === 'week')   return [weekFrom, weekTo];
    if (rangeMode === 'month')  return [monthFrom, monthTo];
    return [customFrom || '1970-01-01', customTo || '9999-12-31'];
  }, [rangeMode, today, weekFrom, weekTo, monthFrom, monthTo, customFrom, customTo]);

  const projects = useMemo(() => [...new Set(reports.map(r => r.project))].sort(), [reports]);

  // Đã báo cáo trong kỳ hiện tại chưa? (day/week/month đều được tính)
  const todayReport = reports.find(r => r.member === selectedMember && coversToday(r, today)) ?? null;

  const displayReports = useMemo(() => {
    return reports
      .filter(r => {
        if (!inRange(r.date, dateFrom, dateTo)) return false;
        if (viewMode === 'mine' && r.member !== selectedMember) return false;
        if (projectFilter && r.project !== projectFilter) return false;
        if (statusFilter  && r.reportStatus !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            r.todayWork.toLowerCase().includes(q) ||
            r.project.toLowerCase().includes(q) ||
            r.member.toLowerCase().includes(q) ||
            (r.blockers ?? '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt));
  }, [reports, viewMode, selectedMember, projectFilter, statusFilter, search, dateFrom, dateTo]);

  // Nhóm theo kỳ (period + date)
  const grouped = useMemo(() => {
    const g: Record<string, DailyReport[]> = {};
    displayReports.forEach(r => {
      const k = groupKey(r);
      if (!g[k]) g[k] = [];
      g[k].push(r);
    });
    return g;
  }, [displayReports]);

  function handleSave(report: DailyReport) {
    // Optimistic update — ReportForm đã gọi api.saveReport() trước khi gọi callback này
    setReports(prev => {
      const idx = prev.findIndex(r => r.id === report.id);
      return idx >= 0
        ? prev.map(r => r.id === report.id ? report : r)
        : [report, ...prev];
    });
    // Refresh nền để đồng bộ với sheet
    loadReports();
  }

  async function handleDelete(report: DailyReport) {
    if (!confirm(`Xóa báo cáo của ${report.member} ngày ${report.date}?`)) return;
    // Optimistic remove
    setReports(prev => prev.filter(r => r.id !== report.id));
    try {
      await api.deleteReport(report.id, reportSheet);
    } catch {
      // Rollback nếu lỗi
      setReports(prev => [report, ...prev]);
    }
  }

  function openEdit(report: DailyReport) {
    setEditingReport(report);
    setShowForm(true);
  }

  // Stats: báo cáo có bao phủ hôm nay (bất kể kỳ nào)
  const todayReports  = reports.filter(r => coversToday(r, today));
  const needSupport   = todayReports.filter(r => r.reportStatus === 'need-support').length;
  const delayed       = todayReports.filter(r => r.reportStatus === 'delayed').length;
  const notReported   = members.filter(m => !todayReports.some(r => r.member === m.name)).length;

  return (
    <div className="flex gap-5 h-full">
      {/* ── Sidebar: danh sách thành viên ── */}
      <aside className="w-48 shrink-0 space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-2">Thành viên</p>
        {members.map(m => {
          const mTodayDone = reports.some(r => r.member === m.name && coversToday(r, today));
          const mStatus    = reports.find(r => r.member === m.name && coversToday(r, today))?.reportStatus;
          return (
            <button
              key={m.id}
              onClick={() => { setSelectedMember(m.name); setViewMode('mine'); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left ${
                selectedMember === m.name && viewMode === 'mine'
                  ? 'bg-green-50 border border-green-200'
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <MemberAvatar name={m.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  selectedMember === m.name && viewMode === 'mine' ? 'text-green-800' : 'text-gray-700'
                }`}>{m.name}</p>
                <p className="text-xs mt-0.5">
                  {mTodayDone ? (
                    <span className={
                      mStatus === 'need-support' ? 'text-red-500' :
                      mStatus === 'delayed' ? 'text-amber-500' : 'text-green-500'
                    }>
                      {mStatus === 'need-support' ? '⚠️ Cần hỗ trợ' :
                       mStatus === 'delayed' ? '🕐 Chậm tiến độ' : '✅ Đã báo cáo'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Chưa báo cáo</span>
                  )}
                </p>
              </div>
            </button>
          );
        })}

        {/* Nút xem tất cả */}
        <button
          onClick={() => setViewMode('all')}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left mt-2 ${
            viewMode === 'all'
              ? 'bg-gray-100 border border-gray-300'
              : 'hover:bg-gray-100 border border-transparent'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Tất cả</p>
            <p className="text-xs text-gray-400">{reports.length} báo cáo</p>
          </div>
        </button>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">
              {viewMode === 'all' ? 'Tất cả báo cáo' : `Báo cáo của ${selectedMember}`}
            </h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {notReported > 0 && (
                <span className="text-xs text-amber-600">
                  ⚠️ {notReported} thành viên chưa báo cáo hôm nay
                </span>
              )}
              {needSupport > 0 && (
                <span className="text-xs text-red-600 font-medium">
                  🆘 {needSupport} cần hỗ trợ
                </span>
              )}
              {delayed > 0 && (
                <span className="text-xs text-amber-600">🕐 {delayed} chậm tiến độ</span>
              )}
              {todayReports.length === members.length && (
                <span className="text-xs text-green-600">✅ Tất cả đã báo cáo hôm nay</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasConfig && (
              <button
                onClick={loadReports}
                disabled={loading}
                title="Tải lại báo cáo từ sheet"
                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-300 hover:bg-green-50 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            {viewMode === 'mine' && (
              <button
                onClick={() => { setEditingReport(null); setShowForm(true); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  todayReport
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                }`}
              >
                {todayReport ? <><Edit2 size={15} /> Cập nhật báo cáo</> : <><Plus size={16} /> Báo cáo hôm nay</>}
              </button>
            )}
          </div>
        </div>

        {/* ── Date range bar ── */}
        <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap items-center gap-2">
          <Calendar size={15} className="text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-gray-500 mr-1">Xem theo:</span>

          {/* Pills */}
          {([
            { key: 'day',   label: 'Hôm nay'    },
            { key: 'week',  label: 'Tuần này'   },
            { key: 'month', label: 'Tháng này'  },
            { key: 'custom',label: 'Tùy chọn'  },
          ] as { key: DateRangeMode; label: string }[]).map(opt => (
            <button
              key={opt.key}
              onClick={() => setRangeMode(opt.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                rangeMode === opt.key
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Custom date inputs */}
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-green-500 text-gray-700"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-green-500 text-gray-700"
              />
            </div>
          )}

          {/* Range label */}
          <span className="ml-auto text-xs text-gray-400">
            {rangeMode === 'day'   && today}
            {rangeMode === 'week'  && `${weekFrom} → ${weekTo}`}
            {rangeMode === 'month' && `${monthFrom} → ${monthTo}`}
            {rangeMode === 'custom' && customFrom && customTo && `${customFrom} → ${customTo}`}
          </span>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm báo cáo..."
              className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
            />
            {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
          </div>

          <div className="relative">
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
                projectFilter ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
              }`}>
              <option value="">Tất cả dự án</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ReportStatus | '')}
              className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
                statusFilter ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
              }`}>
              <option value="">Tất cả trạng thái</option>
              {(Object.entries(STATUS_CFG) as [ReportStatus, typeof STATUS_CFG[ReportStatus]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
          </div>

          {(projectFilter || statusFilter || search) && (
            <button onClick={() => { setProjectFilter(''); setStatusFilter(''); setSearch(''); }}
              className="text-xs text-red-500 hover:text-red-700">
              Xóa filter
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{displayReports.length} báo cáo</span>
        </div>

        {/* Danh sách báo cáo nhóm theo ngày */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
            <FileText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có báo cáo nào</p>
            {viewMode === 'mine' && (
              <button
                onClick={() => { setEditingReport(null); setShowForm(true); }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <Plus size={14} /> Báo cáo ngay
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([key, dayReports]) => {
              const sample = dayReports[0];
              const isCurrentPeriod = isToday(sample.date) && sample.reportPeriod === 'day'
                || (sample.reportPeriod !== 'day' && (() => {
                  const today = new Date().toISOString().split('T')[0];
                  return today >= sample.date && today <= (() => {
                    if (sample.reportPeriod === 'week') {
                      const e = new Date(sample.date + 'T00:00:00'); e.setDate(e.getDate() + 6);
                      return e.toISOString().split('T')[0];
                    }
                    const d = new Date(sample.date + 'T00:00:00');
                    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
                  })();
                })());
              return (
              <div key={key}>
                {/* Period divider */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isCurrentPeriod ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isCurrentPeriod ? `${sample.reportPeriod === 'day' ? '📅' : sample.reportPeriod === 'week' ? '📆' : '🗓️'} ${groupLabel(sample)}` : groupLabel(sample)}
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">{dayReports.length} báo cáo</span>
                </div>

                {/* Cards */}
                <div className="space-y-3">
                  {dayReports.map(report => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      canEdit={report.member === selectedMember && viewMode === 'mine'}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <ReportForm
          member={selectedMember}
          existing={editingReport}
          reportSheet={reportSheet}
          onClose={() => { setShowForm(false); setEditingReport(null); }}
          onSave={report => { handleSave(report); setShowForm(false); setEditingReport(null); }}
        />
      )}
    </div>
  );
}
