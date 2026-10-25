// In-memory stand-in for the Rust backend, used only by `npm run dev` in a plain browser
// (no Tauri window) so the UI can be developed and screenshot-tested without MySQL.
// It mirrors the real validation rules; the Rust integration tests remain the source of truth.

import { addDays, format } from 'date-fns';

type Obj = Record<string, any>;
const d = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

const users = [
  { id: 1, name: 'Dr. El Ansari', code: '1234', role: 'doctor' },
  { id: 2, name: 'Réception Principale', code: '5678', role: 'reception' },
];

let nextId = 100;
const id = () => ++nextId;

const person = (n: number, billet: string, first: string, last: string, gender: string, dob: string, phone: string, insurance: string | null, extra: Obj = {}) => ({
  id: n, billet_number: billet, first_name: first, last_name: last, gender, date_of_birth: dob, phone, insurance,
  address: null, email: null, allergies: null, medical_history: null, medications: null,
  emergency_contact: null, emergency_phone: null, notes: null, created_at: d(-60 + n), ...extra,
});

const patients: Obj[] = [
  person(1, '1201', 'Samira', 'Benali', 'female', '1988-04-12', '0661 23 45 67', 'CNSS', { address: '12 rue Ibn Khaldoun, Meknès', medical_history: 'Hypertension traitée.\nPas de problème de coagulation.', notes: 'Plan : détartrage, 2 composites (16, 26), puis couronne sur 36.', allergies: 'Pénicilline' }),
  person(2, '1202', 'Youssef', 'El Idrissi', 'male', '1975-09-30', '0662 11 22 33', 'CNOPS'),
  person(3, '1203', 'Khadija', 'Alaoui', 'female', '1994-01-08', '0670 55 44 21', null, { address: 'Hay Salam, Meknès' }),
  person(4, '1204', 'Omar', 'Tazi', 'male', '2012-06-21', '0655 90 12 34', 'AMO', { emergency_contact: 'Fatima Tazi', emergency_phone: '0655 90 12 35' }),
  person(5, '1205', 'Nadia', 'Berrada', 'female', '1969-11-02', '0661 78 90 11', 'Assurance privée'),
  person(6, '1206', 'Hamza', 'Chraibi', 'male', '1991-03-17', '0668 40 40 18', 'CNSS'),
  person(7, '1207', 'Salma', 'Fassi', 'female', '2001-12-25', '0677 21 09 87', null),
  person(8, '1208', 'Mehdi', 'Lahlou', 'male', '1983-07-14', '0663 32 10 54', 'CNOPS'),
  person(9, '1209', 'Imane', 'Ouazzani', 'female', '1979-02-28', '0664 88 77 66', 'AMO'),
  person(10, '1210', 'Rachid', 'Bennani', 'male', '1958-10-05', '0661 05 05 50', 'CNSS', { medications: 'Metformine' }),
  person(11, '1211', 'Zineb', 'Kettani', 'female', '1997-05-19', '0672 63 63 36', null),
  person(12, '1212', 'Anas', 'Mansouri', 'male', '2005-08-09', '0660 14 28 42', 'AMO'),
];

const treatments: Obj[] = [
  { id: 1, patient_id: 1, treatment_date: d(-50), tooth: '16', act: 'Composite', quote: 400, notes: null, created_by: 2 },
  { id: 2, patient_id: 1, treatment_date: d(-30), tooth: '26', act: 'Composite', quote: 400, notes: 'Teinte A2', created_by: 2 },
  { id: 3, patient_id: 1, treatment_date: d(-3), tooth: '36', act: 'Couronne céramique', quote: 3200, notes: null, created_by: 1 },
  { id: 4, patient_id: 2, treatment_date: d(-20), tooth: '46', act: 'Dévitalisation', quote: 900, notes: null, created_by: 1 },
  { id: 5, patient_id: 2, treatment_date: d(-1), tooth: '46', act: 'Reconstitution', quote: 500, notes: null, created_by: 2 },
  { id: 6, patient_id: 4, treatment_date: d(-7), tooth: '', act: 'Détartrage', quote: 300, notes: null, created_by: 2 },
  { id: 7, patient_id: 5, treatment_date: d(-14), tooth: '11-21', act: 'Facettes', quote: 6000, notes: null, created_by: 1 },
  { id: 8, patient_id: 8, treatment_date: d(0), tooth: '18', act: 'Extraction', quote: 350, notes: null, created_by: 2 },
  { id: 9, patient_id: 1, treatment_date: d(-10), tooth: '14, 15', act: 'Composite', quote: 700, notes: 'Teinte A3, digue posée', created_by: 2 },
  { id: 10, patient_id: 1, treatment_date: d(-2), tooth: 'Maxillaire', act: 'Détartrage', quote: 250, notes: null, created_by: 2 },
];

