import { Senior, Volunteer, Appointment } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Frontend-only demo mode (no backend needed for screenshots)
const IS_DEMO = !!(import.meta.env.VITE_DEMO && String(import.meta.env.VITE_DEMO).toLowerCase() !== '0' && String(import.meta.env.VITE_DEMO).toLowerCase() !== 'false');

// In-memory demo data
let mockSeniors: Senior[] | null = null;
let mockVolunteers: Array<Volunteer & { zip_code?: string; skills?: string[] }> | null = null;
let mockAppointments: Array<Appointment & {
  senior_first_name?: string;
  senior_last_name?: string;
  volunteer_first_name?: string;
  volunteer_last_name?: string;
}> | null = null;

function initMockData() {
  if (mockSeniors && mockVolunteers && mockAppointments) return;
  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  mockSeniors = [
    {
      id: 1,
      first_name: 'Arthur',
      last_name: 'Pendragon',
      phone_number: '+12015551234',
      email: 'arthur@example.com',
      street_address: '123 Camelot Drive',
      city: 'Beverly Hills',
      state: 'CA',
      zip_code: '90210',
      is_active: true,
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90)),
    },
    {
      id: 2,
      first_name: 'Eleanor',
      last_name: 'Vance',
      phone_number: '+15164770955',
      email: 'eleanor@example.com',
      street_address: '456 Hill House Lane',
      city: 'Beverly Hills',
      state: 'CA',
      zip_code: '90210',
      is_active: true,
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60)),
    },
  ];

  mockVolunteers = [
    {
      id: 1,
      first_name: 'David',
      last_name: 'Chen',
      phone_number: '+16463210545',
      email: 'david@example.com',
      bio: 'Friendly neighbor who enjoys gardening and helping out.',
      background_check_status: 'Not Started' as any,
      availability_schedule: null,
      is_active: true,
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30)),
      zip_code: '90211',
      skills: ['Gardening', 'Companionship'],
    } as any,
    {
      id: 2,
      first_name: 'Maria',
      last_name: 'Garcia',
      phone_number: '+16463210546',
      email: 'maria@example.com',
      bio: 'Reliable driver and grocery helper.',
      background_check_status: 'Not Started' as any,
      availability_schedule: null,
      is_active: true,
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20)),
      zip_code: '90210',
      skills: ['Driving', 'Grocery Shopping', 'Tech Help'],
    } as any,
  ];

  mockAppointments = [
    {
      id: 1,
      senior_id: 2,
      volunteer_id: 2,
      appointment_datetime: iso(new Date(now.getTime() + 1000 * 60 * 60 * 24 * 2)),
      duration_minutes: 60,
      location: '456 Hill House Lane, Beverly Hills, CA 90210',
      status: 'Scheduled' as any,
      notes_for_volunteer: 'Grocery run for the week',
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 12)),
      senior_first_name: 'Eleanor',
      senior_last_name: 'Vance',
      volunteer_first_name: 'Maria',
      volunteer_last_name: 'Garcia',
    },
    {
      id: 2,
      senior_id: 2,
      volunteer_id: 1,
      appointment_datetime: iso(new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7)),
      duration_minutes: 90,
      location: '456 Hill House Lane, Beverly Hills, CA 90210',
      status: 'Requested' as any,
      notes_for_volunteer: 'Help set up a new phone',
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 30)),
      senior_first_name: 'Eleanor',
      senior_last_name: 'Vance',
      volunteer_first_name: 'David',
      volunteer_last_name: 'Chen',
    },
    {
      id: 3,
      senior_id: 1,
      volunteer_id: 1,
      appointment_datetime: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10)),
      duration_minutes: 60,
      location: '123 Camelot Drive, Beverly Hills, CA 90210',
      status: 'Completed' as any,
      notes_for_volunteer: 'Garden weeding',
      created_at: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24 * 11)),
      senior_first_name: 'Arthur',
      senior_last_name: 'Pendragon',
      volunteer_first_name: 'David',
      volunteer_last_name: 'Chen',
    },
  ];
}

export async function fetchSeniors(): Promise<Senior[]> {
  const res = await fetch(`${API_BASE}/api/seniors`);
  if (!res.ok) throw new Error('Failed to fetch seniors');
  return res.json();
}

export async function fetchVolunteers(): Promise<Volunteer[]> {
  const res = await fetch(`${API_BASE}/api/volunteers`);
  if (!res.ok) throw new Error('Failed to fetch volunteers');
  return res.json();
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const res = await fetch(`${API_BASE}/api/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchNearbyVolunteerZips(zip: string, radius: number = 10): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/volunteers/nearby/${zip}?radius=${radius}`);
  if (!res.ok) throw new Error('Failed to fetch nearby zips');
  return res.json();
}

export async function fetchStats(): Promise<{
  totalSeniors: number;
  activeVolunteers: number;
  upcomingAppointments: number;
  completedThisMonth: number;
}> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// New: agent list-volunteers (skill + optional zip/radius)
export async function fetchAgentListVolunteers(params: {
  skill: string;
  zip?: string;
  radius?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/agent/list-volunteers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to list volunteers');
  }
  const json = await res.json();
  if (json.success === false) throw new Error(json.error.message || 'Failed to list volunteers');
  return json.data;
}

export async function scheduleAppointment(params: {
  senior_id: number;
  volunteer_id: number;
  appointment_datetime: string;
  notes_for_volunteer?: string;
  location?: string;
}): Promise<Appointment> {
  const res = await fetch(`${API_BASE}/api/agent/schedule-appointment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to schedule appointment');
  return res.json();
}

export async function fetchSeniorAppointments(seniorId: number): Promise<Appointment[]> {
  const res = await fetch(`${API_BASE}/api/senior/${seniorId}/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchVolunteerAppointments(volunteerId: number): Promise<Appointment[]> {
  const res = await fetch(`${API_BASE}/api/volunteer/${volunteerId}/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function updateAppointmentStatus(
  appointmentId: number,
  status: 'Requested' | 'Scheduled' | 'Confirmed' | 'Declined' | 'Cancelled' | 'Completed'
): Promise<Appointment> {
  const res = await fetch(`${API_BASE}/api/appointments/${appointmentId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}
