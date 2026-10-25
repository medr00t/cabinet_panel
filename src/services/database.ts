import { invoke } from '@tauri-apps/api/core';

// Authentication state management
interface AuthResult {
  user: User;
  dbUrl: string;
}

let currentAuth: AuthResult | null = null;

const SERVER_HOST_KEY = 'serverHost';

// Address of the machine running MySQL (the doctor's/server laptop on the LAN).
export const getServerHost = (): string => {
  try {
    return localStorage.getItem(SERVER_HOST_KEY) || 'localhost';
  } catch {
    return 'localhost';
  }
};

export const setServerHost = (host: string) => {
  try {
    localStorage.setItem(SERVER_HOST_KEY, host.trim() || 'localhost');
  } catch {
    // storage unavailable: the host just won't be remembered
  }
};

export const getCurrentAuth = () => currentAuth;
export const clearAuth = () => { currentAuth = null; };

export interface Patient {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  allergies?: string;
  medicalHistory?: string;
  medications?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
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
  status: string;
  createdAt?: string;
}

export interface User {
  id?: number;
  name: string;
  code: string;
  role: string; // 'doctor' | 'reception'
  isActive: boolean;
  createdAt?: string;
}

export interface Payment {
  id?: number;
  appointmentId: number;
  patientId: number;
  patientName?: string;
  amount: number;
  paymentMethod: 'espèces' | 'carte' | 'chèque' | 'virement';
  collectedBy: number; // user_id
  collectedByName?: string;
  notes?: string;
  paymentDate: string;
  createdAt?: string;
}

export interface DailySummary {
  date: string;
  staffId: number;
  staffName: string;
  totalCash: number;
  totalCard: number;
  totalCheck: number;
  totalTransfer: number;
  totalCollected: number;
  numberOfPayments: number;
}

// Convert frontend format to backend format
const toBackendPatient = (patient: Patient) => ({
  id: patient.id,
  first_name: patient.firstName,
  last_name: patient.lastName,
  phone: patient.phone,
  email: patient.email,
  date_of_birth: patient.dateOfBirth,
  gender: patient.gender,
  address: patient.address,
  allergies: patient.allergies,
  medical_history: patient.medicalHistory,
  medications: patient.medications,
  emergency_contact: patient.emergencyContact,
  emergency_phone: patient.emergencyPhone,
  notes: patient.notes,
  created_at: patient.createdAt,
});

// Convert backend format to frontend format
const fromBackendPatient = (patient: any): Patient => ({
  id: patient.id,
  firstName: patient.first_name,
  lastName: patient.last_name,
  phone: patient.phone,
  email: patient.email,
  dateOfBirth: patient.date_of_birth,
  gender: patient.gender,
  address: patient.address,
  allergies: patient.allergies,
  medicalHistory: patient.medical_history,
  medications: patient.medications,
  emergencyContact: patient.emergency_contact,
  emergencyPhone: patient.emergency_phone,
  notes: patient.notes,
  createdAt: patient.created_at,
});

const toBackendAppointment = (appointment: Appointment) => ({
  id: appointment.id,
  patient_id: appointment.patientId,
  patient_name: appointment.patientName,
  patient_phone: appointment.patientPhone,
  date: appointment.date,
  time: appointment.time,
  treatment_type: appointment.treatmentType,
  notes: appointment.notes,
  status: appointment.status,
  created_at: appointment.createdAt,
});

const fromBackendAppointment = (appointment: any): Appointment => ({
  id: appointment.id,
  patientId: appointment.patient_id,
  patientName: appointment.patient_name,
  patientPhone: appointment.patient_phone,
  date: appointment.date,
  time: appointment.time,
  treatmentType: appointment.treatment_type,
  notes: appointment.notes,
  status: appointment.status,
  createdAt: appointment.created_at,
});

// Patient operations
export const addPatient = async (patient: Omit<Patient, 'id' | 'createdAt'>, userCode?: string): Promise<number> => {
  console.log('[DEBUG] addPatient called, currentAuth:', currentAuth);
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  console.log('[DEBUG] Using dbUrl for addPatient:', (currentAuth as any).db_url);
  const backendPatient = toBackendPatient(patient as Patient);
  
  return executeWithAutoReconnect(async () => {
    return await invoke<number>('add_patient', { patient: backendPatient, dbUrl: (currentAuth as any).db_url });
  }, userCode);
};

export const getPatients = async (userCode?: string): Promise<Patient[]> => {
  console.log('[DEBUG] getPatients called, currentAuth:', currentAuth);
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  console.log('[DEBUG] Using dbUrl for getPatients:', (currentAuth as any).db_url);
  return executeWithAutoReconnect(async () => {
    const patients = await invoke<any[]>('get_patients', { 
      dbUrl: (currentAuth as any).db_url 
    });
    return patients.map(fromBackendPatient);
  }, userCode);
};