const payments: Obj[] = [
  { id: 1, treatment_id: 1, patient_id: 1, amount: 400, payment_method: 'espèces', collected_by: 2, payment_date: d(-50) },
  { id: 2, treatment_id: 2, patient_id: 1, amount: 400, payment_method: 'carte', collected_by: 2, payment_date: d(-30) },
  { id: 3, treatment_id: 3, patient_id: 1, amount: 1500, payment_method: 'chèque', collected_by: 1, payment_date: d(-3) },
  { id: 4, treatment_id: 4, patient_id: 2, amount: 900, payment_method: 'espèces', collected_by: 1, payment_date: d(-20) },
  { id: 5, treatment_id: 5, patient_id: 2, amount: 200, payment_method: 'espèces', collected_by: 2, payment_date: d(0) },
  { id: 6, treatment_id: 6, patient_id: 4, amount: 300, payment_method: 'espèces', collected_by: 2, payment_date: d(-7) },
  { id: 7, treatment_id: 7, patient_id: 5, amount: 2500, payment_method: 'virement', collected_by: 1, payment_date: d(-14) },
  { id: 8, treatment_id: 8, patient_id: 8, amount: 350, payment_method: 'carte', collected_by: 2, payment_date: d(0) },
  { id: 9, treatment_id: 3, patient_id: 1, amount: 700, payment_method: 'espèces', collected_by: 2, payment_date: d(0) },
];

const toothMarks: Obj[] = [
  { patient_id: 1, tooth: '46', status: 'absente', note: 'Extraite en 2019, implant envisagé', updated_by: 1, updated_at: `${d(-400)} 10:00:00` },
  { patient_id: 1, tooth: '18', status: 'carie', note: 'À surveiller à la prochaine visite', updated_by: 1, updated_at: `${d(-5)} 10:00:00` },
  { patient_id: 1, tooth: '11', status: '', note: 'Sensible au froid', updated_by: 2, updated_at: `${d(-9)} 10:00:00` },
];
const cnssSheets: Obj[] = [];
const settings: Record<string, string> = { cnss_inp: '123456789', cnss_city: 'Meknès' };
const VALID_STATUS = ['', 'carie', 'soigne', 'devitalise', 'couronne', 'implant', 'absente'];
const validTooth = (t: string) => /^[1-4][1-8]$/.test(t) || /^[5-8][1-5]$/.test(t);

const appt = (n: number, pid: number, day: number, time: string, type: string, status: string, notes: string | null = null) =>
  ({ id: n, patient_id: pid, date: d(day), time, treatment_type: type, notes, status });
const appointments: Obj[] = [
  appt(1, 1, 0, '09:00', 'Contrôle couronne', 'terminé'),
  appt(2, 8, 0, '10:00', 'Extraction', 'terminé'),
  appt(3, 2, 0, '11:30', 'Reconstitution', 'confirmé'),
  appt(4, 3, 0, '14:00', 'Consultation', 'programmé', 'Première visite'),
  appt(5, 6, 0, '15:30', 'Détartrage', 'programmé'),
  appt(6, 9, 0, '16:30', 'Dévitalisation', 'programmé'),
  appt(7, 4, 1, '09:30', 'Contrôle', 'confirmé'),
  appt(8, 7, 1, '11:00', 'Blanchiment', 'programmé'),
  appt(9, 10, 2, '10:00', 'Prothèse', 'programmé'),
  appt(10, 5, 3, '15:00', 'Facettes', 'confirmé'),
  appt(11, 11, -1, '10:30', 'Détartrage', 'terminé'),
  appt(12, 12, -1, '14:30', 'Consultation', 'manqué'),
];

