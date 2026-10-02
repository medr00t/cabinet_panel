// Simplified type definitions for the dental practice management system

export interface Patient {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  address?: string;
  createdAt?: string;
}

export interface Appointment {
  id?: number;
  patientId: number;
  patientName?: string;
  patientPhone?: string;
  date: string;
  time: string;
  treatmentType: string;
  notes?: string;
  status: 'programmé' | 'confirmé' | 'terminé' | 'annulé';
  createdAt?: string;
}

export type TabType = 'patients' | 'appointments' | 'dashboard' | 'financial';