'use client';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { PRIORITY_COLORS } from '@/lib/config';
import type { ITTaskRow } from '@/lib/types';

const MONTHS = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026', '06/2026',
  '07/2026', '08/2026', '09/2026', '10/2026', '11/2026', '12/2026'];

const CURRENT_MONTH = (() => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
})();

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Go live': 'bg-green-500',
    'Golive': 'bg-green-500',
    'Đang dev': 'bg-orange-500',
    'Nghiệm thu': 'bg-purple-500',
    'Chuẩn bị làm': 'bg-yellow-400',
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-300'} shrink-0`} />
      <span className="text-xs text-gray-700">{status}</span>
    </span>
  );
}

export default function ITTrackerModule() {
  const [activeMonth, setActiveMonth] = useState(CURRENT_MONTH);
  const [allTasks, setAllTasks] = useState<ITTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [lastSync] = useState(new Date());

  useEffect(() => {
    api.getITTasks().then(data => { setAllTasks(data); setLoading(false); });
  }, []);

  const monthTasks = useMemo(() => allTasks.filter(t => t.month === activeMonth), [allTasks, activeMonth]);

  const filtered = useMemo(() => {
    return monthTasks.filter(t => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [monthTasks, statusFilter, priorityFilter]);

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
      {/* Month tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex border-b border-gray-200 min-w-max">
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
                {m === CURRENT_MONTH && <span className="ml-1 text-xs text-green-600">●</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Summary bar */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="font-medium">Tháng {activeMonth}</span>
          <span>•</span>
          <span>{monthTasks.length} task</span>
          {Object.entries(summary).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1">
              <span>{s}: <strong>{c}</strong></span>
            </span>
          ))}
          <span className="ml-auto text-gray-400">
            Đồng bộ: {lastSync.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {lastSync.toLocaleDateString('vi-VN')}
          </span>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-green-500"
          >
            <option value="">Tất cả status</option>
            {[...new Set(monthTasks.map(t => t.status))].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-green-500"
          >
            <option value="">Tất cả priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Task</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">IT Review</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Timeline</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">PM Note</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">IT Note</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(task => {
                const pColor = PRIORITY_COLORS[task.priority] ?? { bg: '#F3F4F6', text: '#6B7280' };
                return (
                  <tr key={task.taskId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400">{task.stt}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-gray-800 font-medium">{task.task}</p>
                        <p className="text-xs text-gray-400 font-mono">{task.taskId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: pColor.bg, color: pColor.text }}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusDot status={task.status} /></td>
                    <td className="px-4 py-3 text-center">
                      <span>{task.itReview ? '✅' : '⬜'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {task.timeline ? new Date(task.timeline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{task.pmNote ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{task.itNote ?? '—'}</td>
                    <td className="px-2 py-3">
                      <div className="flex gap-1">
                        {task.prdLink && (
                          <a href={task.prdLink} target="_blank" rel="noreferrer" title="PRD" className="text-xs text-blue-400 hover:text-blue-600">📄</a>
                        )}
                        {task.designLink && (
                          <a href={task.designLink} target="_blank" rel="noreferrer" title="Design" className="text-xs text-purple-400 hover:text-purple-600">🎨</a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              {monthTasks.length === 0 ? 'Chưa có task trong tháng này' : 'Không có task phù hợp filter'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
