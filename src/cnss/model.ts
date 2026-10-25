import { Patient, Treatment } from '../services/api';
import { ACT_CATALOG } from '../constants';
import { parseDesignation } from '../teeth';
import { MAX_ACT_LINES } from './layout';
import { today } from '../utils/format';

export interface CnssAct {
  id: string;
  /** the treatment of the carnet this line comes from (so it is not billed twice) */
  treatmentId?: number;
  teeth: string;
  code: string;
  date: string;
  coef: string;
  keyValue: string;
  amount: string;
}

export interface CnssData {
  entente: boolean;
  execution: boolean;
  insuredName: string;
  immat: string;
  insuredCin: string;
  relation: 'self' | 'spouse' | 'child';
  address: string;
  fees: string;
  attachments: string;
  beneficiaryName: string;
  dob: string;
  beneficiaryCin: string;
  sex: 'M' | 'F' | '';
  inp: string;
  careSoins: boolean;
  careProthese: boolean;
  careOrtho: boolean;
  careAutres: boolean;
  priorAgreement: string;
  accidentDate: string;
  placeInsured: string;
  dateInsured: string;
  placeDentist: string;
  dateDentist: string;
  acts: CnssAct[];
}

export interface Settings { cnssInp?: string; cnssCity?: string; dentistName?: string }

export interface SavedSheet { id: number; label: string; createdAt?: string; updatedAt?: string; data: CnssData }

type CareKey = 'careSoins' | 'careProthese' | 'careOrtho' | 'careAutres';

/** Which "Type de soins" box an act belongs to. */
export const careOf = (act: string): CareKey => {
  const n = act.trim().toLowerCase();
  const group = ACT_CATALOG.find((a) => a.name.toLowerCase() === n)?.group;
  if (group === 'Prothèse' || group === 'Implantologie') return 'careProthese';
  if (group === 'Orthodontie') return 'careOrtho';
  if (group === 'Esthétique') return 'careAutres';
  if (group) return 'careSoins';
  if (/couronne|bridge|proth|implant|facette|inlay|onlay|pivot|dentier/.test(n)) return 'careProthese';
  if (/orthod|appareil|gouttière|contention/.test(n)) return 'careOrtho';
  if (/blanch|esth/.test(n)) return 'careAutres';
  return 'careSoins';
};

export const emptyAct = (): CnssAct => ({ id: Math.random().toString(36).slice(2, 9), teeth: '', code: '', date: today(), coef: '', keyValue: '', amount: '' });

export const actFromTreatment = (t: Treatment): CnssAct => ({
  ...emptyAct(), treatmentId: t.id, teeth: t.tooth, date: t.treatmentDate,
  // the app has no NGAP code: the dentist types the code / letter-key; the act name is a reminder
  code: '', coef: '', keyValue: '', amount: String(t.quote),
});

const num = (s: string): number => {
  const n = Number(String(s).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const totalOf = (acts: CnssAct[]): number => acts.reduce((s, a) => s + num(a.amount), 0);

/** Re-derives what follows from the act lines: total of the fees and the ticked care types. */
export const withDerived = (data: CnssData, actNames: Record<string, string>): CnssData => {
  const care: Record<CareKey, boolean> = { careSoins: false, careProthese: false, careOrtho: false, careAutres: false };
  for (const a of data.acts) if (a.treatmentId !== undefined && actNames[a.id]) care[careOf(actNames[a.id])] = true;
  return { ...data, ...(Object.values(care).some(Boolean) ? care : {}) };
};

/** All FDI teeth that appear on the act lines, to circle them on the diagram. */
export const treatedTeeth = (acts: CnssAct[]): string[] => Array.from(new Set(acts.flatMap((a) => parseDesignation(a.teeth).teeth)));

interface NewSheetInput { patient: Patient; treatments: Treatment[]; settings: Settings; previous?: CnssData; alreadyBilled: Set<number> }

/** A fresh sheet, prefilled from the patient file, the clinic settings and the last sheet of this patient. */
export const newSheet = ({ patient, treatments, settings, previous, alreadyBilled }: NewSheetInput): { data: CnssData; names: Record<string, string> } => {
  const fullName = `${patient.lastName.toUpperCase()} ${patient.firstName}`.trim();
  const todo = treatments.filter((t) => t.id !== undefined && !alreadyBilled.has(t.id) && t.quote > 0);
  const acts = todo.slice(-MAX_ACT_LINES).map(actFromTreatment);
  const names: Record<string, string> = {};
  acts.forEach((a, i) => { names[a.id] = todo.slice(-MAX_ACT_LINES)[i].act; });
  const city = settings.cnssCity || 'Meknès';
  const data: CnssData = {
    entente: false, execution: true,
    insuredName: previous?.insuredName ?? fullName,
    immat: previous?.immat ?? '',
    insuredCin: previous?.insuredCin ?? '',
    relation: previous?.relation ?? 'self',
    address: previous?.address ?? patient.address ?? '',
    fees: '', attachments: previous?.attachments ?? '',
    beneficiaryName: fullName,
    dob: patient.dateOfBirth ?? '',
    beneficiaryCin: previous?.beneficiaryCin ?? '',
    sex: patient.gender === 'female' ? 'F' : patient.gender === 'male' ? 'M' : '',
    inp: settings.cnssInp ?? '',
    careSoins: false, careProthese: false, careOrtho: false, careAutres: false,
    priorAgreement: '', accidentDate: '',
    placeInsured: city, dateInsured: today(), placeDentist: city, dateDentist: today(),
    acts,
  };
  const derived = withDerived(data, names);
  return { data: { ...derived, fees: totalOf(acts) ? String(totalOf(acts)) : '' }, names };
};

