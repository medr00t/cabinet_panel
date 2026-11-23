import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, Coins, Plus, ReceiptText, UserPlus, Users } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import RefreshButton from '../components/ui/RefreshButton';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import PatientForm from '../components/PatientForm';
import AppointmentForm from '../components/AppointmentForm';
import { STATUS_BADGE, STATUS_LABEL } from '../constants';
import { useData } from '../contexts/DataContext';
import { useNav } from '../contexts/NavContext';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { useLoader } from '../hooks/useLoader';
import { paymentsByDate } from '../services/api';
import { cap, fmtTime, fullName, money, today } from '../utils/format';

const Dashboard = () => {
  const { user, isDoctor } = useUser();
  const { patients, appointments, balances, version, refresh } = useData();
  const { go } = useNav();
  const toast = useToast();
  const [creating, setCreating] = useState<'patient' | 'appointment' | null>(null);

  const day = today();
  const cash = useLoader(() => paymentsByDate(day), [version]);
  const collected = (cash.data ?? []).filter((p) => isDoctor || p.collectedBy === user?.id).reduce((s, p) => s + p.amount, 0);

  const todays = useMemo(() => appointments.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time)), [appointments, day]);
  const done = todays.filter((a) => a.status === 'terminé').length;
  const owing = useMemo(() => {
    const rows = patients
      .map((p) => ({ patient: p, due: (balances.get(p.id!)?.totalQuote ?? 0) - (balances.get(p.id!)?.totalPaid ?? 0) }))
      .filter((r) => r.due > 0.005)
      .sort((a, b) => b.due - a.due);
    return { rows, total: rows.reduce((s, r) => s + r.due, 0) };
  }, [patients, balances]);

  const first = (user?.name ?? '').replace(/^Dr\.?\s*/i, '').trim();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Bonjour{first ? `, ${isDoctor ? 'Dr. ' : ''}${first}` : ''}</h1>
          <p className="sub">{cap(format(new Date(), 'EEEE d MMMM yyyy', { locale: fr }))}</p>
        </div>
        <div className="actions">
          <RefreshButton />
          <button className="btn btn-secondary" onClick={() => setCreating('appointment')}><CalendarDays /> Nouveau rendez-vous</button>
          <button className="btn" onClick={() => setCreating('patient')}><UserPlus /> Nouveau patient</button>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="ico"><CalendarCheck /></div>
          <div><div className="k">Rendez-vous aujourd'hui</div><div className="v">{todays.length}</div><div className="s">{done} terminé{done > 1 ? 's' : ''}</div></div>
        </div>
        <div className="card kpi">
          <div className="ico green"><Coins /></div>
          <div><div className="k">{isDoctor ? 'Encaissé aujourd\'hui' : 'Votre caisse du jour'}</div><div className="v">{money(collected).replace(/ DH$/, '')}<small>DH</small></div><div className="s">{(cash.data ?? []).filter((p) => isDoctor || p.collectedBy === user?.id).length} paiement(s)</div></div>
        </div>
        <div className="card kpi">
          <div className="ico red"><ReceiptText /></div>
          <div><div className="k">Reste à encaisser</div><div className="v">{money(owing.total).replace(/ DH$/, '')}<small>DH</small></div><div className="s">{owing.rows.length} patient{owing.rows.length > 1 ? 's' : ''}</div></div>
        </div>
        <div className="card kpi">
          <div className="ico amber"><Users /></div>
          <div><div className="k">Patients</div><div className="v">{patients.length}</div><div className="s">dossiers enregistrés</div></div>
        </div>
      </div>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Rendez-vous du jour</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go({ page: 'agenda' })}>Voir l'agenda</button>
          </div>
          {todays.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Aucun rendez-vous aujourd'hui" text="Les rendez-vous planifiés pour aujourd'hui apparaîtront ici."
              action={<button className="btn btn-secondary btn-sm" onClick={() => setCreating('appointment')}><Plus /> Planifier</button>} />
          ) : todays.map((a) => {
            const p = patients.find((x) => x.id === a.patientId);
            return (
              <button key={a.id} className="list-row" onClick={() => go({ page: 'patient', patientId: a.patientId })}>
                <span className="time-tag">{fmtTime(a.time)}</span>
                {p && <Avatar first={p.firstName} last={p.lastName} />}
                <span className="grow"><div className="t1">{a.patientName ?? (p ? fullName(p) : 'Patient')}</div><div className="t2">{a.treatmentType}</div></span>
                <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>
              </button>
            );
          })}
        </section>

        <section className="card">
          <div className="card-head"><h2>Soldes à encaisser</h2><span className="muted num" style={{ fontSize: 13 }}>{money(owing.total)}</span></div>
          {owing.rows.length === 0 ? (
            <EmptyState icon={<Coins />} title="Tout est réglé" text="Aucun patient n'a de reste à payer." />
          ) : owing.rows.slice(0, 7).map(({ patient: p, due }) => (
            <button key={p.id} className="list-row" onClick={() => go({ page: 'patient', patientId: p.id! })}>
              <Avatar first={p.firstName} last={p.lastName} />
              <span className="grow"><div className="t1">{fullName(p)}</div><div className="t2">{p.billetNumber ? `Billet ${p.billetNumber}` : p.phone}</div></span>
              <b className="money-due num">{money(due)}</b>
            </button>
          ))}
        </section>
      </div>

      {creating === 'patient' && (
        <PatientForm onClose={() => setCreating(null)} onSaved={async (id) => { setCreating(null); toast.success('Dossier créé'); await refresh(); go({ page: 'patient', patientId: id }); }} />
      )}
      {creating === 'appointment' && (
        <AppointmentForm patients={patients} appointments={appointments} canCancel={isDoctor} onClose={() => setCreating(null)}
          onSaved={async () => { setCreating(null); toast.success('Rendez-vous planifié'); await refresh(); }} />
      )}
    </div>
  );
};

export default Dashboard;
