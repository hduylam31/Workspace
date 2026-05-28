'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, X, ChevronDown, ClipboardList, UserCheck,
  Loader2, Plus, ArrowLeft, List, CheckCircle2,
  AlertTriangle, Trash2, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDataSystem } from '@/lib/use-data-system';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useSheetsData } from '@/lib/sheets-context';
import MemberAvatar from '@/components/MemberAvatar';
import type { TaskRow } from '@/lib/types';

// ─── Role chips ────────────────────────────────────────────────────────────────
const ROLE_COLORS = [
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-blue-100 text-blue-700 border-blue-100',
  'bg-green-100 text-green-700 border-green-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
];

function RoleChip({ role, index }: { role: string; index: number }) {
  const color = ROLE_COLORS[index % ROLE_COLORS.length];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {role}
    </span>
  );
}

// Multi-select role toggle
function RoleSelector({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: string[];
  onChange: (roles: string[]) => void;
}) {
  function toggle(r: string) {
    onChange(selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((r, i) => {
        const active = selected.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              active
                ? `${ROLE_COLORS[i % ROLE_COLORS.length]} ring-2 ring-offset-1 ring-green-400`
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

// ─── Kiểu dữ liệu một dòng giao việc ─────────────────────────────────────────
interface MemberAssignment {
  member: string;
  roles:  string[];
}

// ─── Form giao task (Owner + nhiều thành viên, mỗi người có role riêng) ───────
function AssignTaskForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (projectId: string, projectName: string, assignments: MemberAssignment[]) => void;
}) {
  const { members, roles } = useDataSystem();

  const [projectId,   setProjectId]   = useState('');
  const [projectName, setProjectName] = useState('');
  const [assignments, setAssignments] = useState<MemberAssignment[]>([
    { member: '', roles: [] },
  ]);

  function updateAssignment(idx: number, patch: Partial<MemberAssignment>) {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
  }
  function addMember() {
    setAssignments(prev => [...prev, { member: '', roles: [] }]);
  }
  function removeMember(idx: number) {
    setAssignments(prev => prev.filter((_, i) => i !== idx));
  }

  // Tên người đã được chọn ở các vị trí khác → loại khỏi select
  function availableMembers(idx: number) {
    const picked = new Set(assignments.map((a, i) => i !== idx ? a.member : '').filter(Boolean));
    return members.filter(m => !picked.has(m.name));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = assignments.filter(a => a.member);
    if (!projectName.trim() || valid.length === 0) return;
    onSave(projectId.trim(), projectName.trim(), valid);
  }

  const isValid = projectName.trim() && assignments.some(a => a.member);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10">
          <h3 className="font-semibold text-gray-900">Thêm / Giao Task</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Project ID + Tên dự án */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">ID dự án</label>
              <input
                type="text"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                placeholder="DA001"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 font-mono"
              />
            </div>
            <div className="col-span-2">
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
          </div>

          {/* Danh sách thành viên + vai trò */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Thành viên &amp; Vai trò
              </label>
              <span className="text-xs text-gray-400">{assignments.length} người</span>
            </div>

            {assignments.map((a, idx) => (
              <div key={idx} className={`border rounded-xl p-4 space-y-3 ${
                idx === 0 ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50/40'
              }`}>
                {/* Label + remove */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    idx === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {idx === 0 ? '👑 Owner' : `Thành viên ${idx + 1}`}
                  </span>
                  {idx > 0 && (
                    <button type="button" onClick={() => removeMember(idx)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Member select */}
                <div className="relative">
                  <select
                    value={a.member}
                    onChange={e => updateAssignment(idx, { member: e.target.value })}
                    className={`w-full appearance-none pl-3 pr-7 py-2.5 border rounded-xl text-sm outline-none transition-colors ${
                      a.member
                        ? 'border-green-400 bg-white text-gray-800'
                        : 'border-gray-200 bg-white text-gray-500'
                    }`}
                  >
                    <option value="">-- Chọn thành viên --</option>
                    {availableMembers(idx).map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                </div>

                {/* Role multi-select */}
                {a.member && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      Vai trò
                      {a.roles.length > 0 && (
                        <span className="ml-1.5 text-green-600 font-semibold">
                          ({a.roles.join(', ')})
                        </span>
                      )}
                    </p>
                    <RoleSelector
                      selected={a.roles}
                      options={roles}
                      onChange={r => updateAssignment(idx, { roles: r })}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Add member button */}
            <button
              type="button"
              onClick={addMember}
              disabled={assignments.length >= members.length}
              className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500
                         hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors
                         flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />Thêm thành viên
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
              Hủy
            </button>
            <button type="submit" disabled={!isValid}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} />Lưu giao việc
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Popup xác nhận Pick ──────────────────────────────────────────────────────
function PickConfirmDialog({
  projectName, assignments, state, errorMsg, onConfirm, onClose,
}: {
  projectName: string;
  assignments: MemberAssignment[];
  state: 'confirm' | 'loading' | 'done' | 'error';
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
        <div className={`px-6 py-5 flex items-center gap-3 border-b border-gray-100 ${
          isDone ? 'bg-green-50' : isError ? 'bg-red-50' : 'bg-white'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isDone ? 'bg-green-100' : isError ? 'bg-red-100' : isLoading ? 'bg-blue-100' : 'bg-green-100'
          }`}>
            {isDone    ? <CheckCircle2 size={22} className="text-green-600" /> :
             isError   ? <AlertTriangle size={22} className="text-red-500" /> :
             isLoading ? <Loader2 size={22} className="text-blue-500 animate-spin" /> :
                         <UserCheck size={22} className="text-green-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-base">
              {isDone ? 'Giao việc thành công!' : isError ? 'Có lỗi xảy ra' : isLoading ? 'Đang xử lý...' : 'Xác nhận giao việc'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{projectName}</p>
          </div>
          {(isDone || isError) && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-6 py-4 space-y-2 max-h-56 overflow-y-auto">
          {assignments.map((a, i) => (
            <div key={a.member} className={`flex items-center gap-3 p-3 rounded-xl border ${
              isDone ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
            }`}>
              <MemberAvatar name={a.member} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  {i === 0 && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Owner</span>}
                  {a.member}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {a.roles.length > 0
                    ? a.roles.map((r, ri) => <RoleChip key={r} role={r} index={ri} />)
                    : <span className="text-xs text-gray-400">Chưa chọn vai trò</span>}
                </div>
              </div>
              {isDone && <CheckCircle2 size={15} className="text-green-500 shrink-0" />}
            </div>
          ))}
        </div>

        {state === 'confirm' && (
          <div className="px-6 py-4 flex gap-3 border-t border-gray-100">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
              Hủy
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2">
              <UserCheck size={15} />Xác nhận
            </button>
          </div>
        )}
        {state === 'done' && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button onClick={onClose}
              className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2">
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
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center mx-auto mb-3">
          <ClipboardList size={24} className="text-white" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Pick Task</h2>
        <p className="text-sm text-gray-500">Chọn thành viên để xem task được giao</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
        {members.map(m => (
          <button key={m.id} onClick={() => onSelect(m.name)}
            className="flex flex-col items-center gap-2.5 p-5 bg-white rounded-2xl border border-gray-200
                       hover:border-green-400 hover:bg-green-50 hover:shadow-md transition-all group">
            <span className="group-hover:scale-105 transition-transform">
              <MemberAvatar name={m.name} size="lg" />
            </span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-green-700">{m.name}</span>
          </button>
        ))}
      </div>
      <button onClick={onViewAll}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white
                   text-sm text-gray-600 hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-all shadow-sm">
        <List size={16} />Xem tất cả dự án
      </button>
    </div>
  );
}

// ─── Board chính ──────────────────────────────────────────────────────────────
function PickBoard({ member, onBack }: { member: string; onBack: () => void }) {
  const [poolTasks,    setPoolTasks]    = useState<TaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [isFromSheet,  setIsFromSheet]  = useState(false);
  const [search,       setSearch]       = useState('');
  const [activeMember, setActiveMember] = useState(member);
  const [showForm,     setShowForm]     = useState(false);

  // Confirm pick state
  const [confirmData,  setConfirmData]  = useState<{ projectId: string; projectName: string; assignments: MemberAssignment[] } | null>(null);
  const [confirmState, setConfirmState] = useState<'confirm' | 'loading' | 'done' | 'error'>('confirm');
  const [confirmError, setConfirmError] = useState('');

  const config = typeof window !== 'undefined' ? loadSheetsConfig() : null;
  const { members } = useDataSystem();
  const { refresh: refreshSheets } = useSheetsData();

  const loadPool = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const data = await api.getPoolTasks();
      setPoolTasks(data);
      setIsFromSheet(!!config?.poolSheet && data.length > 0);
    } catch {
      setPoolTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadPool(); }, [loadPool]);

  // Nhóm các dòng theo ID dự án (itTaskId)
  type ProjectGroup = {
    projectId:   string;
    projectName: string;
    assignments: { member: string; roles: string[] }[];
  };

  const projectGroups = useMemo((): ProjectGroup[] => {
    const map = new Map<string, ProjectGroup>();
    poolTasks.forEach(t => {
      const key  = t.itTaskId ?? t.project;
      const name = t.project;
      if (!map.has(key)) map.set(key, { projectId: key, projectName: name, assignments: [] });
      map.get(key)!.assignments.push({
        member: t.owner,
        roles:  t.role ? t.role.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
    });
    return Array.from(map.values());
  }, [poolTasks]);

  // Filter theo search + member
  const filtered = useMemo(() => {
    return projectGroups.filter(g => {
      if (activeMember && !g.assignments.some(a => a.member === activeMember)) return false;
      if (search) {
        const q = search.toLowerCase();
        return g.projectName.toLowerCase().includes(q) ||
               g.projectId.toLowerCase().includes(q) ||
               g.assignments.some(a => a.member.toLowerCase().includes(q));
      }
      return true;
    });
  }, [projectGroups, activeMember, search]);

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // Submit form → show confirm dialog
  function handleFormSave(projectId: string, projectName: string, assignments: MemberAssignment[]) {
    setConfirmData({ projectId, projectName, assignments });
    setConfirmState('confirm');
    setShowForm(false);
  }

  async function executeConfirmed() {
    if (!confirmData) return;
    setConfirmState('loading');

    const newRows: TaskRow[] = confirmData.assignments.map((a, i) => ({
      id:           `POOL${Date.now()}_${i}`,
      project:      confirmData.projectName,
      task:         confirmData.projectName,
      owner:        a.member,
      role:         a.roles.join(', ') || null,
      itTaskId:     confirmData.projectId || null,
      detail:       null, link: null, note: null,
      status:       'In Progress' as TaskRow['status'],
      startDate:    null, endDate: null,
      sourceSheet:  config?.poolSheet ?? 'Pool',
      sourceRow:    poolTasks.length + 2,
      lastModified: new Date().toISOString(),
    }));

    // Optimistic update
    setPoolTasks(prev => [...prev, ...newRows]);

    if (!config?.appsScriptUrl) { setConfirmState('done'); return; }

    try {
      await Promise.all(
        newRows.map(t =>
          api.pickPoolTask(t.id, t.owner, config?.poolSheet)
        )
      );
      await refreshSheets();
      setConfirmState('done');
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Lỗi không xác định');
      setConfirmState('error');
    }
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
            ? <>Sheet <strong>{config?.poolSheet}</strong> · {projectGroups.length} dự án · {poolTasks.length} lượt giao</>
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
            <p className="font-semibold text-gray-900 text-sm">
              {activeMember ? `Task của ${activeMember}` : 'Tất cả dự án'}
            </p>
            <p className="text-xs text-gray-400">{filtered.length} dự án</p>
          </div>

          {/* Selector khi xem tất cả */}
          {!member && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Xem của:</span>
              <div className="relative">
                <select value={activeMember}
                  onChange={e => { setActiveMember(e.target.value); }}
                  className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm outline-none ${
                    activeMember ? 'border-green-500 bg-green-50 text-green-800 font-medium' : 'border-gray-200 text-gray-600'
                  }`}>
                  <option value="">Tất cả</option>
                  {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm ml-auto">
            <Plus size={15} />Giao task mới
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm tên dự án, ID, thành viên..."
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
        {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
        <span className="text-xs text-gray-400">{filtered.length} dự án</span>
      </div>

      {/* ── Project list ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2rem_6rem_1fr_auto] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
          <div />
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tên dự án</div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-2">Thành viên</div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <ClipboardList size={34} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có dự án nào</p>
            <button onClick={() => setShowForm(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs hover:border-green-400 hover:text-green-600 transition-colors">
              <Plus size={13} />Thêm dự án mới
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(g => {
              const isOpen = expanded.has(g.projectId);
              const myAssignment = g.assignments.find(a => a.member === activeMember);

              return (
                <div key={g.projectId}>
                  {/* Project row */}
                  <div
                    className="grid grid-cols-[2rem_6rem_1fr_auto] gap-0 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                    onClick={() => toggleExpand(g.projectId)}
                  >
                    {/* Expand arrow */}
                    <div className="flex items-center">
                      <ChevronRight size={15} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </div>

                    {/* ID */}
                    <div>
                      <span className="text-xs font-mono font-semibold text-gray-500">
                        {g.projectId}
                      </span>
                    </div>

                    {/* Tên dự án */}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{g.projectName}</p>
                      {myAssignment && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {myAssignment.roles.map((r, i) => (
                            <RoleChip key={r} role={r} index={i} />
                          ))}
                          {myAssignment.roles.length === 0 && (
                            <span className="text-xs text-gray-400">Chưa có vai trò</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Avatar stack */}
                    <div className="flex items-center pr-2">
                      <div className="flex -space-x-2">
                        {g.assignments.slice(0, 4).map((a, i) => (
                          <div key={a.member} className="ring-2 ring-white rounded-full" style={{ zIndex: 10 - i }}>
                            <MemberAvatar name={a.member} size="sm" />
                          </div>
                        ))}
                        {g.assignments.length > 4 && (
                          <div className="w-7 h-7 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-500">+{g.assignments.length - 4}</span>
                          </div>
                        )}
                      </div>
                      <span className="ml-2 text-xs text-gray-400">{g.assignments.length}</span>
                    </div>
                  </div>

                  {/* Expanded: member details */}
                  {isOpen && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                      <div className="space-y-2 ml-8">
                        {g.assignments.map((a, i) => (
                          <div key={`${a.member}_${i}`}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border bg-white ${
                              a.member === activeMember ? 'border-green-200' : 'border-gray-100'
                            }`}>
                            <MemberAvatar name={a.member} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-800">{a.member}</span>
                                {i === 0 && (
                                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                                    Owner
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {a.roles.length > 0
                                  ? a.roles.map((r, ri) => <RoleChip key={r} role={r} index={ri} />)
                                  : <span className="text-xs text-gray-400">Chưa có vai trò</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form giao task */}
      {showForm && (
        <AssignTaskForm
          onClose={() => setShowForm(false)}
          onSave={handleFormSave}
        />
      )}

      {/* Confirm dialog */}
      {confirmData && confirmState !== 'confirm' || (confirmData && confirmState === 'confirm') ? (
        confirmData ? (
          <PickConfirmDialog
            projectName={`${confirmData.projectId ? `[${confirmData.projectId}] ` : ''}${confirmData.projectName}`}
            assignments={confirmData.assignments}
            state={confirmState}
            errorMsg={confirmError}
            onConfirm={executeConfirmed}
            onClose={() => { setConfirmData(null); setConfirmError(''); }}
          />
        ) : null
      ) : null}
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
