'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Search, CheckSquare, Square, ChevronDown, X,
  ClipboardList, UserCheck, Loader2, Plus, ArrowLeft, List, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDataSystem } from '@/lib/use-data-system';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useSheetsData } from '@/lib/sheets-context';
import StatusBadge from '@/components/StatusBadge';
import MemberAvatar from '@/components/MemberAvatar';
import TaskForm from '@/components/my-tasks/TaskForm';
import type { TaskRow } from '@/lib/types';

type PickedMap = Record<string, string>; // taskId → memberName
type ViewFilter = 'all' | 'available' | 'picked';
type ConfirmState = 'idle' | 'confirm' | 'loading' | 'done' | 'error';

// ─── Popup xác nhận Pick Task ─────────────────────────────────────────────────
function PickConfirmDialog({
  tasks,
  member,
  state,
  errorMsg,
  onConfirm,
  onClose,
}: {
  tasks: TaskRow[];
  member: string;
  state: ConfirmState;
  errorMsg: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isDone    = state === 'done';
  const isLoading = state === 'loading';
  const isError   = state === 'error';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className={`px-6 py-5 flex items-center gap-3 ${
          isDone ? 'bg-green-50' : isError ? 'bg-red-50' : 'bg-white'
        } border-b border-gray-100`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isDone    ? 'bg-green-100' :
            isError   ? 'bg-red-100'   :
            isLoading ? 'bg-blue-100'  :
                        'bg-green-100'
          }`}>
            {isDone    ? <CheckCircle2 size={22} className="text-green-600" /> :
             isError   ? <AlertTriangle size={22} className="text-red-500" />  :
             isLoading ? <Loader2 size={22} className="text-blue-500 animate-spin" /> :
                         <UserCheck size={22} className="text-green-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-base">
              {isDone    ? 'Pick thành công!' :
               isError   ? 'Có lỗi xảy ra'    :
               isLoading ? 'Đang xử lý...'    :
                           'Xác nhận Pick Task'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isDone    ? `Đã thêm vào My Tasks của ${member}` :
               isError   ? errorMsg :
               isLoading ? 'Đang ghi xuống sheet và cập nhật My Tasks...' :
                           `${tasks.length} task sẽ được giao cho ${member}`}
            </p>
          </div>
          {(isDone || isError) && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Task list */}
        <div className="px-6 py-4 max-h-56 overflow-y-auto space-y-2">
          {tasks.map(t => (
            <div key={t.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
              isDone ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
            }`}>
              {isDone
                ? <CheckCircle2 size={15} className="text-green-500 shrink-0 mt-0.5" />
                : <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 mt-1.5" />}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{t.task}</p>
                <p className="text-xs text-gray-400 truncate">{t.project}</p>
              </div>
              {isDone && (
                <span className="ml-auto shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Backlog
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer member info */}
        {!isDone && !isError && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <MemberAvatar name={member} size="sm" />
            <span className="text-sm text-gray-600">
              Giao cho <span className="font-semibold text-gray-800">{member}</span>
              <span className="ml-1 text-gray-400">· Status: <span className="text-green-600 font-medium">Backlog</span></span>
            </span>
          </div>
        )}

        {/* Actions */}
        {(state === 'confirm') && (
          <div className="px-6 py-4 flex gap-3 border-t border-gray-100">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <UserCheck size={15} />
              Xác nhận Pick
            </button>
          </div>
        )}

        {state === 'done' && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={15} />
              Hoàn tất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Màn hình chọn thành viên ─────────────────────────────────────────────────
function MemberPicker({ onSelect, onViewAll }: { onSelect: (name: string) => void; onViewAll: () => void }) {
  const { members } = useDataSystem();
  return (
    <div className="flex flex-col items-center py-10 space-y-6">
      <div className="text-center space-y-1">
        <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center mx-auto mb-3">
          <ClipboardList size={24} className="text-white" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Pick Task</h2>
        <p className="text-sm text-gray-500">Chọn thành viên để bắt đầu nhận task</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
        {members.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.name)}
            className="flex flex-col items-center gap-2.5 p-5 bg-white rounded-2xl border border-gray-200
                       hover:border-green-400 hover:bg-green-50 hover:shadow-md transition-all group"
          >
            <span className="group-hover:scale-105 transition-transform inline-flex shadow-sm rounded-full">
              <MemberAvatar name={m.name} size="lg" />
            </span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-green-700">{m.name}</span>
          </button>
        ))}
      </div>

      {/* Nút xem toàn bộ danh sách */}
      <button
        onClick={onViewAll}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white
                   text-sm text-gray-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50
                   transition-all shadow-sm"
      >
        <List size={16} />
        Xem danh sách tất cả Task
      </button>
    </div>
  );
}