const paidOf = (tid: number) => payments.filter((p) => p.treatment_id === tid).reduce((s, p) => s + p.amount, 0);
const round = (n: number) => Math.round(n * 100) / 100;
const fail = (m: string): never => { throw m; };

const asPatient = (p: Obj) => ({ ...p });
const withNames = (a: Obj) => {
  const p = patients.find((x) => x.id === a.patient_id);
  return { ...a, patient_name: p ? `${p.first_name} ${p.last_name}` : null, patient_phone: p?.phone ?? null };
};

function requireDoctor(url: string) {
  if (!url.endsWith('doctor')) fail('Erreur: DELETE command denied to user \'reception\'');
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

export async function mockInvoke(cmd: string, a: Obj): Promise<unknown> {
  const url: string = a.dbUrl ?? '';
  switch (cmd) {
    case 'discover_server': return delay('localhost');
    case 'verify_doctor_answer': return delay(String(a.answer).trim().toLowerCase() === 'test');
    case 'authenticate_user':
    case 'reconnect_database': {
      const u = users.find((x) => x.code === a.code);
      if (!u) return Promise.reject('Code invalide ou utilisateur inactif');
      return delay({ user: { id: u.id, name: u.name, role: u.role, code: '', is_active: true }, db_url: `mock://${u.role}` });
    }

    case 'get_patients': return delay(patients.map(asPatient));
    case 'get_next_billet_number': return delay(String(Math.max(0, ...patients.map((p) => Number(p.billet_number) || 0)) + 1));
    case 'add_patient': {
      const p = a.patient;
      if (!p.first_name?.trim() || !p.last_name?.trim()) fail('Le nom et le prénom sont obligatoires');
      if (!p.phone?.trim()) fail('Le numéro de téléphone est obligatoire');
      const billet = p.billet_number?.trim() || null;
      if (billet && patients.some((x) => x.billet_number === billet)) fail('Ce numéro de billet existe déjà');
      const row = { ...p, billet_number: billet, id: id(), created_at: format(new Date(), 'yyyy-MM-dd') };
      patients.push(row);
      return delay(row.id);
    }
    case 'update_patient': {
      const i = patients.findIndex((x) => x.id === a.id);
      const billet = a.patient.billet_number?.trim() || null;
      if (billet && patients.some((x) => x.billet_number === billet && x.id !== a.id)) fail('Ce numéro de billet existe déjà');
      patients[i] = { ...patients[i], ...a.patient, billet_number: billet, id: a.id };
      return delay(null);
    }
    case 'delete_patient': {
      requireDoctor(url);
      if (treatments.some((t) => t.patient_id === a.id)) fail('Ce patient a des actes ou des paiements enregistrés : suppression impossible');
      for (let i = appointments.length - 1; i >= 0; i--) if (appointments[i].patient_id === a.id) appointments.splice(i, 1);
      patients.splice(patients.findIndex((x) => x.id === a.id), 1);
      return delay(null);
    }

    case 'get_appointments': return delay(appointments.map(withNames));
    case 'add_appointment': { const row = { ...a.appointment, id: id() }; appointments.push(row); return delay(row.id); }
    case 'update_appointment': {
      const i = appointments.findIndex((x) => x.id === a.id);
      appointments[i] = { ...appointments[i], ...a.appointment, id: a.id };
      return delay(null);
    }
    case 'update_appointment_status': appointments.find((x) => x.id === a.id)!.status = a.status; return delay(null);
    case 'delete_appointment': appointments.splice(appointments.findIndex((x) => x.id === a.id), 1); return delay(null);

    case 'get_patient_treatments':
      return delay(treatments.filter((t) => t.patient_id === a.patientId)
        .sort((x, y) => x.treatment_date.localeCompare(y.treatment_date) || x.id - y.id)
        .map((t) => ({ ...t, total_paid: paidOf(t.id) })));
    case 'add_treatment': {
      const t = a.treatment;
      if (!t.act?.trim()) fail("L'acte médical est obligatoire");
      if (!(a.paidNow >= 0) || !(t.quote >= 0)) fail('Montant invalide');
      if (a.paidNow > t.quote + 0.005) fail('Le montant payé dépasse le devis');
      const row = { ...t, id: id() };
      treatments.push(row);
      if (a.paidNow > 0.005) payments.push({ id: id(), treatment_id: row.id, patient_id: t.patient_id, amount: a.paidNow, payment_method: a.paymentMethod, collected_by: t.created_by, payment_date: t.treatment_date });
      return delay(row.id);
    }
    case 'update_treatment': {
      const t = a.treatment;
      if (t.quote + 0.005 < paidOf(t.id)) fail(`Le devis ne peut pas être inférieur au montant déjà payé (${paidOf(t.id).toFixed(2)})`);
      const i = treatments.findIndex((x) => x.id === t.id);
      treatments[i] = { ...treatments[i], ...t };
      return delay(null);
    }
    case 'delete_treatment': {
      requireDoctor(url);
      for (let i = payments.length - 1; i >= 0; i--) if (payments[i].treatment_id === a.id) payments.splice(i, 1);
      treatments.splice(treatments.findIndex((x) => x.id === a.id), 1);
      return delay(null);
    }
    case 'add_treatment_payment': {
      const t = treatments.find((x) => x.id === a.treatmentId) ?? fail('Acte introuvable');
      if (!(a.amount > 0.005)) fail('Le montant doit être supérieur à zéro');
      const reste = round(t.quote - paidOf(t.id));
      if (a.amount > reste + 0.005) fail(`Le paiement dépasse le reste à payer (${reste.toFixed(2)})`);
      const row = { id: id(), treatment_id: t.id, patient_id: t.patient_id, amount: a.amount, payment_method: a.paymentMethod, collected_by: a.collectedBy, payment_date: a.paymentDate };
      payments.push(row);
      return delay(row.id);
    }
    case 'get_treatment_payments':
      return delay(payments.filter((p) => p.treatment_id === a.treatmentId).sort((x, y) => x.payment_date.localeCompare(y.payment_date) || x.id - y.id));
    case 'delete_payment': requireDoctor(url); payments.splice(payments.findIndex((x) => x.id === a.id), 1); return delay(null);
    case 'get_cnss_sheets': return delay(cnssSheets.filter((s) => s.patient_id === a.patientId).sort((x, y) => y.id - x.id));
    case 'save_cnss_sheet': {
      const s = a.sheet;
      try { JSON.parse(s.data); } catch { fail('Données de la feuille CNSS invalides'); }
      const now = `${format(new Date(), 'yyyy-MM-dd')} 12:00:00`;
      if (s.id) { const i = cnssSheets.findIndex((x) => x.id === s.id); cnssSheets[i] = { ...cnssSheets[i], label: s.label, data: s.data, updated_at: now }; return delay(s.id); }
      const row = { ...s, id: id(), created_at: now, updated_at: now };
      cnssSheets.push(row);
      return delay(row.id);
    }
    case 'delete_cnss_sheet': requireDoctor(url); cnssSheets.splice(cnssSheets.findIndex((x) => x.id === a.id), 1); return delay(null);
    case 'get_settings': return delay({ ...settings });
    case 'set_setting':
      if (!['cnss_inp', 'cnss_city', 'dentist_name'].includes(a.name)) fail('Paramètre inconnu');
      settings[a.name] = String(a.value).trim();
      return delay(null);
    case 'open_pdf': {
      (window as any).__lastPdf = a.data;
      const bin = atob(a.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
      return delay(`/tmp/cabinet-impressions/${a.name}.pdf`);
    }
    case 'list_backups':
      requireDoctor(url);
      return delay({ dir: 'Documents/Sauvegardes Cabinet', files: [
        { name: `cabinet_${format(new Date(), 'yyyy-MM')}.xlsx`, size: 41200, modified: format(new Date(), 'dd/MM/yyyy HH:mm') },
        { name: 'cabinet_2026-09.xlsx', size: 38800, modified: '30/09/2026 17:40' } ] });
    case 'restore_backup':
      requireDoctor(url);
      return Promise.reject('La base de données contient déjà des données : la restauration ne remplace jamais des données existantes.');
    case 'export_backup':
      requireDoctor(url);
      return delay({ path: `Documents/Sauvegardes Cabinet/cabinet_${format(new Date(), 'yyyy-MM')}.xlsx (aperçu navigateur)`, files: a.full ? 3 : 2, patients: patients.length,
        new_patients: 1, treatments: treatments.length, payments: payments.length, appointments: appointments.length, tooth_marks: toothMarks.length });
    case 'get_tooth_marks': return delay(toothMarks.filter((m) => m.patient_id === a.patientId));
    case 'set_tooth_mark': {
      const m = a.mark;
      if (!validTooth(m.tooth)) fail('Numéro de dent invalide');
      if (!VALID_STATUS.includes(m.status)) fail('Statut de dent invalide');
      const row = { ...m, note: m.note?.trim() || null, updated_at: `${format(new Date(), 'yyyy-MM-dd')} 12:00:00` };
      const i = toothMarks.findIndex((x) => x.patient_id === m.patient_id && x.tooth === m.tooth);
      if (i >= 0) toothMarks[i] = row; else toothMarks.push(row);
      return delay(null);
    }
    case 'get_patient_balances': {
      const by = new Map<number, { patient_id: number; total_quote: number; total_paid: number }>();
      for (const t of treatments) {
        const b = by.get(t.patient_id) ?? { patient_id: t.patient_id, total_quote: 0, total_paid: 0 };
        b.total_quote += t.quote; b.total_paid += paidOf(t.id);
        by.set(t.patient_id, b);
      }
      return delay([...by.values()]);
    }

    case 'get_payments_by_date':
      return delay(payments.filter((p) => p.payment_date === a.date).map((p) => {
        const pt = patients.find((x) => x.id === p.patient_id);
        return { ...p, patient_name: pt ? `${pt.first_name} ${pt.last_name}` : null, treatment_act: treatments.find((t) => t.id === p.treatment_id)?.act ?? null };
      }));
    case 'get_daily_summary_all_staff':
    case 'get_daily_summary_by_staff': {
      const rows = users.filter((u) => cmd === 'get_daily_summary_all_staff' || u.id === a.staffId).map((u) => {
        const mine = payments.filter((p) => p.payment_date === a.date && p.collected_by === u.id);
        const sum = (m: string) => mine.filter((p) => p.payment_method === m).reduce((s, p) => s + p.amount, 0);
        return { date: a.date, staff_id: u.id, staff_name: u.name, total_cash: sum('espèces'), total_card: sum('carte'), total_check: sum('chèque'), total_transfer: sum('virement'), total_collected: mine.reduce((s, p) => s + p.amount, 0), number_of_payments: mine.length };
      });
      return delay(cmd === 'get_daily_summary_by_staff' ? rows[0] : rows.filter((r) => r.number_of_payments > 0));
    }
    case 'setup_status': return delay({ config_exists: !location.search.includes('setup'), server_installed: false, server_running: false, port_busy: false, platform: 'windows' });
    case 'setup_save_config': return delay(null);
    case 'server_install': return new Promise((r) => setTimeout(() => r({ version: '8.4.11', port: 3306, address: '192.168.1.20' }), 1500));
    case 'server_start': return delay(true);
    case 'setup_find_backups': return delay([{ path: 'D:\\Sauvegardes Cabinet\\cabinet_2026-10.xlsx', name: 'cabinet_2026-10.xlsx', folder: 'D:\\Sauvegardes Cabinet', size: 48210, modified: '25/10/2026 18:02', restorable: true }]);
    case 'setup_restore': return delay({ patients: 12, appointments: 5, treatments: 10, payments: 8, tooth_marks: 2, cnss_sheets: 0, settings: 1 });
    case 'client_check': return delay({ ok: String(a.passphrase).length >= 8, host: '192.168.1.20', message: 'Serveur trouvé (192.168.1.20)' });
    default: return Promise.reject(`Commande inconnue (mock): ${cmd}`);
  }
}

