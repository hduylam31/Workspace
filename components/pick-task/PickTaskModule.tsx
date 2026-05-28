'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Search, CheckSquare, Square, ChevronDown, X,
  ClipboardList, UserCheck, Loader2, Plus, ArrowLeft,
  List, CheckCircle2, AlertTriangle, Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDataSystem } from '@/lib/use-data-system';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useSheetsData } from '@/lib/sheets-context';
import MemberAvatar from '@/components/MemberAvatar';
import type { TaskRow } from '@/lib/types';

type PickedMap   = Record<string, string>;   // taskId → ownerName
type ViewFilter  = 'all' | 'available' | 'picked';
type ConfirmState = 'idle' | 'confirm' | 'loading' | 'done' | 'error';

// ─── Status badge cho Trạng thái dự án ───────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'In Progress':  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'  },
  'Done':         { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  'Backlog':      { bg: 'bg-gray-100',  text: 'text-gray-600',   border: 'border-gray-200'  },
  'In progress':  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'  },
};
function getStatusStyle(status: string) {
  return STATUS_COLOR[status] ?? { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
}

// ─── Loại dự án badge ─────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const isSubtask = type?.toLowerCase() === 'subtask';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
      isSubtask
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-blue-50 text-blue-700 border-blue-100'
    }`}>
      {type || 'Task'}
    </span>
  );
}

// ─── Member chips (Thành viên khác) ──────────────────────────────────────────
const CHIP_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-gray-200 text-gray-700',
  'bg-green-100 text-green-700',
  'bg-blue-100 text-blue-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
];
function MemberChip({ name, index }: { name: string; index: number }) {
  const color = CHIP_COLORS[index % CHIP_COLORS.length];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {name}
    </span>
  );
}

// ─── Form thêm task mới vào Pool ─────────────────────────────────────────────
function AddPoolTaskForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Partial<TaskRow>) => void;
}) {
  const { members, projectStatuses } = useDataSystem();
  const [projectName,    setProjectName]    = useState('');
  const [status,         setStatus]         = useState('In Progress');
  const [loaiDuAn,       setLoaiDuAn]       = useState<'Task' | 'Subtask'>('Task');
  const [owner,          setOwner]          = useState('');
  const [otherMembers,   setOtherMembers]   = useState<string[]>([]);
  const [deadline,       setDeadline]       = useState('');

  function toggleOther(name: string) {
    setOtherMembers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    onSave({
      project:   projectName.trim(),
      task:      loaiDuAn,
      status:    status as TaskRow['status'],
      owner:     owner,
      role:      otherMembers.length > 0 ? otherMembers.join(', ') : null,
      endDate:   deadline || null,
    });
  }

  const availableStatuses = projectStatuses.length
    ? projectStatuses
    : ['In Progress', 'Done', 'Backlog'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Thêm task vào Pool</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Tên dự án */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tên dự án *</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Nhập tên dự án..."
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Trạng thái + Loại dự án (cùng hàng) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Trạng thái</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500"
                >
                  {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Loại dự án</label>
              <div className="flex gap-2">
                {(['Task', 'Subtask'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLoaiDuAn(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      loaiDuAn === t
                        ? t === 'Subtask'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Owner</label>
            <div className="relative">
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500"
              >
                <option value="">-- Chọn Owner --</option>
                {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Thành viên khác (multi-select chips) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Thành viên khác
              {otherMembers.length > 0 && (
                <span className="ml-1.5 text-green-600">({otherMembers.length} đã chọn)</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-xl bg-gray-50 min-h-[44px]">
              {members
                .filter(m => m.name !== owner)
                .map((m, i) => {
                  const selected = otherMembers.includes(m.name);
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggleOther(m.name)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        selected
                          ? `${CHIP_COLORS[i % CHIP_COLORS.length]} border-transparent ring-2 ring-green-400`
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <MemberAvatar name={m.name} size="sm" />
                      {m.name}
                    </button>
                  );
                })}
              {members.filter(m => m.name !== owner).length === 0 && (
                <span className="text-xs text-gray-400">Chọn Owner trước để lọc thành viên</span>
              )}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Calendar size={12} className="inline mr-1" />Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!projectName.trim()}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              <Plus size={14} className="inline mr-1" />Thêm task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Popup xác nhận Pick ──────────────────────────────────────────────────────
function PickConfirmDialog({
  tasks, member, state, errorMsg, onConfirm, onClose,
}: {
  tasks: TaskRow[]; member: string; state: ConfirmState;
  errorMsg: string; onConfirm: () => void; onClose: () => void;
}) {
  const isDone    = state === 'done';
  const isLoading = state === 'loading';
  const isError   = state === 'error';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-5 flex items-center gap-3 border-b border-gray-100 ${
          isDone ? 'bg-green-50' : isError ? 'bg-red-50' : 'bg-white'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isDone ? 'bg-green-100' : isError ? 'bg-red-100' : isLoading ? 'bg-blue-100' : 'bg-green-100'
          }`}>
            {isDone    ? <CheckCircle2 size={22} className="text-green-600" /> :
             isError   ? <AlertTriangle size={22} className="text-red-500" />  :
             isLoading ? <Loader2 size={22} className="text-blue-500 animate-spin" /> :
                         <UserCheck size={22} className="text-green-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-base">
              {isDone ? 'Pick thành công!' : isError ? 'Có lỗi xảy ra' : isLoading ? 'Đang xử lý...' : 'Xác nhận Pick Task'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isDone    ? `Đã thêm vào My Tasks của ${member}` :
               isError   ? errorMsg :
               isLoading ? 'Đang ghi xuống sheet...' :
                           `${tasks.length} task sẽ được giao cho ${member}`}
            </p>
          </div>
          {(isDone || isError) && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-6 py-4 max-h-56 overflow-y-auto space-y-2">
          {tasks.map(t => (
            <div key={t.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
              isDone ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
            }`}>
              {isDone
                ? <CheckCircle2 size={15} className="text-green-500 shrink-0 mt-0.5" />
                : <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 mt-1.5" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{t.project}</p>
                <p className="text-xs text-gray-400">{t.task} · {t.status}</p>
              </div>
            </div>
          ))}
        </div>

        {!isDone && !isError && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <MemberAvatar name={member} size="sm" />
            <span className="text-sm text-gray-600">
              Owner: <span className="font-semibold text-gray-800">{member}</span>
            </span>
          </div>
        )}

        {state === 'confirm' && (
          <div className="px-6 py-4 flex gap-3 border-t border-gray-100">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
              Hủy
            </button>
            <button onClick={onConfirm}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2">
              <UserCheck size={15} />Xác nhận Pick
            </button>
          </div>
        )}
        {state === 'done' && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button onClick={onClose}
              className="w-full px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2">
              <CheckCircle2 size={15} />Hoàn tất
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
          <button key={m.id} onClick={() => onSelect(m.name)}
            className="flex flex-col items-center gap-2.5 p-5 bg-white rounded-2xl border border-gray-200
                       hover:border-green-400 hover:bg-green-50 hover:shadow-md transition-all group">
            <span className="group-hover:scale-105 transition-transform inline-flex shadow-sm rounded-full">
              <MemberAvatar name={m.name} size="lg" />
            </span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-green-700">{m.name}</span>
          </button>
        ))}
      </div>
      <button onClick={onViewAll}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white
                   text-sm text-gray-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-all shadow-sm">
        <List size={16} />Xem danh sách tất cả Task
      </button>
    </div>
  );
}

// ─── Bảng pool task ────────────────────────────────────────────────────────────
function PickBoard({ member, onBack }: { member: string; onBack: () => void }) {
  const [poolTasks,    setPoolTasks]    = useState<TaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [isFromSheet,  setIsFromSheet]  = useState(false);
  const [pickedBy,     setPickedBy]     = useState<PickedMap>({});
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [viewFilter,   setViewFilter]   = useState<ViewFilter>('all');
  const [activeMember, setActiveMember] = useState(member);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [confirmTasks, setConfirmTasks] = useState<TaskRow[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [confirmError, setConfirmError] = useState('');

  const config = typeof window !== 'undefined' ? loadSheetsConfig() : null;
  const { members } = useDataSystem();
  const { refresh: refreshSheets } = useSheetsData();

  useEffect(() => {
    api.getPoolTasks()
      .then(data => {
        setPoolTasks(data);
        const initialPicked: PickedMap = {};
        data.forEach(t => { if (t.owner) initialPicked[t.id] = t.owner; });
        setPickedBy(initialPicked);
        setIsFromSheet(!!config?.poolSheet && data.length > 0);
      })
      .catch(() => setPoolTasks([]))
      .finally(() => setLoadingTasks(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unique statuses và types từ dữ liệu thật
  const allStatuses = useMemo(() => [...new Set(poolTasks.map(t => t.status).filter(Boolean))], [poolTasks]);
  const allTypes    = useMemo(() => [...new Set(poolTasks.map(t => t.task).filter(Boolean))],   [poolTasks]);

  const pickedCount    = Object.keys(pickedBy).length;
  const availableCount = poolTasks.length - pickedCount;

  const filtered = useMemo(() => poolTasks.filter(t => {
    if (viewFilter === 'available' && pickedBy[t.id])  return false;
    if (viewFilter === 'picked'    && !pickedBy[t.id]) return false;
    if (statusFilter && t.status !== statusFilter)     return false;
    if (typeFilter   && t.task   !== typeFilter)       return false;
    if (search) {
      const q = search.toLowerCase();
      return t.project.toLowerCase().includes(q) ||
             (t.owner ?? '').toLowerCase().includes(q) ||
             (t.role  ?? '').toLowerCase().includes(q);
    }
    return true;
  }), [poolTasks, viewFilter, statusFilter, typeFilter, search, pickedBy]);

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

  function handlePick() {
    if (!activeMember || selected.size === 0) return;
    setConfirmTasks(poolTasks.filter(t => selected.has(t.id)));
    setConfirmState('confirm');
    setConfirmError('');
  }

  async function executePickConfirmed() {
    const cfg = loadSheetsConfig();
    setConfirmState('loading');
    const newPickedBy = { ...pickedBy };
    confirmTasks.forEach(t => { newPickedBy[t.id] = activeMember; });
    setPickedBy(newPickedBy);
    setSelected(new Set());

    if (!cfg?.appsScriptUrl) { setConfirmState('done'); return; }

    try {
      const results = await Promise.allSettled(
        confirmTasks.map(t => api.pickPoolTask(t.id, activeMember, cfg?.poolSheet))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        setConfirmError(`${failed}/${confirmTasks.length} task lỗi`);
        setConfirmState('error');
        return;
      }
      await refreshSheets();
      setConfirmState('done');
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Lỗi không xác định');
      setConfirmState('error');
    }
  }

  function closeConfirm() { setConfirmState('idle'); setConfirmTasks([]); setConfirmError(''); }

  function handleAddTask(data: Partial<TaskRow>) {
    const newTask: TaskRow = {
      id:           `POOL${Date.now()}`,
      project:      data.project  ?? '',
      task:         data.task     ?? 'Task',
      owner:        data.owner    ?? '',
      role:         data.role     ?? null,
      status:       data.status   ?? 'In Progress',
      startDate:    null,
      endDate:      data.endDate  ?? null,
      detail:       null,
      link:         null,
      note:         null,
      sourceSheet:  'Pool',
      sourceRow:    poolTasks.length + 2,
      itTaskId:     null,
      lastModified: new Date().toISOString(),
    };
    setPoolTasks(prev => [newTask, ...prev]);
    if (newTask.owner) setPickedBy(prev => ({ ...prev, [newTask.id]: newTask.owner }));
    setShowAddForm(false);
  }

  if (loadingTasks) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sheet status */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
        isFromSheet ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
      }`}>
        <span>{isFromSheet ? '✅' : '📋'}</span>
        <span>
          {isFromSheet
            ? <>Sheet <strong>{config?.poolSheet}</strong> · {poolTasks.length} task</>
            : 'Mock data · Kết nối Google Sheets để dùng dữ liệu thật'}
        </span>
      </div>

      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>

          {activeMember
            ? <MemberAvatar name={activeMember} size="md" />
            : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <List size={16} className="text-gray-500" />
              </div>}

          <div>
            <p className="font-semibold text-gray-900 text-sm">{activeMember || 'Tất cả Task Pool'}</p>
            <p className="text-xs text-gray-400">{availableCount} chưa pick · {pickedCount} đã pick · {poolTasks.length} tổng</p>
          </div>

          {/* Selector khi xem tất cả */}
          {!member && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Pick với tư cách:</span>
              <div className="relative">
                <select value={activeMember} onChange={e => { setActiveMember(e.target.value); setSelected(new Set()); }}
                  className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
                    activeMember ? 'border-green-500 bg-green-50 text-green-800 font-medium' : 'border-gray-200 text-gray-600'
                  }`}>
                  <option value="">-- Chọn thành viên --</option>
                  {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* View filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'all',       label: 'Tất cả'    },
              { key: 'available', label: 'Chưa pick' },
              { key: 'picked',    label: 'Đã pick'   },
            ] as { key: ViewFilter; label: string }[]).map(opt => (
              <button key={opt.key} onClick={() => setViewFilter(opt.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewFilter === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          <button onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm ml-auto">
            <Plus size={15} />Thêm task
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên dự án, owner..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
          {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
        </div>

        {/* Filter Trạng thái */}
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
              statusFilter ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
            }`}>
            <option value="">Tất cả trạng thái</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>

        {/* Filter Loại dự án */}
        <div className="relative">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
              typeFilter ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
            }`}>
            <option value="">Tất cả loại</option>
            {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>

        {(statusFilter || typeFilter || search) && (
          <button onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); }}
            className="text-xs text-red-500 hover:text-red-700">Xóa filter</button>
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tên dự án</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Loại</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Thành viên khác</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(task => {
                const isPicked   = !!pickedBy[task.id];
                const isSelected = selected.has(task.id);
                const otherNames = task.role
                  ? task.role.split(',').map(s => s.trim()).filter(Boolean)
                  : [];

                return (
                  <tr
                    key={task.id}
                    onClick={() => !isPicked && toggle(task.id)}
                    className={`transition-colors ${
                      isPicked   ? 'bg-gray-50 opacity-70' :
                      isSelected ? 'bg-green-50 hover:bg-green-100 cursor-pointer' :
                                   'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggle(task.id); }}>
                      {isPicked
                        ? <span className="text-green-500 font-bold">✓</span>
                        : isSelected
                          ? <CheckSquare size={16} className="text-green-600" />
                          : <Square size={16} className="text-gray-300" />}
                    </td>

                    {/* Tên dự án */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className={`font-medium text-sm truncate ${isPicked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {task.project}
                      </p>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3">
                      {(() => {
                        const s = getStatusStyle(task.status);
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
                            {task.status}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Loại dự án */}
                    <td className="px-4 py-3">
                      <TypeBadge type={task.task} />
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3">
                      {task.owner ? (
                        <div className="flex items-center gap-1.5">
                          <MemberAvatar name={task.owner} size="sm" />
                          <span className="text-xs font-medium text-gray-700">{task.owner}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Thành viên khác */}
                    <td className="px-4 py-3">
                      {otherNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {otherNames.map((name, i) => (
                            <MemberChip key={name} name={name} index={i} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {task.endDate ? (
                        <span className={`text-xs ${isPicked ? 'text-gray-400' : 'text-gray-600'}`}>
                          {new Date(task.endDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </span>
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
                {viewFilter === 'available' ? 'Tất cả task đã được assign!' :
                 viewFilter === 'picked'    ? 'Chưa có task nào được assign' :
                 'Không có task nào phù hợp'}
              </p>
              <button onClick={() => setShowAddForm(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs hover:border-green-400 hover:text-green-600 transition-colors">
                <Plus size={13} />Thêm task mới
              </button>
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
            }`}>
            <UserCheck size={15} />
            Pick {selected.size > 0 ? `${selected.size} task` : 'task'}{activeMember ? ` cho ${activeMember}` : ''}
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddPoolTaskForm onClose={() => setShowAddForm(false)} onSave={handleAddTask} />
      )}

      {confirmState !== 'idle' && (
        <PickConfirmDialog
          tasks={confirmTasks} member={activeMember}
          state={confirmState} errorMsg={confirmError}
          onConfirm={executePickConfirmed} onClose={closeConfirm}
        />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function PickTaskModule() {
  const [view, setView] = useState<string | null>(null);

  if (view === null) {
    return <MemberPicker onSelect={name => setView(name)} onViewAll={() => setView('')} />;
  }
  return <PickBoard member={view} onBack={() => setView(null)} />;
}
