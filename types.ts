// =================================================================
// ENUM Types
// Mirroring the PostgreSQL ENUM types for type safety in the frontend.
// =================================================================

export enum AppointmentStatus {
  Scheduled = 'Scheduled',
  Confirmed = 'Confirmed',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  NoShow = 'No-Show',
  Requested = 'Requested' // A common state for new appointments before acceptance.
}

export enum BackgroundCheckStatus {
  NotStarted = 'Not Started',
  InProgress = 'In Progress',
  Completed = 'Completed',
  Failed = 'Failed',
}

export enum ContactRelationship {
  Daughter = 'Daughter',
  Son = 'Son',
  Spouse = 'Spouse',
  Sibling = 'Sibling',
  Friend = 'Friend',
  Neighbor = 'Neighbor',
  Other = 'Other',
}

// =================================================================
// Lookup Tables
// These represent master lists of skills and accommodations.
// =================================================================

export interface Skill {
  id: number;
  name: string;
  description?: string;
  // UI-specific property, not in the DB schema but useful for frontend rendering.
  icon?: string; 
}

export interface Accommodation {
  id: number;
  name: string;
  description?: string;
}

// =================================================================
// Core Data Models
// These interfaces represent the main entities in the application, mapping
// directly to the core database tables.
// =================================================================

export interface Senior {
  id: number;
  first_name: string;
  last_name: string;
  phone_number?: string;
  email?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  is_active: boolean;
  created_at: string; // ISO date string e.g., "2023-10-27T10:00:00Z"
  updated_at?: string; // ISO date string
  
  // Optional hydrated data for convenient frontend use
  accommodations?: Accommodation[]; 
  emergency_contacts?: EmergencyContact[];
}

export interface Volunteer {
  id: number;
  first_name: string;
  last_name: string;
  phone_number?: string;
  email: string;
  bio?: string;
  background_check_status: BackgroundCheckStatus;
  // JSONB can be complex, 'any' is a flexible start for the frontend.
  availability_schedule?: any; 
  is_active: boolean;
  created_at: string; // ISO date string

  // Optional hydrated data for convenient frontend use
  skills?: Skill[]; 
}

export interface Appointment {
  id: number;
  senior_id: number;
  volunteer_id?: number | null;
  appointment_datetime: string; // ISO date string
  duration_minutes?: number;
  location?: string;
  status: AppointmentStatus;
  notes_for_volunteer?: string;
  feedback_from_senior?: string;
  feedback_from_volunteer?: string;
  created_at: string; // ISO date string
  
  // For UI convenience, the API might send the full objects
  senior?: Senior;
  volunteer?: Volunteer;
}

export interface EmergencyContact {
  id: number;
  senior_id: number;
  full_name: string;
  phone_number: string;
  relationship: ContactRelationship;
}

// Add JSX intrinsic element for ElevenLabs widget
declare namespace JSX {
  interface IntrinsicElements {
    'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      'agent-id'?: string;
    };
  }
}