export const updatePatient = async (id: number, patient: Omit<Patient, 'id' | 'createdAt'>): Promise<void> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const backendPatient = toBackendPatient(patient as Patient);
  await invoke('update_patient', { 
    id, 
    patient: backendPatient, 
    dbUrl: (currentAuth as any).db_url 
  });
};

export const deletePatient = async (id: number): Promise<void> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  await invoke('delete_patient', { 
    id, 
    dbUrl: (currentAuth as any).db_url 
  });
};

// Appointment operations
export const addAppointment = async (appointment: Omit<Appointment, 'id' | 'createdAt'>, userCode?: string): Promise<number> => {
  console.log('[DEBUG] addAppointment called with:', JSON.stringify(appointment, null, 2));
  console.log('[DEBUG] addAppointment currentAuth:', currentAuth);
  
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  console.log('[DEBUG] Using db_url for addAppointment:', (currentAuth as any).db_url);
  const backendAppointment = toBackendAppointment(appointment as Appointment);
  console.log('[DEBUG] Converted to backend format:', JSON.stringify(backendAppointment, null, 2));
  
  return executeWithAutoReconnect(async () => {
    const result = await invoke<number>('add_appointment', { appointment: backendAppointment, dbUrl: (currentAuth as any).db_url });
    console.log('[DEBUG] add_appointment result:', result);
    return result;
  }, userCode);
};

export const getAppointments = async (userCode?: string): Promise<Appointment[]> => {
  console.log('[DEBUG] getAppointments called, currentAuth:', currentAuth);
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  console.log('[DEBUG] Using db_url for getAppointments:', (currentAuth as any).db_url);
  
  return executeWithAutoReconnect(async () => {
    console.log('[DEBUG] Invoking get_appointments...');
    const appointments = await invoke<any[]>('get_appointments', { dbUrl: (currentAuth as any).db_url });
    console.log('[DEBUG] Raw appointments from backend:', appointments);
    const mappedAppointments = appointments.map(fromBackendAppointment);
    console.log('[DEBUG] Mapped appointments:', mappedAppointments);
    return mappedAppointments;
  }, userCode);
};

export const updateAppointment = async (id: number, appointment: Omit<Appointment, 'id' | 'createdAt' | 'patientName' | 'patientPhone'>): Promise<void> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const backendAppointment = toBackendAppointment(appointment as Appointment);
  await invoke('update_appointment', { id, appointment: backendAppointment, dbUrl: (currentAuth as any).db_url });
};

export const deleteAppointment = async (id: number): Promise<void> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  await invoke('delete_appointment', { id, dbUrl: (currentAuth as any).db_url });
};

export const updateAppointmentStatus = async (id: number, status: string): Promise<void> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  await invoke('update_appointment_status', { id, status, dbUrl: (currentAuth as any).db_url });
};

export const getPatientAppointments = async (patientId: number): Promise<Appointment[]> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const appointments = await invoke<any[]>('get_patient_appointments', { patientId, dbUrl: (currentAuth as any).db_url });
  return appointments.map(fromBackendAppointment);
};

// User authentication functions
export const authenticateUser = async (code: string): Promise<User> => {
  console.log('[DEBUG] Database service: Starting authentication for code:', code);
  
  // Add timeout wrapper to prevent hanging
  const authWithTimeout = new Promise<User>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Authentication timeout after 10 seconds'));
    }, 10000);
    
    const performAuth = async () => {
      try {
        console.log('[DEBUG] Database service: Calling backend authenticate_user...');
        const authResult = await invoke<AuthResult>('authenticate_user', { code, host: getServerHost() });
        console.log('[DEBUG] Database service: Backend authentication result:', authResult);
        
        // Skip connection test for now since backend authentication is already working
        console.log('[DEBUG] Database service: Skipping connection test - backend auth successful');
        
        // Store authentication result for subsequent database operations
        currentAuth = authResult;
        console.log('[DEBUG] currentAuth set to:', currentAuth);
        
        const user = {
          id: authResult.user.id,
          name: authResult.user.name,
          code: authResult.user.code,
          role: authResult.user.role,
          isActive: authResult.user.isActive,
          createdAt: authResult.user.createdAt,
        };
        
        console.log('[DEBUG] Database service: Returning user object:', user);
        clearTimeout(timeout);
        resolve(user);
      } catch (error) {
        console.error('[ERROR] Database service: Authentication failed:', error);
        clearTimeout(timeout);
        reject(error);
      }
    };
    
    performAuth();
  });
  
  return authWithTimeout;
};

