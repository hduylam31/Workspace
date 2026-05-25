'use client';
import { RefreshCw, Wifi, WifiOff, Link2, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDataSystem } from '@/lib/use-data-system';

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  lastUpdated: Date | null;
  onRefresh: () => void;
  loading: boolean;
  onOpenConnect: () => void;
  isConnected: boolean;
}

const TABS = [
  { id: 'overview',      label: 'Overview'   },
  { id: 'dashboard',     label: 'Dashboard'  },
  { id: 'pick-task',     label: 'Pick Task'  },
  { id: 'my-tasks',      label: 'My Tasks'   },
  { id: 'daily-report',  label: 'Báo cáo'   },
  { id: 'it-tracker',    label: 'IT Tracker' },
];

export default function Header({ activeTab, onTabChange, lastUpdated, onRefresh, loading, onOpenConnect, isConnected }: Props) {
  const { members } = useDataSystem();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      {!online && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-amber-700 text-sm">
          <WifiOff size={14} />
          <span>⚠️ Mất kết nối — Đang xem dữ liệu cũ</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm">AK</div>
            <span className="font-semibold text-gray-900 hidden sm:block">An Khang PM</span>
          </div>
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Cập nhật {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onOpenConnect}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isConnected
                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isConnected
              ? <><CheckCircle2 size={13} /> Google Sheets</>
              : <><Link2 size={13} /> Kết nối Sheets</>}
          </button>
          <div className="flex items-center text-xs text-gray-500">
            {online ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500" />}
          </div>
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
            {members[0]?.initial ?? '?'}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex border-t border-gray-100">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'text-green-700 border-b-2 border-green-600' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
