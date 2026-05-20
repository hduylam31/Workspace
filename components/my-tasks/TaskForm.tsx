'use client';
import { useState, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { loadSheetsConfig } from '@/lib/google-sheets';
import { useDataSystem } from '@/lib/use-data-system';
import Combobox from '@/components/Combobox';
import type { TaskRow } from '@/lib/types';

interface Props {
  task?: TaskRow | null;
  owner: string;
  onClose: () => void;
  onSave: (task: Partial<TaskRow>) => void;
}

export default function TaskForm({ task, owner, onClose, onSave }: Props) {
  const { projects, statuses, roles, loading: dsLoading } = useDataSystem();
  const [form, setForm] = useState({
    project:   task?.project   ?? '',
    task:      task?.task      ?? '',
    role:      task?.role      ?? '',
    status:    task?.status    ?? '',
    detail:    task?.detail    ?? '',
    link:      task?.link      ?? '',
    startDate: task?.startDate ?? '',
    endDate:   task?.endDate   ?? '',
    note:      task?.note      ?? '',
  });
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [progress, setProgress] = useState(0);
  const [saved, setSaved]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasScript = !!loadSheetsConfig()?.appsScriptUrl;

  // Status hiện tại — fallback về phần tử đầu khi danh sách load xong
  const currentStatus = form.status || statuses[0] || 'Chuẩn bị đưa vào làm';

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
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
        owner,
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
            <h2 className="font-semibold text-gray-900">{task ? 'Sửa Task' : 'Thêm Task mới'}</h2>
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
          {/* Dự án */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dự án <span className="text-red-500">*</span>
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
              Tên Task <span className="text-red-500">*</span>
            </label>
            <input
              value={form.task}
              onChange={e => set('task', e.target.value)}
              placeholder="Nhập tên task..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200"
              required
            />
          </div>

          {/* Status + Vai trò — 2 cột */}
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
              <Combobox
                value={form.role}
                onChange={v => set('role', v)}
                options={roles}
                placeholder="Chọn vai trò..."
                allowFreeText={false}
                loading={dsLoading}
              />
            </div>
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

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              value={form.note}
              onChange={e => set('note', e.target.value)}
              placeholder="Ghi chú thêm..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
            />
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
