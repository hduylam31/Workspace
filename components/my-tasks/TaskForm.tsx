'use client';
import { useState, useRef } from 'react';
import { X, CheckCircle, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useDataSystem } from '@/lib/use-data-system';
import Combobox from '@/components/Combobox';
import MemberAvatar from '@/components/MemberAvatar';
import type { TaskRow } from '@/lib/types';

interface Props {
  task?: TaskRow | null;
  /** Owner mặc định — nếu truyền vào sẽ pre-fill, vẫn có thể đổi trong form */
  owner: string;
  /** Nếu true, ẩn trường Owner (dùng khi context đã cố định member) */
  lockOwner?: boolean;
  onClose: () => void;
  onSave: (task: Partial<TaskRow>) => void;
  title?: string;
}

/** Parse role string "PO, DA" → ['PO','DA'] */
function parseRoles(roleStr: string | null | undefined): string[] {
  if (!roleStr) return [];
  return roleStr.split(',').map(r => r.trim()).filter(Boolean);
}

/** Join roles array → "PO, DA" */
function joinRoles(roles: string[]): string {
  return roles.join(', ');
}

export default function TaskForm({ task, owner, lockOwner = false, onClose, onSave, title }: Props) {
  const { projects, statuses, roles, members, loading: dsLoading } = useDataSystem();
  const [form, setForm] = useState({
    project:   task?.project   ?? '',
    task:      task?.task      ?? '',
    status:    task?.status    ?? '',
    detail:    task?.detail    ?? '',
    link:      task?.link      ?? '',
    startDate: task?.startDate ?? '',
    endDate:   task?.endDate   ?? '',
  });
  const [selectedOwner, setSelectedOwner] = useState(task?.owner || owner);
  // Vai trò — multi-select (lưu dạng mảng, khi submit join thành "PO, DA")
  const [selectedRoles, setSelectedRoles] = useState<string[]>(parseRoles(task?.role));

  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [progress, setProgress] = useState(0);
  const [saved, setSaved]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasScript = false; // Apps Script đã xóa, sẽ viết lại

  const currentStatus = form.status || statuses[0] || 'Chuẩn bị đưa vào làm';

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project || !form.task || !currentStatus) return;
    setSaving(true);
    setSaved(false);
    setProgress(0);

    if (hasScript) {
      setSaveMsg('Đang lưu xuống Google Sheets...');
      let p = 0;
      timerRef.current = setInterval(() => {
        p += p < 70 ? 8 : p < 90 ? 2 : 0.5;
        setProgress(Math.min(p, 93));
      }, 500);
    }

    try {
      const data: Partial<TaskRow> = {
        ...form,
        status: currentStatus as TaskRow['status'],
        role:   joinRoles(selectedRoles) || null,
        owner:  selectedOwner || owner,
      };
      if (task) data.id = task.id;
      const result = await (task
        ? api.updateTask({ ...data, id: task.id } as TaskRow)
        : api.addTask(data));
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      setSaved(true);
      setSaveMsg('Đã lưu thành công!');
      onSave(task ? data : (result as Partial<TaskRow>) ?? data);
      setTimeout(() => onClose(), 600);
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(0);
      setSaveMsg('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-2xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{title ?? (task ? 'Sửa Task' : 'Thêm Task mới')}</h2>
            <button onClick={onClose} disabled={saving} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40">
              <X size={18} />
            </button>
          </div>
          {saving && progress > 0 && (
            <div className="h-1 bg-gray-100">
              <div
                className={`h-full transition-all duration-500 ${saved ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* ID — chỉ hiện khi đang edit, read-only */}
          {task?.id && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide shrink-0">ID</span>
              <span className="text-xs font-mono text-gray-600 font-semibold">{task.id}</span>
              <span className="ml-auto text-[10px] text-gray-400 italic">Tự động</span>
            </div>
          )}

          {/* Owner */}
          {!lockOwner && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Owner <span className="text-red-500">*</span>
              </label>
              {dsLoading ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {selectedOwner
                      ? <MemberAvatar name={selectedOwner} size="sm" />
                      : <div className="w-7 h-7 rounded-full bg-gray-200" />}
                  </div>
                  <select
                    value={selectedOwner}
                    onChange={e => setSelectedOwner(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg pl-11 pr-8 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 appearance-none bg-white"
                    required
                  >
                    <option value="">-- Chọn thành viên --</option>
                    {members.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          )}

          {/* Dự án */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên dự án <span className="text-red-500">*</span>
            </label>
            <Combobox
              value={form.project}
              onChange={v => set('project', v)}
              options={projects}
              placeholder="Chọn hoặc nhập dự án..."
              allowFreeText={true}
              loading={dsLoading}
              required
            />
          </div>

          {/* Tên Task */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task <span className="text-red-500">*</span>
            </label>
            <input
              value={form.task}
              onChange={e => set('task', e.target.value)}
              placeholder="Nhập tên task..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
              required
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <Combobox
              value={currentStatus}
              onChange={v => set('status', v)}
              options={statuses}
              placeholder="Chọn trạng thái..."
              allowFreeText={false}
              loading={dsLoading}
            />
          </div>

          {/* Vai trò — multi-select checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Vai trò
              <span className="ml-1.5 text-xs font-normal text-gray-400">(chọn nhiều)</span>
            </label>
            {dsLoading ? (
              <div className="flex gap-1.5">
                {[1,2,3].map(i => <div key={i} className="h-7 w-14 bg-gray-100 rounded-full animate-pulse" />)}
              </div>
            ) : roles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Chưa có dữ liệu vai trò từ Data System</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map(role => {
                  const selected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-700'
                      }`}
                    >
                      {selected && <span className="mr-1">✓</span>}
                      {role}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedRoles.length > 0 && (
              <p className="text-xs text-green-600 mt-1.5 font-medium">
                Đã chọn: {selectedRoles.join(', ')}
              </p>
            )}
          </div>

          {/* Chi tiết */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chi tiết</label>
            <textarea
              value={form.detail}
              onChange={e => set('detail', e.target.value)}
              rows={3}
              placeholder="Mô tả chi tiết task..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 resize-none"
            />
          </div>

          {/* Link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link (Figma / Google Doc)</label>
            <input
              type="url"
              value={form.link}
              onChange={e => set('link', e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
            />
          </div>

          {/* Ngày */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
              />
            </div>
          </div>

          {/* Save message */}
          {saveMsg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              saved ? 'bg-green-50 text-green-700' :
              saveMsg.startsWith('Lỗi') ? 'bg-red-50 text-red-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              {saved && <CheckCircle size={14} />}
              <span>{saveMsg}</span>
              {saving && hasScript && !saved && (
                <span className="text-xs text-blue-500 ml-auto">Apps Script lần đầu ~10s</span>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || saved}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saved ? <><CheckCircle size={15} /> Đã lưu!</> :
               saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Đang lưu...
                </span>
               ) : task ? 'Lưu thay đổi' : 'Thêm Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
