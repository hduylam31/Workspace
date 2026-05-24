'use client';
import { useState, useRef } from 'react';
import { X, CheckCircle, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { useDataSystem } from '@/lib/use-data-system';
import { api } from '@/lib/api';
import Combobox from '@/components/Combobox';
import type { DailyReport, ReportStatus, ReportPeriod } from '@/lib/types';

// ─── Helpers chuyển đổi ngày ──────────────────────────────────────────────────

/** "2026-W21" → "2026-05-18" (thứ Hai của tuần đó) */
function weekInputToMonday(weekVal: string): string {
  const [yearStr, weekStr] = weekVal.split('-W');
  const year = Number(yearStr), week = Number(weekStr);
  const jan4 = new Date(year, 0, 4); // 4/1 luôn nằm trong tuần 1 ISO
  const dow  = jan4.getDay() || 7;   // 1=Mon..7=Sun
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dow - 1) + (week - 1) * 7);
  return monday.toISOString().split('T')[0];
}

/** "2026-05-18" → "2026-W21" */
function dateToWeekInput(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);           // đến thứ Năm (ISO week rule)
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** "2026-05" → "2026-05-01" */
function monthInputToFirst(monthVal: string): string {
  return `${monthVal}-01`;
}

/** "2026-05-01" → "2026-05" */
function dateToMonthInput(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─── Labels theo kỳ báo cáo ───────────────────────────────────────────────────
const PERIOD_LABELS: Record<ReportPeriod, {
  title: string; dateLabel: string;
  doneLabel: string; nextLabel: string;
  donePlaceholder: string; nextPlaceholder: string;
}> = {
  day: {
    title: 'Báo cáo ngày',      dateLabel: 'Ngày báo cáo',
    doneLabel: 'Hôm nay đã làm gì',     nextLabel: 'Ngày mai sẽ làm gì',
    donePlaceholder: 'Mô tả công việc đã hoàn thành hôm nay...',
    nextPlaceholder: 'Kế hoạch công việc ngày mai...',
  },
  week: {
    title: 'Báo cáo tuần',      dateLabel: 'Tuần báo cáo',
    doneLabel: 'Tuần này đã làm gì',    nextLabel: 'Tuần tới sẽ làm gì',
    donePlaceholder: 'Tóm tắt công việc đã thực hiện trong tuần...',
    nextPlaceholder: 'Kế hoạch công việc tuần tới...',
  },
  month: {
    title: 'Báo cáo tháng',     dateLabel: 'Tháng báo cáo',
    doneLabel: 'Tháng này đã làm gì',   nextLabel: 'Tháng tới sẽ làm gì',
    donePlaceholder: 'Tóm tắt các công việc & thành quả trong tháng...',
    nextPlaceholder: 'Mục tiêu và kế hoạch tháng tới...',
  },
};

// ─── Status options ────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: ReportStatus; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
  { value: 'on-track',     label: 'Đúng tiến độ', desc: 'Mọi thứ đang đúng kế hoạch',           color: 'green', icon: <TrendingUp size={14} /> },
  { value: 'delayed',      label: 'Có chậm trễ',  desc: 'Tiến độ chậm hơn kế hoạch ban đầu',    color: 'amber', icon: <Clock size={14} /> },
  { value: 'need-support', label: 'Cần hỗ trợ',   desc: 'Đang gặp vấn đề cần được giải quyết',  color: 'red',   icon: <AlertCircle size={14} /> },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  member: string;
  onClose: () => void;
  onSave: (report: DailyReport) => void;
  existing?: DailyReport | null;
  reportSheet?: string;
}

/** Parse "PO, DA" → ['PO','DA'] */
function parseRoles(r: string | null | undefined): string[] {
  if (!r) return [];
  return r.split(',').map(x => x.trim()).filter(Boolean);
}

