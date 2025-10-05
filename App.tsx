
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PortalSelection from './portals/PortalSelection.tsx';
import AdminPortal from './portals/AdminPortal.tsx';
import SeniorPortal from './portals/SeniorPortal.tsx';
import VolunteerPortal from './portals/VolunteerPortal.tsx';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<PortalSelection />} />
        <Route path="/admin" element={<AdminPortal />} />
        <Route path="/senior" element={<SeniorPortal />} />
        <Route path="/volunteer" element={<VolunteerPortal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <elevenlabs-convai agent-id="agent_4001k6r3gfv1f5rr6tx3vf8fehbv"></elevenlabs-convai>
    </div>
  );
};

export default App;
