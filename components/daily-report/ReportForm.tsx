'use client';
import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, TrendingUp, AlertCircle, Clock, ClipboardList, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { fetchSheetTasks, loadSheetsConfig } from '@/lib/google-sheets';
import type { DailyReport, ReportStatus, ReportPeriod, TaskRow } from '@/lib/types';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function weekInputToMonday(weekVal: string): string {
  const [yearStr, weekStr] = weekVal.split('-W');
  const year = Number(yearStr), week = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const dow  = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dow - 1) + (week - 1) * 7);
  return monday.toISOString().split('T')[0];
}
function dateToWeekInput(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthInputToFirst(monthVal: string): string { return `${monthVal}-01`; }
function dateToMonthInput(dateStr: string): string    { return dateStr.slice(0, 7); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─── Period labels ────────────────────────────────────────────────────────────
const PERIOD_LABELS: Record<ReportPeriod, {
  title: string; dateLabel: string;
  doneLabel: string; nextLabel: string;
  donePlaceholder: string; nextPlaceholder: string;
}> = {
  day: {
    title: 'Báo cáo ngày', dateLabel: 'Ngày báo cáo',
    doneLabel: 'Hôm nay đã làm gì', nextLabel: 'Ngày mai sẽ làm gì',
    donePlaceholder: 'Mô tả công việc đã hoàn thành hôm nay...',
    nextPlaceholder: 'Kế hoạch công việc ngày mai...',
  },
  week: {
    title: 'Báo cáo tuần', dateLabel: 'Tuần báo cáo',
    doneLabel: 'Tuần này đã làm gì', nextLabel: 'Tuần tới sẽ làm gì',
    donePlaceholder: 'Tóm tắt công việc đã thực hiện trong tuần...',
    nextPlaceholder: 'Kế hoạch công việc tuần tới...',
  },
  month: {
    title: 'Báo cáo tháng', dateLabel: 'Tháng báo cáo',
    doneLabel: 'Tháng này đã làm gì', nextLabel: 'Tháng tới sẽ làm gì',
    donePlaceholder: 'Tóm tắt các công việc & thành quả trong tháng...',
    nextPlaceholder: 'Mục tiêu và kế hoạch tháng tới...',
  },
};

// ─── Status options ───────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: ReportStatus; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
  { value: 'on-track',     label: 'Đúng tiến độ', desc: 'Mọi thứ đang đúng kế hoạch',          color: 'green', icon: <TrendingUp size={14} /> },
  { value: 'delayed',      label: 'Có chậm trễ',  desc: 'Tiến độ chậm hơn kế hoạch ban đầu',   color: 'amber', icon: <Clock size={14} /> },
  { value: 'need-support', label: 'Cần hỗ trợ',   desc: 'Đang gặp vấn đề cần được giải quyết', color: 'red',   icon: <AlertCircle size={14} /> },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  member: string;
  onClose: () => void;
  onSave: (report: DailyReport) => void;
  existing?: DailyReport | null;
  reportSheet?: string;
}

export default function ReportForm({ member, onClose, onSave, existing, reportSheet }: Props) {
  // ── State kỳ báo cáo ──
  const [period, setPeriod] = useState<ReportPeriod>(existing?.reportPeriod ?? 'week');
  const [dayVal,   setDayVal]   = useState(existing?.reportPeriod === 'day'   ? existing.date : todayStr());
  const [weekVal,  setWeekVal]  = useState(existing?.reportPeriod === 'week'  ? dateToWeekInput(existing.date)  : dateToWeekInput(todayStr()));
  const [monthVal, setMonthVal] = useState(existing?.reportPeriod === 'month' ? dateToMonthInput(existing.date) : dateToMonthInput(todayStr()));

  // ── Tasks từ sheet cá nhân ──
  const [memberTasks, setMemberTasks] = useState<TaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  // ── Form fields ──
  const [role,         setRole]         = useState(existing?.role ?? '');
  const [reportStatus, setReportStatus] = useState<ReportStatus>(existing?.reportStatus ?? 'on-track');
  const [todayWork,    setTodayWork]    = useState(existing?.todayWork ?? '');
  const [tomorrowPlan, setTomorrowPlan] = useState(existing?.tomorrowPlan ?? '');
  const [blockers,     setBlockers]     = useState(existing?.blockers ?? '');

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load tasks từ sheet thành viên
  useEffect(() => {
    const cfg = loadSheetsConfig();
    if (!cfg?.spreadsheetId || !cfg?.apiKey) return;
    setLoadingTasks(true);
    fetchSheetTasks(cfg.spreadsheetId, cfg.apiKey, member)
      .then(data => setMemberTasks(data))
      .catch(() => setMemberTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [member]);

  // Nếu đang edit — khôi phục task đã chọn
  useEffect(() => {
    if (existing?.taskName && memberTasks.length > 0) {
      const found = memberTasks.find(t => t.task === existing.taskName && t.project === existing.project);
      if (found) setSelectedTask(found);
    }
  }, [existing, memberTasks]);

  function selectTask(task: TaskRow) {
    setSelectedTask(task);
    setRole(task.role ?? '');
    setShowTaskPicker(false);
  }

  function resolvedDate(): string {
    if (period === 'day')   return dayVal;
    if (period === 'week')  return weekVal ? weekInputToMonday(weekVal) : todayStr();
    return monthVal ? monthInputToFirst(monthVal) : todayStr();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTask) { setSaveError('Vui lòng chọn Task cần báo cáo'); return; }
    if (!todayWork.trim()) { setSaveError('Vui lòng điền nội dung đã làm'); return; }
    setSaving(true);
    setSaveError('');

    const report: DailyReport = {
      id:           existing?.id ?? `RPT${Date.now()}`,
      date:         resolvedDate(),
      reportPeriod: period,
      member,
      role:         role.trim() || null,
      taskName:     selectedTask.task,
      project:      selectedTask.project,
      taskStatus:   selectedTask.status ?? null,
      reportStatus,
      todayWork:    todayWork.trim(),
      tomorrowPlan: tomorrowPlan.trim(),
      blockers:     blockers.trim() || null,
      submittedAt:  new Date().toISOString(),
    };

    try {
      const result = await api.saveReport(report, reportSheet ?? 'Báo cáo');
      const savedReport: DailyReport = { ...report, id: result.id ?? report.id, submittedAt: result.submittedAt ?? report.submittedAt };
      onSave(savedReport);
      setSaved(true);
      timerRef.current = setTimeout(() => onClose(), 500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gửi báo cáo thất bại');
    } finally {
      setSaving(false);
    }
  }

  const lbl = PERIOD_LABELS[period];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{existing ? 'Chỉnh sửa báo cáo' : lbl.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{member}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* Kỳ báo cáo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Kỳ báo cáo</label>
            <div className="grid grid-cols-3 gap-2">
              {([{ key: 'day', label: '📅 Ngày' }, { key: 'week', label: '📆 Tuần' }, { key: 'month', label: '🗓️ Tháng' }] as { key: ReportPeriod; label: string }[]).map(opt => (
                <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)}
                  className={`py-2 rounded-xl border-2 text-sm font-medium transition-all ${period === opt.key ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ngày báo cáo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lbl.dateLabel}</label>
            {period === 'day'   && <input type="date"  value={dayVal}   onChange={e => setDayVal(e.target.value)}   className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />}
            {period === 'week'  && <input type="week"  value={weekVal}  onChange={e => setWeekVal(e.target.value)}  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />}
            {period === 'month' && <input type="month" value={monthVal} onChange={e => setMonthVal(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />}
          </div>

          {/* Chọn Task */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tên Task <span className="text-red-500">*</span>
            </label>
            {selectedTask ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800 truncate">{selectedTask.task}</p>
                    <p className="text-xs text-green-600 truncate">{selectedTask.project}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selectedTask.role && <span className="px-1.5 py-0.5 bg-white border border-green-300 rounded text-[11px] font-semibold text-green-700">{selectedTask.role}</span>}
                      {selectedTask.status && <span className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[11px] text-gray-600">{selectedTask.status}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowTaskPicker(true)} className="text-xs text-green-600 hover:text-green-800 shrink-0 underline">Đổi</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowTaskPicker(true)}
                className="w-full flex items-center gap-2 px-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-all">
                <ClipboardList size={16} />
                {loadingTasks ? 'Đang tải task...' : `Chọn Task của ${member}`}
              </button>
            )}
          </div>

          {/* Vai trò */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
            <input type="text" value={role} onChange={e => setRole(e.target.value)}
              placeholder="PO, PMC, ..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
          </div>

          {/* Trạng thái tiến độ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái tiến độ</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setReportStatus(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    reportStatus === opt.value
                      ? opt.color === 'green' ? 'border-green-500 bg-green-50 text-green-700'
                        : opt.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  <span className={reportStatus === opt.value
                    ? opt.color === 'green' ? 'text-green-600' : opt.color === 'amber' ? 'text-amber-600' : 'text-red-600'
                    : 'text-gray-400'}>
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Đã làm gì */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {lbl.doneLabel} <span className="text-red-500">*</span>
            </label>
            <textarea value={todayWork} onChange={e => setTodayWork(e.target.value)} rows={3}
              placeholder={lbl.donePlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 resize-none" />
          </div>

          {/* Sẽ làm gì */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lbl.nextLabel}</label>
            <textarea value={tomorrowPlan} onChange={e => setTomorrowPlan(e.target.value)} rows={2}
              placeholder={lbl.nextPlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 resize-none" />
          </div>

          {/* Vướng mắc */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vướng mắc / Blockers <span className="text-gray-400 font-normal">(nếu có)</span>
            </label>
            <textarea value={blockers} onChange={e => setBlockers(e.target.value)} rows={2}
              placeholder="Mô tả vấn đề đang gặp phải..."
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none bg-amber-50/30" />
          </div>

          {saveError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {saveError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              Hủy
            </button>
            <button type="submit" disabled={saving || saved}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {saved  ? <><CheckCircle size={15} /> Đã gửi!</> :
               saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Đang gửi...</> :
               existing ? 'Lưu thay đổi' : 'Gửi báo cáo'}
            </button>
          </div>
        </form>
      </div>

      {/* Task Picker Modal */}
      {showTaskPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(100vh - 64px)' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">Chọn Task</h3>
                <p className="text-xs text-gray-400 mt-0.5">Task của {member}</p>
              </div>
              <button onClick={() => setShowTaskPicker(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {loadingTasks ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : memberTasks.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">Chưa có task nào trong sheet {member}</p>
              ) : (
                memberTasks.map(task => (
                  <button key={task.id + task.task} onClick={() => selectTask(task)}
                    className={`w-full text-left p-3 rounded-xl border transition-all hover:border-green-400 hover:bg-green-50 ${selectedTask?.task === task.task && selectedTask?.project === task.project ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
                    <p className="text-sm font-semibold text-gray-800 truncate">{task.task}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500 truncate">{task.project}</span>
                      {task.role && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[11px] font-semibold">{task.role}</span>}
                      {task.status && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">{task.status}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
