'use client';
/**
 * Global reactive store cho màu thành viên tuỳ chỉnh.
 * Lưu vào localStorage key "ak_member_colors": { "Tuyền": "#ff6600", ... }
 *
 * Dùng pattern subscriber đơn giản để tất cả component (MemberAvatar,
 * MyTasksModule...) cập nhật đồng bộ khi màu thay đổi mà không cần Context.
 */
import { useState, useEffect } from 'react';

const LS_KEY = 'ak_member_colors';

// ─── Global store (module-level, shared across all hook instances) ────────────
let _colors: Record<string, string> = {};
const _subs = new Set<() => void>();

function _load() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    _colors = raw ? JSON.parse(raw) : {};
  } catch { _colors = {}; }
}

function _save(next: Record<string, string>) {
  _colors = next;
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  _subs.forEach(fn => fn()); // notify tất cả subscribers
}

// Load một lần khi module được import
if (typeof window !== 'undefined') _load();

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useMemberColors() {
  const [, tick] = useState(0); // trigger re-render khi _colors thay đổi

  useEffect(() => {
    _load(); // sync lại lần đầu render (hydration)
    const notify = () => tick(n => n + 1);
    _subs.add(notify);
    return () => { _subs.delete(notify); };
  }, []);

  /** Lấy màu tuỳ chỉnh, fallback về defaultColor nếu chưa đặt */
  const getColor = (name: string, defaultColor: string): string =>
    _colors[name] ?? defaultColor;

  /** Đặt màu cho 1 thành viên */
  const setColor = (name: string, color: string) => {
    _save({ ..._colors, [name]: color });
  };

  /** Xoá màu tuỳ chỉnh (về lại màu mặc định) */
  const resetColor = (name: string) => {
    const next = { ..._colors };
    delete next[name];
    _save(next);
  };

  /** Kiểm tra xem thành viên có đang dùng màu tuỳ chỉnh không */
  const hasCustomColor = (name: string): boolean => !!_colors[name];

  return { getColor, setColor, resetColor, hasCustomColor };
}
