export const CONFIG = {
  APPS_SCRIPT_URL: process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '',
  USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false',
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DOMAIN: process.env.NEXT_PUBLIC_DOMAIN || 'mwg.com.vn',
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'Golive':        { bg: '#4CB551', text: '#fff',    label: 'Go Live' },
  'Go live':       { bg: '#4CB551', text: '#fff',    label: 'Go Live' },
  'Add Sprint':    { bg: '#4285F4', text: '#fff',    label: 'Add Sprint' },
  'Add Xtask':     { bg: '#A8C7FA', text: '#1a1a1a', label: 'Add Xtask' },
  'In progress':   { bg: '#FB8C00', text: '#fff',    label: 'In Progress' },
  'Đang dev':      { bg: '#FB8C00', text: '#fff',    label: 'Đang dev' },
  'Nghiệm thu':    { bg: '#9C27B0', text: '#fff',    label: 'Nghiệm thu' },
  'Done':          { bg: '#757575', text: '#fff',    label: 'Done' },
  'Xong mô tả':   { bg: '#757575', text: '#fff',    label: 'Xong mô tả' },
  'Chuẩn bị làm': { bg: '#FFF176', text: '#1a1a1a', label: 'Chuẩn bị làm' },
  'Định kỳ':      { bg: '#BCAAA4', text: '#1a1a1a', label: 'Định kỳ' },
};

export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  'High':   { bg: '#FECACA', text: '#DC2626' },
  'Medium': { bg: '#FED7AA', text: '#EA580C' },
  'Low':    { bg: '#BBF7D0', text: '#16A34A' },
};

export const MEMBERS = [
  { id: 'da', name: 'Đức Anh', initial: 'DA', color: '#4285F4', email: 'ducanh@mwg.com.vn' },
  { id: 'kh', name: 'Khánh',   initial: 'KH', color: '#EA4335', email: 'khanh@mwg.com.vn' },
  { id: 'ty', name: 'Tuyền',   initial: 'TY', color: '#34A853', email: 'tuyen@mwg.com.vn' },
  { id: 'tr', name: 'Trang',   initial: 'TR', color: '#FBBC05', email: 'trang@mwg.com.vn' },
  { id: 'ti', name: 'Trình',   initial: 'TI', color: '#9C27B0', email: 'trinh@mwg.com.vn' },
  { id: 'ma', name: 'Mai',     initial: 'MA', color: '#FF6D00', email: 'mai@mwg.com.vn' },
];

export const ALL_STATUSES = [
  'Golive', 'Add Sprint', 'Add Xtask', 'In progress', 'Nghiệm thu',
  'Done', 'Chuẩn bị làm', 'Định kỳ', 'Xong mô tả',
];