// Looks for the MySQL server on this machine / the local network (no manual IP needed).
export const discoverServer = async (): Promise<string | null> => {
  const found = await invoke<string | null>('discover_server', { savedHost: getServerHost() });
  if (found) setServerHost(found);
  return found;
};

export const verifyDoctorAnswer = (answer: string): Promise<boolean> =>
  invoke<boolean>('verify_doctor_answer', { answer });

// Test database connection
export const testDatabaseConnection = async (): Promise<string> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  return await invoke<string>('test_database_connection', { dbUrl: (currentAuth as any).db_url });
};

// Auto-reconnect function
export const reconnectDatabase = async (code: string): Promise<User> => {
  try {
    const authResult = await invoke<AuthResult>('reconnect_database', { code, host: getServerHost() });
    
    // Update stored authentication
    currentAuth = authResult;
    
    return {
      id: authResult.user.id,
      name: authResult.user.name,
      code: authResult.user.code,
      role: authResult.user.role,
      isActive: authResult.user.isActive,
      createdAt: authResult.user.createdAt,
    };
  } catch (error) {
    console.error('[ERROR] Reconnection failed:', error);
    throw error;
  }
};

// Enhanced database operation wrapper with auto-reconnect
const executeWithAutoReconnect = async <T>(
  operation: () => Promise<T>,
  userCode?: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const errorMessage = error as string;
    
    // Check if error is related to database connection
    if (errorMessage.includes('connection') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('network') ||
        errorMessage.includes('Failed to connect')) {
      
      console.log('[DEBUG] Database connection error detected, attempting reconnection...');
      
      if (userCode && currentAuth) {
        try {
          await reconnectDatabase(userCode);
          console.log('[DEBUG] Reconnection successful, retrying operation...');
          return await operation();
        } catch (reconnectError) {
          console.error('[ERROR] Reconnection failed:', reconnectError);
          throw new Error('Connexion à la base de données perdue. Veuillez vous reconnecter.');
        }
      } else {
        throw new Error('Connexion à la base de données perdue. Veuillez vous reconnecter.');
      }
    }
    
    // If it's not a connection error, throw the original error
    throw error;
  }
};

// Payment management functions
export const addPayment = async (payment: Omit<Payment, 'id' | 'createdAt' | 'patientName' | 'collectedByName'>): Promise<number> => {
  const backendPayment = {
    appointment_id: payment.appointmentId,
    patient_id: payment.patientId,
    amount: payment.amount,
    payment_method: payment.paymentMethod,
    collected_by: payment.collectedBy,
    notes: payment.notes,
    payment_date: payment.paymentDate,
  };
  
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  return await invoke<number>('add_payment', { payment: backendPayment, dbUrl: (currentAuth as any).db_url });
};

export const getPaymentsByDate = async (date: string): Promise<Payment[]> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const payments = await invoke<any[]>('get_payments_by_date', { date, dbUrl: (currentAuth as any).db_url });
  return payments.map(payment => ({
    id: payment.id,
    appointmentId: payment.appointment_id,
    patientId: payment.patient_id,
    patientName: payment.patient_name,
    amount: payment.amount,
    paymentMethod: payment.payment_method,
    collectedBy: payment.collected_by,
    collectedByName: payment.collected_by_name,
    notes: payment.notes,
    paymentDate: payment.payment_date,
    createdAt: payment.created_at,
  }));
};

export const getDailySummaryByStaff = async (date: string, staffId: number): Promise<DailySummary> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const summary = await invoke<any>('get_daily_summary_by_staff', { date, staffId, dbUrl: (currentAuth as any).db_url });
  return {
    date: summary.date,
    staffId: summary.staff_id,
    staffName: summary.staff_name,
    totalCash: summary.total_cash,
    totalCard: summary.total_card,
    totalCheck: summary.total_check,
    totalTransfer: summary.total_transfer,
    totalCollected: summary.total_collected,
    numberOfPayments: summary.number_of_payments,
  };
};

export const getDailySummaryAllStaff = async (date: string): Promise<DailySummary[]> => {
  if (!currentAuth) {
    throw new Error('User not authenticated. Please login first.');
  }
  
  const summaries = await invoke<any[]>('get_daily_summary_all_staff', { date, dbUrl: (currentAuth as any).db_url });
  return summaries.map(summary => ({
    date: summary.date,
    staffId: summary.staff_id,
    staffName: summary.staff_name,
    totalCash: summary.total_cash,
    totalCard: summary.total_card,
    totalCheck: summary.total_check,
    totalTransfer: summary.total_transfer,
    totalCollected: summary.total_collected,
    numberOfPayments: summary.number_of_payments,
  }));
};

// Initialize database (happens automatically on first call)
export const initDatabase = async (): Promise<void> => {
  // Database is initialized automatically when first operation is called
  // This function exists for compatibility
  return Promise.resolve();
};