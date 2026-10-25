import { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import Field from './ui/Field';
import PatientPicker from './PatientPicker';
import { ACTS, STATUS_LABEL, TIME_SLOTS } from '../constants';
import { Appointment, AppointmentStatus, Patient, createAppointment, errorMessage, saveAppointment } from '../services/api';
import { fmtTime, today } from '../utils/format';

interface AppointmentFormProps {
  patients: Patient[];
  appointments: Appointment[]; // to warn about clashes
  appointment?: Appointment;
  defaultPatientId?: number;
  defaultDate?: string;
  canCancel: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const AppointmentForm = ({ patients, appointments, appointment, defaultPatientId, defaultDate, canCancel, onClose, onSaved }: AppointmentFormProps) => {
  const editing = appointment?.id !== undefined;
  const [patientId, setPatientId] = useState<number | null>(appointment?.patientId ?? defaultPatientId ?? null);
  const [date, setDate] = useState(appointment?.date ?? defaultDate ?? today());
  const [time, setTime] = useState(appointment ? fmtTime(appointment.time) : '09:00');
  const [type, setType] = useState(appointment?.treatmentType ?? 'Consultation');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? 'programmé');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clash = useMemo(() => appointments.find((a) =>
    a.id !== appointment?.id && a.date === date && fmtTime(a.time) === time && a.status !== 'annulé' && a.status !== 'manqué'), [appointments, appointment, date, time]);
  const slots = TIME_SLOTS.includes(time) ? TIME_SLOTS : [...TIME_SLOTS, time].sort();
  const statuses = (Object.keys(STATUS_LABEL) as AppointmentStatus[]).filter((s) => canCancel || s !== 'annulé' || status === 'annulé');

  const submit = async () => {
    if (patientId === null) return setError('Choisissez un patient');
    if (!type.trim()) return setError('Indiquez le motif du rendez-vous');
    if (!date) return setError('Date obligatoire');
    const payload: Appointment = { ...appointment, patientId, date, time, treatmentType: type.trim(), notes: notes.trim() || undefined, status };
    setBusy(true);
    try {
      if (editing) await saveAppointment(appointment!.id!, payload); else await createAppointment(payload);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
      onClose={onClose} onSubmit={submit}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn" disabled={busy}>{editing ? 'Enregistrer' : 'Planifier'}</button>
      </>}
    >
      <div className="stack">
        <Field label="Patient" required>
          <PatientPicker patients={patients} value={patientId} onChange={(id) => { setPatientId(id); setError(''); }} invalid={!!error && patientId === null} disabled={editing && !!defaultPatientId} />
        </Field>
        <div className="grid-2">
          <Field label="Date" htmlFor="a-date" required>
            <input id="a-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure" htmlFor="a-time">
            <select id="a-time" className="select num" value={time} onChange={(e) => setTime(e.target.value)}>
              {slots.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        {clash && (
          <div className="alert alert-warn">
            Ce créneau est déjà pris par {clash.patientName ?? 'un autre patient'}. Vous pouvez quand même planifier.
          </div>
        )}
        <Field label="Motif" htmlFor="a-type" required>
          <input id="a-type" className="input" list="appt-types" value={type} onChange={(e) => setType(e.target.value)} autoComplete="off" />
          <datalist id="appt-types">{ACTS.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        {editing && (
          <Field label="Statut" htmlFor="a-status">
            <select id="a-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
              {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes" htmlFor="a-notes">
          <input id="a-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Facultatif" />
        </Field>
        {error && <div className="alert alert-bad" role="alert">{error}</div>}
      </div>
    </Modal>
  );
};

export default AppointmentForm;
