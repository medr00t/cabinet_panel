import { invoke as tauriInvoke } from '@tauri-apps/api/core';

// ------------------------------------------------------------------ types

export type Role = 'doctor' | 'reception';
export interface User { id: number; name: string; role: Role }

export interface Patient {
  id?: number;
  billetNumber?: string;
  firstName: string;
  lastName: string;
  phone: string;
  insurance?: string;
  dateOfBirth?: string;
  gender: 'male' | 'female';
  address?: string;
  email?: string;
  allergies?: string;
  medicalHistory?: string; // "R.C." on the paper card
  medications?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string; // "Devis" / treatment plan on the paper card
  createdAt?: string;
}

export type AppointmentStatus = 'programmé' | 'confirmé' | 'terminé' | 'annulé' | 'manqué';
export interface Appointment {
  id?: number;
  patientId: number;
  patientName?: string;
  patientPhone?: string;
  date: string;
  time: string;
  treatmentType: string;
  notes?: string;
  status: AppointmentStatus;
}

/** One line of the paper ledger. paid comes from the payments attached to it. */
export interface Treatment {
  id?: number;
  patientId: number;
  treatmentDate: string;
  tooth: string;
  act: string;
  quote: number;
  notes?: string;
  createdBy: number;
  totalPaid: number;
}

export type PaymentMethod = 'espèces' | 'carte' | 'chèque' | 'virement';
export interface TreatmentPayment { id: number; treatmentId: number; amount: number; paymentMethod: PaymentMethod; paymentDate: string; collectedBy: number }
export interface Payment {
  id: number; patientId: number; patientName?: string; treatmentId?: number; treatmentAct?: string;
  amount: number; paymentMethod: PaymentMethod; collectedBy: number; paymentDate: string;
}
export type ToothStatus = '' | 'carie' | 'soigne' | 'devitalise' | 'couronne' | 'implant' | 'absente';
/** Per-tooth state set by hand, plus a remark (FDI tooth number like "36"). */
export interface ToothMark { patientId: number; tooth: string; status: ToothStatus; note?: string; updatedBy: number; updatedAt?: string }
export interface Balance { patientId: number; totalQuote: number; totalPaid: number }
export interface DailySummary {
  date: string; staffId: number; staffName: string;
  totalCash: number; totalCard: number; totalCheck: number; totalTransfer: number;
  totalCollected: number; numberOfPayments: number;
}

// ------------------------------------------------------------------ transport

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function rawInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  // Browser preview (npm run dev without Tauri): in-memory fake backend, stripped from production builds.
  if (import.meta.env.DEV && !inTauri) {
    const { mockInvoke } = await import('../dev/mockBackend');
    return mockInvoke(cmd, args) as Promise<T>;
  }
  return tauriInvoke<T>(cmd, args);
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function mapKeys(value: unknown, fn: (k: string) => string, dropNull: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, fn, dropNull));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (dropNull && v === null) continue; // Rust Option::None -> undefined
      if (!dropNull && v === undefined) { out[fn(k)] = null; continue; } // undefined -> Option::None
      out[fn(k)] = mapKeys(v, fn, dropNull);
    }
    return out;
  }
  return value;
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Une erreur est survenue';

// ------------------------------------------------------------------ session

interface Session { user: User; dbUrl: string; code: string }
let session: Session | null = null;

const HOST_KEY = 'serverHost';
export const getServerHost = (): string => {
  try { return localStorage.getItem(HOST_KEY) || 'localhost'; } catch { return 'localhost'; }
};
export const setServerHost = (host: string): void => {
  try { localStorage.setItem(HOST_KEY, host.trim() || 'localhost'); } catch { /* not remembered */ }
};

interface AuthResult { user: { id: number; name: string; role: Role }; db_url: string }

export async function login(code: string): Promise<User> {
  const res = await rawInvoke<AuthResult>('authenticate_user', { code, host: getServerHost() });
  const user: User = { id: res.user.id, name: res.user.name, role: res.user.role };
  session = { user, dbUrl: res.db_url, code };
  return user;
}

export function logout(): void { session = null; }
export const currentUser = (): User | null => session?.user ?? null;

export async function discoverServer(): Promise<string | null> {
  const found = await rawInvoke<string | null>('discover_server', { savedHost: getServerHost() });
  if (found) setServerHost(found);
  return found;
}

export const verifyDoctorAnswer = (answer: string): Promise<boolean> =>
  rawInvoke<boolean>('verify_doctor_answer', { answer });

const CONNECTION_ERROR = /connect|connexion|timed? ?out|gone away|lost connection|broken pipe/i;

