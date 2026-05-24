'use client';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertCircle, Clock, Users, FileText, BarChart2, RefreshCw, Calendar } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { getReportsFromSheet } from '@/lib/api';
import { useDataSystem } from '@/lib/use-data-system';
import MemberAvatar from '@/components/MemberAvatar';
import { coversToday } from '@/components/daily-report/DailyReportModule';
import type { DailyReport, ReportStatus, ReportPeriod } from '@/lib/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<ReportStatus, string> = {
  'on-track':     'Đúng tiến độ',
  'delayed':      'Có chậm trễ',
  'need-support': 'Cần hỗ trợ',
};
const STATUS_COLOR: Record<ReportStatus, string> = {
  'on-track':     '#22C55E',
  'delayed':      '#F59E0B',
  'need-support': '#EF4444',
};
const STATUS_BG: Record<ReportStatus, string> = {
  'on-track':     'rgba(34,197,94,0.15)',
  'delayed':      'rgba(245,158,11,0.15)',
  'need-support': 'rgba(239,68,68,0.15)',
};

const PERIOD_LABEL: Record<ReportPeriod, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng' };
const CHART_COLORS = ['#4285F4','#34A853','#FBBC05','#EA4335','#9C27B0','#FF6D00','#00BCD4','#795548'];
const TOOLTIP_DEFAULTS = {
  plugins: {
    tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12 } },
    legend:  { labels: { boxWidth: 12, font: { size: 11 }, padding: 12 } },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/** Báo cáo có thuộc kỳ hiện tại của tab không? */
function coversCurrentPeriod(r: DailyReport, tab: ReportPeriod): boolean {
  if (r.reportPeriod !== tab) return false;
  const today = new Date().toISOString().split('T')[0];
  if (tab === 'day') return r.date === today;
  if (tab === 'week') { const [f, t] = getWeekRange(); return r.date >= f && r.date <= t; }
  const [f] = getMonthRange(); return r.date.slice(0, 7) === f.slice(0, 7);
}

