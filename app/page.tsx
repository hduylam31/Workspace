'use client';
import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import OverviewModule from '@/components/overview/OverviewModule';
import MyTasksModule from '@/components/my-tasks/MyTasksModule';
import ITTrackerModule from '@/components/it-tracker/ITTrackerModule';
import DashboardModule from '@/components/dashboard/DashboardModule';
import PickTaskModule from '@/components/pick-task/PickTaskModule';
import DailyReportModule from '@/components/daily-report/DailyReportModule';
import ConnectSheet from '@/components/settings/ConnectSheet';
import { SheetsProvider, useSheetsData } from '@/lib/sheets-context';
import type { SheetsConfig } from '@/lib/google-sheets';

function AppContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [showConnect, setShowConnect] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { config, setConfig, refresh, loading: sheetsLoading, lastFetch } = useSheetsData();

  const handleRefresh = useCallback(async () => {
    if (config) {
      await refresh();
    }
    setRefreshKey(k => k + 1);
  }, [config, refresh]);

  const handleConnect = useCallback((cfg: SheetsConfig) => {
    setConfig(cfg);
    setShowConnect(false);
    setRefreshKey(k => k + 1);
  }, [setConfig]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        lastUpdated={lastFetch}
        onRefresh={handleRefresh}
        loading={sheetsLoading}
        onOpenConnect={() => setShowConnect(true)}
        isConnected={!!config}
      />

      {/* Loading bar khi fetch từ Sheets */}
      {sheetsLoading && (
        <div className="h-0.5 bg-gray-100 overflow-hidden">
          <div className="h-full bg-green-500 animate-pulse w-full" />
        </div>
      )}

      <main className="flex-1 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
        {activeTab === 'overview'   && <OverviewModule key={`ov-${refreshKey}`} />}
        {activeTab === 'my-tasks'   && <MyTasksModule key={`mt-${refreshKey}`} />}
        {activeTab === 'pick-task'    && <PickTaskModule key={`pt-${refreshKey}`} />}
        {activeTab === 'daily-report' && <DailyReportModule key={`dr-${refreshKey}`} />}
        {activeTab === 'it-tracker'   && <ITTrackerModule key={`it-${refreshKey}`} />}
        {activeTab === 'dashboard'  && <DashboardModule key={`db-${refreshKey}`} />}
      </main>

      {showConnect && (
        <ConnectSheet
          onClose={() => setShowConnect(false)}
          onConnect={handleConnect}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <SheetsProvider>
      <AppContent />
    </SheetsProvider>
  );
}
