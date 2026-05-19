'use client';
import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Edit2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ALL_STATUSES, MEMBERS, STATUS_COLORS } from '@/lib/config';
import type { TaskRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import MemberAvatar from '@/components/MemberAvatar';

const ITEMS_PER_PAGE = 50;

function isOverdue(task: TaskRow) {
  if (!task.endDate) return false;
  const end = new Date(task.endDate);
  const now = new Date();
  return end < now && task.status !== 'Done' && task.status !== 'Golive' && task.status !== 'Go live';
}

function isDueSoon(task: TaskRow) {
  if (!task.endDate) return false;
  const end = new Date(task.endDate);
  const now = new Date();
  const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

export default function OverviewModule() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'project' | 'owner' | 'status'>('project');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');

  useEffect(() => {
    api.getOverview().then(data => { setTasks(data); setLoading(false); });
  }, []);

  const projects = useMemo(() => [...new Set(tasks.map(t => t.project))].sort(), [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (ownerFilter.length && !ownerFilter.includes(t.owner)) return false;
      if (statusFilter.length && !statusFilter.includes(t.status)) return false;
      if (projectFilter.length && !projectFilter.includes(t.project)) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.task.toLowerCase().includes(q) || (t.detail || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [tasks, ownerFilter, statusFilter, projectFilter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, TaskRow[]> = {};
    filtered.forEach(t => {
      const key = groupBy === 'project' ? t.project : groupBy === 'owner' ? t.owner : t.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered, groupBy]);

  const allRows = useMemo(() => {
    return Object.entries(grouped).flatMap(([, rows]) => rows);
  }, [grouped]);

  const paginated = allRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(allRows.length / ITEMS_PER_PAGE));

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveStatus(task: TaskRow) {
    await api.updateTaskStatus(task.id, editStatus);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: editStatus as TaskRow['status'] } : t));
    setEditingId(null);
  }

  function MultiSelect({ label, options, value, onChange }: {
    label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            value.length ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          {label} {value.length ? `(${value.length})` : ''} <ChevronDown size={14} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[160px] py-1">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  onChange={e => {
                    const next = e.target.checked ? [...value, opt] : value.filter(v => v !== opt);
                    onChange(next);
                  }}
                  className="rounded text-green-600"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {value.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 mt-1">
                Xóa filter
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm kiếm task..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')}><X size={14} className="text-gray-400" /></button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <MultiSelect label="Owner" options={MEMBERS.map(m => m.name)} value={ownerFilter} onChange={v => { setOwnerFilter(v); setPage(1); }} />
          <MultiSelect label="Status" options={ALL_STATUSES} value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} />
          <MultiSelect label="Dự án" options={projects} value={projectFilter} onChange={v => { setProjectFilter(v); setPage(1); }} />
        </div>
        <div className="flex items-center gap-1 ml-auto text-xs text-gray-500">
          <span>Nhóm:</span>
          {(['project', 'owner', 'status'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-2 py-1 rounded-md capitalize ${groupBy === g ? 'bg-green-100 text-green-700 font-medium' : 'hover:bg-gray-100'}`}
            >
              {g === 'project' ? 'Dự án' : g === 'owner' ? 'Owner' : 'Status'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dự án</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Task</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Deadline</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(grouped).map(([groupKey, groupTasks]) => {
                const groupRows = groupTasks.filter(t =>
                  paginated.some(p => p.id === t.id)
                );
                if (!groupRows.length) return null;
                return groupRows.map((task, idx) => {
                  const overdue = isOverdue(task);
                  const soon = isDueSoon(task);
                  const expanded = expandedRows.has(task.id);
                  return (
                    <>
                      <tr
                        key={task.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          overdue ? 'bg-red-50' : soon ? 'bg-yellow-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {idx === 0 && groupBy === 'project' ? (
                            <span className="font-medium text-gray-600">{(page - 1) * ITEMS_PER_PAGE + allRows.indexOf(task) + 1}</span>
                          ) : (
                            allRows.indexOf(task) + 1 + (page - 1) * ITEMS_PER_PAGE
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {idx === 0 ? (
                            <span className="font-medium text-gray-700 text-xs">{task.project}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-start gap-1">
                            <span className="text-gray-800">{task.task}</span>
                            {task.detail && (
                              <button onClick={() => toggleRow(task.id)} className="text-gray-400 hover:text-gray-600 ml-1 shrink-0 mt-0.5">
                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </div>
                          {expanded && task.detail && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-3">{task.detail}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <MemberAvatar name={task.owner} />
                            <span className="text-gray-700 text-xs hidden sm:block">{task.owner}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editingId === task.id ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={editStatus}
                                onChange={e => setEditStatus(e.target.value)}
                                className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none"
                              >
                                {ALL_STATUSES.map(s => (
                                  <option key={s} value={s}>{STATUS_COLORS[s]?.label ?? s}</option>
                                ))}
                              </select>
                              <button onClick={() => saveStatus(task)} className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">✓</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 px-1">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group">
                              <StatusBadge status={task.status} />
                              <button
                                onClick={() => { setEditingId(task.id); setEditStatus(task.status); }}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {task.endDate ? (
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : soon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
                              {new Date(task.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              {overdue && ' 🔴'}
                              {soon && !overdue && ' ⚠️'}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {task.link && (
                            <a href={task.link} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-600 text-xs">🔗</a>
                          )}
                        </td>
                      </tr>
                    </>
                  );
                });
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Không có task nào phù hợp</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
            <span className="text-xs text-gray-500">{filtered.length} task</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white transition-colors"
              >←</button>
              <span className="text-xs text-gray-600">Trang {page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white transition-colors"
              >→</button>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        <span>{filtered.length} task hiển thị</span>
        {ownerFilter.length > 0 && <span>• Owner: {ownerFilter.join(', ')}</span>}
        {statusFilter.length > 0 && <span>• Status: {statusFilter.length} đã chọn</span>}
        {projectFilter.length > 0 && <span>• Dự án: {projectFilter.length} đã chọn</span>}
      </div>
    </div>
  );
}
