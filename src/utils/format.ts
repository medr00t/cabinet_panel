import { format, differenceInYears, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const nbsp = ' ';

/** 1250 -> "1 250,00" (no currency). */
export const amount = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0).replace(/ /g, nbsp);

/** 1250 -> "1 250,00 DH" */
export const money = (n: number): string => `${amount(n)}${nbsp}DH`;

/** Local calendar day as yyyy-MM-dd (toISOString would give the UTC day, wrong after midnight in UTC+1). */
export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');
export const today = (): string => toISODate(new Date());

export const fromISODate = (iso: string): Date => parseISO(iso);

export const fmtDate = (iso?: string): string => {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : iso;
};

export const fmtDateLong = (iso: string): string => {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'EEEE d MMMM yyyy', { locale: fr }) : iso;
};

/** "dimanche 25 octobre 2026" -> "Dimanche 25 octobre 2026" (French keeps month names lower-case). */
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtTime = (t: string): string => t.slice(0, 5);

export const ageOf = (dob?: string): number | null => {
  if (!dob) return null;
  const d = parseISO(dob);
  return isValid(d) ? differenceInYears(new Date(), d) : null;
};

/** Accepts "1 250,50", "1250.5", "1250,5 DH". Returns NaN when it is not a number. */
export const parseAmount = (s: string): number => {
  const cleaned = s.replace(/[\s  ]/g, '').replace(/dh$/i, '').replace(',', '.');
  if (cleaned === '') return NaN;
  return /^\d+(\.\d{0,2})?$/.test(cleaned) ? Number(cleaned) : NaN;
};

export const initials = (first: string, last: string): string =>
  `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || '?';

const PALETTE = ['#2f78c4', '#0f766e', '#7c3aed', '#b45309', '#be185d', '#0369a1', '#4d7c0f', '#c2410c'];
export const colorFor = (seed: string): string => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`.trim();
