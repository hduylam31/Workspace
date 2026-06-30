'use client';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { loadSheetsConfig } from '@/lib/google-sheets';
import type { ITTaskRow } from '@/lib/types';

const MONTHS = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026', '06/2026',
  '07/2026', '08/2026', '09/2026', '10/2026', '11/2026', '12/2026'];

const CURRENT_MONTH = (() => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
})();

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  High:   { bg: '#FEE2E2', text: '#B91C1C' },
  Medium: { bg: '#FEF3C7', text: '#B45309' },
  Low:    { bg: '#DCFCE7', text: '#15803D' },
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  'Go live':         { bg: '#DCFCE7', text: '#15803D' },
  'Golive':          { bg: '#DCFCE7', text: '#15803D' },
  'Đang dev':        { bg: '#FED7AA', text: '#C2410C' },
  'Nghiệm thu':      { bg: '#EDE9FE', text: '#6D28D9' },
  'Chuẩn bị làm':   { bg: '#FEF9C3', text: '#854D0E' },
  'In progress':     { bg: '#DBEAFE', text: '#1D4ED8' },
  'Done':            { bg: '#D1FAE5', text: '#065F46' },
  'Pending':         { bg: '#F3F4F6', text: '#6B7280' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={s ? { backgroundColor: s.bg, color: s.text } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
    >
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
      style={s ? { backgroundColor: s.bg, color: s.text } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
    >
      {priority}
    </span>
  );
}

function LinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
    >
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 10H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/>
        <path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4.02 4.02 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z"/>
      </svg>
      {label}
    </a>
  );
}

function NoteCell({ text }: { text: string | null }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className="text-xs text-gray-600 block max-w-[140px] truncate cursor-default"
      title={text}
    >
      {text}
    </span>
  );
}

