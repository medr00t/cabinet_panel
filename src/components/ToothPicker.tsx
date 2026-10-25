import { useState } from 'react';
import Odontogram from './Odontogram';
import {
  DECIDUOUS_LOWER, DECIDUOUS_UPPER, PERMANENT_LOWER, PERMANENT_UPPER, ToothState, ZONES, formatDesignation, isDeciduous,
  parseDesignation, sortTeeth,
} from '../teeth';

interface ToothPickerProps {
  /** the "Désignation" text, e.g. "36, 37" or "Maxillaire" */
  value: string;
  onChange: (value: string) => void;
  /** current state of the patient's teeth, so already-treated teeth show their colour */
  states: Record<string, ToothState>;
  /** open on the baby teeth (children) */
  childPatient?: boolean;
}

const ZONE_INFO: Record<string, string> = {
  Maxillaire: 'Toutes les dents du haut',
  Mandibule: 'Toutes les dents du bas',
  'Toute la bouche': 'Haut et bas',
};

/**
 * Where was the act done? Either on precise teeth (click the chart) or on a whole zone: the two are
 * exclusive, switching from one to the other clears the other.
 */
const ToothPicker = ({ value, onChange, states, childPatient }: ToothPickerProps) => {
  const d = parseDesignation(value);
  const [baby, setBaby] = useState(childPatient || d.teeth.some(isDeciduous));
  const [mode, setMode] = useState<'teeth' | 'zone'>(d.zones.length > 0 && d.teeth.length === 0 ? 'zone' : 'teeth');

  const upper = baby ? DECIDUOUS_UPPER : PERMANENT_UPPER;
  const lower = baby ? DECIDUOUS_LOWER : PERMANENT_LOWER;
  const zoneTeeth = (zone: string): string[] => (zone === 'Maxillaire' ? upper : zone === 'Mandibule' ? lower : [...upper, ...lower]);

  const switchMode = (next: 'teeth' | 'zone') => {
    if (next === mode) return;
    setMode(next);
    onChange(d.other); // the other kind of selection is dropped (free legacy text is kept)
  };
  const toggleTooth = (t: string) =>
    onChange(formatDesignation({ teeth: d.teeth.includes(t) ? d.teeth.filter((x) => x !== t) : sortTeeth([...d.teeth, t]), zones: [], other: d.other }));
  const pickZone = (z: string) => onChange(formatDesignation({ teeth: [], zones: d.zones[0] === z ? [] : [z], other: d.other }));

  const shown = mode === 'zone' ? new Set(d.zones[0] ? zoneTeeth(d.zones[0]) : []) : new Set(d.teeth);
  const empty = d.teeth.length === 0 && d.zones.length === 0 && !d.other;

  return (
    <div className="tooth-picker">
      <Odontogram states={states} selected={shown} onToothClick={toggleTooth} deciduous={baby} locked={mode === 'zone'} maxWidth={360} />
      <div className="tooth-picker-side">
        <div className="segmented wide" role="group" aria-label="Où a été fait l'acte ?">
          <button type="button" aria-pressed={mode === 'teeth'} onClick={() => switchMode('teeth')}>Dents précises</button>
          <button type="button" aria-pressed={mode === 'zone'} onClick={() => switchMode('zone')}>Zone entière</button>
        </div>

        {mode === 'teeth' ? (
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Cliquez sur les dents du schéma, plusieurs possibles. Facultatif pour un détartrage ou une consultation.</div>
            <div className="segmented" role="group" aria-label="Type de dentition" style={{ marginTop: 12 }}>
              <button type="button" aria-pressed={!baby} onClick={() => setBaby(false)}>Adulte</button>
              <button type="button" aria-pressed={baby} onClick={() => setBaby(true)}>Dents de lait</button>
            </div>
          </div>
        ) : (
          <div className="zone-cards" role="radiogroup" aria-label="Zone">
            {ZONES.map((z) => (
              <button key={z} type="button" role="radio" aria-checked={d.zones[0] === z} className="zone-card" onClick={() => pickZone(z)}>
                <b>{z}</b><span>{ZONE_INFO[z]}</span>
              </button>
            ))}
          </div>
        )}

        <div>
          <div className="label" style={{ marginBottom: 6 }}>Sélection</div>
          {empty
            ? <span className="none">Aucune</span>
            : <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="designation">
                {d.teeth.map((t) => <span key={t} className="tooth-chip">{t}</span>)}
                {d.zones.map((z) => <span key={z} className="tooth-chip zone">{z}</span>)}
                {d.other && <span className="tooth-chip zone">{d.other}</span>}
              </span>
              <button type="button" className="link" onClick={() => onChange('')}>Tout effacer</button>
            </div>}
        </div>
      </div>
    </div>
  );
};

export default ToothPicker;
