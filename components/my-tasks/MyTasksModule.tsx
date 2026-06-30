'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, ChevronDown, ChevronUp, ExternalLink, Edit2, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { nameToMemberItem } from '@/lib/config';
import { useMemberColors } from '@/lib/use-member-colors';
import type { TaskRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import MemberAvatar from '@/components/MemberAvatar';
import TaskForm from './TaskForm';
import { useSheetsData } from '@/lib/sheets-context';
import { useDataSystem } from '@/lib/use-data-system';
import { useToast, ToastContainer } from '@/components/ui/Toast';

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
  const { tasks: sheetsTasks, loading: sheetsLoading, config: sheetsConfig, refresh, lastFetch } = useSheetsData();
  const { members } = useDataSystem();
  const { getColor, setColor, resetColor, hasCustomColor } = useMemberColors();
  const { toasts, push: pushToast, dismiss } = useToast();
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [selectedMember, setSelectedMember] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  // Local overrides — patch ngay sau khi save, không cần reload
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<TaskRow>>>({});

  // Chọn thành viên đầu tiên khi members load xong
  useEffect(() => {
    if (!selectedMember && members.length > 0) {
      setSelectedMember(members[0].name);
    }
  }, [members, selectedMember]);

  const loading = sheetsLoading;
  const tasks = sheetsTasks
    .filter(t => t.owner === selectedMember || t.sourceSheet === selectedMember)
    .map(t => localOverrides[t.id] ? { ...t, ...localOverrides[t.id] } : t);

  // Thành viên có trong sheets data
  const availableMembers = sheetsConfig
    ? members.filter(m => sheetsConfig.selectedSheets.includes(m.name) || sheetsTasks.some(t => t.owner === m.name))
    : members;


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

  async function handleDelete(task: TaskRow) {
    if (!confirm(`Xóa task "${task.task}"?`)) return;
    setLocalOverrides(prev => { const n = { ...prev }; delete n[task.id]; return n; });
    try {
      await api.deleteMyTask(task.sourceSheet ?? selectedMember, task.id, task.task);
      pushToast('success', 'Đã xóa task', task.task);
    } catch {
      pushToast('error', 'Xóa thất bại', 'Không thể xóa task khỏi sheet');
    }
    refresh();
  }

  function handleSave(data: Partial<TaskRow>) {
    if (editingTask) {
      // Cập nhật ngay trên UI, không cần reload
      setLocalOverrides(prev => ({ ...prev, [editingTask.id]: { ...(prev[editingTask.id] ?? {}), ...data } }));
    }
    // Sau khi thêm mới → refresh để lấy data thật từ sheet
    if (!editingTask) refresh();
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Member sidebar */}
      <aside className="w-48 shrink-0 space-y-1">
        {availableMembers.map(m => {
          const count = sheetsTasks.filter(t => (t.owner === m.name || t.sourceSheet === m.name) && ACTIVE_STATUSES.includes(t.status)).length;
          const currentColor = getColor(m.name, nameToMemberItem(m.name).color);
          const isCustom     = hasCustomColor(m.name);
          return (
            <div key={m.id} className="relative">
              {/* Hidden color input */}
              <input
                ref={el => { colorInputRefs.current[m.name] = el; }}
                type="color"
                value={currentColor}
                className="sr-only"
                onChange={e => setColor(m.name, e.target.value)}
              />

              <button
                onClick={() => setSelectedMember(m.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left ${
                  selectedMember === m.name
                    ? 'bg-green-50 border border-green-200'
                    : 'hover:bg-gray-100 border border-transparent'
                }`}
              >
                {/* Avatar + chấm màu luôn hiện */}
                <div className="relative shrink-0">
                  <MemberAvatar name={m.name} size="md" />
                  {/* Chấm màu nhỏ ở góc dưới phải — click để đổi màu */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); colorInputRefs.current[m.name]?.click(); }}
                    title={isCustom ? 'Đổi màu (double-click để reset)' : 'Đổi màu avatar'}
                    onDoubleClick={e => { e.stopPropagation(); resetColor(m.name); }}
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm
                               hover:scale-125 active:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: currentColor }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selectedMember === m.name ? 'text-green-800' : 'text-gray-700'}`}>
                    {m.name}
                  </p>
                  {count > 0 && (
                    <p className="text-xs text-gray-400">{count} active</p>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </aside>

      {/* Task list */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{selectedMember}</h2>
            <p className="text-sm text-gray-500">
              {activeCount} task đang active
              {lastFetch && sheetsConfig && (
                <span className="ml-2 text-gray-400 text-xs">
                  · cập nhật {lastFetch.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sheetsConfig && (
              <button
                onClick={() => refresh()}
                disabled={sheetsLoading}
                title="Tải lại dữ liệu từ sheet"
                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-300 hover:bg-green-50 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={15} className={sheetsLoading ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              onClick={() => { setEditingTask(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Plus size={16} />
              Thêm Task
            </button>
          </div>
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-16">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dự án</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Vai trò</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Bắt đầu</th>
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
                        <td className="px-4 py-3">
                          {task.role ? (
                            <div className="flex flex-wrap gap-1">
                              {task.role.split(',').map(r => r.trim()).filter(Boolean).map(r => (
                                <span key={r} className="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-medium whitespace-nowrap">
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                        <td className="px-4 py-3">
                          {task.startDate ? (
                            <span className="text-xs text-gray-500">
                              {new Date(task.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {task.endDate ? (
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : soon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
                              {new Date(task.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              {overdue && ' 🔴'}
                              {soon && !overdue && ' ⚠️'}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
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
                            <button
                              onClick={() => handleDelete(task)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 size={13} />
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
          lockOwner
          onClose={() => { setShowForm(false); setEditingTask(null); }}
          onSave={handleSave}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
