import React, { useState, useEffect } from 'react';
import TopBar from '@/components/TopBar';
import { Volunteer } from '../types';
import { fetchAgentListVolunteers, scheduleAppointment, fetchSeniorAppointments } from '../lib/api';

interface SeniorPortalProps {
  onExit: () => void;
}

const SkillTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 text-xs">
    {children}
  </span>
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-5">{children}</div>
);

const SeniorPortal: React.FC<SeniorPortalProps> = () => {
  const [allVolunteers, setAllVolunteers] = useState<Volunteer[]>([]);
  const [filteredVolunteers, setFilteredVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState('90210');
  const [radius, setRadius] = useState<number>(10);
  const [skill, setSkill] = useState<string>(''); // Default to empty/all
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedVolunteer, setSelectedVolunteer] = useState<Volunteer | null>(null);
  const [notes, setNotes] = useState('');
  const [datetime, setDatetime] = useState('');
  const seniorId = 2; // Hardcoded for Eleanor

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params: { zip: string; radius: number; } = { zip, radius };
        const data = await fetchAgentListVolunteers(params);
        setAllVolunteers(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load volunteers.');
      } finally {
        setLoading(false);
      }
    }
    async function loadAppointments() {
      try {
        const data = await fetchSeniorAppointments(seniorId);
        setAppointments(data);
      } catch (e) { console.error('Failed to load appointments', e); }
    }
    load();
    loadAppointments();
  }, [zip, radius]);

  useEffect(() => {
    let filtered = allVolunteers;
    if (skill) {
      filtered = allVolunteers.filter(v => v.skills?.includes(skill));
    }
    setFilteredVolunteers(filtered);
  }, [skill, allVolunteers]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVolunteer || !datetime) return;
    try {
      await scheduleAppointment({
        senior_id: seniorId,
        volunteer_id: selectedVolunteer.id,
        appointment_datetime: new Date(datetime).toISOString(),
        notes_for_volunteer: notes,
      });
      setSelectedVolunteer(null);
      // Refresh logic or toast message would go here
    } catch (err) {
      console.error('Failed to schedule', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar userName="Eleanor" />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">Find a Volunteer</h1>

          <div className="mt-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-slate-600">Zip</label>
              <input value={zip} onChange={e => setZip(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-slate-600">Radius (mi)</label>
              <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} className="border border-slate-300 rounded-md px-3 py-2 w-24" />
            </div>
            <div>
              <label className="block text-sm text-slate-600">Skill</label>
              <select value={skill} onChange={e => setSkill(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2">
                <option value="">All Skills</option>
                <option>Driving</option>
                <option>Grocery Shopping</option>
                <option>Tech Help</option>
                <option>Gardening</option>
                <option>Companionship</option>
              </select>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {loading && <div>Loading...</div>}
            {error && <div className="text-red-500">{error}</div>}
            {!loading && !error && filteredVolunteers.length > 0 ? (
              filteredVolunteers.map((v) => (
                <Card key={v.id}>
                  <div className="text-lg font-semibold text-slate-900">{v.first_name} {v.last_name}</div>
                  <p className="mt-1 text-slate-700 text-sm leading-relaxed">{v.bio || 'No bio available.'}</p>
                  <div className="mt-1 text-xs text-slate-500">Zip: {v.zip_code || '—'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {v.skills?.map(s => s && <SkillTag key={s}>{s}</SkillTag>)}
                  </div>
                  <button onClick={() => setSelectedVolunteer(v)} className="mt-4 inline-flex items-center justify-center w-full rounded-md bg-sky-700 text-white px-4 py-2 text-sm font-medium hover:bg-sky-800">Request Help</button>
                </Card>
              ))
            ) : (
              !loading && !error && <div>No volunteers found nearby.</div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold tracking-tight">My Appointments</h2>
          <div className="mt-4 divide-y divide-slate-200 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm">
            {appointments.map(a => (
              <div key={a.id} className="p-5 flex justify-between">
                <div>
                  <div className="font-medium">{a.notes_for_volunteer || 'Appointment'}</div>
                  <div className="text-sm text-slate-600">
                    With {a.volunteer_first_name || 'N/A'} on {new Date(a.appointment_datetime).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm text-slate-500">{a.status}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
      {selectedVolunteer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium">Request help from {selectedVolunteer.first_name}</h3>
            <form onSubmit={handleRequest}>
              <div className="mt-4 space-y-3">
                <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} required />
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for volunteer..." />
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit">Schedule</button>
                <button type="button" onClick={() => setSelectedVolunteer(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeniorPortal;


