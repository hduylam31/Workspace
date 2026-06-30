'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  Search, CheckSquare, Square, ChevronDown, X,
  ClipboardList, UserCheck, Loader2, Plus, ArrowLeft,
  List, CheckCircle2, AlertTriangle, Calendar, ExternalLink, Eye, Pencil, Save, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDataSystem } from '@/lib/use-data-system';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useSheetsData } from '@/lib/sheets-context';
import MemberAvatar from '@/components/MemberAvatar';
import { useToast, ToastContainer } from '@/components/ui/Toast';
import type { TaskRow, RoleTask } from '@/lib/types';

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

// ─── Role chip ───────────────────────────────────────────────────────────────
const ROLE_CHIP_COLORS: Record<string, string> = {
  'PO':  'bg-purple-100 text-purple-700 border-purple-200',
  'DA':  'bg-blue-100 text-blue-700 border-blue-200',
  'Dev': 'bg-green-100 text-green-700 border-green-200',
  'QC':  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'PMC': 'bg-orange-100 text-orange-700 border-orange-200',
  'PD':  'bg-pink-100 text-pink-700 border-pink-200',
  'BA':  'bg-teal-100 text-teal-700 border-teal-200',
};
function RoleChip({ role }: { role: string }) {
  const cls = ROLE_CHIP_COLORS[role] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold border ${cls}`}>{role}</span>;
}

// ─── Parse "Name[R1, R2]; Name2[R3]" or "Name[R1, R2|Task A; Task B]" ────────
function parseMemberRoles(raw: string | null): { name: string; roles: string[]; tasks: string[] }[] {
  if (!raw) return [];
  if (raw.includes('[')) {
    // Split by ]; to avoid breaking on ; inside task lists (tasks are separated by ; too)
    const rawParts = raw.split(/\];\s*/);
    const parts = rawParts.map((p, i) => i < rawParts.length - 1 ? p.trim() + ']' : p.trim());
    return parts.map(t => {
      const m = t.match(/^(.+)\[(.+)\]$/);
      if (m) {
        const inner = m[2];
        const pipe = inner.indexOf('|');
        if (pipe >= 0) return {
          name: m[1].trim(),
          roles: inner.slice(0, pipe).split(',').map(r => r.trim()).filter(Boolean),
          tasks: inner.slice(pipe + 1).split(';').map(t2 => t2.trim()).filter(Boolean),
        };
        return { name: m[1].trim(), roles: inner.split(',').map(r => r.trim()).filter(Boolean), tasks: [] };
      }
      return { name: t.replace(/\]$/, '').trim(), roles: [], tasks: [] };
    }).filter(m => m.name);
  }
  return raw.split(',').map(s => ({ name: s.trim(), roles: [], tasks: [] })).filter(m => m.name);
}
function encodeMemberRoles(members: { name: string; roles: string[]; tasks?: string[] }[]): string {
  return members.map(m => {
    if (!m.roles.length) return m.name;
    const inner = m.tasks?.length ? `${m.roles.join(', ')}|${m.tasks.join('; ')}` : m.roles.join(', ');
    return `${m.name}[${inner}]`;
  }).join('; ');
}

// ─── Parse / encode owner detail field (roles with optional tasks) ────────────
function parseOwnerDetail(detail: string | null): { roles: string[]; tasks: string[] } {
  if (!detail) return { roles: [], tasks: [] };
  const pipe = detail.indexOf('|');
  if (pipe >= 0) return {
    roles: detail.slice(0, pipe).split(',').map(r => r.trim()).filter(Boolean),
    tasks: detail.slice(pipe + 1).split(';').map(t => t.trim()).filter(Boolean),
  };
  return { roles: detail.split(',').map(r => r.trim()).filter(Boolean), tasks: [] };
}
function encodeOwnerDetail(roles: string[], tasks: string[]): string | null {
  if (!roles.length) return null;
  return tasks.length ? `${roles.join(', ')}|${tasks.join('; ')}` : roles.join(', ');
}

// ─── Role background colors ──────────────────────────────────────────────────
const ROLE_BG: Record<string, string> = {
  'PO':  'bg-green-100 text-green-800 border-green-300',
  'PMC': 'bg-orange-100 text-orange-800 border-orange-300',
  'PD':  'bg-blue-100 text-blue-800 border-blue-300',
  'DA':  'bg-purple-100 text-purple-800 border-purple-300',
};
function getRoleBg(role: string) { return ROLE_BG[role] ?? 'bg-gray-100 text-gray-700 border-gray-200'; }

// ─── Modal chọn đầu việc theo vai trò ────────────────────────────────────────
function RoleTaskPickerModal({
  filterRoles, initialSelected, onSave, onClose,
}: {
  filterRoles?: string[];
  initialSelected?: string[];
  onSave: (selected: string[]) => void;
  onClose: () => void;
}) {
  const [roleTasks, setRoleTasks] = useState<RoleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    api.getRoleTasks()
      .then(data => setRoleTasks(filterRoles?.length ? data.filter(t => filterRoles.includes(t.role)) : data))
      .catch(() => setRoleTasks([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRoles = useMemo(() => [...new Set(roleTasks.map(t => t.role))], [roleTasks]);
  const filtered = useMemo(
    () => roleFilter === 'all' ? roleTasks : roleTasks.filter(t => t.role === roleFilter),
    [roleTasks, roleFilter],
  );
  const grouped = useMemo(() => {
    const g: Record<string, RoleTask[]> = {};
    filtered.forEach(t => { if (!g[t.role]) g[t.role] = []; g[t.role].push(t); });
    return g;
  }, [filtered]);

  function toggleTask(name: string) {
    setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }
  function toggleGroup(tasks: RoleTask[]) {
    const all = tasks.every(t => selected.has(t.taskName));
    setSelected(prev => {
      const n = new Set(prev);
      tasks.forEach(t => all ? n.delete(t.taskName) : n.add(t.taskName));
      return n;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Chọn đầu việc theo vai trò</h3>
            <p className="text-xs text-gray-400 mt-0.5">Tick vào các đầu việc sẽ thực hiện</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
        </div>
        {/* Role filter tabs */}
        <div className="px-6 pt-3 shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${roleFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              Tất cả
            </button>
            {allRoles.map(role => (
              <button key={role} onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${roleFilter === role ? getRoleBg(role) : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                {role}
              </button>
            ))}
          </div>
        </div>
        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {loading
            ? <div className="flex items-center justify-center h-32"><Loader2 size={24} className="text-green-500 animate-spin" /></div>
            : Object.entries(grouped).map(([role, tasks]) => (
              <div key={role}>
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer mb-2 ${getRoleBg(role)}`}
                  onClick={() => toggleGroup(tasks)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{role}</span>
                    <span className="text-xs opacity-70">{tasks.length} đầu việc</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {tasks.every(t => selected.has(t.taskName))
                      ? <><CheckSquare size={14} />Bỏ chọn tất cả</>
                      : <><Square size={14} />Chọn tất cả</>}
                  </div>
                </div>
                <div className="space-y-1 pl-2">
                  {tasks.map(t => {
                    const isSel = selected.has(t.taskName);
                    return (
                      <label key={t.taskName} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isSel ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleTask(t.taskName)} className="w-4 h-4 accent-green-600 shrink-0" />
                        <span className="text-xs font-mono text-gray-400 w-5 shrink-0">{t.stt}.</span>
                        <span className={`text-sm ${isSel ? 'text-green-800 font-medium' : 'text-gray-700'}`}>{t.taskName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          }
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center gap-3">
          <span className="text-sm text-gray-500 flex-1">
            {selected.size > 0
              ? <span className="text-green-700 font-semibold">{selected.size} đầu việc đã chọn</span>
              : 'Chưa chọn đầu việc nào'}
          </span>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Bỏ qua</button>
          <button onClick={() => onSave([...selected])} className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} />Lưu{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form thêm task mới vào Pool ─────────────────────────────────────────────
function AddPoolTaskForm({ onClose, onSave }: { onClose: () => void; onSave: (data: Partial<TaskRow>) => void }) {
  const { members, roles: allRoles, projectStatuses } = useDataSystem();
  const [projectName,  setProjectName]  = useState('');
  const [status,       setStatus]       = useState('In Progress');
  const [loaiDuAn,     setLoaiDuAn]     = useState<'Task' | 'Subtask'>('Task');
  const [owner,        setOwner]        = useState('');
  const [ownerRoles,   setOwnerRoles]   = useState<string[]>([]);
  const [otherMembers, setOtherMembers] = useState<string[]>([]);
  const [memberRoles,  setMemberRoles]  = useState<Record<string, string[]>>({});
  const [deadline,     setDeadline]     = useState('');
  const [link,         setLink]         = useState('');
  const [noteText,     setNoteText]     = useState('');
  const [ownerTasks,   setOwnerTasks]   = useState<string[]>([]);
  const [memberTasks,  setMemberTasks]  = useState<Record<string, string[]>>({});
  const [pickerTarget, setPickerTarget] = useState<'owner' | string | null>(null);
  const [pickerRoles,  setPickerRoles]  = useState<string[]>([]);

  const availableRoles = allRoles.length ? allRoles : ['PO', 'DA', 'Dev', 'QC', 'PMC', 'PD', 'BA'];

  function toggleOther(name: string) {
    setOtherMembers(prev => {
      if (prev.includes(name)) {
        setMemberRoles(r => { const n = { ...r }; delete n[name]; return n; });
        setMemberTasks(t => { const n = { ...t }; delete n[name]; return n; });
        return prev.filter(n => n !== name);
      }
      return [...prev, name];
    });
  }
  function openPickerFor(target: 'owner' | string, roles: string[]) {
    if (!roles.length) return;
    setPickerTarget(target);
    setPickerRoles(roles);
  }
  function handlePickerSave(tasks: string[]) {
    if (pickerTarget === 'owner') setOwnerTasks(tasks);
    else if (pickerTarget) setMemberTasks(prev => ({ ...prev, [pickerTarget]: tasks }));
    setPickerTarget(null);
  }
  function toggleOwnerRole(role: string) {
    setOwnerRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  }
  function toggleMemberRole(member: string, role: string) {
    setMemberRoles(prev => {
      const cur = prev[member] ?? [];
      return { ...prev, [member]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] };
    });
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;

    // Validate: owner phải chọn ít nhất 1 task nếu đã có role
    if (owner && ownerRoles.length > 0 && ownerTasks.length === 0) {
      alert(`Owner "${owner}" chưa chọn đầu việc. Vui lòng chọn ít nhất 1 task.`);
      return;
    }
    // Validate: từng thành viên phải có ít nhất 1 task nếu đã có role
    for (const name of otherMembers) {
      const roles = memberRoles[name] ?? [];
      const tasks = memberTasks[name] ?? [];
      if (roles.length > 0 && tasks.length === 0) {
        alert(`"${name}" chưa chọn đầu việc. Vui lòng chọn ít nhất 1 task.`);
        return;
      }
    }

    const memberStr = otherMembers.length > 0
      ? encodeMemberRoles(otherMembers.map(name => ({ name, roles: memberRoles[name] ?? [], tasks: memberTasks[name] ?? [] })))
      : null;
    onSave({
      project: projectName.trim(), task: loaiDuAn,
      status: status as TaskRow['status'], owner,
      role: memberStr,
      detail: encodeOwnerDetail(ownerRoles, ownerTasks),
      endDate: deadline || null,
      link: link.trim() || null,
      note: noteText.trim() || null,
    });
  }
  const availableStatuses = projectStatuses.length ? projectStatuses : ['In Progress', 'Done', 'Backlog'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-gray-900">Thêm task vào Pool</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Tên dự án */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tên dự án *</label>
              <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                placeholder="Nhập tên dự án..." autoFocus
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
            </div>
            {/* Trạng thái + Loại */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Trạng thái</label>
                <div className="relative">
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500">
                    {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Loại dự án</label>
                <div className="flex gap-2">
                  {(['Task', 'Subtask'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setLoaiDuAn(t)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        loaiDuAn === t
                          ? t === 'Subtask' ? 'bg-purple-600 text-white border-purple-600' : 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Owner */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Owner</label>
              <div className="relative">
                <select value={owner} onChange={e => { setOwner(e.target.value); setOwnerRoles([]); }}
                  className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500">
                  <option value="">-- Chọn Owner --</option>
                  {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
              </div>
              {owner && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 mb-1.5">Vai trò của Owner{ownerRoles.length > 0 && <span className="ml-1 text-green-600 font-semibold">({ownerRoles.join(', ')})</span>}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableRoles.map(role => (
                      <button key={role} type="button" onClick={() => toggleOwnerRole(role)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          ownerRoles.includes(role) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-400'
                        }`}>{role}</button>
                    ))}
                  </div>
                  {ownerRoles.length > 0 && (
                    <button type="button" onClick={() => openPickerFor('owner', ownerRoles)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-green-400 text-xs text-green-700 hover:bg-green-50 transition-colors">
                      <ClipboardList size={13} />
                      {ownerTasks.length > 0
                        ? <><CheckCircle2 size={12} />{ownerTasks.length} đầu việc đã chọn — Sửa</>
                        : 'Chọn đầu việc cho Owner'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Thành viên khác */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Thành viên khác{otherMembers.length > 0 && <span className="ml-1.5 text-green-600">({otherMembers.length} đã chọn)</span>}
              </label>
              <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-xl bg-gray-50 min-h-[44px]">
                {members.filter(m => m.name !== owner).map((m, i) => {
                  const selected = otherMembers.includes(m.name);
                  return (
                    <button key={m.name} type="button" onClick={() => toggleOther(m.name)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        selected ? `${CHIP_COLORS[i % CHIP_COLORS.length]} border-transparent ring-2 ring-green-400` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>
                      <MemberAvatar name={m.name} size="sm" />{m.name}
                    </button>
                  );
                })}
                {members.filter(m => m.name !== owner).length === 0 && (
                  <span className="text-xs text-gray-400">Chọn Owner trước để lọc thành viên</span>
                )}
              </div>
              {otherMembers.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-400">Vai trò từng thành viên</p>
                  {otherMembers.map(name => (
                    <div key={name} className="p-2 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="flex items-center gap-1.5 min-w-[90px] shrink-0 mt-0.5">
                          <MemberAvatar name={name} size="sm" />
                          <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availableRoles.map(role => (
                            <button key={role} type="button" onClick={() => toggleMemberRole(name, role)}
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                                (memberRoles[name] ?? []).includes(role) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                              }`}>{role}</button>
                          ))}
                        </div>
                      </div>
                      {(memberRoles[name] ?? []).length > 0 && (
                        <button type="button" onClick={() => openPickerFor(name, memberRoles[name] ?? [])}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-blue-300 text-xs text-blue-700 hover:bg-blue-50 transition-colors">
                          <ClipboardList size={12} />
                          {(memberTasks[name] ?? []).length > 0
                            ? <>{(memberTasks[name] ?? []).length} đầu việc — Sửa</>
                            : 'Chọn đầu việc'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Deadline */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5"><Calendar size={12} className="inline mr-1" />Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" />
            </div>
            {/* Link */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5"><ExternalLink size={12} className="inline mr-1" />Link</label>
              <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" />
            </div>
            {/* Ghi chú */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú</label>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Mô tả thêm về task..." rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={!projectName.trim()}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
              <Plus size={14} className="inline mr-1" />Thêm task
            </button>
          </div>
        </form>
      </div>
      {pickerTarget !== null && (
        <RoleTaskPickerModal
          filterRoles={pickerRoles}
          initialSelected={pickerTarget === 'owner' ? ownerTasks : (memberTasks[pickerTarget] ?? [])}
          onSave={handlePickerSave}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Task Detail Modal (view + edit mode) ────────────────────────────────────
function TaskDetailModal({
  task, onClose, onUpdate,
}: {
  task: TaskRow;
  onClose: () => void;
  onUpdate?: (updated: TaskRow, hasPick: boolean) => void;
}) {
  const { members: allMembers, roles: allRoles, projectStatuses } = useDataSystem();
  const availableRoles    = allRoles.length ? allRoles : ['PO', 'DA', 'Dev', 'QC', 'PMC', 'PD', 'BA'];
  const availableStatuses = projectStatuses.length ? projectStatuses : ['In Progress', 'Done', 'Backlog', 'Chuẩn bị đưa vào làm', 'Định kỳ'];

  const [isEditing, setIsEditing] = useState(false);
  const [saving,    setSaving]    = useState(false);

  // ── View state (derived) ──────────────────────────────────────────────────
  const ownerInfo = parseOwnerDetail(task.detail);
  const members   = parseMemberRoles(task.role);
  const isSubtask = task.task?.toLowerCase() === 'subtask';

  // ── Edit state ────────────────────────────────────────────────────────────
  const [projectName,  setProjectName]  = useState(task.project);
  const [status,       setStatus]       = useState(task.status);
  const [loaiDuAn,     setLoaiDuAn]     = useState<'Task' | 'Subtask'>(isSubtask ? 'Subtask' : 'Task');
  const [owner,        setOwner]        = useState(task.owner ?? '');
  const [ownerRoles,   setOwnerRoles]   = useState<string[]>(ownerInfo.roles);
  const [ownerTasks,   setOwnerTasks]   = useState<string[]>(ownerInfo.tasks);
  const [otherMembers, setOtherMembers] = useState<string[]>(members.map(m => m.name));
  const [memberRoles,  setMemberRoles]  = useState<Record<string, string[]>>(
    Object.fromEntries(members.map(m => [m.name, m.roles]))
  );
  const [memberTasks,  setMemberTasks]  = useState<Record<string, string[]>>(
    Object.fromEntries(members.map(m => [m.name, m.tasks]))
  );
  const [deadline,     setDeadline]     = useState(task.endDate ?? '');
  const [link,         setLink]         = useState(task.link ?? '');
  const [noteText,     setNoteText]     = useState(task.note ?? '');
  const [pickerTarget, setPickerTarget] = useState<'owner' | string | null>(null);
  const [pickerRoles,  setPickerRoles]  = useState<string[]>([]);

  function resetEdit() {
    const oi = parseOwnerDetail(task.detail);
    const ms = parseMemberRoles(task.role);
    setProjectName(task.project);
    setStatus(task.status);
    setLoaiDuAn(task.task?.toLowerCase() === 'subtask' ? 'Subtask' : 'Task');
    setOwner(task.owner ?? '');
    setOwnerRoles(oi.roles);
    setOwnerTasks(oi.tasks);
    setOtherMembers(ms.map(m => m.name));
    setMemberRoles(Object.fromEntries(ms.map(m => [m.name, m.roles])));
    setMemberTasks(Object.fromEntries(ms.map(m => [m.name, m.tasks])));
    setDeadline(task.endDate ?? '');
    setLink(task.link ?? '');
    setNoteText(task.note ?? '');
  }

  function toggleOther(name: string) {
    setOtherMembers(prev => {
      if (prev.includes(name)) {
        setMemberRoles(r => { const n = { ...r }; delete n[name]; return n; });
        setMemberTasks(t => { const n = { ...t }; delete n[name]; return n; });
        return prev.filter(n => n !== name);
      }
      return [...prev, name];
    });
  }
  function openPickerFor(target: 'owner' | string, roles: string[]) {
    if (!roles.length) return;
    setPickerTarget(target); setPickerRoles(roles);
  }
  function handlePickerSave(tasks: string[]) {
    if (pickerTarget === 'owner') setOwnerTasks(tasks);
    else if (pickerTarget) setMemberTasks(prev => ({ ...prev, [pickerTarget]: tasks }));
    setPickerTarget(null);
  }

  async function handleSave() {
    if (!projectName.trim()) return;

    // Validate: owner phải chọn ít nhất 1 task nếu đã có role
    if (owner && ownerRoles.length > 0 && ownerTasks.length === 0) {
      alert(`Owner "${owner}" chưa chọn đầu việc. Vui lòng chọn ít nhất 1 task.`);
      return;
    }
    // Validate: từng thành viên phải có ít nhất 1 task nếu đã có role
    for (const name of otherMembers) {
      const roles = memberRoles[name] ?? [];
      const tasks = memberTasks[name] ?? [];
      if (roles.length > 0 && tasks.length === 0) {
        alert(`"${name}" chưa chọn đầu việc. Vui lòng chọn ít nhất 1 task.`);
        return;
      }
    }

    setSaving(true);
    const memberStr = otherMembers.length > 0
      ? encodeMemberRoles(otherMembers.map(n => ({ name: n, roles: memberRoles[n] ?? [], tasks: memberTasks[n] ?? [] })))
      : null;
    const updated: TaskRow = {
      ...task,
      project:  projectName.trim(),
      task:     loaiDuAn,
      status:   status as TaskRow['status'],
      owner,
      detail:   encodeOwnerDetail(ownerRoles, ownerTasks),
      role:     memberStr,
      endDate:  deadline || null,
      link:     link.trim() || null,
      note:     noteText.trim() || null,
    };
    // Build assignments cho Role to Project + member sheets
    const assignments: Array<{ member: string; role: string; tasks: string }> = [];
    if (owner && ownerRoles.length > 0) {
      assignments.push({ member: owner, role: ownerRoles.join(', '), tasks: ownerTasks.join('; ') });
    }
    for (const name of otherMembers) {
      const roles = memberRoles[name] ?? [];
      const tasks = memberTasks[name] ?? [];
      if (roles.length > 0) assignments.push({ member: name, role: roles.join(', '), tasks: tasks.join('; ') });
    }

    try {
      await api.updatePoolTask(updated, assignments);
      onUpdate?.(updated, assignments.length > 0);
      setIsEditing(false);
      onClose(); // đóng modal để thấy list ngay
    } catch (err) {
      alert('Lỗi lưu: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={!isEditing ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            {!isEditing && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{task.id}</span>
                {(() => { const s = getStatusStyle(task.status); return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>{task.status}</span>; })()}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isSubtask ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{task.task || 'Task'}</span>
              </div>
            )}
            <h3 className="font-semibold text-gray-900 text-base leading-snug">
              {isEditing ? 'Chỉnh sửa task' : task.project}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <Pencil size={13} />Chỉnh sửa
              </button>
            )}
            <button onClick={() => { if (isEditing) { resetEdit(); setIsEditing(false); } else onClose(); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
          </div>
        </div>

        {/* ── View mode ── */}
        {!isEditing && (
          <>
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
              {/* Owner */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Owner</p>
                {task.owner ? (
                  <div className="p-3 bg-gray-50 rounded-xl space-y-2">
                    <div className="flex items-center gap-3">
                      <MemberAvatar name={task.owner} size="md" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{task.owner}</p>
                        {ownerInfo.roles.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{ownerInfo.roles.map(r => <RoleChip key={r} role={r} />)}</div>}
                      </div>
                    </div>
                    {ownerInfo.tasks.length > 0 && (
                      <div className="border-t border-gray-200 pt-2">
                        <p className="text-xs text-gray-400 mb-1.5">Đầu việc ({ownerInfo.tasks.length})</p>
                        <ul className="space-y-1">
                          {ownerInfo.tasks.map(t => (
                            <li key={t} className="flex items-center gap-2 text-xs text-gray-700">
                              <CheckCircle2 size={12} className="text-green-500 shrink-0" />{t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : <p className="text-sm text-gray-400 italic">Chưa có owner</p>}
              </div>
              {/* Thành viên khác */}
              {members.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Thành viên khác ({members.length})</p>
                  <div className="space-y-2">
                    {members.map((m, i) => (
                      <div key={m.name} className="p-2.5 bg-gray-50 rounded-xl space-y-2">
                        <div className="flex items-center gap-3">
                          <MemberAvatar name={m.name} size="sm" />
                          <span className={`text-sm font-medium min-w-[70px] ${CHIP_COLORS[i % CHIP_COLORS.length].split(' ')[1]}`}>{m.name}</span>
                          {m.roles.length > 0 ? <div className="flex flex-wrap gap-1">{m.roles.map(r => <RoleChip key={r} role={r} />)}</div> : <span className="text-xs text-gray-300">Chưa có vai trò</span>}
                        </div>
                        {m.tasks.length > 0 && (
                          <div className="border-t border-gray-200 pt-2 pl-1">
                            <p className="text-xs text-gray-400 mb-1">Đầu việc ({m.tasks.length})</p>
                            <ul className="space-y-1">
                              {m.tasks.map(t => (
                                <li key={t} className="flex items-center gap-2 text-xs text-gray-700">
                                  <CheckCircle2 size={12} className="text-blue-400 shrink-0" />{t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Deadline + Link */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Deadline</p>
                  {task.endDate ? <p className="text-sm font-medium text-gray-700">{new Date(task.endDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p> : <p className="text-sm text-gray-300">—</p>}
                </div>
                {task.link && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Link</p>
                    <a href={task.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"><ExternalLink size={13} />Mở link</a>
                  </div>
                )}
              </div>
              {/* Ghi chú */}
              {task.note && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Ghi chú</p>
                  <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">{task.note}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
              <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">Đóng</button>
            </div>
          </>
        )}

        {/* ── Edit mode ── */}
        {isEditing && (
          <>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Tên dự án */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tên dự án *</label>
                <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} autoFocus
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
              </div>
              {/* Trạng thái + Loại */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Trạng thái</label>
                  <div className="relative">
                    <select value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500">
                      {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Loại dự án</label>
                  <div className="flex gap-2">
                    {(['Task', 'Subtask'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setLoaiDuAn(t)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                          loaiDuAn === t
                            ? t === 'Subtask' ? 'bg-purple-600 text-white border-purple-600' : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Owner */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Owner</label>
                <div className="relative">
                  <select value={owner} onChange={e => { setOwner(e.target.value); setOwnerRoles([]); setOwnerTasks([]); }}
                    className="w-full appearance-none pl-3 pr-7 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500">
                    <option value="">-- Chọn Owner --</option>
                    {allMembers.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                </div>
                {owner && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1.5">Vai trò của Owner{ownerRoles.length > 0 && <span className="ml-1 text-green-600 font-semibold">({ownerRoles.join(', ')})</span>}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableRoles.map(role => (
                        <button key={role} type="button"
                          onClick={() => setOwnerRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${ownerRoles.includes(role) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-400'}`}>
                          {role}
                        </button>
                      ))}
                    </div>
                    {ownerRoles.length > 0 && (
                      <button type="button" onClick={() => openPickerFor('owner', ownerRoles)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-green-400 text-xs text-green-700 hover:bg-green-50">
                        <ClipboardList size={13} />
                        {ownerTasks.length > 0 ? <><CheckCircle2 size={12} />{ownerTasks.length} đầu việc — Sửa</> : 'Chọn đầu việc cho Owner'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Thành viên khác */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Thành viên khác{otherMembers.length > 0 && <span className="ml-1.5 text-green-600">({otherMembers.length} đã chọn)</span>}
                </label>
                <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-xl bg-gray-50 min-h-[44px]">
                  {allMembers.filter(m => m.name !== owner).map((m, i) => {
                    const sel = otherMembers.includes(m.name);
                    return (
                      <button key={m.name} type="button" onClick={() => toggleOther(m.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${sel ? `${CHIP_COLORS[i % CHIP_COLORS.length]} border-transparent ring-2 ring-green-400` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                        <MemberAvatar name={m.name} size="sm" />{m.name}
                      </button>
                    );
                  })}
                </div>
                {otherMembers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-400">Vai trò từng thành viên</p>
                    {otherMembers.map(name => (
                      <div key={name} className="p-2 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <div className="flex items-center gap-1.5 min-w-[90px] shrink-0 mt-0.5">
                            <MemberAvatar name={name} size="sm" />
                            <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {availableRoles.map(role => (
                              <button key={role} type="button"
                                onClick={() => setMemberRoles(prev => { const cur = prev[name] ?? []; return { ...prev, [name]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] }; })}
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${(memberRoles[name] ?? []).includes(role) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}>
                                {role}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(memberRoles[name] ?? []).length > 0 && (
                          <button type="button" onClick={() => openPickerFor(name, memberRoles[name] ?? [])}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-blue-300 text-xs text-blue-700 hover:bg-blue-50">
                            <ClipboardList size={12} />
                            {(memberTasks[name] ?? []).length > 0 ? <>{(memberTasks[name] ?? []).length} đầu việc — Sửa</> : 'Chọn đầu việc'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Deadline */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5"><Calendar size={12} className="inline mr-1" />Deadline</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" />
              </div>
              {/* Link */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5"><ExternalLink size={12} className="inline mr-1" />Link</label>
                <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" />
              </div>
              {/* Ghi chú */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú</label>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="Mô tả thêm về task..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button type="button" onClick={() => { resetEdit(); setIsEditing(false); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Hủy</button>
              <button type="button" onClick={handleSave} disabled={!projectName.trim() || saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
            {pickerTarget !== null && (
              <RoleTaskPickerModal
                filterRoles={pickerRoles}
                initialSelected={pickerTarget === 'owner' ? ownerTasks : (memberTasks[pickerTarget] ?? [])}
                onSave={handlePickerSave}
                onClose={() => setPickerTarget(null)}
              />
            )}
          </>
        )}
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
  const [detailTask,   setDetailTask]   = useState<TaskRow | null>(null);
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast(8000);

  const config = typeof window !== 'undefined' ? loadSheetsConfig() : null;
  const { members } = useDataSystem();
  const { refresh: refreshSheets } = useSheetsData();

  useEffect(() => {
    api.getPoolTasks()
      .then(data => {
        setPoolTasks(data);
        const initialPicked: PickedMap = {};
        // itTaskId có giá trị = task đã được pick (đã copy sang My Tasks)
        data.forEach(t => { if (t.itTaskId) initialPicked[t.id] = t.owner; });
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

    try {
      const results = await Promise.allSettled(
        confirmTasks.map(t => {
          // Build assignments cho TẤT CẢ thành viên trong task
          const ownerInfo  = parseOwnerDetail(t.detail);
          const memberList = parseMemberRoles(t.role);

          const assignments: Array<{ member: string; role: string; tasks: string }> = [
            // Owner
            ...(t.owner ? [{
              member: t.owner,
              role:   ownerInfo.roles.join(', '),
              tasks:  ownerInfo.tasks.join('; '),
            }] : []),
            // Các thành viên khác
            ...memberList.map(m => ({
              member: m.name,
              role:   m.roles.join(', '),
              tasks:  m.tasks.join('; '),
            })),
          ].filter(a => a.member.trim() !== '');

          return api.pickPoolTask(t.id, activeMember, cfg?.poolSheet, t.project, assignments);
        })
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

  async function handleDeletePool(task: TaskRow) {
    if (!confirm(`Xóa dự án "${task.project}"?\nThao tác này sẽ xóa luôn Role to Project và task trong sheet thành viên.`)) return;
    setPoolTasks(prev => prev.filter(t => t.id !== task.id));
    try {
      await api.deletePoolTask(task.id);
      pushToast('success', 'Đã xóa dự án', task.project);
    } catch {
      setPoolTasks(prev => [task, ...prev]);
      pushToast('error', 'Xóa thất bại', 'Không thể xóa dự án khỏi sheet');
    }
  }

  async function handleAddTask(data: Partial<TaskRow>) {
    const newTask: TaskRow = {
      id:           `POOL${Date.now()}`,
      project:      data.project  ?? '',
      task:         data.task     ?? 'Task',
      owner:        data.owner    ?? '',
      role:         data.role     ?? null,
      status:       data.status   ?? 'In Progress',
      startDate:    null,
      endDate:      data.endDate  ?? null,
      detail:       data.detail   ?? null,
      link:         data.link     ?? null,
      note:         data.note     ?? null,
      sourceSheet:  'Pool',
      sourceRow:    poolTasks.length + 2,
      itTaskId:     null,
      lastModified: new Date().toISOString(),
    };

    // Cập nhật UI trước
    setPoolTasks(prev => [newTask, ...prev]);
    setShowAddForm(false);

    const cfg = loadSheetsConfig();
    const hasScriptUrl = !!cfg?.appsScriptUrl;
    pushToast('info',
      hasScriptUrl ? '📡 Đang ghi xuống Google Sheet...' : '⚠️ Chưa có Apps Script URL — chỉ lưu UI',
      hasScriptUrl ? `URL: ${cfg!.appsScriptUrl!.slice(0, 60)}...` : 'Vào Settings → điền Apps Script URL để ghi thật'
    );

    try {
      // 1. Ghi vào sheet "Dự án"
      const membersPreview = newTask.role
        ? newTask.role.replace(/\[[^\]]*\]/g, '').split(/;\s*/).map((p: string) => p.trim()).filter(Boolean).join(', ')
        : '(chưa chọn thành viên)';
      pushToast('info', '📤 Data gửi lên sheet "Dự án"',
        `F(Thành viên): "${membersPreview}" | G(Deadline): "${newTask.endDate ?? '(trống)'}"`
      );
      await api.addPoolTask(newTask);
      pushToast('success', '✅ Đã ghi vào sheet "Dự án"', `ID: ${newTask.id} · ${newTask.project}`);

      // 2. Ghi vào Role to Project + sheet thành viên nếu có role
      //    (kể cả khi chưa chọn đầu việc cụ thể)
      const ownerInfo  = parseOwnerDetail(data.detail ?? null);
      const memberList = parseMemberRoles(data.role ?? null);

      const assignments: Array<{ member: string; role: string; tasks: string }> = [
        // Owner — luôn ghi vào sheet của họ
        ...(newTask.owner ? [{
          member: newTask.owner,
          role:   ownerInfo.roles.join(', '),
          tasks:  ownerInfo.tasks.join('; '),
        }] : []),
        // Thành viên khác
        ...memberList
          .filter(m => m.name)
          .map(m => ({
            member: m.name,
            role:   m.roles.join(', '),
            tasks:  m.tasks.join('; '),
          })),
      ].filter(a => a.member.trim() !== '');

      pushToast('info',
        `📋 Tìm thấy ${assignments.length} thành viên cần ghi`,
        assignments.length > 0
          ? assignments.map(a => `${a.member}(${a.role || 'chưa có role'})`).join(', ')
          : 'Owner chưa chọn vai trò — không ghi Role to Project'
      );

      if (assignments.length > 0) {
        setPickedBy(prev => ({ ...prev, [newTask.id]: newTask.owner }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pickResult = await api.pickPoolTask(newTask.id, newTask.owner, undefined, newTask.project, assignments) as any;
        const errs: string[] = pickResult?.errors ?? [];
        if (errs.length > 0) {
          pushToast('error', '⚠️ Lỗi ghi sheet thành viên', errs.join(' | '));
        } else {
          pushToast('success', '✅ Đã ghi vào Role to Project + sheet thành viên',
            `r2p: ${pickResult?.r2pRows ?? 0} rows · tasks: ${pickResult?.taskRows ?? 0} rows · ${(pickResult?.writtenMembers ?? []).join(', ')}`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushToast('error', '❌ Lỗi khi ghi xuống sheet', msg);
      console.error('[PickTask] handleAddTask failed:', err);
    }
  }

  if (loadingTasks) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">ID</th>
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
                const parsedMembers = parseMemberRoles(task.role);

                const isHovered = hoveredRow === task.id;
                return (
                  <tr
                    key={task.id}
                    onClick={() => !isPicked && toggle(task.id)}
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className={`group transition-colors ${
                      isPicked   ? 'bg-gray-50 opacity-70' :
                      isSelected ? 'bg-green-50 cursor-pointer' :
                      isHovered  ? 'bg-gray-50 cursor-pointer' :
                                   'cursor-pointer'
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

                    {/* ID */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-semibold ${isPicked ? 'text-gray-400' : 'text-gray-500'}`}>
                        {task.id}
                      </span>
                    </td>

                    {/* Tên dự án */}
                    <td className="px-4 py-3 max-w-[240px]">
                      <div
                        className="flex items-center gap-1.5 cursor-pointer"
                        onClick={e => { e.stopPropagation(); setDetailTask(task); }}
                      >
                        <p className={`font-medium text-sm truncate transition-colors ${
                          isPicked
                            ? isHovered ? 'text-gray-600 line-through underline underline-offset-2' : 'text-gray-400 line-through'
                            : isHovered ? 'text-green-800 underline underline-offset-2' : 'text-green-700'
                        }`}>
                          {task.project}
                        </p>
                        <Eye
                          size={13}
                          className={`shrink-0 transition-all ${isHovered ? 'text-green-500 opacity-100' : 'opacity-0'}`}
                        />
                      </div>
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
                      {parsedMembers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {parsedMembers.map((m, i) => (
                            <MemberChip key={m.name} name={m.name} index={i} />
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

                    {/* Xóa */}
                    <td className="px-2 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); handleDeletePool(task); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Xóa dự án"
                      >
                        <Trash2 size={13} />
                      </button>
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

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onUpdate={(updated, hasPick) => {
            setPoolTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
            setDetailTask(updated);
            if (hasPick && updated.owner) {
              setPickedBy(prev => ({ ...prev, [updated.id]: updated.owner! }));
            }
          }}
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
