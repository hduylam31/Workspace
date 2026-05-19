'use client';
import { STATUS_COLORS } from '@/lib/config';

export default function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? { bg: '#E5E7EB', text: '#374151', label: status };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {color.label}
    </span>
  );
}
