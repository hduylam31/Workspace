'use client';
import { MEMBERS } from '@/lib/config';

export default function MemberAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const member = MEMBERS.find(m => m.name === name);
  const initial = member?.initial ?? name.slice(0, 2).toUpperCase();
  const color = member?.color ?? '#6B7280';
  const cls = size === 'md' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-xs';
  return (
    <span
      className={`${cls} rounded-full inline-flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initial}
    </span>
  );
}
