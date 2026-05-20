export type Status =
  | 'Golive'
  | 'Go live'
  | 'Add Sprint'
  | 'Add Xtask'
  | 'Chờ Add Xtask'
  | 'In progress'
  | 'Đang dev'
  | 'Nghiệm thu'
  | 'Chờ review mô tả'
  | 'Done'
  | 'Xong mô tả'
  | 'Chuẩn bị làm'
  | 'Chuẩn bị đưa vào làm'
  | 'Định kỳ'
  | 'Backlog'
  | 'Pending'
  | 'Cancelled'
  | 'Follow'
  | string;   // cho phép status mới từ Data System

export type Role = 'member' | 'lead' | 'viewer';

export type Priority = 'High' | 'Medium' | 'Low';

export interface TaskRow {
  id: string;
  project: string;
  task: string;
  owner: string;
  role: string | null;       // Vai trò: PO, DA, PMC, PD...
  status: Status;
  startDate: string | null;
  endDate: string | null;
  detail: string | null;
  link: string | null;
  note: string | null;
  sourceSheet: string;
  sourceRow: number;
  itTaskId: string | null;
  lastModified: string;
}

export interface ITTaskRow {
  taskId: string;
  month: string;
  stt: number;
  task: string;
  priority: Priority;
  prdLink: string | null;
  designLink: string | null;
  status: string;
  itReview: boolean;
  timeline: string | null;
  pmNote: string | null;
  itNote: string | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  initial: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface DashboardData {
  totalActive: number;
  goLiveThisMonth: number;
  inProgress: number;
  overdue: number;
  byMember: { member: string; counts: Record<string, number> }[];
  byMonth: { month: string; golive: number; inprogress: number; planned: number }[];
  byProject: { project: string; count: number }[];
  roadmap: { quarter: string; done: number; total: number }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
  timestamp: string;
}

export interface AppUser {
  email: string;
  name: string;
  role: Role;
}
