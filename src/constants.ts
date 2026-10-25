import { AppointmentStatus, PaymentMethod, ToothStatus } from './services/api';

export type ActGroup =
  | 'Diagnostic & urgence' | 'Soins conservateurs' | 'Endodontie' | 'Chirurgie' | 'Parodontologie'
  | 'Prothèse' | 'Implantologie' | 'Esthétique' | 'Orthodontie' | 'Pédodontie';

interface ActDef { name: string; group: ActGroup; /** state this act leaves on the tooth, if any */ status?: Exclude<ToothStatus, ''> }

const act = (group: ActGroup, names: string[], status?: Exclude<ToothStatus, ''>): ActDef[] => names.map((name) => ({ name, group, status }));

/** Suggestions for the "Acte médical" and appointment "Motif" fields. Both also accept free text. */
export const ACT_CATALOG: ActDef[] = [
  ...act('Diagnostic & urgence', ['Consultation', 'Première consultation', 'Contrôle', 'Urgence / douleur', 'Radiographie rétro-alvéolaire', 'Radiographie panoramique', 'Scanner (CBCT)', 'Empreinte / étude']),
  ...act('Soins conservateurs', ['Détartrage', 'Polissage', 'Fluoration', 'Scellement de sillons']),
  ...act('Soins conservateurs', ['Composite', 'Soin de carie', 'Obturation provisoire', 'Reconstitution', 'Amalgame', 'Ciment verre ionomère'], 'soigne'),
  ...act('Endodontie', ['Dévitalisation', 'Dévitalisation monoradiculée', 'Dévitalisation pluriradiculée', 'Retraitement endodontique', 'Pulpotomie'], 'devitalise'),
  ...act('Endodontie', ['Médication / pansement canalaire']),
  ...act('Chirurgie', ['Extraction', 'Extraction chirurgicale', 'Extraction dent de sagesse', 'Alvéolectomie'], 'absente'),
  ...act('Chirurgie', ['Résection apicale', 'Freinectomie', 'Incision d\'abcès', 'Contrôle post-opératoire', 'Ablation des fils']),
  ...act('Parodontologie', ['Détartrage-surfaçage', 'Curetage parodontal', 'Greffe gingivale', 'Gingivectomie']),
  ...act('Prothèse', ['Couronne céramique', 'Couronne zircone', 'Couronne métallique', 'Couronne provisoire', 'Inlay-core', 'Pivot', 'Inlay / Onlay', 'Bridge', 'Facette', 'Prothèse amovible partielle', 'Prothèse complète (dentier)'], 'couronne'),
  ...act('Prothèse', ['Réparation de prothèse', 'Rebasage de prothèse', 'Empreinte prothétique', 'Essayage']),
  ...act('Implantologie', ['Implant', 'Couronne sur implant'], 'implant'),
  ...act('Implantologie', ['Pilier implantaire', 'Greffe osseuse', 'Sinus lift']),
  ...act('Esthétique', ['Blanchiment', 'Composite esthétique', 'Masque / mock-up']),
  ...act('Orthodontie', ['Bilan orthodontique', 'Pose d\'appareil', 'Contrôle orthodontique', 'Pose de gouttière', 'Contention', 'Dépose d\'appareil']),
  ...act('Pédodontie', ['Soin dent de lait', 'Couronne pédodontique', 'Extraction dent de lait', 'Application de vernis fluoré']),
];

export const ACT_GROUPS: ActGroup[] = Array.from(new Set(ACT_CATALOG.map((a) => a.group)));

/** What an act leaves on a tooth: from the catalogue, else guessed from the wording (free text acts). */
export const actStatus = (name: string): Exclude<ToothStatus, ''> | undefined => {
  const n = name.trim().toLowerCase();
  const known = ACT_CATALOG.find((a) => a.name.toLowerCase() === n);
  if (known) return known.status;
  if (/extract|avuls/.test(n)) return 'absente';
  if (/implant/.test(n)) return 'implant';
  if (/couronne|bridge|proth|facette|inlay|onlay|pivot|céram|ceram|zircon/.test(n)) return 'couronne';
  if (/d[ée]vital|endo|canal|pulpo/.test(n)) return 'devitalise';
  if (/composite|carie|obtur|reconstit|amalgam|soin|cvi|plomb/.test(n)) return 'soigne';
  return undefined;
};

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
