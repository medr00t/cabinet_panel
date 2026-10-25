import { Treatment, ToothMark, ToothStatus } from './services/api';
import { actStatus } from './constants';

// ---------------------------------------------------------------- FDI numbering

/** Chart order as seen facing the patient: patient's right on the left of the screen. */
export const PERMANENT_UPPER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
export const PERMANENT_LOWER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
export const DECIDUOUS_UPPER = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
export const DECIDUOUS_LOWER = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];

export const ALL_TEETH = [...PERMANENT_UPPER, ...PERMANENT_LOWER, ...DECIDUOUS_UPPER, ...DECIDUOUS_LOWER];
const ORDER = new Map(ALL_TEETH.map((t, i) => [t, i]));

export const isTooth = (t: string): boolean => ORDER.has(t);
export const isDeciduous = (t: string): boolean => Number(t[0]) >= 5;
export const isUpper = (t: string): boolean => ['1', '2', '5', '6'].includes(t[0]);

export type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';
export const toothKind = (t: string): ToothKind => {
  const n = Number(t[1]);
  if (n <= 2) return 'incisor';
  if (n === 3) return 'canine';
  if (isDeciduous(t)) return 'molar'; // baby teeth 4-5 are molars
  return n <= 5 ? 'premolar' : 'molar';
};

const NAMES: Record<number, string> = {
  1: 'Incisive centrale', 2: 'Incisive latérale', 3: 'Canine', 4: '1ʳᵉ prémolaire',
  5: '2ᵉ prémolaire', 6: '1ʳᵉ molaire', 7: '2ᵉ molaire', 8: '3ᵉ molaire (dent de sagesse)',
};
const NAMES_DECIDUOUS: Record<number, string> = { 1: 'Incisive centrale', 2: 'Incisive latérale', 3: 'Canine', 4: '1ʳᵉ molaire', 5: '2ᵉ molaire' };
const QUADRANT: Record<string, string> = {
  '1': 'supérieure droite', '2': 'supérieure gauche', '3': 'inférieure gauche', '4': 'inférieure droite',
  '5': 'supérieure droite', '6': 'supérieure gauche', '7': 'inférieure gauche', '8': 'inférieure droite',
};

export const toothName = (t: string): string => {
  const base = (isDeciduous(t) ? NAMES_DECIDUOUS : NAMES)[Number(t[1])];
  return `${base} ${QUADRANT[t[0]]}${isDeciduous(t) ? ' (dent de lait)' : ''}`;
};

// ---------------------------------------------------------------- tooth state

export interface StatusInfo { label: string; color: string; soft: string }

export const STATUS: Record<Exclude<ToothStatus, ''>, StatusInfo> = {
  carie: { label: 'À traiter', color: '#d14b3b', soft: '#fdecec' },
  soigne: { label: 'Soignée', color: '#2f78c4', soft: '#d6e6f8' },
  devitalise: { label: 'Dévitalisée', color: '#7c4dd0', soft: '#e7dcf8' },
  couronne: { label: 'Couronne', color: '#b7791f', soft: '#fbe7b2' },
  implant: { label: 'Implant', color: '#0f766e', soft: '#c6ece6' },
  absente: { label: 'Absente', color: '#64748b', soft: '#eef2f7' },
};
export const STATUS_ORDER = Object.keys(STATUS) as Exclude<ToothStatus, ''>[];

// ---------------------------------------------------------------- "Désignation" text

export const ZONES = ['Maxillaire', 'Mandibule', 'Toute la bouche'];

export interface Designation { teeth: string[]; zones: string[]; other: string }

/** "36, 37, Maxillaire" or a legacy "11-21" -> { teeth: [11, 21], zones: [Maxillaire] }. */
export const parseDesignation = (text: string): Designation => {
  let rest = text ?? '';
  const zones: string[] = [];
  for (const z of ZONES) {
    const re = new RegExp(z, 'i');
    if (re.test(rest)) { zones.push(z); rest = rest.replace(re, ' '); }
  }
  const teeth: string[] = [];
  const other: string[] = [];
  for (const token of rest.split(/[\s,;/-]+/).filter(Boolean)) {
    if (isTooth(token)) { if (!teeth.includes(token)) teeth.push(token); } else other.push(token);
  }
  return { teeth: sortTeeth(teeth), zones, other: other.join(' ') };
};

export const sortTeeth = (teeth: string[]): string[] => [...teeth].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));

export const formatDesignation = ({ teeth, zones, other }: Designation): string =>
  [...sortTeeth(teeth), ...zones, ...(other ? [other] : [])].join(', ');

// ---------------------------------------------------------------- derived chart state

export interface ToothState {
  status: ToothStatus;
  source: 'act' | 'mark' | 'none';
  /** most recent act that touched the tooth */
  lastAct?: Treatment;
  /** the act that set the current status (a newer manual mark overrides it) */
  statusAct?: Treatment;
  mark?: ToothMark;
  acts: Treatment[];
}

/**
 * Each tooth takes the state of its latest act that changes a tooth (composite, extraction, crown…),
 * unless a manual mark is newer than that act. Zone acts (Maxillaire, Toute la bouche…) change nothing.
 */
export const computeToothStates = (treatments: Treatment[], marks: ToothMark[]): Record<string, ToothState> => {
  const states: Record<string, ToothState> = {};
  const get = (t: string): ToothState => (states[t] ??= { status: '', source: 'none', acts: [] });

  const byDate = [...treatments].sort((a, b) => a.treatmentDate.localeCompare(b.treatmentDate) || (a.id ?? 0) - (b.id ?? 0));
  for (const line of byDate) {
    const { teeth } = parseDesignation(line.tooth);
    const status = actStatus(line.act);
    for (const tooth of teeth) {
      const s = get(tooth);
      s.acts.push(line);
      s.lastAct = line;
      const keeps = status === 'soigne' && ['devitalise', 'couronne', 'implant'].includes(s.status);
      if (status && !keeps) { s.status = status; s.source = 'act'; s.statusAct = line; }
    }
  }
  for (const mark of marks) {
    const s = get(mark.tooth);
    s.mark = mark;
    if (mark.status) {
      const markDay = (mark.updatedAt ?? '').slice(0, 10);
      const actDay = s.source === 'act' ? s.statusAct?.treatmentDate ?? '' : '';
      if (!actDay || markDay >= actDay) { s.status = mark.status; s.source = 'mark'; }
    }
  }
  return states;
};
