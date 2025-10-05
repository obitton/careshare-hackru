import React, { useState, useEffect } from 'react';
import { fetchStats } from '../lib/api';

interface AdminPortalProps {
  onExit: () => void;
}

const SidebarLink: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
      isActive ? 'bg-sky-100 text-sky-800 font-medium' : 'text-slate-700 hover:bg-slate-100'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
    <div className="text-sm text-slate-600">{label}</div>
    <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
  </div>
);

const AdminPortal: React.FC<AdminPortalProps> = () => {
  const [activeView, setActiveView] = useState('Dashboard');
  const [stats, setStats] = useState({
    totalSeniors: 0,
    activeVolunteers: 0,
    upcomingAppointments: 0,
    completedThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchStats();
        setStats(data);
      } catch (err) {
        setError('Failed to load dashboard stats.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white">
        <div className="h-16 flex items-center justify-between px-6">
          <div className="text-lg font-semibold tracking-tight text-slate-800">CareShare</div>
          <button className="text-slate-500 hover:text-slate-800">&times;</button>
        </div>
        <nav className="p-4 space-y-1">
          <SidebarLink label="Dashboard" isActive={activeView === 'Dashboard'} onClick={() => setActiveView('Dashboard')} icon={<span>📊</span>} />
          <SidebarLink label="Seniors" isActive={activeView === 'Seniors'} onClick={() => setActiveView('Seniors')} icon={<span>👵</span>} />
          <SidebarLink label="Volunteers" isActive={activeView === 'Volunteers'} onClick={() => setActiveView('Volunteers')} icon={<span>🤝</span>} />
          <SidebarLink label="Appointments" isActive={activeView === 'Appointments'} onClick={() => setActiveView('Appointments')} icon={<span>📅</span>} />
        </nav>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200 bg-white">
          <h1 className="text-xl font-semibold">{activeView}</h1>
          <div>User Avatar</div>
        </header>
        <main className="flex-1 p-8">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {!loading && !error && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Total Seniors" value={stats.totalSeniors} />
                <StatCard label="Active Volunteers" value={stats.activeVolunteers} />
                <StatCard label="Upcoming Appointments" value={stats.upcomingAppointments} />
                <StatCard label="Completed This Month" value={stats.completedThisMonth} />
              </div>
              <div className="mt-8 rounded-xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                <h2 className="font-medium text-slate-800">Recent Activity</h2>
                {/* Activity items would go here */}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPortal;


