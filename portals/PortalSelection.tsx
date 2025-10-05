import React from 'react';
import { Portal } from './PortalType';
import { useNavigate } from 'react-router-dom';

interface PortalSelectionProps {
  onSelectPortal: (portal: Portal) => void;
}

const Card: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}> = ({ icon, title, subtitle, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 p-8 w-full"
    >
      <div className="flex flex-col items-start gap-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-slate-50 ring-1 ring-slate-200">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold text-slate-900">{title}</div>
          <div className="mt-2 text-slate-600 leading-relaxed">{subtitle}</div>
        </div>
      </div>
    </button>
  );
};

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-12 w-12 text-sky-500" strokeWidth="1.6">
    <path d="M12.001 20.727C10.016 19.043 3 13.94 3 8.88 3 6.19 5.239 4 7.999 4c1.57 0 3.07.73 4.002 1.874C12.935 4.73 14.434 4 16.004 4 18.764 4 21 6.19 21 8.88c0 5.06-7.016 10.163-8.999 11.847z" />
  </svg>
);

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-sky-500" strokeWidth="1.6">
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);

const HandshakeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-emerald-600" strokeWidth="1.6">
    <path d="M8.5 12.5 11 10l2.5 2.5M2 12l4.5-4.5a3 3 0 0 1 4.243 0L12 8l1.257-1.257a3 3 0 0 1 4.243 0L22 11" />
    <path d="M2 12v3a3 3 0 0 0 3 3h2l2 2 2-2 2 2 2-2h2a3 3 0 0 0 3-3v-1" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-indigo-600" strokeWidth="1.6">
    <path d="M12 3 4 6v6a8 8 0 0 0 8 8 8 8 0 0 0 8-8V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const PortalSelection: React.FC<PortalSelectionProps> = ({ onSelectPortal }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen px-6 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-3">
            <HeartIcon />
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">CareShare</h1>
          <p className="mt-3 text-lg sm:text-xl text-slate-600">Connecting communities, one caring hand at a time.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={<PersonIcon />}
            title="Senior Portal"
            subtitle="Find help and manage appointments."
            onClick={() => navigate('/senior')}
          />

          <Card
            icon={<HandshakeIcon />}
            title="Volunteer Portal"
            subtitle="View requests and manage your schedule."
            onClick={() => navigate('/volunteer')}
          />

          <Card
            icon={<ShieldIcon />}
            title="Admin Dashboard"
            subtitle="Oversee platform operations."
            onClick={() => navigate('/admin')}
          />
        </div>
      </div>
    </div>
  );
};

export default PortalSelection;