export default function ReportForm({ member, onClose, onSave, existing, reportSheet }: Props) {
  const { projects, roles, loading: dsLoading } = useDataSystem();

  const [period, setPeriod] = useState<ReportPeriod>(existing?.reportPeriod ?? 'day');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(parseRoles(existing?.role));

  function toggleRole(r: string) {
    setSelectedRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  // date inputs — lưu theo format của input tương ứng
  const [dayVal,   setDayVal]   = useState(existing?.date ? (existing.reportPeriod === 'day' ? existing.date : todayStr()) : todayStr());
  const [weekVal,  setWeekVal]  = useState(existing?.date ? (existing.reportPeriod === 'week'  ? dateToWeekInput(existing.date)  : dateToWeekInput(todayStr())) : dateToWeekInput(todayStr()));
  const [monthVal, setMonthVal] = useState(existing?.date ? (existing.reportPeriod === 'month' ? dateToMonthInput(existing.date) : dateToMonthInput(todayStr())) : dateToMonthInput(todayStr()));

  const [form, setForm] = useState({
    project:      existing?.project      ?? '',
    progress:     existing?.progress     ?? 50,
    reportStatus: existing?.reportStatus ?? 'on-track' as ReportStatus,
    todayWork:    existing?.todayWork    ?? '',
    tomorrowPlan: existing?.tomorrowPlan ?? '',
    blockers:     existing?.blockers     ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function set<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  // Ngày đầu kỳ (YYYY-MM-DD) tính từ input hiện tại
  function resolvedDate(): string {
    if (period === 'day')   return dayVal;
    if (period === 'week')  return weekVal ? weekInputToMonday(weekVal) : todayStr();
    return monthVal ? monthInputToFirst(monthVal) : todayStr();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project || !form.todayWork) return;
    setSaving(true);
    setSaveError('');

    const report: DailyReport = {
      id:           existing?.id ?? `RPT${Date.now()}`,
      date:         resolvedDate(),
      reportPeriod: period,
      member,
      role:         selectedRoles.length > 0 ? selectedRoles.join(', ') : null,
      project:      form.project,
      progress:     form.progress,
      reportStatus: form.reportStatus,
      todayWork:    form.todayWork,
      tomorrowPlan: form.tomorrowPlan,
      blockers:     form.blockers.trim() || null,
      submittedAt:  new Date().toISOString(),
    };

    try {
      const result = await api.saveReport(report, reportSheet ?? 'Báo cáo');
      // Cập nhật id/submittedAt từ server nếu có
      const savedReport: DailyReport = {
        ...report,
        id:          result.id ?? report.id,
        submittedAt: result.submittedAt ?? report.submittedAt,
      };
      onSave(savedReport);
      setSaved(true);
      timerRef.current = setTimeout(() => onClose(), 500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gửi báo cáo thất bại');
    } finally {
      setSaving(false);
    }
  }

  const lbl       = PERIOD_LABELS[period];
  const statusCfg = STATUS_OPTIONS.find(s => s.value === form.reportStatus)!;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              {existing ? 'Chỉnh sửa báo cáo' : lbl.title}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{member}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* ── Chọn kỳ báo cáo ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Kỳ báo cáo</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'day',   label: '📅 Ngày'  },
                { key: 'week',  label: '📆 Tuần'  },
                { key: 'month', label: '🗓️ Tháng' },
              ] as { key: ReportPeriod; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  className={`py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                    period === opt.key
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Kỳ + Dự án ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{lbl.dateLabel}</label>
              {period === 'day' && (
                <input type="date" value={dayVal} onChange={e => setDayVal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
              )}
              {period === 'week' && (
                <input type="week" value={weekVal} onChange={e => setWeekVal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
              )}
              {period === 'month' && (
                <input type="month" value={monthVal} onChange={e => setMonthVal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dự án <span className="text-red-500">*</span>
              </label>
              <Combobox
                value={form.project}
                onChange={v => set('project', v)}
                options={projects}
                placeholder="Chọn dự án..."
                allowFreeText={true}
                loading={dsLoading}
                required
              />
            </div>
          </div>

          {/* ── Vai trò — multi-select ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Vai trò
              <span className="ml-1.5 text-xs font-normal text-gray-400">(chọn nhiều)</span>
            </label>
            {dsLoading ? (
              <div className="flex gap-2">
                {[1,2,3,4].map(i => <div key={i} className="h-7 w-14 bg-gray-100 rounded-full animate-pulse" />)}
              </div>
            ) : roles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Chưa có dữ liệu vai trò</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map(r => {
                  const active = selectedRoles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                        active
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedRoles.length > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                Đã chọn: <span className="font-medium text-green-700">{selectedRoles.join(', ')}</span>
              </p>
            )}
          </div>

          {/* ── Trạng thái tiến độ ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái tiến độ</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('reportStatus', opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.reportStatus === opt.value
                      ? opt.color === 'green' ? 'border-green-500 bg-green-50 text-green-700'
                        : opt.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className={form.reportStatus === opt.value
                    ? opt.color === 'green' ? 'text-green-600' : opt.color === 'amber' ? 'text-amber-600' : 'text-red-600'
                    : 'text-gray-400'}>
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{statusCfg.desc}</p>
          </div>

          {/* ── % Hoàn thành ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">% Hoàn thành dự án</label>
              <span className={`text-sm font-bold tabular-nums ${
                form.progress >= 80 ? 'text-green-600' : form.progress >= 50 ? 'text-blue-600' : 'text-amber-600'
              }`}>{form.progress}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={form.progress}
              onChange={e => set('progress', Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-green-600 [&::-webkit-slider-thumb]:cursor-pointer"
              style={{ background: `linear-gradient(to right, #16a34a ${form.progress}%, #e5e7eb ${form.progress}%)` }}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          {/* ── Đã làm gì ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {lbl.doneLabel} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.todayWork}
              onChange={e => set('todayWork', e.target.value)}
              rows={3}
              placeholder={lbl.donePlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 resize-none"
              required
            />
          </div>

          {/* ── Kế hoạch tiếp theo ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lbl.nextLabel}</label>
            <textarea
              value={form.tomorrowPlan}
              onChange={e => set('tomorrowPlan', e.target.value)}
              rows={2}
              placeholder={lbl.nextPlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 resize-none"
            />
          </div>

          {/* ── Vướng mắc ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vướng mắc / Blockers
              <span className="text-gray-400 font-normal ml-1">(nếu có)</span>
            </label>
            <textarea
              value={form.blockers}
              onChange={e => set('blockers', e.target.value)}
              rows={2}
              placeholder="Mô tả vấn đề đang gặp phải..."
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 resize-none bg-amber-50/30"
            />
          </div>

          {/* ── Error ── */}
          {saveError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ {saveError}
            </div>
          )}

          {/* ── Buttons ── */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
              Hủy
            </button>
            <button type="submit" disabled={saving || saved}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saved   ? <><CheckCircle size={15} /> Đã gửi!</> :
               saving  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Đang gửi...</> :
               existing ? 'Lưu thay đổi' : 'Gửi báo cáo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
