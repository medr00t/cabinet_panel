import { format, isToday, addDays, startOfDay, endOfDay, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Patient, Appointment } from '../services/database';

// Format date for display (dd/MM/yyyy)
export const formatDate = (date: string | Date): string => {
  return format(new Date(date), 'dd/MM/yyyy', { locale: fr });
};

export const formatDateLong = (date: string | Date): string => {
  return format(new Date(date), 'EEEE dd MMMM yyyy', { locale: fr });
};

// Convert dd/MM/yyyy string to ISO date string (yyyy-mm-dd) for HTML date inputs
export const convertToISODate = (ddmmyyyy: string): string => {
  if (!ddmmyyyy || ddmmyyyy.length !== 10) return '';
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

// Convert ISO date string (yyyy-mm-dd) to dd/MM/yyyy format
export const convertFromISODate = (isoDate: string): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return format(date, 'dd/MM/yyyy');
};

// Get today's date in ISO format for HTML date inputs
export const getTodayISO = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Parse dd/MM/yyyy date string to Date object
export const parseDDMMYYYY = (dateString: string): Date | null => {
  try {
    return parse(dateString, 'dd/MM/yyyy', new Date());
  } catch {
    return null;
  }
};

export const formatTime = (time: string): string => {
  return format(new Date(`2000-01-01T${time}`), 'HH:mm');
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD'
  }).format(amount);
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const getPatientFullName = (patient: Patient): string => {
  return `${patient.firstName} ${patient.lastName}`;
};

export const getAge = (dateOfBirth: string): number => {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

export const getTodaysAppointments = (appointments: Appointment[]): Appointment[] => {
  return appointments.filter(apt => isToday(new Date(apt.date)));
};

export const getUpcomingAppointments = (appointments: Appointment[], days: number = 7): Appointment[] => {
  const endDate = addDays(new Date(), days);
  return appointments.filter(apt => {
    const aptDate = new Date(apt.date);
    return aptDate >= startOfDay(new Date()) && aptDate <= endOfDay(endDate);
  });
};

export const getAppointmentColor = (appointmentType: string): string => {
  const colors = {
    consultation: '#3b82f6',
    cleaning: '#10b981',
    filling: '#f59e0b',
    extraction: '#ef4444',
    'root-canal': '#8b5cf6',
    crown: '#06b6d4',
    other: '#6b7280'
  };
  return colors[appointmentType as keyof typeof colors] || colors.other;
};

export const getStatusColor = (status: string): string => {
  const colors = {
    scheduled: '#3b82f6',
    confirmed: '#10b981',
    'in-progress': '#f59e0b',
    completed: '#22c55e',
    cancelled: '#ef4444',
    'no-show': '#8b5cf6',
    pending: '#f59e0b',
    failed: '#ef4444'
  };
  return colors[status as keyof typeof colors] || '#6b7280';
};

export const searchPatients = (patients: Patient[], query: string): Patient[] => {
  if (!query.trim()) return patients;
  
  const searchTerm = query.toLowerCase();
  return patients.filter(patient => 
    patient.firstName.toLowerCase().includes(searchTerm) ||
    patient.lastName.toLowerCase().includes(searchTerm) ||
    (patient.email && patient.email.toLowerCase().includes(searchTerm)) ||
    patient.phone.includes(query)
  );
};

export const getTimeSlots = (): string[] => {
  const slots = [];
  for (let hour = 8; hour < 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(time);
    }
  }
  return slots;
};