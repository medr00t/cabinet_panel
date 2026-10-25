import { AppointmentStatus, PaymentMethod } from './services/api';

/** Suggestions only: every field also accepts free text. */
export const ACTS = [
  'Consultation', 'Contrôle', 'Urgence', 'Détartrage', 'Composite', 'Dévitalisation', 'Reconstitution',
  'Extraction', 'Extraction dent de sagesse', 'Couronne céramique', 'Couronne métallique', 'Inlay-core',
  'Bridge', 'Prothèse amovible', 'Facettes', 'Blanchiment', 'Implant', 'Radiographie panoramique',
  'Scellement de sillons', 'Orthodontie', 'Chirurgie',
];

export const INSURANCES = ['CNSS', 'CNOPS', 'AMO', 'FAR', 'Mutuelle', 'Assurance privée', 'Sans couverture'];

export const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'espèces', label: 'Espèces' },
  { value: 'carte', label: 'Carte bancaire' },
  { value: 'chèque', label: 'Chèque' },
  { value: 'virement', label: 'Virement' },
];

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  programmé: 'Programmé', confirmé: 'Confirmé', terminé: 'Terminé', annulé: 'Annulé', manqué: 'Manqué',
};

export const STATUS_BADGE: Record<AppointmentStatus, string> = {
  programmé: 'badge', confirmé: 'badge badge-brand', terminé: 'badge badge-ok', annulé: 'badge badge-bad', manqué: 'badge badge-warn',
};

/** 08:00 … 19:45 every 15 minutes. */
export const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const mins = 8 * 60 + i * 15;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});
