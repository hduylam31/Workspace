'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TrendingUp, AlertCircle, Clock, FileText,
  ChevronDown, Users, Calendar, RefreshCw,
} from 'lucide-react';
import { useDataSystem } from '@/lib/use-data-system';
import { getReportsFromSheet } from '@/lib/api';
import MemberAvatar from '@/components/MemberAvatar';
import { coversToday } from '@/components/daily-report/DailyReportModule';
import type { DailyReport, ReportStatus, ReportPeriod } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ReportStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode; dot: string }> = {
  'on-track':     { label: 'Đúng tiến độ', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', icon: <TrendingUp size={12} />, dot: 'bg-green-500' },
  'delayed':      { label: 'Có chậm trễ',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', icon: <Clock size={12} />,       dot: 'bg-amber-400' },
  'need-support': { label: 'Cần hỗ trợ',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   icon: <AlertCircle size={12} />, dot: 'bg-red-500'   },
};

const PERIOD_LABEL: Record<ReportPeriod, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng' };
const PERIOD_DONE_LABEL: Record<ReportPeriod, string> = { day: 'Đã làm hôm nay', week: 'Tuần này đã làm', month: 'Tháng này đã làm' };

function getWeekRange(d = new Date()): [string, string] {
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]];
}

function getMonthRange(d = new Date()): [string, string] {
  const y = d.getFullYear(), m = d.getMonth();
  return [
    new Date(y, m, 1).toISOString().split('T')[0],
    new Date(y, m + 1, 0).toISOString().split('T')[0],
  ];
}

function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatPeriodHeader(dateStr: string, period: ReportPeriod): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (period === 'day') {
    return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (period === 'week') {
    const end = new Date(d); end.setDate(d.getDate() + 6);
    const wk = getISOWeek(dateStr);
    const from = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const to   = end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return `Tuần ${wk} · ${from} – ${to}/${d.getFullYear()}`;
  }
  return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

/** Quy đổi trạng thái tiến độ sang điểm số 0-100 để hiển thị thanh tiến độ */
function statusScore(status: ReportStatus): number {
  return status === 'on-track' ? 100 : status === 'delayed' ? 50 : 0;
}

/** Báo cáo có thuộc kỳ hiện tại của tab không? (overlap — báo cáo tuần/tháng có thể bắt đầu trước kỳ hiện tại) */
function coversCurrentPeriod(r: DailyReport, tab: ReportPeriod): boolean {
  if (r.reportPeriod !== tab) return false;
  const today = new Date().toISOString().split('T')[0];
  if (tab === 'day') return r.date === today;

  let from: string, to: string, coverEnd: string;
  if (tab === 'week') {
    [from, to] = getWeekRange();
    const d = new Date(r.date + 'T00:00:00'); d.setDate(d.getDate() + 6);
    coverEnd = d.toISOString().split('T')[0];
  } else {
    [from, to] = getMonthRange();
    const d = new Date(r.date + 'T00:00:00');
    coverEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  }
  return r.date <= to && coverEnd >= from;
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-blue-500' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-gray-500 w-7 text-right">{value}%</span>
    </div>
  );
}

