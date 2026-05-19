# An Khang PM Workspace

Ứng dụng quản lý task nội bộ cho Team PM An Khang — thay thế quy trình Google Sheets thủ công bằng một dashboard web hiện đại.

## Tính năng

- **Overview** — Tổng quan toàn bộ task của team, filter theo owner/status/dự án, quick edit inline
- **My Tasks** — Xem và quản lý task theo từng thành viên, thêm/sửa task qua form
- **IT Tracker** — Theo dõi task phối hợp với IT theo tháng, đồng bộ 2 chiều
- **Dashboard** — KPI cards, biểu đồ tiến độ theo người/tháng, phân bổ theo dự án, roadmap Q1–Q4

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS**
- **Chart.js** + react-chartjs-2
- **Google Apps Script** (backend API — tuỳ chọn)

## Chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) — mặc định chạy với **mock data**, không cần cấu hình gì thêm.

## Deploy lên Vercel

1. Push repo lên GitHub
2. Import vào [vercel.com](https://vercel.com) → Deploy
3. Xong! App chạy ngay với mock data.

## Kết nối Google Sheets thực

1. Deploy Apps Script từ `Workspace An Khang 2026` làm Web App
2. Tạo `.env.local`:

```env
NEXT_PUBLIC_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
NEXT_PUBLIC_USE_MOCK_DATA=false
```

3. Thêm các env vars này vào Vercel Project Settings → Environment Variables

## Cấu trúc project

```
├── app/
│   ├── layout.tsx
│   └── page.tsx              # Tabs: Overview | My Tasks | IT Tracker | Dashboard
├── components/
│   ├── Header.tsx
│   ├── StatusBadge.tsx
│   ├── MemberAvatar.tsx
│   ├── overview/OverviewModule.tsx
│   ├── my-tasks/MyTasksModule.tsx
│   ├── my-tasks/TaskForm.tsx
│   ├── it-tracker/ITTrackerModule.tsx
│   └── dashboard/DashboardModule.tsx
└── lib/
    ├── api.ts                # API client (mock + real Apps Script)
    ├── config.ts             # Colors, members, status map
    ├── mock-data.ts          # Demo data
    └── types.ts
```
