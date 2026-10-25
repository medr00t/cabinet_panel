import { useState } from 'react';
import Modal from './ui/Modal';
import Field from './ui/Field';
import DateField from './ui/DateField';
import MoneyInput from './ui/MoneyInput';
import { ACTS, METHODS } from '../constants';
import { Patient, PaymentMethod, Treatment, addTreatment, errorMessage, saveTreatment } from '../services/api';
import { amount, fullName, money, parseAmount, today } from '../utils/format';

interface TreatmentFormProps {
  patient: Patient;
  userId: number;
  treatment?: Treatment; // edit an existing line
  onClose: () => void;
  onSaved: () => void;
}

/** One line of the paper ledger: Date | Désignation | Acte médical | Devis | Payé. */
const TreatmentForm = ({ patient, userId, treatment, onClose, onSaved }: TreatmentFormProps) => {
  const editing = treatment?.id !== undefined;
  const [date, setDate] = useState(treatment?.treatmentDate ?? today());
  const [tooth, setTooth] = useState(treatment?.tooth ?? '');
  const [act, setAct] = useState(treatment?.act ?? '');
  const [quote, setQuote] = useState(treatment ? amount(treatment.quote).replace(/ /g, '') : '');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('espèces');
  const [notes, setNotes] = useState(treatment?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const quoteN = parseAmount(quote);
  const paidN = paid.trim() === '' ? 0 : parseAmount(paid);
  const alreadyPaid = treatment?.totalPaid ?? 0;
  const reste = (Number.isNaN(quoteN) ? 0 : quoteN) - alreadyPaid - (Number.isNaN(paidN) ? 0 : paidN);
  const clear = (k: string) => setErrors((e) => ({ ...e, [k]: '' }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!act.trim()) e.act = 'Indiquez l\'acte médical';
    if (!date) e.date = 'Date obligatoire';
    if (Number.isNaN(quoteN)) e.quote = 'Montant invalide';
    if (Number.isNaN(paidN)) e.paid = 'Montant invalide';
    if (!e.quote && !e.paid) {
      if (!editing && paidN > quoteN) e.paid = 'Supérieur au devis';
      if (editing && quoteN < alreadyPaid) e.quote = `Inférieur au montant déjà payé (${money(alreadyPaid)})`;
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    const line: Treatment = {
      ...treatment, patientId: patient.id!, treatmentDate: date, tooth: tooth.trim(), act: act.trim(),
      quote: quoteN, notes: notes.trim() || undefined, createdBy: treatment?.createdBy ?? userId, totalPaid: alreadyPaid,
    };
    setBusy(true);
    setFormError('');
    try {
      if (editing) await saveTreatment(line); else await addTreatment(line, paidN, method);
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Modifier l\'acte' : 'Nouvel acte'}
      subtitle={fullName(patient)}
      onClose={onClose} onSubmit={submit}
      footer={<>
        {formError && <span className="error" style={{ color: 'var(--bad)', marginRight: 'auto', alignSelf: 'center', fontSize: 13 }}>{formError}</span>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn" disabled={busy}>{editing ? 'Enregistrer' : 'Ajouter l\'acte'}</button>
      </>}
    >
      <div className="stack">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Date" htmlFor="t-date" required error={errors.date} hint={editing ? undefined : 'Changez-la pour saisir une ligne du carnet papier.'}>
            <DateField id="t-date" value={date} onChange={(v) => { setDate(v); clear('date'); }} invalid={!!errors.date} />
          </Field>
          <Field label="Désignation (dent)" htmlFor="t-tooth" hint="Ex. 36, 11-21, Haut">
            <input id="t-tooth" className="input" value={tooth} onChange={(e) => setTooth(e.target.value)} maxLength={50} />
          </Field>
        </div>
        <Field label="Acte médical" htmlFor="t-act" required error={errors.act}>
          <input id="t-act" className="input" list="acts" value={act} onChange={(e) => { setAct(e.target.value); clear('act'); }} aria-invalid={!!errors.act} autoComplete="off" />
          <datalist id="acts">{ACTS.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <div className="grid-2">
          <Field label="Devis" htmlFor="t-quote" required error={errors.quote}>
            <MoneyInput id="t-quote" value={quote} onChange={(v) => { setQuote(v); clear('quote'); }} invalid={!!errors.quote} />
          </Field>
          {editing ? (
            <Field label="Déjà payé"><div className="input num" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>{money(alreadyPaid)}</div></Field>
          ) : (
            <Field label="Payé à ce jour" htmlFor="t-paid" error={errors.paid}>
              <MoneyInput id="t-paid" value={paid} onChange={(v) => { setPaid(v); clear('paid'); }} invalid={!!errors.paid} />
            </Field>
          )}
        </div>
        {!editing && paidN > 0 && (
          <Field label="Mode de paiement" htmlFor="t-method">
            <select id="t-method" className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes" htmlFor="t-notes">
          <input id="t-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Facultatif" />
        </Field>
        <div className="row-between" style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
          <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>Reste à payer après cet acte</span>
          <b className={`num ${Number.isNaN(quoteN) ? 'muted' : reste > 0.005 ? 'money-due' : 'money-ok'}`}>{Number.isNaN(quoteN) ? '—' : reste > 0.005 ? money(reste) : 'Soldé'}</b>
        </div>
      </div>
    </Modal>
  );
};

export default TreatmentForm;
