'use client';
import { useState, useEffect, useMemo } from 'react';
import { Plus, ChevronDown, ChevronUp, ExternalLink, Edit2 } from 'lucide-react';
import { api } from '@/lib/api';
import { MEMBERS } from '@/lib/config';
import type { TaskRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import MemberAvatar from '@/components/MemberAvatar';
import TaskForm from './TaskForm';
import { useSheetsData } from '@/lib/sheets-context';

function isOverdue(task: TaskRow) {
  if (!task.endDate) return false;
  const end = new Date(task.endDate);
  return end < new Date() && task.status !== 'Done' && task.status !== 'Golive' && task.status !== 'Go live';
}

function isDueSoon(task: TaskRow) {
  if (!task.endDate) return false;
  const diff = (new Date(task.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

const ACTIVE_STATUSES = ['Add Sprint', 'Add Xtask', 'In progress', 'Đang dev', 'Nghiệm thu', 'Chuẩn bị làm'];

export default function MyTasksModule() {
  const { tasks: sheetsTasks, loading: sheetsLoading, config: sheetsConfig } = useSheetsData();
  const [selectedMember, setSelectedMember] = useState(MEMBERS[0].name);
  const [mockTasksByMember, setMockTasksByMember] = useState<Record<string, TaskRow[]>>({});
  const [mockLoading, setMockLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);

  useEffect(() => {
    if (sheetsConfig) return; // dùng sheets data
    if (mockTasksByMember[selectedMember]) return;
    setMockLoading(true);
    api.getMyTasks(selectedMember).then(data => {
      setMockTasksByMember(prev => ({ ...prev, [selectedMember]: data }));
      setMockLoading(false);
    });
  }, [selectedMember, sheetsConfig]);

  const loading = sheetsConfig ? sheetsLoading : mockLoading;
  const tasks = sheetsConfig
    ? sheetsTasks.filter(t => t.owner === selectedMember || t.sourceSheet === selectedMember)
    : (mockTasksByMember[selectedMember] ?? []);

  // Thành viên có trong sheets data
  const availableMembers = sheetsConfig
    ? MEMBERS.filter(m => sheetsConfig.selectedSheets.includes(m.name) || sheetsTasks.some(t => t.owner === m.name))
    : MEMBERS;

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (!a.endDate && !b.endDate) return 0;
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    });
  }, [tasks]);

  const activeCount = tasks.filter(t => ACTIVE_STATUSES.includes(t.status)).length;

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSave(data: Partial<TaskRow>) {
    if (editingTask) {
      setMockTasksByMember(prev => ({
        ...prev,
        [selectedMember]: (prev[selectedMember] ?? []).map(t =>
          t.id === editingTask.id ? { ...t, ...data } : t
        ),
      }));
    } else {
      const newTask: TaskRow = {
        id: `${selectedMember.slice(0, 2).toUpperCase()}${Date.now()}`,
        project: data.project ?? '',
        task: data.task ?? '',
        owner: selectedMember,
        status: (data.status as TaskRow['status']) ?? 'Chuẩn bị làm',
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        detail: data.detail ?? null,
        link: data.link ?? null,
        note: data.note ?? null,
        sourceSheet: selectedMember,
        sourceRow: 0,
        itTaskId: null,
        lastModified: new Date().toISOString(),
      };
      setMockTasksByMember(prev => ({
        ...prev,
        [selectedMember]: [...(prev[selectedMember] ?? []), newTask],
      }));
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Member sidebar */}
      <aside className="w-48 shrink-0 space-y-1">
        {(sheetsConfig ? availableMembers : MEMBERS).map(m => {
          const count = sheetsConfig
            ? sheetsTasks.filter(t => (t.owner === m.name || t.sourceSheet === m.name) && ACTIVE_STATUSES.includes(t.status)).length
            : (mockTasksByMember[m.name]?.filter(t => ACTIVE_STATUSES.includes(t.status)).length ?? 0);
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMember(m.name)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left ${
                selectedMember === m.name
                  ? 'bg-green-50 border border-green-200'
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <MemberAvatar name={m.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${selectedMember === m.name ? 'text-green-800' : 'text-gray-700'}`}>
                  {m.name}
                </p>
                {count > 0 && (
                  <p className="text-xs text-gray-400">{count} active</p>
                )}
              </div>
            </button>
          );
        })}
      </aside>

      {/* Task list */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{selectedMember}</h2>
            <p className="text-sm text-gray-500">{activeCount} task đang active</p>
          </div>
          <button
            onClick={() => { setEditingTask(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            Thêm Task
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
            <p className="text-sm">Chưa có task nào</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dự án</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Kết thúc</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map(task => {
                    const overdue = isOverdue(task);
                    const soon = isDueSoon(task);
                    const expanded = expandedRows.has(task.id);
                    return (
                      <tr
                        key={task.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          overdue ? 'bg-red-50' : soon ? 'bg-yellow-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-xs font-mono text-gray-400">{task.id}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate">{task.project}</td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-start gap-1">
                            <span className="text-gray-800">{task.task}</span>
                            {task.detail && (
                              <button onClick={() => toggleRow(task.id)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </div>
                          {expanded && task.detail && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-4 whitespace-pre-line">{task.detail}</p>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                        <td className="px-4 py-3">
                          {task.endDate ? (
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : soon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
                              {new Date(task.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              {overdue && ' 🔴'}
                              {soon && !overdue && ' ⚠️'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-1">
                            {task.link && (
                              <a href={task.link} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-500">
                                <ExternalLink size={13} />
                              </a>
                            )}
                            <button
                              onClick={() => { setEditingTask(task); setShowForm(true); }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <TaskForm
          task={editingTask}
          owner={selectedMember}
          onClose={() => { setShowForm(false); setEditingTask(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
