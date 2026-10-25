import { useMemo, useState } from 'react';
import { addDays, addWeeks, eachDayOfInterval, endOfWeek, format, startOfWeek, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, CheckCheck, ChevronLeft, ChevronRight, Pencil, Phone, Plus, Trash2, X, CalendarDays } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import AppointmentForm from '../components/AppointmentForm';
import { STATUS_BADGE, STATUS_LABEL } from '../constants';
import { useData } from '../contexts/DataContext';
import { useNav } from '../contexts/NavContext';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { Appointment, AppointmentStatus, errorMessage, removeAppointment, setAppointmentStatus } from '../services/api';
import { cap, fmtDateLong, fmtTime, fromISODate, toISODate, today } from '../utils/format';

type Dialog = { kind: 'new' } | { kind: 'edit'; a: Appointment } | { kind: 'delete'; a: Appointment };

// Who may do what (kept in one place so the rules are easy to change).
const rules = (isDoctor: boolean) => ({
  confirm: true,
  finish: isDoctor,
  cancel: isDoctor,
  edit: (a: Appointment) => a.status !== 'terminé' || isDoctor,
  remove: (a: Appointment) => a.status !== 'terminé' || isDoctor,
});

const Agenda = ({ initialDate }: { initialDate?: string }) => {
  const { isDoctor } = useUser();
  const { patients, appointments, refresh } = useData();
  const { go } = useNav();
  const toast = useToast();
  const [date, setDate] = useState(initialDate ?? today());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const can = rules(isDoctor);

  const week = useMemo(() => {
    const d = fromISODate(date);
    return eachDayOfInterval({ start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) });
  }, [date]);
  const countFor = (iso: string) => appointments.filter((a) => a.date === iso && a.status !== 'annulé').length;
  const day = useMemo(() => appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time)), [appointments, date]);
  const done = day.filter((a) => a.status === 'terminé').length;

  const move = (n: number) => setDate(toISODate(addDays(fromISODate(date), n)));
  const moveWeek = (n: 1 | -1) => setDate(toISODate((n === 1 ? addWeeks : subWeeks)(fromISODate(date), 1)));

  const setStatus = async (a: Appointment, status: AppointmentStatus) => {
    try { await setAppointmentStatus(a.id!, status); toast.success(`Rendez-vous ${STATUS_LABEL[status].toLowerCase()}`); await refresh(); }
    catch (e) { toast.error('Modification impossible', errorMessage(e)); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Rendez-vous</h1>
          <p className="sub">{cap(fmtDateLong(date))}</p>
        </div>
        <div className="actions">
          <div className="day-nav">
            <button className="btn btn-secondary btn-icon" onClick={() => move(-1)} aria-label="Jour précédent"><ChevronLeft /></button>
            <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160 }} aria-label="Date" />
            <button className="btn btn-secondary btn-icon" onClick={() => move(1)} aria-label="Jour suivant"><ChevronRight /></button>
            <button className="btn btn-secondary" onClick={() => setDate(today())} disabled={date === today()}>Aujourd'hui</button>
          </div>
          <button className="btn" onClick={() => setDialog({ kind: 'new' })}><Plus /> Nouveau rendez-vous</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 10, gap: 6 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveWeek(-1)} aria-label="Semaine précédente"><ChevronLeft /></button>
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Semaine du {format(week[0], 'd MMMM', { locale: fr })}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveWeek(1)} aria-label="Semaine suivante"><ChevronRight /></button>
      </div>
      <div className="week-strip">
        {week.map((d) => {
          const iso = toISODate(d);
          const n = countFor(iso);
          return (
            <button key={iso} className={`day-pill ${iso === today() ? 'today' : ''}`} aria-pressed={iso === date} onClick={() => setDate(iso)}>
              <span className="d">{format(d, 'EEE', { locale: fr })}</span>
              <span className="n">{format(d, 'd')}</span>
              <span className="c">{n > 0 ? `${n} RDV` : ''}</span>
            </button>
          );
        })}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{day.length === 0 ? 'Journée libre' : `${day.length} rendez-vous`}</h2>
          {day.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{done} terminé{done > 1 ? 's' : ''}</span>}
        </div>
        {day.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Aucun rendez-vous ce jour" text="Planifiez un rendez-vous pour ce jour."
            action={<button className="btn btn-secondary" onClick={() => setDialog({ kind: 'new' })}><Plus /> Planifier</button>} />
        ) : day.map((a) => {
          const p = patients.find((x) => x.id === a.patientId);
          return (
            <div key={a.id} className={`appt ${a.status === 'terminé' ? 'done' : ''} ${a.status === 'annulé' ? 'cancelled' : ''}`}>
              <span className="time-tag">{fmtTime(a.time)}</span>
              {p && <Avatar first={p.firstName} last={p.lastName} />}
              <div className="grow">
                <button className="link" style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }} onClick={() => go({ page: 'patient', patientId: a.patientId })}>
                  <span className="t1">{a.patientName ?? 'Patient'}</span>
                </button>
                <div className="t2" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                  {a.treatmentType}{a.patientPhone ? <> · <Phone size={11} style={{ verticalAlign: -1 }} /> {a.patientPhone}</> : null}{a.notes ? ` · ${a.notes}` : ''}
                </div>
              </div>
              <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>
              <div className="actions">
                {a.status === 'programmé' && can.confirm && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(a, 'confirmé')}><Check /> Confirmer</button>}
                {(a.status === 'programmé' || a.status === 'confirmé') && can.finish && <button className="btn btn-sm" onClick={() => setStatus(a, 'terminé')}><CheckCheck /> Terminé</button>}
                {(a.status === 'programmé' || a.status === 'confirmé') && can.cancel && <button className="btn btn-ghost btn-icon btn-sm" title="Annuler le rendez-vous" aria-label="Annuler le rendez-vous" onClick={() => setStatus(a, 'annulé')}><X /></button>}
                {can.edit(a) && <button className="btn btn-ghost btn-icon btn-sm" title="Modifier" aria-label="Modifier" onClick={() => setDialog({ kind: 'edit', a })}><Pencil /></button>}
                {can.remove(a) && <button className="btn btn-ghost btn-icon btn-sm" title="Supprimer" aria-label="Supprimer" onClick={() => setDialog({ kind: 'delete', a })}><Trash2 /></button>}
              </div>
            </div>
          );
        })}
      </section>

      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && (
        <AppointmentForm patients={patients} appointments={appointments} appointment={dialog.kind === 'edit' ? dialog.a : undefined} defaultDate={date} canCancel={isDoctor}
          onClose={() => setDialog(null)}
          onSaved={async () => { toast.success(dialog.kind === 'edit' ? 'Rendez-vous modifié' : 'Rendez-vous planifié'); setDialog(null); await refresh(); }} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog danger title="Supprimer ce rendez-vous ?" confirmLabel="Supprimer"
          message={`Le rendez-vous de ${dialog.a.patientName ?? 'ce patient'} à ${fmtTime(dialog.a.time)} sera supprimé.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try { await removeAppointment(dialog.a.id!); toast.success('Rendez-vous supprimé'); await refresh(); }
            catch (e) { toast.error('Suppression impossible', errorMessage(e)); throw e; }
          }} />
      )}
    </div>
  );
};

export default Agenda;