// Calls a backend command with the session's db url; on a connection error, re-finds the server
// (it may have a new IP), reconnects with the remembered code and retries once.
async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!session) throw new Error('Session expirée. Veuillez vous reconnecter.');
  // Tauri maps top-level argument names itself (camelCase); only payload objects need snake_case fields.
  const payload = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, v !== null && typeof v === 'object' ? mapKeys(v, snake, false) : v]),
  );
  const send = (dbUrl: string) => rawInvoke<unknown>(cmd, { ...payload, dbUrl });
  try {
    return mapKeys(await send(session.dbUrl), camel, true) as T;
  } catch (first) {
    if (!CONNECTION_ERROR.test(errorMessage(first))) throw new Error(errorMessage(first));
    try {
      await discoverServer().catch(() => null);
      const res = await rawInvoke<AuthResult>('reconnect_database', { code: session.code, host: getServerHost() });
      session = { ...session, dbUrl: res.db_url };
      return mapKeys(await send(session.dbUrl), camel, true) as T;
    } catch {
      throw new Error('Connexion au serveur perdue. Vérifiez que le poste du docteur est allumé.');
    }
  }
}

// ------------------------------------------------------------------ patients

export const listPatients = () => call<Patient[]>('get_patients');
// the backend requires date_of_birth to be a string (empty when unknown)
const forBackend = (p: Patient): Patient => ({ ...p, dateOfBirth: p.dateOfBirth ?? '' });
export const createPatient = (patient: Patient) => call<number>('add_patient', { patient: forBackend(patient) });
export const savePatient = (id: number, patient: Patient) => call<void>('update_patient', { id, patient: forBackend(patient) });
export const removePatient = (id: number) => call<void>('delete_patient', { id });
export const nextBilletNumber = () => call<string>('get_next_billet_number');

// ------------------------------------------------------------------ appointments

export const listAppointments = () => call<Appointment[]>('get_appointments');
export const createAppointment = (appointment: Appointment) => call<number>('add_appointment', { appointment });
export const saveAppointment = (id: number, appointment: Appointment) => call<void>('update_appointment', { id, appointment });
export const setAppointmentStatus = (id: number, status: AppointmentStatus) => call<void>('update_appointment_status', { id, status });
export const removeAppointment = (id: number) => call<void>('delete_appointment', { id });

// ------------------------------------------------------------------ ledger (actes & paiements)

export const patientTreatments = (patientId: number) => call<Treatment[]>('get_patient_treatments', { patientId });
export const addTreatment = (treatment: Treatment, paidNow: number, paymentMethod: PaymentMethod) =>
  call<number>('add_treatment', { treatment, paidNow, paymentMethod });
export const saveTreatment = (treatment: Treatment) => call<void>('update_treatment', { treatment });
export const removeTreatment = (id: number) => call<void>('delete_treatment', { id });
export const payTreatment = (treatmentId: number, amount: number, paymentMethod: PaymentMethod, paymentDate: string) =>
  call<number>('add_treatment_payment', { treatmentId, amount, paymentMethod, paymentDate, collectedBy: session?.user.id ?? 0 });
export const treatmentPayments = (treatmentId: number) => call<TreatmentPayment[]>('get_treatment_payments', { treatmentId });
export const removePayment = (id: number) => call<void>('delete_payment', { id });
export const patientBalances = () => call<Balance[]>('get_patient_balances');

export const toothMarks = (patientId: number) => call<ToothMark[]>('get_tooth_marks', { patientId });
export const saveToothMark = (mark: ToothMark) => call<void>('set_tooth_mark', { mark });

// ------------------------------------------------------------------ CNSS sheets and clinic settings

export interface CnssSheetRow { id?: number; patientId: number; label: string; data: string; createdBy: number; createdAt?: string; updatedAt?: string }
export const cnssSheets = (patientId: number) => call<CnssSheetRow[]>('get_cnss_sheets', { patientId });
export const saveCnssSheet = (sheet: CnssSheetRow) => call<number>('save_cnss_sheet', { sheet });
export const removeCnssSheet = (id: number) => call<void>('delete_cnss_sheet', { id });
/** keys come back camelCased: cnssInp, cnssCity, dentistName */
export const getSettings = () => call<Record<string, string>>('get_settings');
export const setSetting = (name: 'cnss_inp' | 'cnss_city' | 'dentist_name', value: string) => call<void>('set_setting', { name, value });

// ------------------------------------------------------------------ Excel backup (doctor only)

export interface BackupResult { path: string; files: number; patients: number; newPatients: number; treatments: number; payments: number; appointments: number; toothMarks: number }
/** automatic (after login): this month and last month; full (button): every month that has data */
export const exportBackup = (full = false) => call<BackupResult>('export_backup', { full });

// ------------------------------------------------------------------ caisse

export const paymentsByDate = (date: string) => call<Payment[]>('get_payments_by_date', { date });
export const summaryByStaff = (date: string, staffId: number) => call<DailySummary>('get_daily_summary_by_staff', { date, staffId });
export const summaryAllStaff = (date: string) => call<DailySummary[]>('get_daily_summary_all_staff', { date });
