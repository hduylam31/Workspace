'use client';
import { nameToMemberItem } from '@/lib/config';
import { useMemberColors } from '@/lib/use-member-colors';

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** Truyền vào để override màu (ví dụ khi đang chọn màu real-time) */
  colorOverride?: string;
}

export default function MemberAvatar({ name, size = 'sm', colorOverride }: Props) {
  const { getColor } = useMemberColors();
  const { initial, color: defaultColor } = nameToMemberItem(name);
  const color = colorOverride ?? getColor(name, defaultColor);

  const cls =
    size === 'lg' ? 'w-12 h-12 text-base' :
    size === 'md' ? 'w-9 h-9 text-sm'     :
                    'w-7 h-7 text-xs';

  return (
    <span
      className={`${cls} rounded-full inline-flex items-center justify-center font-bold text-white flex-shrink-0 transition-colors duration-200`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initial}
    </span>
  );
}
