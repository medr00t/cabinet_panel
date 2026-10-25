import { useMemo, useState } from 'react';
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Landmark, ScrollText, Wallet } from 'lucide-react';
import { addDays } from 'date-fns';
import DateField from '../components/ui/DateField';
import RefreshButton from '../components/ui/RefreshButton';
import EmptyState from '../components/ui/EmptyState';
import { METHODS } from '../constants';
import { useData } from '../contexts/DataContext';
import { useNav } from '../contexts/NavContext';
import { useUser } from '../contexts/UserContext';
import { useLoader } from '../hooks/useLoader';
import { PaymentMethod, paymentsByDate, summaryAllStaff } from '../services/api';
import { cap, fmtDateLong, fromISODate, money, toISODate, today } from '../utils/format';

const ICONS: Record<PaymentMethod, typeof Banknote> = { espèces: Banknote, carte: CreditCard, chèque: ScrollText, virement: Landmark };

const Caisse = () => {
  const { user, isDoctor } = useUser();
  const { version } = useData();
  const { go } = useNav();
  const [date, setDate] = useState(today());

  const payments = useLoader(() => paymentsByDate(date), [date, version]);
  // names of whoever collected, only the doctor sees everyone
  const staff = useLoader(() => (isDoctor ? summaryAllStaff(date) : Promise.resolve([])), [date, isDoctor, version]);

  const mine = useMemo(() => (payments.data ?? []).filter((p) => isDoctor || p.collectedBy === user?.id), [payments.data, isDoctor, user]);
  const total = mine.reduce((s, p) => s + p.amount, 0);
  const byMethod = (m: PaymentMethod) => mine.filter((p) => p.paymentMethod === m).reduce((s, p) => s + p.amount, 0);
  const nameOf = (id: number) => (id === user?.id ? user.name : staff.data?.find((s) => s.staffId === id)?.staffName ?? `Utilisateur ${id}`);
  const shift = (n: number) => setDate(toISODate(addDays(fromISODate(date), n)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Caisse</h1>
          <p className="sub">{cap(fmtDateLong(date))}{isDoctor ? '' : ' · vos encaissements'}</p>
        </div>
        <div className="actions">
          <RefreshButton />
          {isDoctor && (<div className="day-nav">
            <button className="btn btn-secondary btn-icon" onClick={() => shift(-1)} aria-label="Jour précédent"><ChevronLeft /></button>
            <DateField value={date} onChange={(v) => v && setDate(v)} width={150} ariaLabel="Date" />
            <button className="btn btn-secondary btn-icon" onClick={() => shift(1)} aria-label="Jour suivant"><ChevronRight /></button>
            <button className="btn btn-secondary" onClick={() => setDate(today())} disabled={date === today()}>Aujourd'hui</button>
          </div>)}
        </div>
      </div>

      {payments.error && <div className="alert alert-bad" style={{ marginBottom: 16 }}>{payments.error}</div>}

      <div className="card total-card">
        <div><div className="k">Total encaissé</div><div className="v num">{money(total).replace(/ DH$/, '')}<small>DH</small></div></div>
        <div style={{ textAlign: 'right' }}><div className="k">Paiements</div><div className="v num" style={{ fontSize: 26 }}>{mine.length}</div></div>
      </div>

      <div className="methods">
        {METHODS.map(({ value, label }) => {
          const Icon = ICONS[value];
          const v = byMethod(value);
          return (
            <div key={value} className="card method">
              <div className="k"><Icon /> {label}</div>
              <div className="v num">{money(v)}</div>
              <div className="bar"><i style={{ width: total > 0 ? `${(v / total) * 100}%` : 0 }} /></div>
            </div>
          );
        })}
      </div>

      <div className={isDoctor ? 'two-col' : ''} style={isDoctor ? { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)' } : undefined}>
        <section className="card">
          <div className="card-head"><h2>Détail des paiements</h2></div>
          {payments.loading ? <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 120 }} /></div>
            : mine.length === 0 ? <EmptyState icon={<Wallet />} title="Aucun paiement ce jour" text="Les paiements enregistrés dans les dossiers patients apparaissent ici." />
              : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Patient</th><th>Acte</th><th>Mode</th>{isDoctor && <th>Encaissé par</th>}<th className="r">Montant</th></tr></thead>
                    <tbody>
                      {mine.map((p) => (
                        <tr key={p.id} className="click" onClick={() => go({ page: 'patient', patientId: p.patientId })}>
                          <td style={{ fontWeight: 600 }}>{p.patientName ?? `Patient ${p.patientId}`}</td>
                          <td>{p.treatmentAct ?? <span className="muted">—</span>}</td>
                          <td><span className="badge plain">{METHODS.find((m) => m.value === p.paymentMethod)?.label ?? p.paymentMethod}</span></td>
                          {isDoctor && <td>{nameOf(p.collectedBy)}</td>}
                          <td className="r num" style={{ fontWeight: 650 }}>{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </section>

        {isDoctor && (
          <section className="card">
            <div className="card-head"><h2>Par personne</h2></div>
            {(staff.data ?? []).length === 0 ? <EmptyState icon={<Wallet />} title="Rien à afficher" />
              : (staff.data ?? []).map((s) => (
                <div key={s.staffId} className="list-row" style={{ cursor: 'default' }}>
                  <span className="grow"><div className="t1">{s.staffName}</div><div className="t2">{s.numberOfPayments} paiement{s.numberOfPayments > 1 ? 's' : ''}</div></span>
                  <b className="num">{money(s.totalCollected)}</b>
                </div>
              ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default Caisse;
