'use client';
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { api } from '@/lib/api';
import type { DashboardData } from '@/lib/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend);

function KPICard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-3xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

const QUARTER_ICONS: Record<string, string> = { Q1: '✅', Q2: '🔄', Q3: '⏳', Q4: '⏳' };

export default function DashboardModule() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const memberNames = data.byMember.map(m => m.member);
  const allStatuses = ['Add Sprint', 'Add Xtask', 'In progress', 'Nghiệm thu', 'Chuẩn bị làm', 'Định kỳ', 'Done', 'Golive'];
  const statusColors: Record<string, string> = {
    'Golive': '#4CB551', 'Add Sprint': '#4285F4', 'Add Xtask': '#A8C7FA',
    'In progress': '#FB8C00', 'Nghiệm thu': '#9C27B0', 'Done': '#757575',
    'Chuẩn bị làm': '#FFF176', 'Định kỳ': '#BCAAA4',
  };

  const barData = {
    labels: memberNames,
    datasets: allStatuses.map(s => ({
      label: s,
      data: data.byMember.map(m => m.counts[s] ?? 0),
      backgroundColor: statusColors[s] ?? '#E5E7EB',
    })),
  };

  const lineData = {
    labels: data.byMonth.map(m => m.month),
    datasets: [
      { label: 'Go Live', data: data.byMonth.map(m => m.golive), borderColor: '#4CB551', backgroundColor: 'rgba(76,181,81,0.1)', tension: 0.3, fill: true },
      { label: 'Đang dev', data: data.byMonth.map(m => m.inprogress), borderColor: '#FB8C00', backgroundColor: 'rgba(251,140,0,0.1)', tension: 0.3, fill: true },
      { label: 'Chuẩn bị', data: data.byMonth.map(m => m.planned), borderColor: '#9CA3AF', backgroundColor: 'rgba(156,163,175,0.1)', tension: 0.3, fill: true },
    ],
  };

  const donutData = {
    labels: data.byProject.map(p => p.project),
    datasets: [{
      data: data.byProject.map(p => p.count),
      backgroundColor: ['#4285F4','#EA4335','#34A853','#FBBC05','#9C27B0','#FF6D00','#00BCD4'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Active Tasks" value={data.totalActive} color="text-blue-600" icon="📋" />
        <KPICard label="Go Live tháng này" value={data.goLiveThisMonth} color="text-green-600" icon="🚀" />
        <KPICard label="In Progress" value={data.inProgress} color="text-orange-600" icon="⚡" />
        <KPICard label="Overdue" value={data.overdue} color="text-red-600" icon="🔴" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Tiến độ theo người</h3>
          <div style={{ height: 220 }}>
            <Bar data={barData} options={{ ...chartOptions, indexAxis: 'y' as const, scales: { x: { stacked: true }, y: { stacked: true } } }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Timeline T1–T12/2026</h3>
          <div style={{ height: 220 }}>
            <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } } } }} />
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Phân bổ theo dự án</h3>
          <div style={{ height: 220 }}>
            <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const, labels: { boxWidth: 12, font: { size: 11 } } } } }} />
          </div>
        </div>

        {/* Roadmap */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Roadmap 2026</h3>
            <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg">
              <Download size={13} /> Export CSV
            </button>
          </div>
          <div className="space-y-4">
            {data.roadmap.map(q => {
              const pct = q.total > 0 ? (q.done / q.total) * 100 : 0;
              const icon = QUARTER_ICONS[q.quarter] ?? '⏳';
              return (
                <div key={q.quarter}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{q.quarter}</span>
                      <span>{icon}</span>
                    </div>
                    <span className="text-xs text-gray-500">{q.done}/{q.total} dự án</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? '#4CB551' : pct > 50 ? '#4285F4' : '#FB8C00',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
