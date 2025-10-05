import React, { useState, useEffect } from 'react';
import TopBar from '@/components/TopBar';
import { Appointment } from '../types';
import { fetchVolunteerAppointments, updateAppointmentStatus } from '../lib/api';

interface VolunteerPortalProps {
  onExit: () => void;
}

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100 px-2.5 py-1 text-xs">
    {children}
  </span>
);

const VolunteerPortal: React.FC<VolunteerPortalProps> = () => {
  const [scheduled, setScheduled] = useState<Appointment[]>([]);
  const [requests, setRequests] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // Add version state
  const volunteerId = 1; // Hardcoded for David Chen

  useEffect(() => {
    async function loadAppointments() {
      try {
        setLoading(true);
        setError(null);
        const all = await fetchVolunteerAppointments(volunteerId);
        // Requests are now 'Requested' OR 'Scheduled'
        setRequests(all.filter(a => a.status === 'Requested' || a.status === 'Scheduled'));
        // Schedule is everything else
        setScheduled(all.filter(a => a.status !== 'Requested' && a.status !== 'Scheduled'));
      } catch (err) {
        setError('Failed to load schedule.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadAppointments();
  }, [volunteerId, version]); // Add version to dependency array

  const handleStatusUpdate = async (id: number, status: 'Confirmed' | 'Declined') => {
    try {
      await updateAppointmentStatus(id, status);
      setVersion(v => v + 1); // Increment version to trigger refetch
    } catch (err) {
      console.error(`Failed to ${status.toLowerCase()} request`, err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar userName="David" />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">New Senior Requests</h1>
          <div className="mt-4 space-y-4">
            {requests.map(req => (
              <div key={req.id} className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm">
                <div className="p-5 flex items-start justify-between gap-6">
                  <div>
                    <div className="text-slate-900 font-medium">{req.notes_for_volunteer || 'Appointment'}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      For {req.senior_first_name} {req.senior_last_name} on {new Date(req.appointment_datetime).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleStatusUpdate(req.id, 'Confirmed')} className="inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700">Accept</button>
                    <button onClick={() => handleStatusUpdate(req.id, 'Declined')} className="inline-flex items-center rounded-md bg-slate-100 text-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-200">Decline</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="pt-2">
          <h2 className="text-2xl font-semibold tracking-tight">My Schedule</h2>
          <div className="mt-4 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm divide-y divide-slate-200">
            {loading && <div className="p-4">Loading schedule...</div>}
            {error && <div className="p-4 text-red-500">{error}</div>}
            {!loading && !error && scheduled.map(a => (
              <div key={a.id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.notes_for_volunteer || 'Appointment'}</div>
                  <div className="text-sm text-slate-600">
                    For {a.senior_first_name} {a.senior_last_name} on {new Date(a.appointment_datetime).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm text-slate-500">{a.status}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default VolunteerPortal;