/** Sinh dãy ngày trong khoảng [from, to] */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to   + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── UI components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
function ChartCard({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ─── Module ───────────────────────────────────────────────────────────────────
export default function DashboardModule() {
  const { members } = useDataSystem();
  const today = new Date().toISOString().split('T')[0];

  const [reports,  setReports]  = useState<DailyReport[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState<ReportPeriod>('week'); // mặc định Tuần

  const loadReports = useCallback(async () => {
    setLoading(true);
    try { setReports(await getReportsFromSheet()); }
    catch { setReports([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Báo cáo thuộc kỳ đang chọn
  const periodReports = useMemo(
    () => reports.filter(r => coversCurrentPeriod(r, tab)),
    [reports, tab]
  );

  // Báo cáo bao phủ hôm nay (any period, dùng cho KPI "hôm nay")
  const todayReports   = useMemo(() => reports.filter(r => coversToday(r, today)), [reports, today]);
  const reportedToday  = useMemo(() => new Set(todayReports.map(r => r.member)), [todayReports]);

  // ── KPI của kỳ đang chọn ─────────────────────────────────────────────────
  const reportedPeriod = useMemo(() => new Set(periodReports.map(r => r.member)), [periodReports]);
  const avgProgress    = useMemo(() => {
    if (!periodReports.length) return 0;
    return Math.round(periodReports.reduce((s, r) => s + r.progress, 0) / periodReports.length);
  }, [periodReports]);
  const needSupport    = periodReports.filter(r => r.reportStatus === 'need-support').length;
  const delayed        = periodReports.filter(r => r.reportStatus === 'delayed').length;

  // ── Donut: phân bổ trạng thái ────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const counts: Record<ReportStatus, number> = { 'on-track': 0, 'delayed': 0, 'need-support': 0 };
    periodReports.forEach(r => { counts[r.reportStatus]++; });
    return counts;
  }, [periodReports]);

  const donutData = useMemo(() => ({
    labels: (Object.keys(statusDist) as ReportStatus[]).map(k => STATUS_LABEL[k]),
    datasets: [{
      data: Object.values(statusDist),
      backgroundColor: (Object.keys(statusDist) as ReportStatus[]).map(k => STATUS_COLOR[k]),
      borderWidth: 2, borderColor: '#fff',
    }],
  }), [statusDist]);

  // ── Line: xu hướng theo ngày trong kỳ ────────────────────────────────────
  const trendDates = useMemo(() => {
    if (tab === 'day')   return [today];
    if (tab === 'week')  { const [f, t] = getWeekRange();  return dateRange(f, t); }
    const [f, t] = getMonthRange(); return dateRange(f, t);
  }, [tab, today]);

  // Để vẽ trend: dùng TẤT CẢ báo cáo trong khoảng ngày (không lọc period type)
  const trendAllInRange = useMemo(() => {
    const [from, to] = trendDates.length ? [trendDates[0], trendDates[trendDates.length - 1]] : [today, today];
    return reports.filter(r => r.date >= from && r.date <= to);
  }, [reports, trendDates, today]);

  const trendMap = useMemo(() => {
    const map: Record<string, { onTrack: number; delayed: number; needSupport: number }> = {};
    trendDates.forEach(d => { map[d] = { onTrack: 0, delayed: 0, needSupport: 0 }; });
    trendAllInRange.forEach(r => {
      if (!map[r.date]) return;
      if (r.reportStatus === 'on-track')     map[r.date].onTrack++;
      if (r.reportStatus === 'delayed')      map[r.date].delayed++;
      if (r.reportStatus === 'need-support') map[r.date].needSupport++;
    });
    return map;
  }, [trendDates, trendAllInRange]);

  const lineData = useMemo(() => ({
    labels: trendDates.map(d =>
      new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    ),
    datasets: [
      { label: 'Đúng tiến độ', data: trendDates.map(d => trendMap[d]?.onTrack ?? 0),
        borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.4, fill: true, pointRadius: 4 },
      { label: 'Chậm trễ',     data: trendDates.map(d => trendMap[d]?.delayed ?? 0),
        borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: true, pointRadius: 4 },
      { label: 'Cần hỗ trợ',   data: trendDates.map(d => trendMap[d]?.needSupport ?? 0),
        borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)', tension: 0.4, fill: true, pointRadius: 4 },
    ],
  }), [trendDates, trendMap]);

  // ── Bar: tiến độ TB per member ────────────────────────────────────────────
  const memberStats = useMemo(() =>
    members.map(m => {
      const mReports = periodReports.filter(r => r.member === m.name);
      const avg = mReports.length
        ? Math.round(mReports.reduce((s, r) => s + r.progress, 0) / mReports.length) : 0;
      const latest = [...mReports].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      return { name: m.name, avg, count: mReports.length, latest };
    })
  , [periodReports, members]);

  const progressBarData = useMemo(() => ({
    labels: memberStats.map(m => m.name),
    datasets: [{
      label: 'Tiến độ TB (%)',
      data: memberStats.map(m => m.avg),
      backgroundColor: memberStats.map(m =>
        m.avg >= 80 ? 'rgba(34,197,94,0.8)' : m.avg >= 50 ? 'rgba(59,130,246,0.8)' : 'rgba(245,158,11,0.8)'
      ),
      borderRadius: 6,
    }],
  }), [memberStats]);

  // ── Bar: số BC per project ────────────────────────────────────────────────
  const projectStats = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    periodReports.forEach(r => {
      if (!map[r.project]) map[r.project] = { count: 0, total: 0 };
      map[r.project].count++;
      map[r.project].total += r.progress;
    });
    return Object.entries(map)
      .map(([project, v]) => ({ project, count: v.count, avgProgress: Math.round(v.total / v.count) }))
      .sort((a, b) => b.count - a.count);
  }, [periodReports]);

  const projectBarData = useMemo(() => ({
    labels: projectStats.map(p => p.project.length > 20 ? p.project.slice(0, 18) + '…' : p.project),
    datasets: [{
      label: 'Số báo cáo',
      data: projectStats.map(p => p.count),
      backgroundColor: CHART_COLORS.slice(0, projectStats.length).map(c => c + 'CC'),
      borderRadius: 6,
    }],
  }), [projectStats]);

  // ── Kỳ label ─────────────────────────────────────────────────────────────
  const periodRangeLabel = useMemo(() => {
    if (tab === 'day') return today;
    if (tab === 'week') { const [f, t] = getWeekRange(); return `${f} → ${t}`; }
    const [f, t] = getMonthRange(); return `${f} → ${t}`;
  }, [tab, today]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Period tabs ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar size={15} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Xem theo kỳ:</span>
        <div className="flex items-center gap-1.5">
          {(['day', 'week', 'month'] as ReportPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setTab(p)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === p ? 'bg-green-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{periodRangeLabel}</span>
        <button
          onClick={loadReports} disabled={loading}
          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
          title="Tải lại"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={`Đã báo cáo ${PERIOD_LABEL[tab].toLowerCase()}`}
          value={`${reportedPeriod.size}/${members.length}`}
          sub={periodRangeLabel}
          icon={<Users size={18} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          label="Tiến độ trung bình"
          value={`${avgProgress}%`}
          sub={`${periodReports.length} báo cáo`}
          icon={<TrendingUp size={18} className="text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          label="Có chậm trễ"
          value={delayed}
          sub={PERIOD_LABEL[tab].toLowerCase() + ' này'}
          icon={<Clock size={18} className="text-amber-600" />}
          color="bg-amber-50"
        />
        <StatCard
          label="Cần hỗ trợ"
          value={needSupport}
          sub={PERIOD_LABEL[tab].toLowerCase() + ' này'}
          icon={<AlertCircle size={18} className={needSupport > 0 ? 'text-red-600' : 'text-gray-400'} />}
          color={needSupport > 0 ? 'bg-red-50' : 'bg-gray-50'}
        />
      </div>

      {/* ── Row 1: Donut + Line ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`Phân bổ trạng thái — ${PERIOD_LABEL[tab].toLowerCase()} này`}>
          {loading ? (
            <div className="flex items-center justify-center h-[220px]">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : periodReports.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
              Chưa có dữ liệu
            </div>
          ) : (
            <>
              <div style={{ height: 220 }}>
                <Doughnut
                  data={donutData}
                  options={{
                    responsive: true, maintainAspectRatio: false, ...TOOLTIP_DEFAULTS,
                    plugins: {
                      ...TOOLTIP_DEFAULTS.plugins,
                      legend: { position: 'right' as const, labels: { boxWidth: 12, font: { size: 12 }, padding: 14 } },
                    },
                    cutout: '62%',
                  }}
                />
              </div>
              <div className="flex gap-4 mt-3 justify-center flex-wrap">
                {(Object.entries(statusDist) as [ReportStatus, number][]).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[k] }} />
                    <span>{STATUS_LABEL[k]}: <strong>{v}</strong></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title={`Xu hướng báo cáo — ${PERIOD_LABEL[tab].toLowerCase()} này`}>
          {loading ? (
            <div className="flex items-center justify-center h-[220px]">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Line
                data={lineData}
                options={{
                  responsive: true, maintainAspectRatio: false, ...TOOLTIP_DEFAULTS,
                  plugins: {
                    ...TOOLTIP_DEFAULTS.plugins,
                    legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
                  },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                    x: { ticks: { font: { size: 11 }, maxRotation: tab === 'month' ? 45 : 0 }, grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Progress per member + per project ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`Tiến độ TB theo thành viên — ${PERIOD_LABEL[tab].toLowerCase()} này`}>
          {loading ? (
            <div className="flex items-center justify-center h-[220px]">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Bar
                data={progressBarData}
                options={{
                  responsive: true, maintainAspectRatio: false, indexAxis: 'y' as const, ...TOOLTIP_DEFAULTS,
                  plugins: { ...TOOLTIP_DEFAULTS.plugins, legend: { display: false } },
                  scales: {
                    x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                    y: { ticks: { font: { size: 12 } }, grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title={`Số báo cáo theo dự án — ${PERIOD_LABEL[tab].toLowerCase()} này`}>
          {loading || projectStats.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
              {loading ? <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> : 'Chưa có dữ liệu'}
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Bar
                data={projectBarData}
                options={{
                  responsive: true, maintainAspectRatio: false, ...TOOLTIP_DEFAULTS,
                  plugins: { ...TOOLTIP_DEFAULTS.plugins, legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#F3F4F6' } },
                    x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                  },
                }}
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Member detail table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart2 size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">Chi tiết thành viên — {PERIOD_LABEL[tab].toLowerCase()} này</h3>
          <span className="ml-auto text-xs text-gray-400">Tổng {periodReports.length} báo cáo</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Thành viên</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Báo cáo</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Tiến độ TB</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{PERIOD_LABEL[tab]} này</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Dự án gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : memberStats.map(m => {
                const periodStatus = periodReports.find(r => r.member === m.name)?.reportStatus ?? null;
                const hasPeriod = reportedPeriod.has(m.name);
                const progressColor = m.avg >= 80 ? 'bg-green-500' : m.avg >= 50 ? 'bg-blue-500' : 'bg-amber-400';
                return (
                  <tr key={m.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar name={m.name} size="md" />
                        <span className="font-medium text-gray-800 text-sm">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-gray-700">{m.count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${m.avg}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 w-8 text-right">{m.avg}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {hasPeriod && periodStatus ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: STATUS_BG[periodStatus], color: STATUS_COLOR[periodStatus] }}
                        >
                          {STATUS_LABEL[periodStatus]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Chưa báo cáo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.latest ? (
                        <span className="text-xs text-gray-600 truncate block max-w-[200px]">{m.latest.project}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Row 4: Project breakdown ── */}
      {projectStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileText size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-800">Tiến độ theo dự án — {PERIOD_LABEL[tab].toLowerCase()} này</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {projectStats.map((p, i) => (
              <div key={p.project} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{p.project}</span>
                <span className="text-xs text-gray-500 shrink-0">{p.count} báo cáo</span>
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${p.avgProgress}%`,
                        backgroundColor: p.avgProgress >= 80 ? '#22C55E' : p.avgProgress >= 50 ? '#3B82F6' : '#F59E0B',
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 w-8 text-right">{p.avgProgress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
