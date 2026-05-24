export const CONFIG = {
  APPS_SCRIPT_URL: process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '',
  USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false',
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DOMAIN: process.env.NEXT_PUBLIC_DOMAIN || 'mwg.com.vn',
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'Golive':                  { bg: '#4CB551', text: '#fff',    label: 'Golive' },
  'Go live':                 { bg: '#4CB551', text: '#fff',    label: 'Golive' },
  'Add Sprint':              { bg: '#4285F4', text: '#fff',    label: 'Add Sprint' },
  'Add Xtask':               { bg: '#A8C7FA', text: '#1a1a1a', label: 'Add Xtask' },
  'Chờ Add Xtask':           { bg: '#D0E8FF', text: '#1a5fa8', label: 'Chờ Add Xtask' },
  'In progress':             { bg: '#FB8C00', text: '#fff',    label: 'In progress' },
  'Đang dev':                { bg: '#FB8C00', text: '#fff',    label: 'Đang dev' },
  'Nghiệm thu':              { bg: '#9C27B0', text: '#fff',    label: 'Nghiệm thu' },
  'Chờ review mô tả':        { bg: '#E1BEE7', text: '#6A1B9A', label: 'Chờ review mô tả' },
  'Done':                    { bg: '#757575', text: '#fff',    label: 'Done' },
  'Xong mô tả':              { bg: '#757575', text: '#fff',    label: 'Xong mô tả' },
  'Chuẩn bị làm':            { bg: '#FFF9C4', text: '#1a1a1a', label: 'Chuẩn bị làm' },
  'Chuẩn bị đưa vào làm':   { bg: '#FFF9C4', text: '#1a1a1a', label: 'Chuẩn bị đưa vào làm' },
  'Định kỳ':                 { bg: '#BCAAA4', text: '#1a1a1a', label: 'Định kỳ' },
  'Backlog':                 { bg: '#E0E0E0', text: '#424242', label: 'Backlog' },
  'Pending':                 { bg: '#FFE0B2', text: '#E65100', label: 'Pending' },
  'Cancelled':               { bg: '#FFCDD2', text: '#C62828', label: 'Cancelled' },
  'Follow':                  { bg: '#B2EBF2', text: '#006064', label: 'Follow' },
};

export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  'High':   { bg: '#FECACA', text: '#DC2626' },
  'Medium': { bg: '#FED7AA', text: '#EA580C' },
  'Low':    { bg: '#BBF7D0', text: '#16A34A' },
};

export interface MemberItem {
  id: string;
  name: string;
  initial: string;
  color: string;
  email?: string;
}

const AVATAR_PALETTE = [
  '#4285F4', '#EA4335', '#34A853', '#FBBC05',
  '#9C27B0', '#FF6D00', '#00BCD4', '#795548',
  '#607D8B', '#E91E63',
];

/** Tạo MemberItem từ tên — deterministic color từ hash tên */
export function nameToMemberItem(name: string, index = 0): MemberItem {
  const words = name.trim().split(/\s+/);
  const initial = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  // Màu cố định theo hash tên (không thay đổi khi thêm/bớt thành viên)
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '') || `m${index}`;
  return { id, name, initial, color };
}

/** Fallback cứng — dùng khi chưa kết nối Google Sheets */
export const MEMBERS: MemberItem[] = [
  { id: 'da', name: 'Đức Anh', initial: 'DA', color: '#4285F4' },
  { id: 'kh', name: 'Khánh',   initial: 'KH', color: '#EA4335' },
  { id: 'ty', name: 'Tuyền',   initial: 'TY', color: '#34A853' },
  { id: 'tr', name: 'Trang',   initial: 'TR', color: '#FBBC05' },
  { id: 'ti', name: 'Trình',   initial: 'TI', color: '#9C27B0' },
  { id: 'ma', name: 'Mai',     initial: 'MA', color: '#FF6D00' },
];

export const ALL_STATUSES = [
  'Golive', 'Done', 'Nghiệm thu', 'Add Sprint', 'Add Xtask',
  'Chờ Add Xtask', 'Chờ review mô tả', 'In progress',
  'Chuẩn bị đưa vào làm', 'Định kỳ', 'Backlog', 'Pending', 'Cancelled', 'Follow',
];

export const ALL_ROLES = ['PO', 'DA', 'PMC', 'PD'];