// ─── Bảng pool task ────────────────────────────────────────────────────────────
function PickBoard({
  member,
  onBack,
}: {
  member: string;   // '' = xem tất cả, không cần chọn người
  onBack: () => void;
}) {
  const [poolTasks, setPoolTasks] = useState<TaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [isFromSheet, setIsFromSheet]   = useState(false);
  const [pickedBy, setPickedBy]   = useState<PickedMap>({});
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [viewFilter, setViewFilter]       = useState<ViewFilter>('all');
  // Khi vào từ "Xem tất cả", cho chọn người pick ngay tại đây
  const [activeMember, setActiveMember]   = useState(member);
  const [showAddForm, setShowAddForm]     = useState(false);
  const [confirmTasks, setConfirmTasks]   = useState<TaskRow[]>([]);
  const [confirmState, setConfirmState]   = useState<ConfirmState>('idle');
  const [confirmError, setConfirmError]   = useState('');

  const config     = typeof window !== 'undefined' ? loadSheetsConfig() : null;
  const { members } = useDataSystem();
  const { refresh: refreshSheets } = useSheetsData();

  // Load pool tasks (từ sheet hoặc mock)
  useEffect(() => {
    api.getPoolTasks()
      .then(data => {
        setPoolTasks(data);
        // Khôi phục trạng thái "đã pick" từ dữ liệu sheet (owner đã có sẵn)
        const initialPicked: PickedMap = {};
        data.forEach(t => { if (t.owner) initialPicked[t.id] = t.owner; });
        setPickedBy(initialPicked);
        setIsFromSheet(!!config?.poolSheet && data.length > 0);
      })
      .catch(() => setPoolTasks([]))
      .finally(() => setLoadingTasks(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects      = useMemo(() => [...new Set(poolTasks.map(t => t.project))].sort(), [poolTasks]);
  const pickedCount   = Object.keys(pickedBy).length;
  const availableCount = poolTasks.length - pickedCount;

  const filtered = useMemo(() => {
    return poolTasks.filter(t => {
      if (projectFilter && t.project !== projectFilter) return false;
      if (viewFilter === 'available' && pickedBy[t.id])  return false;
      if (viewFilter === 'picked'    && !pickedBy[t.id]) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.task.toLowerCase().includes(q) || (t.detail ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [poolTasks, projectFilter, viewFilter, search, pickedBy]);

  const selectableFiltered    = filtered.filter(t => !pickedBy[t.id]);
  const allSelectableSelected = selectableFiltered.length > 0 && selectableFiltered.every(t => selected.has(t.id));

  function toggleAll() {
    if (allSelectableSelected) {
      setSelected(prev => { const n = new Set(prev); selectableFiltered.forEach(t => n.delete(t.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); selectableFiltered.forEach(t => n.add(t.id)); return n; });
    }
  }

  function toggle(id: string) {
    if (pickedBy[id]) return;
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Bước 1: mở popup xác nhận
  function handlePick() {
    if (!activeMember || selected.size === 0) return;
    const tasks = poolTasks.filter(t => selected.has(t.id));
    setConfirmTasks(tasks);
    setConfirmState('confirm');
    setConfirmError('');
  }

  // Bước 2: thực sự pick sau khi user xác nhận
  async function executePickConfirmed() {
    const cfg = loadSheetsConfig();
    setConfirmState('loading');

    // Optimistic update bảng pool ngay
    const newPickedBy = { ...pickedBy };
    confirmTasks.forEach(t => { newPickedBy[t.id] = activeMember; });
    setPickedBy(newPickedBy);
    setSelected(new Set());

    if (!cfg?.appsScriptUrl) {
      // Mock mode — không ghi sheet thật
      setConfirmState('done');
      return;
    }

    try {
      const results = await Promise.allSettled(
        confirmTasks.map(t => api.pickPoolTask(t.id, activeMember, cfg?.poolSheet))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        setConfirmError(`${failed}/${confirmTasks.length} task lỗi — kiểm tra Apps Script`);
        setConfirmState('error');
        return;
      }
      // Reload sheets để My Tasks hiển thị task mới
      await refreshSheets();
      setConfirmState('done');
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Lỗi không xác định');
      setConfirmState('error');
    }
  }

  function closeConfirm() {
    setConfirmState('idle');
    setConfirmTasks([]);
    setConfirmError('');
  }

  function handleAddTask(data: Partial<TaskRow>) {
    const newTask: TaskRow = {
      id:           `POOL${Date.now()}`,
      project:      data.project   ?? '',
      task:         data.task      ?? '',
      owner:        '',
      role:         data.role      ?? null,
      status:       data.status    ?? 'Chuẩn bị đưa vào làm',
      startDate:    data.startDate ?? null,
      endDate:      data.endDate   ?? null,
      detail:       data.detail    ?? null,
      link:         data.link      ?? null,
      note:         data.note      ?? null,
      sourceSheet:  'Pool',
      sourceRow:    poolTasks.length + 2,
      itTaskId:     null,
      lastModified: new Date().toISOString(),
    };
    setPoolTasks(prev => [newTask, ...prev]);
    setShowAddForm(false);
  }

  if (loadingTasks) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sheet status banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
        isFromSheet
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 'bg-gray-50 border-gray-200 text-gray-500'
      }`}>
        <span>{isFromSheet ? '✅' : '📋'}</span>
        <span>
          {isFromSheet
            ? <>Đang đọc từ Google Sheets · Sheet <strong>{config?.poolSheet}</strong> · {poolTasks.length} task trong pool</>
            : <>Đang xem dữ liệu mock · Kết nối Google Sheets để đọc/ghi pool task thật</>
          }
        </span>
      </div>

      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">

          {/* Back + title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              title="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
            {activeMember ? (
              <MemberAvatar name={activeMember} size="md" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <List size={16} className="text-gray-500" />
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">
                {activeMember || 'Tất cả Task Pool'}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                {availableCount} chưa pick · {pickedCount} đã pick · {poolTasks.length} tổng
              </p>
            </div>
          </div>

          {/* Khi xem tất cả, hiện selector chọn người để pick */}
          {!member && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Pick với tư cách:</span>
              <div className="relative">
                <select
                  value={activeMember}
                  onChange={e => { setActiveMember(e.target.value); setSelected(new Set()); }}
                  className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none transition-colors ${
                    activeMember
                      ? 'border-green-500 bg-green-50 text-green-800 font-medium'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <option value="">-- Chọn thành viên --</option>
                  {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* View filter pills */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'all',       label: 'Tất cả'    },
              { key: 'available', label: 'Chưa pick' },
              { key: 'picked',    label: 'Đã pick'   },
            ] as { key: ViewFilter; label: string }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setViewFilter(opt.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewFilter === opt.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Add task */}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm ml-auto"
          >
            <Plus size={15} />
            Thêm task
          </button>
        </div>
      </div>


      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm task..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
          {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
        </div>

        <div className="relative">
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
              projectFilter ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
            }`}
          >
            <option value="">Tất cả dự án</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>

        {(projectFilter || search) && (
          <button onClick={() => { setProjectFilter(''); setSearch(''); }} className="text-xs text-red-500 hover:text-red-700">
            Xóa filter
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} task{selected.size > 0 ? ` · ${selected.size} đã chọn` : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  {viewFilter !== 'picked' && (
                    <button onClick={toggleAll} className="text-gray-400 hover:text-green-600 transition-colors">
                      {allSelectableSelected
                        ? <CheckSquare size={16} className="text-green-600" />
                        : <Square size={16} />}
                    </button>
                  )}
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Dự án</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Task</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Vai trò</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Bắt đầu</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Deadline</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Người pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(task => {
                const isPicked   = !!pickedBy[task.id];
                const picker     = pickedBy[task.id] ?? '';
                const isSelected = selected.has(task.id);
                const isMe       = picker === activeMember;

                return (
                  <tr
                    key={task.id}
                    onClick={() => !isPicked && toggle(task.id)}
                    className={`transition-colors ${
                      isPicked
                        ? 'bg-gray-50 opacity-70'
                        : isSelected
                          ? 'bg-green-50 hover:bg-green-100 cursor-pointer'
                          : 'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggle(task.id); }}>
                      {isPicked
                        ? <span className="text-green-500 font-bold text-base">✓</span>
                        : isSelected
                          ? <CheckSquare size={16} className="text-green-600" />
                          : <Square size={16} className="text-gray-300" />}
                    </td>

                    {/* Dự án */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${isPicked ? 'text-gray-400' : 'text-gray-600'}`}>
                        {task.project}
                      </span>
                    </td>

                    {/* Task */}
                    <td className="px-4 py-3 max-w-xs">
                      <p className={`font-medium ${isPicked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {task.task}
                      </p>
                      {!isPicked && task.detail && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{task.detail}</p>
                      )}
                      {!isPicked && task.note && (
                        <p className="text-xs text-amber-600 mt-0.5">📌 {task.note}</p>
                      )}
                      {!isPicked && task.link && (
                        <a href={task.link} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-blue-500 hover:text-blue-700 mt-0.5 inline-block">
                          🔗 Link
                        </a>
                      )}
                    </td>

                    {/* Vai trò */}
                    <td className="px-4 py-3">
                      {task.role ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          isPicked ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {task.role}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {isPicked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          Đã pick
                        </span>
                      ) : (
                        <StatusBadge status={task.status} />
                      )}
                    </td>

                    {/* Bắt đầu */}
                    <td className="px-4 py-3">
                      {task.startDate ? (
                        <span className={`text-xs ${isPicked ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date(task.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {task.endDate ? (
                        <span className={`text-xs ${isPicked ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date(task.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Người pick */}
                    <td className="px-4 py-3">
                      {isPicked ? (
                        <div className="flex items-center gap-1.5">
                          <MemberAvatar name={picker} size="sm" />
                          <span className={`text-xs font-medium ${isMe ? 'text-green-700' : 'text-gray-600'}`}>
                            {picker}
                            {isMe && <span className="text-green-500 ml-1">(bạn)</span>}
                          </span>
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-14 text-gray-400">
              <ClipboardList size={34} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {viewFilter === 'available' ? 'Tất cả task đã được pick!' :
                 viewFilter === 'picked'    ? 'Chưa có task nào được pick' :
                 'Không có task nào phù hợp'}
              </p>
              {viewFilter !== 'picked' && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs hover:border-green-400 hover:text-green-600 transition-colors"
                >
                  <Plus size={13} /> Thêm task mới vào Pool
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer / Pick button */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {selected.size > 0
              ? <span className="text-green-700 font-medium">{selected.size} task đã chọn</span>
              : !activeMember
                ? <span className="text-amber-600">Chọn thành viên ở trên để pick</span>
                : 'Tick vào task muốn nhận'}
          </span>
          <button
            onClick={handlePick}
            disabled={!activeMember || selected.size === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              !activeMember || selected.size === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
            }`}
          >
            <UserCheck size={15} />
            Pick {selected.size > 0 ? `${selected.size} task` : 'task'}{activeMember ? ` cho ${activeMember}` : ''}
          </button>
        </div>
      </div>

      {/* Add pool task form */}
      {showAddForm && (
        <TaskForm
          task={null}
          owner="Pool"
          title="Thêm task vào Pool"
          onClose={() => setShowAddForm(false)}
          onSave={handleAddTask}
        />
      )}

      {/* Confirm pick dialog */}
      {confirmState !== 'idle' && (
        <PickConfirmDialog
          tasks={confirmTasks}
          member={activeMember}
          state={confirmState}
          errorMsg={confirmError}
          onConfirm={executePickConfirmed}
          onClose={closeConfirm}
        />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function PickTaskModule() {
  // null = chưa vào board, '' = xem tất cả, 'Tên' = xem theo người
  const [view, setView] = useState<string | null>(null);

  if (view === null) {
    return (
      <MemberPicker
        onSelect={name => setView(name)}
        onViewAll={() => setView('')}
      />
    );
  }

  return <PickBoard member={view} onBack={() => setView(null)} />;
}
