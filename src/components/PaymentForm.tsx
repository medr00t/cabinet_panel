import { useState } from 'react';
import Modal from './ui/Modal';
import Field from './ui/Field';
import MoneyInput from './ui/MoneyInput';
import { METHODS } from '../constants';
import { PaymentMethod, Treatment, errorMessage, payTreatment } from '../services/api';
import { amount, money, parseAmount, today } from '../utils/format';

interface PaymentFormProps {
  treatment: Treatment;
  onClose: () => void;
  onSaved: () => void;
}

const PaymentForm = ({ treatment, onClose, onSaved }: PaymentFormProps) => {
  const reste = Math.round((treatment.quote - treatment.totalPaid) * 100) / 100;
  const [value, setValue] = useState(amount(reste).replace(/ /g, ''));
  const [method, setMethod] = useState<PaymentMethod>('espèces');
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const n = parseAmount(value);
  const after = reste - (Number.isNaN(n) ? 0 : n);

  const submit = async () => {
    if (Number.isNaN(n) || n <= 0) return setError('Saisissez un montant supérieur à zéro');
    if (n > reste + 0.005) return setError(`Le montant dépasse le reste à payer (${money(reste)})`);
    if (!date) return setError('Date obligatoire');
    setBusy(true);
    try {
      await payTreatment(treatment.id!, n, method, date);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Encaisser un paiement"
      subtitle={`${treatment.act}${treatment.tooth ? ` · dent ${treatment.tooth}` : ''}`}
      size="narrow" onClose={onClose} onSubmit={submit}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-ok" disabled={busy}>Encaisser</button>
      </>}
    >
      <div className="stack">
        <div className="grid-3" style={{ gap: 10 }}>
          {[['Devis', money(treatment.quote)], ['Payé', money(treatment.totalPaid)], ['Reste', money(reste)]].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{k}</div>
              <div className="num" style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        <Field label="Montant versé" htmlFor="p-amount" required>
          <MoneyInput id="p-amount" value={value} onChange={(v) => { setValue(v); setError(''); }} invalid={!!error} />
        </Field>
        <div className="grid-2">
          <Field label="Mode de paiement" htmlFor="p-method">
            <select id="p-method" className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Date" htmlFor="p-date">
            <input id="p-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {error && <div className="alert alert-bad" role="alert">{error}</div>}
        {!error && !Number.isNaN(n) && n > 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            Après ce paiement : {after > 0.005 ? <b className="money-due">{money(after)} restant</b> : <b className="money-ok">acte soldé</b>}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PaymentForm;
