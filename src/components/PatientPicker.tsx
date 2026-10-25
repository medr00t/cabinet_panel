import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import Avatar from './ui/Avatar';
import { Patient } from '../services/api';
import { fullName } from '../utils/format';

interface PatientPickerProps {
  patients: Patient[];
  value: number | null;
  onChange: (id: number | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}

/** Type-ahead patient search (name, phone or N° Billet). */
const PatientPicker = ({ patients, value, onChange, invalid, disabled }: PatientPickerProps) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = patients.find((p) => p.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    const digits = q.replace(/\D/g, '');
    return patients.filter((p) =>
      fullName(p).toLowerCase().includes(q) ||
      `${p.lastName} ${p.firstName}`.toLowerCase().includes(q) ||
      (p.billetNumber ?? '').toLowerCase() === q ||
      (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits)),
    ).slice(0, 8);
  }, [patients, query]);

  if (selected) {
    return (
      <div className="input row" style={{ justifyContent: 'space-between', background: disabled ? 'var(--surface-2)' : undefined }}>
        <span className="name-cell"><Avatar first={selected.firstName} last={selected.lastName} />
          <span><span className="n">{fullName(selected)}</span> <span className="muted">· {selected.phone}</span></span></span>
        {!disabled && <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Changer de patient" onClick={() => { onChange(null); setQuery(''); }}><X /></button>}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="input-affix">
        <Search />
        <input className="input" placeholder="Nom, téléphone ou N° billet…" value={query} aria-invalid={invalid}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
      </div>
      {open && (
        <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 260, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
          {matches.length === 0 && <div className="muted" style={{ padding: 14, fontSize: 13 }}>Aucun patient trouvé</div>}
          {matches.map((p) => (
            <button key={p.id} type="button" className="list-row" style={{ padding: '10px 14px' }} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(p.id!); setOpen(false); }}>
              <Avatar first={p.firstName} last={p.lastName} />
              <span className="grow"><div className="t1">{fullName(p)}</div><div className="t2">{p.phone}{p.billetNumber ? ` · billet ${p.billetNumber}` : ''}</div></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientPicker;
