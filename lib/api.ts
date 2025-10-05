import { Senior, Volunteer, Appointment } from './types';

export async function fetchSeniors(): Promise<Senior[]> {
  const res = await fetch('/api/seniors');
  if (!res.ok) throw new Error('Failed to fetch seniors');
  return res.json();
}

export async function fetchVolunteers(): Promise<Volunteer[]> {
  const res = await fetch('/api/volunteers');
  if (!res.ok) throw new Error('Failed to fetch volunteers');
  return res.json();
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const res = await fetch('/api/appointments');
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchNearbyVolunteerZips(zip: string, radius: number = 10): Promise<string[]> {
  const res = await fetch(`/api/volunteers/nearby/${zip}?radius=${radius}`);
  if (!res.ok) throw new Error('Failed to fetch nearby zips');
  return res.json();
}

export async function fetchStats(): Promise<{
  totalSeniors: number;
  activeVolunteers: number;
  upcomingAppointments: number;
  completedThisMonth: number;
}> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// New: agent list-volunteers (skill + optional zip/radius)
export async function fetchAgentListVolunteers(params: {
  skill: string;
  zip?: string;
  radius?: number;
}): Promise<Volunteer[]> {
  const res = await fetch('/api/agent/list-volunteers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to list volunteers');
  }
  return res.json();
}

export async function scheduleAppointment(params: {
  senior_id: number;
  volunteer_id: number;
  appointment_datetime: string;
  notes_for_volunteer?: string;
  location?: string;
}): Promise<Appointment> {
  const res = await fetch('/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to schedule appointment');
  return res.json();
}

export async function fetchSeniorAppointments(seniorId: number): Promise<Appointment[]> {
  const res = await fetch(`/api/senior/${seniorId}/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchVolunteerAppointments(volunteerId: number): Promise<Appointment[]> {
  const res = await fetch(`/api/volunteer/${volunteerId}/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function updateAppointmentStatus(
  appointmentId: number,
  status: 'Confirmed' | 'Declined' | 'Cancelled' | 'Completed'
): Promise<Appointment> {
  const res = await fetch(`/api/appointments/${appointmentId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}