export default function ITTrackerModule() {
  const [activeMonth, setActiveMonth] = useState(CURRENT_MONTH);
  const [allTasks, setAllTasks] = useState<ITTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [lastSync, setLastSync] = useState(new Date());
  const [isFromSheet, setIsFromSheet] = useState(false);

  const config = typeof window !== 'undefined' ? loadSheetsConfig() : null;

  useEffect(() => {
    api.getITTasks()
      .then(data => {
        const hasSheet = !!(config?.itTrackerSheets?.length || config?.itTrackerSheet);
        setAllTasks(data ?? []);
        setIsFromSheet(hasSheet && data.length > 0);
        setLastSync(new Date());
      })
      .catch(() => {
        setAllTasks([]);
        setIsFromSheet(false);
      })
      .finally(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthTasks = useMemo(() => allTasks.filter(t => t.month === activeMonth), [allTasks, activeMonth]);

  const filtered = useMemo(() => monthTasks.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  }), [monthTasks, statusFilter, priorityFilter]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    monthTasks.forEach(t => { counts[t.status] = (counts[t.status] ?? 0) + 1; });
    return counts;
  }, [monthTasks]);

  const monthsWithTasks = useMemo(() => {
    const s = new Set(allTasks.map(t => t.month));
    return MONTHS.filter(m => s.has(m) || m === CURRENT_MONTH);
  }, [allTasks]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sheet status banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
        isFromSheet
          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
          : 'bg-gray-50 border-gray-200 text-gray-500'
      }`}>
        <span>{isFromSheet ? '✅' : '📋'}</span>
        <span className="flex-1">
          {isFromSheet ? (
            <>
              Đang đọc từ Spreadsheet IT Tracker
              {config?.itTrackerSpreadsheetId && (
                <span className="font-mono ml-1 opacity-70">({config.itTrackerSpreadsheetId.slice(0, 16)}…)</span>
              )}
              {' · '}
              {(() => {
                const sheets = config?.itTrackerSheets?.length
                  ? config.itTrackerSheets
                  : config?.itTrackerSheet ? [config.itTrackerSheet] : [];
                return sheets.length > 1
                  ? <><strong>{sheets.length} sheets</strong> ({sheets[0]}–{sheets[sheets.length - 1]})</>
                  : sheets.length === 1
                    ? <>Sheet <strong>{sheets[0]}</strong></>
                    : null;
              })()}
              {' · '}{allTasks.length} task
            </>
          ) : (
            <>Đang xem dữ liệu mock · Cấu hình Spreadsheet IT Tracker riêng trong <strong>Kết nối Sheets</strong></>
          )}
        </span>
        {isFromSheet && (
          <span className="ml-auto text-indigo-400 shrink-0">
            {lastSync.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Month tabs */}
        <div className="overflow-x-auto border-b border-gray-200">
          <div className="flex min-w-max">
            {monthsWithTasks.map(m => (
              <button
                key={m}
                onClick={() => setActiveMonth(m)}
                className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                  activeMonth === m
                    ? 'border-green-600 text-green-700 bg-green-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m}
                {m === CURRENT_MONTH && <span className="ml-1 text-[10px] text-green-500">●</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Info bar */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">Tháng {activeMonth}</span>
          <span className="text-gray-300">|</span>
          <span>{monthTasks.length} task</span>
          {Object.entries(summary).map(([s, c]) => {
            const st = STATUS_STYLE[s];
            return (
              <span
                key={s}
                className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                style={st ? { backgroundColor: st.bg, color: st.text } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
              >
                {s}: {c}
              </span>
            );
          })}
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 font-medium mr-1">Lọc:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-green-500 bg-white"
          >
            <option value="">Tất cả Status</option>
            {[...new Set(monthTasks.map(t => t.status))].sort().map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-green-500 bg-white"
          >
            <option value="">Tất cả Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          {(statusFilter || priorityFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              ✕ Xoá filter
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {filtered.length !== monthTasks.length ? `${filtered.length} / ` : ''}{monthTasks.length} task
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#34A853' }}>
                {[
                  { label: 'Task ID',      cls: 'w-[110px] pl-4' },
                  { label: 'STT',          cls: 'w-10 text-center' },
                  { label: 'Task',         cls: 'min-w-[200px]' },
                  { label: 'Priority',     cls: 'w-24 text-center' },
                  { label: 'PRD Link',     cls: 'w-24 text-center' },
                  { label: 'Design Link',  cls: 'w-28 text-center' },
                  { label: 'Status',       cls: 'w-36' },
                  { label: 'IT Review',    cls: 'w-24 text-center' },
                  { label: 'Timeline',     cls: 'w-24 text-center' },
                  { label: 'PM Note',      cls: 'w-[150px]' },
                  { label: 'IT Note',      cls: 'w-[150px] pr-4' },
                ].map(col => (
                  <th
                    key={col.label}
                    className={`py-2.5 px-3 text-xs font-semibold text-white uppercase tracking-wide text-left whitespace-nowrap ${col.cls}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, idx) => (
                <tr
                  key={task.taskId}
                  className={`border-b border-gray-100 transition-colors hover:bg-green-50/40 ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                >
                  {/* Task ID */}
                  <td className="px-3 pl-4 py-2.5">
                    <span className="text-[11px] font-mono text-gray-400 select-all">{task.taskId}</span>
                  </td>
                  {/* STT */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-xs text-gray-500">{task.stt}</span>
                  </td>
                  {/* Task */}
                  <td className="px-3 py-2.5">
                    <span className="text-sm text-gray-800 font-medium">{task.task}</span>
                  </td>
                  {/* Priority */}
                  <td className="px-3 py-2.5 text-center">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  {/* PRD Link */}
                  <td className="px-3 py-2.5 text-center">
                    <LinkCell href={task.prdLink} label="PRD" />
                  </td>
                  {/* Design Link */}
                  <td className="px-3 py-2.5 text-center">
                    <LinkCell href={task.designLink} label="Design" />
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <StatusBadge status={task.status} />
                  </td>
                  {/* IT Review */}
                  <td className="px-3 py-2.5 text-center">
                    {task.itReview ? (
                      <span className="text-base" title="Đã review">✅</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {/* Timeline */}
                  <td className="px-3 py-2.5 text-center">
                    {task.timeline ? (
                      <span className="text-xs text-gray-600 font-medium">
                        {new Date(task.timeline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {/* PM Note */}
                  <td className="px-3 py-2.5">
                    <NoteCell text={task.pmNote} />
                  </td>
                  {/* IT Note */}
                  <td className="px-3 pr-4 py-2.5">
                    <NoteCell text={task.itNote} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              {monthTasks.length === 0
                ? <><p className="text-2xl mb-2">📋</p><p>Chưa có task trong tháng {activeMonth}</p></>
                : <><p className="text-2xl mb-2">🔍</p><p>Không có task phù hợp với filter đang chọn</p></>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
