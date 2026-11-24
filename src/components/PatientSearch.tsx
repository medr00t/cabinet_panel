import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import Avatar from './ui/Avatar';
import { Patient } from '../services/api';
import { fullName } from '../utils/format';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Words in any order, accents ignored: "benali sam" finds Samira BENALI; also matches the phone and the billet number. */
export const searchPatients = (patients: Patient[], query: string, limit = 8): Patient[] => {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { p: Patient; score: number }[] = [];
  for (const p of patients) {
    const first = plain(p.firstName), last = plain(p.lastName);
    const hay = `${first} ${last} ${plain(p.billetNumber ?? '')} ${p.phone.replace(/\D/g, '')} ${plain(p.phone)}`;
    if (!words.every((w) => hay.includes(w))) continue;
    // names that START with a typed word come first
    const score = words.reduce((s, w) => s + (first.startsWith(w) || last.startsWith(w) ? 0 : 1), 0);
    scored.push({ p, score });
  }
  return scored.sort((a, b) => a.score - b.score || fullName(a.p).localeCompare(fullName(b.p))).slice(0, limit).map((x) => x.p);
};

interface Props { patients: Patient[]; onPick: (patient: Patient) => void; /** start typing anywhere on the page to search */ typeAnywhere?: boolean }

const PatientSearch = ({ patients, onPick, typeAnywhere }: Props) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchPatients(patients, query), [patients, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Typing anywhere (outside a field or a dialog) starts the search.
  useEffect(() => {
    if (!typeAnywhere) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (document.querySelector('[role="dialog"]')) return; // a dialog is open
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop, [role="dialog"]')) return;
      e.preventDefault();
      input.current?.focus();
      setQuery((q) => q + e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typeAnywhere]);

  const pick = (p: Patient) => { setQuery(''); input.current?.blur(); onPick(p); };

  return (
    <div className="psearch">
      <div className="psearch-box">
        <Search size={18} />
        <input
          ref={input} className="psearch-input" value={query} placeholder="Rechercher un patient : nom, téléphone, n° de billet…"
          aria-label="Rechercher un patient" autoComplete="off" spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && results[active]) pick(results[active]);
            else if (e.key === 'Escape') { setQuery(''); input.current?.blur(); }
          }}
        />
        {query && <button type="button" className="psearch-clear" aria-label="Effacer" onClick={() => { setQuery(''); input.current?.focus(); }}><X size={16} /></button>}
      </div>
      {query.trim() && (
        <div className="psearch-list card" role="listbox">
          {results.length === 0 ? <div className="psearch-empty">Aucun patient trouvé pour « {query.trim()} »</div> : results.map((p, i) => (
            <button key={p.id} type="button" role="option" aria-selected={i === active} className={`list-row ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => pick(p)}>
              <Avatar first={p.firstName} last={p.lastName} />
              <span className="grow"><div className="t1">{fullName(p)}</div><div className="t2">{[p.billetNumber ? `Billet ${p.billetNumber}` : '', p.phone].filter(Boolean).join(' · ')}</div></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientSearch;
