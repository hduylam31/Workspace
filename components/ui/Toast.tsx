'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastItem { id: number; type: ToastType; msg: string; detail?: string }

let _id = 0;
export function nextToastId() { return ++_id; }

const ICONS = {
  success: <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />,
  error:   <XCircle      size={16} className="text-red-500   shrink-0 mt-0.5" />,
  info:    <Info         size={16} className="text-blue-500  shrink-0 mt-0.5" />,
};

const BG = {
  success: 'bg-white border-green-200',
  error:   'bg-white border-red-200',
  info:    'bg-white border-blue-200',
};

export function ToastContainer({ toasts, onDismiss }: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg max-w-xs pointer-events-auto
            animate-[fadeInUp_0.2s_ease] ${BG[t.type]}`}
        >
          {ICONS[t.type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 leading-snug">{t.msg}</p>
            {t.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{t.detail}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast(duration = 4000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function push(type: ToastType, msg: string, detail?: string) {
    const id = nextToastId();
    setToasts(prev => [...prev, { id, type, msg, detail }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }

  function dismiss(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  return { toasts, push, dismiss };
}
