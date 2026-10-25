import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Search, UserPlus, Users } from 'lucide-react';
import RefreshButton from '../components/ui/RefreshButton';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import PatientForm from '../components/PatientForm';
import { useData } from '../contexts/DataContext';
import { useNav } from '../contexts/NavContext';
import { useToast } from '../contexts/ToastContext';
import { Patient } from '../services/api';
import { ageOf, fullName, money } from '../utils/format';

type SortKey = 'recent' | 'billet' | 'name' | 'due';
const PAGE = 100;

const Patients = () => {
  const { patients, balances, loading, refresh } = useData();
  const { go } = useNav();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'recent', dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);

  const dueOf = (p: Patient) => {
    const b = balances.get(p.id!);
    return b ? b.totalQuote - b.totalPaid : 0;
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = patients.filter((p) => {
      if (onlyDue && dueOf(p) <= 0.005) return false;
      if (!q) return true;
      return fullName(p).toLowerCase().includes(q) || `${p.lastName} ${p.firstName}`.toLowerCase().includes(q)
        || (p.billetNumber ?? '').toLowerCase().startsWith(q) || (p.insurance ?? '').toLowerCase().includes(q)
        || (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits));
    });
    const billetNum = (p: Patient) => Number(p.billetNumber) || 0;
    const cmp: Record<SortKey, (a: Patient, b: Patient) => number> = {
      recent: (a, b) => (a.id ?? 0) - (b.id ?? 0),
      billet: (a, b) => billetNum(a) - billetNum(b),
      name: (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'),
      due: (a, b) => dueOf(a) - dueOf(b),
    };
    return [...list].sort((a, b) => cmp[sort.key](a, b) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, balances, query, onlyDue, sort]);

  const dueCount = useMemo(() => patients.filter((p) => dueOf(p) > 0.005).length, [patients, balances]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'due' || key === 'recent' ? -1 : 1 }));
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? <ChevronUp size={13} style={{ verticalAlign: -2 }} /> : <ChevronDown size={13} style={{ verticalAlign: -2 }} />) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Patients</h1><p className="sub">{patients.length} dossier{patients.length > 1 ? 's' : ''}</p></div>
        <div className="actions"><RefreshButton /><button className="btn" onClick={() => setCreating(true)}><UserPlus /> Nouveau patient</button></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="input-affix">
            <Search />
            <input className="input" placeholder="Rechercher par nom, téléphone ou n° billet…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} aria-label="Rechercher un patient" autoFocus />
          </div>
          <button className="chip" aria-pressed={!onlyDue} onClick={() => setOnlyDue(false)}>Tous</button>
          <button className="chip" aria-pressed={onlyDue} onClick={() => setOnlyDue(true)}>Avec reste à payer ({dueCount})</button>
        </div>

        {loading ? (
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users />} title={patients.length === 0 ? 'Aucun patient' : 'Aucun résultat'}
            text={patients.length === 0 ? 'Créez le premier dossier pour commencer.' : 'Essayez un autre nom, numéro de téléphone ou numéro de billet.'}
            action={patients.length === 0 ? <button className="btn" onClick={() => setCreating(true)}><UserPlus /> Nouveau patient</button> : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggle('billet')}>N° Billet {arrow('billet')}</th>
                  <th className="sortable" onClick={() => toggle('name')}>Patient {arrow('name')}</th>
                  <th>Téléphone</th>
                  <th>Couverture</th>
                  <th className="sortable r" onClick={() => toggle('due')}>Reste à payer {arrow('due')}</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((p) => {
                  const due = dueOf(p);
                  const age = ageOf(p.dateOfBirth);
                  return (
                    <tr key={p.id} className="click" onClick={() => go({ page: 'patient', patientId: p.id! })}>
                      <td>{p.billetNumber ? <span className="billet">{p.billetNumber}</span> : <span className="muted">—</span>}</td>
                      <td>
                        <div className="name-cell">
                          <Avatar first={p.firstName} last={p.lastName} />
                          <div><div className="n">{p.lastName.toUpperCase()} {p.firstName}</div><div className="s">{p.gender === 'female' ? 'F' : 'H'}{age !== null ? ` · ${age} ans` : ''}</div></div>
                        </div>
                      </td>
                      <td className="num">{p.phone}</td>
                      <td>{p.insurance ? <span className="badge badge-brand plain">{p.insurance}</span> : <span className="muted">—</span>}</td>
                      <td className="r num">{due > 0.005 ? <span className="money-due">{money(due)}</span> : balances.has(p.id!) ? <span className="money-ok">Soldé</span> : <span className="muted">—</span>}</td>
                      <td><ChevronRight size={16} color="var(--text-3)" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > limit && (
              <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setLimit((l) => l + PAGE)}>Afficher plus ({rows.length - limit} restants)</button>
              </div>
            )}
          </div>
        )}
      </div>

      {creating && (
        <PatientForm onClose={() => setCreating(false)} onSaved={async (id) => { setCreating(false); toast.success('Dossier créé'); await refresh(); go({ page: 'patient', patientId: id }); }} />
      )}
    </div>
  );
};

export default Patients;