// ─── Mini report card ─────────────────────────────────────────────────────────
function MiniReportCard({ report }: { report: DailyReport }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border bg-white overflow-hidden ${
      report.reportStatus === 'need-support' ? 'border-red-200' :
      report.reportStatus === 'delayed' ? 'border-amber-200' : 'border-gray-200'
    }`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <MemberAvatar name={report.member} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{report.member}</span>
            {report.role && report.role.split(',').map(r => r.trim()).filter(Boolean).map(r => (
              <span key={r} className="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-semibold">{r}</span>
            ))}
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full truncate max-w-[180px]">
              {report.project}
            </span>
            <StatusBadge status={report.reportStatus} />
          </div>
          <div className="mt-1.5">
            <ProgressBar value={statusScore(report.reportStatus)} />
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">📋 Kế hoạch tiếp theo</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{report.tomorrowPlan}</p>
            </div>
          )}
          {report.blockers && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">⚠️ Vướng mắc / Blockers</p>
              <p className="text-sm text-amber-800 whitespace-pre-line leading-relaxed">{report.blockers}</p>
            </div>
          )}
          {report.submittedAt && (
            <p className="text-xs text-gray-400">
              Gửi lúc {new Date(report.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Module chính ─────────────────────────────────────────────────────────────
export default function OverviewModule() {
  const { members } = useDataSystem();
  const today = new Date().toISOString().split('T')[0];

  const [reports, setReports]   = useState<DailyReport[]>([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<ReportPeriod>('week'); // mặc định Tuần

  const loadReports = useCallback(async () => {
    setLoading(true);
    try { setReports(await getReportsFromSheet()); }
    catch { setReports([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Báo cáo thuộc tab hiện tại (kỳ đang chọn)
  const periodReports = useMemo(
    () => reports.filter(r => coversCurrentPeriod(r, tab)),
    [reports, tab]
  );

  // Per-member: lấy báo cáo mới nhất trong kỳ
  const memberReport = useMemo(() => {
    const map: Record<string, DailyReport> = {};
    periodReports.forEach(r => {
      if (!map[r.member] || r.submittedAt > map[r.member].submittedAt) map[r.member] = r;
    });
    return map;
  }, [periodReports]);

  const reportedSet   = useMemo(() => new Set(Object.keys(memberReport)), [memberReport]);
  const needSupport   = periodReports.filter(r => r.reportStatus === 'need-support').length;
  const delayed       = periodReports.filter(r => r.reportStatus === 'delayed').length;
  const onTrack       = periodReports.filter(r => r.reportStatus === 'on-track').length;
  const notReported   = members.filter(m => !reportedSet.has(m.name));

  // Timeline: nhóm theo period+date
  const grouped = useMemo(() => {
    const sorted = [...periodReports].sort((a, b) =>
      b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt)
    );
    const g: Record<string, DailyReport[]> = {};
    sorted.forEach(r => {
      const k = `${r.reportPeriod}::${r.date}`;
      if (!g[k]) g[k] = [];
      g[k].push(r);
    });
    return g;
  }, [periodReports]);

  // Label kỳ đang xem
  const periodRangeLabel = useMemo(() => {
    if (tab === 'day') return today;
    if (tab === 'week') {
      const [wFrom, wTo] = getWeekRange();
      return `${wFrom} → ${wTo}`;
    }
    const [mFrom, mTo] = getMonthRange();
    return `${mFrom} → ${mTo}`;
  }, [tab, today]);

  return (
    <div className="space-y-5">

      {/* ── 3 Tab: Ngày / Tuần / Tháng ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar size={15} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Xem theo kỳ:</span>
        <div className="flex items-center gap-1.5">
          {(['day', 'week', 'month'] as ReportPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setTab(p)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === p
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{periodRangeLabel}</span>
        <button
          onClick={loadReports}
          disabled={loading}
          title="Tải lại"
          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Đã báo cáo */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Đã báo cáo</span>
            <Users size={15} className="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {reportedSet.size}<span className="text-base font-normal text-gray-400">/{members.length}</span>
          </p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${members.length ? (reportedSet.size / members.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{PERIOD_LABEL[tab]} này</p>
        </div>

        {/* Đúng tiến độ */}
        <div className="bg-white rounded-xl border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Đúng tiến độ</span>
            <TrendingUp size={15} className="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-700">{onTrack}</p>
          <p className="text-xs text-gray-400 mt-1">báo cáo {PERIOD_LABEL[tab].toLowerCase()}</p>
        </div>

        {/* Chậm tiến độ */}
        <div className="bg-white rounded-xl border border-amber-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chậm tiến độ</span>
            <Clock size={15} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600">{delayed}</p>
          <p className="text-xs text-gray-400 mt-1">báo cáo {PERIOD_LABEL[tab].toLowerCase()}</p>
        </div>

        {/* Cần hỗ trợ */}
        <div className={`bg-white rounded-xl border p-4 ${needSupport > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cần hỗ trợ</span>
            <AlertCircle size={15} className={needSupport > 0 ? 'text-red-500' : 'text-gray-300'} />
          </div>
          <p className={`text-2xl font-bold ${needSupport > 0 ? 'text-red-600' : 'text-gray-900'}`}>{needSupport}</p>
          <p className="text-xs text-gray-400 mt-1">báo cáo {PERIOD_LABEL[tab].toLowerCase()}</p>
        </div>
      </div>

      {/* ── Trạng thái thành viên ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Users size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Trạng thái {PERIOD_LABEL[tab].toLowerCase()} này</h3>
          <span className="ml-auto text-xs text-gray-400">{periodRangeLabel}</span>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : members.map(m => {
            const mReport   = memberReport[m.name];
            const hasReport = !!mReport;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <MemberAvatar name={m.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.name}</p>
                  {mReport && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{mReport.project}</p>
                  )}
                </div>
                {hasReport && mReport ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 hidden sm:block">
                      <ProgressBar value={statusScore(mReport.reportStatus)} />
                    </div>
                    <StatusBadge status={mReport.reportStatus} />
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
                    Chưa báo cáo
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {!loading && notReported.length > 0 && (
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center gap-2">
            <span className="text-xs text-amber-700">
              ⚠️ Chưa báo cáo {PERIOD_LABEL[tab].toLowerCase()}:&nbsp;
              <strong>{notReported.map(m => m.name).join(', ')}</strong>
            </span>
          </div>
        )}
        {!loading && notReported.length === 0 && members.length > 0 && (
          <div className="px-4 py-2.5 bg-green-50 border-t border-green-100">
            <span className="text-xs text-green-700">✅ Tất cả thành viên đã báo cáo {PERIOD_LABEL[tab].toLowerCase()} này!</span>
          </div>
        )}
      </div>

      {/* ── Timeline báo cáo ── */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Báo cáo {PERIOD_LABEL[tab].toLowerCase()} này</h3>
          <span className="ml-auto text-xs text-gray-400">{periodReports.length} báo cáo</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
            <FileText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có báo cáo {PERIOD_LABEL[tab].toLowerCase()} nào</p>
          </div>
        ) : (
          Object.entries(grouped).map(([key, groupReports]) => {
            const sample = groupReports[0];
            return (
              <div key={key}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-green-600 text-white whitespace-nowrap">
                    {tab === 'day' ? '📅' : tab === 'week' ? '📆' : '🗓️'} {formatPeriodHeader(sample.date, sample.reportPeriod)}
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{groupReports.length} báo cáo</span>
                </div>
                <div className="space-y-3">
                  {groupReports.map(report => (
                    <MiniReportCard key={report.id} report={report} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
