'use client';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { ALL_STATUSES } from '@/lib/config';
import type { TaskRow } from '@/lib/types';

interface Props {
  task?: TaskRow | null;
  owner: string;
  onClose: () => void;
  onSave: (task: Partial<TaskRow>) => void;
}

export default function TaskForm({ task, owner, onClose, onSave }: Props) {
  const [projects, setProjects] = useState<string[]>([]);
  const [form, setForm] = useState({
    project: task?.project ?? '',
    task: task?.task ?? '',
    status: task?.status ?? 'Chuẩn bị làm',
    detail: task?.detail ?? '',
    link: task?.link ?? '',
    startDate: task?.startDate ?? '',
    endDate: task?.endDate ?? '',
    note: task?.note ?? '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProjects().then(p => setProjects(p.map(x => x.name)));
  }, []);

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project || !form.task || !form.status) return;
    setSaving(true);
    const data: Partial<TaskRow> = { ...form, owner, status: form.status as TaskRow['status'] };
    if (task) data.id = task.id;
    await api.addTask(data);
    onSave(data);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{task ? 'Sửa Task' : 'Thêm Task mới'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dự án <span className="text-red-500">*</span></label>
            <input
              list="projects-list"
              value={form.project}
              onChange={e => set('project', e.target.value)}
              placeholder="Chọn hoặc nhập dự án..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
              required
            />
            <datalist id="projects-list">
              {projects.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên Task <span className="text-red-500">*</span></label>
            <input
              value={form.task}
              onChange={e => set('task', e.target.value)}
              placeholder="Nhập tên task..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status <span className="text-red-500">*</span></label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              value={form.note}
              onChange={e => set('note', e.target.value)}
              placeholder="Ghi chú thêm..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : task ? 'Lưu thay đổi' : 'Thêm Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
