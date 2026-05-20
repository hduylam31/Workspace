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

export const MEMBERS = [
  { id: 'da', name: 'Đức Anh', initial: 'DA', color: '#4285F4', email: 'ducanh@mwg.com.vn' },
  { id: 'kh', name: 'Khánh',   initial: 'KH', color: '#EA4335', email: 'khanh@mwg.com.vn' },
  { id: 'ty', name: 'Tuyền',   initial: 'TY', color: '#34A853', email: 'tuyen@mwg.com.vn' },
  { id: 'tr', name: 'Trang',   initial: 'TR', color: '#FBBC05', email: 'trang@mwg.com.vn' },
  { id: 'ti', name: 'Trình',   initial: 'TI', color: '#9C27B0', email: 'trinh@mwg.com.vn' },
  { id: 'ma', name: 'Mai',     initial: 'MA', color: '#FF6D00', email: 'mai@mwg.com.vn' },
];

export const ALL_STATUSES = [
  'Golive', 'Done', 'Nghiệm thu', 'Add Sprint', 'Add Xtask',
  'Chờ Add Xtask', 'Chờ review mô tả', 'In progress',
  'Chuẩn bị đưa vào làm', 'Định kỳ', 'Backlog', 'Pending', 'Cancelled', 'Follow',
];

export const ALL_ROLES = ['PO', 'DA', 'PMC', 'PD'];
