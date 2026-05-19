'use client';
import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import OverviewModule from '@/components/overview/OverviewModule';
import MyTasksModule from '@/components/my-tasks/MyTasksModule';
import ITTrackerModule from '@/components/it-tracker/ITTrackerModule';
import DashboardModule from '@/components/dashboard/DashboardModule';

export default function Home() {
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey(k => k + 1);
    setTimeout(() => {
      setLastUpdated(new Date());
      setLoading(false);
    }, 600);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        loading={loading}
      />
      <main className="flex-1 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
        {activeTab === 'overview'   && <OverviewModule key={`ov-${refreshKey}`} />}
        {activeTab === 'my-tasks'   && <MyTasksModule key={`mt-${refreshKey}`} />}
        {activeTab === 'it-tracker' && <ITTrackerModule key={`it-${refreshKey}`} />}
        {activeTab === 'dashboard'  && <DashboardModule key={`db-${refreshKey}`} />}
      </main>
    </div>
  );
}
