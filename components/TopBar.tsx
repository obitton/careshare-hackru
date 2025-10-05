import React from 'react';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  userName?: string;
  onLogout?: () => void;
}

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-sky-600" strokeWidth="1.8">
    <path d="M12.001 20.727C10.016 19.043 3 13.94 3 8.88 3 6.19 5.239 4 7.999 4c1.57 0 3.07.73 4.002 1.874C12.935 4.73 14.434 4 16.004 4 18.764 4 21 6.19 21 8.88c0 5.06-7.016 10.163-8.999 11.847z" />
  </svg>
);

const SparklesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth="1.8">
    <path d="M12 3v4m0 10v4m8-8h-4M8 12H4m10.95-6.364L12 8.586 9.05 5.636M9.05 18.364 12 15.414l2.95 2.95" />
  </svg>
);

const TopBar: React.FC<TopBarProps> = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    if (onLogout) onLogout();
    navigate('/');
  };
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <button className="inline-flex items-center gap-2" onClick={() => navigate('/')}> 
          <HeartIcon />
          <span className="text-lg font-semibold tracking-tight text-slate-800">CareShare</span>
        </button>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <span className="text-slate-700/80">Invite a friend</span>
          </button>
          {userName && (
            <div className="hidden sm:block text-slate-700 text-sm">Welcome, <span className="font-medium">{userName}</span>!</div>
          )}
          <button onClick={handleLogout} className="text-sm text-slate-600 hover:underline">Logout</button>
        </div>
      </div>
    </div>
  );
};

export default TopBar;


