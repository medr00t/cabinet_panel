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

// The app talks to the cabinet's web server (/api/...). `npm run dev:mock` uses an in-memory fake instead.
const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1';

export const SESSION_EXPIRED_EVENT = 'cabinet:session-expired';

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), credentials: 'same-origin' });
  } catch {
    throw new Error('Connexion au serveur perdue. Vérifiez que le poste du serveur est allumé.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/login') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error((data as { error?: string }).error || `Erreur du serveur (${res.status})`);
  }
  return data as T;
}

async function rawInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (USE_MOCK) {
    const { mockInvoke } = await import('../dev/mockBackend');
    return mockInvoke(cmd, { ...args, dbUrl: 'mock' }) as Promise<T>;
  }
  return post<T>(`/api/call/${cmd}`, args);
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

// ------------------------------------------------------------------ session (kept by the server, in a cookie)

let session: { user: User } | null = null;

interface LoginResult { user: User }

export async function login(code: string): Promise<User> {
  const res = USE_MOCK
    ? await (async () => {
      const { mockInvoke } = await import('../dev/mockBackend');
      const r = await mockInvoke('authenticate_user', { code, host: 'localhost' }) as { user: User };
      return { user: r.user } as LoginResult;
    })()
    : await post<LoginResult>('/api/login', { code });
  session = { user: res.user };
  return res.user;
}

/** After a page refresh: is the browser still logged in? */
export async function restoreSession(): Promise<User | null> {
  if (USE_MOCK) return null;
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const user = ((await res.json()) as LoginResult).user;
    session = { user };
    return user;
  } catch {
    return null;
  }
}

export function logout(): void {
  session = null;
  if (!USE_MOCK) void fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
}
export const currentUser = (): User | null => session?.user ?? null;

// Calls a backend command. The server knows the database from the session; payload objects use snake_case fields.
async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!session) throw new Error('Session expirée. Veuillez vous reconnecter.');
  const payload = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, v !== null && typeof v === 'object' ? mapKeys(v, snake, false) : v]),
  );
  return mapKeys(await rawInvoke<unknown>(cmd, payload), camel, true) as T;
}

/** Shows a generated PDF (base64) in a new browser tab, where it can be printed with Ctrl+P. */
export async function openPdf(name: string, data: string): Promise<void> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const win = window.open(url, '_blank');
  if (!win) { // pop-up blocked: download it instead
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export const backupDownloadUrl = (name: string) => `/api/backup/${encodeURIComponent(name)}`;

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
export interface BackupFile { name: string; size: number; modified: string }
export interface BackupList { dir: string; files: BackupFile[] }
export interface RestoreResult { patients: number; appointments: number; treatments: number; payments: number; toothMarks: number; cnssSheets: number; settings: number }
export const listBackups = () => call<BackupList>('list_backups');
/** Rebuilds an EMPTY database from a backup workbook; refused when the database already holds data. */
export const restoreBackup = (file: string) => call<RestoreResult>('restore_backup', { file });
/** automatic (after login): this month and last month; full (button): every month that has data */
export const exportBackup = (full = false) => call<BackupResult>('export_backup', { full });

// ------------------------------------------------------------------ doctor's settings

/** The reception login code as stored in the database (null until reception has logged in once or the doctor sets one). */
export const getReceptionCode = () => call<string | null>('get_reception_code');
export const setReceptionCode = (code: string) => call<void>('set_reception_code', { code });
/** Changes the doctor's own code and/or security answer on this laptop; the current code is asked again. */
export const changeDoctorLogin = (currentCode: string, newCode?: string, newAnswer?: string) =>
  call<void>('change_doctor_login', { currentCode, newCode: newCode || null, newAnswer: newAnswer || null });

// ------------------------------------------------------------------ caisse

export const paymentsByDate = (date: string) => call<Payment[]>('get_payments_by_date', { date });
export const summaryByStaff = (date: string, staffId: number) => call<DailySummary>('get_daily_summary_by_staff', { date, staffId });
export const summaryAllStaff = (date: string) => call<DailySummary[]>('get_daily_summary_all_staff', { date });
