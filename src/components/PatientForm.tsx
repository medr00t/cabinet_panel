import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import Field from './ui/Field';
import DateField from './ui/DateField';
import { today } from '../utils/format';
import { INSURANCES } from '../constants';
import { Patient, createPatient, errorMessage, nextBilletNumber, savePatient } from '../services/api';

interface PatientFormProps {
  patient?: Patient;
  onClose: () => void;
  onSaved: (id: number) => void;
}

const blank = (v?: string) => v ?? '';

const PatientForm = ({ patient, onClose, onSaved }: PatientFormProps) => {
  const editing = patient?.id !== undefined;
  const [f, setF] = useState({
    billetNumber: blank(patient?.billetNumber),
    lastName: blank(patient?.lastName),
    firstName: blank(patient?.firstName),
    dateOfBirth: blank(patient?.dateOfBirth),
    gender: patient?.gender ?? 'male',
    phone: blank(patient?.phone),
    address: blank(patient?.address),
    insurance: blank(patient?.insurance),
    medicalHistory: blank(patient?.medicalHistory),
    notes: blank(patient?.notes),
    email: blank(patient?.email),
    allergies: blank(patient?.allergies),
    medications: blank(patient?.medications),
    emergencyContact: blank(patient?.emergencyContact),
    emergencyPhone: blank(patient?.emergencyPhone),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  // suggest the next free N° Billet for a new card, unless the user already typed one
  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    nextBilletNumber().then((n) => { if (!cancelled) setF((s) => (s.billetNumber ? s : { ...s, billetNumber: n })); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [editing]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.lastName.trim()) e.lastName = 'Obligatoire';
    if (!f.firstName.trim()) e.firstName = 'Obligatoire';
    if (f.phone.replace(/\D/g, '').length < 6) e.phone = 'Numéro de téléphone invalide';
    if (f.dateOfBirth && f.dateOfBirth > today()) e.dateOfBirth = 'Date dans le futur';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Adresse e-mail invalide';
    setErrors(e);
    if (Object.keys(e).length) return;

    const payload: Patient = {
      ...patient,
      billetNumber: f.billetNumber.trim() || undefined,
      lastName: f.lastName.trim(), firstName: f.firstName.trim(), gender: f.gender,
      dateOfBirth: f.dateOfBirth, phone: f.phone.trim(),
      address: f.address.trim() || undefined, insurance: f.insurance.trim() || undefined,
      medicalHistory: f.medicalHistory.trim() || undefined, notes: f.notes.trim() || undefined,
      email: f.email.trim() || undefined, allergies: f.allergies.trim() || undefined,
      medications: f.medications.trim() || undefined,
      emergencyContact: f.emergencyContact.trim() || undefined, emergencyPhone: f.emergencyPhone.trim() || undefined,
    };
    setBusy(true);
    setFormError('');
    try {
      if (editing) { await savePatient(patient!.id!, payload); onSaved(patient!.id!); }
      else onSaved(await createPatient(payload));
    } catch (err) {
      const msg = errorMessage(err);
      if (/billet/i.test(msg)) setErrors({ billetNumber: msg }); else setFormError(msg);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Modifier le patient' : 'Nouveau patient'}
      subtitle="Les informations de la fiche papier du patient."
      size="wide" onClose={onClose} onSubmit={submit}
      footer={<>
        {formError && <span className="error" style={{ color: 'var(--bad)', marginRight: 'auto', alignSelf: 'center', fontSize: 13 }}>{formError}</span>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn" disabled={busy}>{editing ? 'Enregistrer' : 'Créer le dossier'}</button>
      </>}
    >
      <div className="stack">
        <div className="section-title">Identité</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 16 }}>
          <Field label="N° Billet" htmlFor="billet" error={errors.billetNumber}>
            <input id="billet" className="input num" value={f.billetNumber} onChange={(e) => set('billetNumber', e.target.value)} aria-invalid={!!errors.billetNumber} />
          </Field>
          <Field label="Nom" htmlFor="ln" required error={errors.lastName}>
            <input id="ln" data-autofocus className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} aria-invalid={!!errors.lastName} />
          </Field>
          <Field label="Prénom" htmlFor="fn" required error={errors.firstName}>
            <input id="fn" className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} aria-invalid={!!errors.firstName} />
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Date de naissance" htmlFor="dob" error={errors.dateOfBirth}>
            <DateField id="dob" value={f.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} invalid={!!errors.dateOfBirth} />
          </Field>
          <Field label="Sexe">
            <div className="segmented" role="group" aria-label="Sexe">
              <button type="button" aria-pressed={f.gender === 'male'} onClick={() => set('gender', 'male')}>H</button>
              <button type="button" aria-pressed={f.gender === 'female'} onClick={() => set('gender', 'female')}>F</button>
            </div>
          </Field>
          <Field label="Téléphone" htmlFor="tel" required error={errors.phone}>
            <input id="tel" className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Adresse" htmlFor="addr">
            <input id="addr" className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Couverture médicale" htmlFor="ins">
            <input id="ins" className="input" list="insurances" value={f.insurance} onChange={(e) => set('insurance', e.target.value)} placeholder="CNSS, CNOPS, AMO…" />
            <datalist id="insurances">{INSURANCES.map((i) => <option key={i} value={i} />)}</datalist>
          </Field>
        </div>

        <div className="section-title">Dossier clinique</div>
        <div className="grid-2">
          <Field label="R.C. — renseignements cliniques" htmlFor="rc">
            <textarea id="rc" className="textarea" value={f.medicalHistory} onChange={(e) => set('medicalHistory', e.target.value)} placeholder="Antécédents, motif de consultation…" />
          </Field>
          <Field label="Devis / plan de traitement" htmlFor="plan">
            <textarea id="plan" className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Soins prévus…" />
          </Field>
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text-2)', padding: '4px 0' }}>Autres informations</summary>
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="grid-2">
              <Field label="E-mail" htmlFor="mail" error={errors.email}>
                <input id="mail" className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} />
              </Field>
              <Field label="Allergies" htmlFor="all">
                <input id="all" className="input" value={f.allergies} onChange={(e) => set('allergies', e.target.value)} />
              </Field>
            </div>
            <Field label="Médicaments en cours" htmlFor="med">
              <input id="med" className="input" value={f.medications} onChange={(e) => set('medications', e.target.value)} />
            </Field>
            <div className="grid-2">
              <Field label="Personne à prévenir" htmlFor="ec">
                <input id="ec" className="input" value={f.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />
              </Field>
              <Field label="Téléphone (urgence)" htmlFor="ep">
                <input id="ep" className="input" inputMode="tel" value={f.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
              </Field>
            </div>
          </div>
        </details>
      </div>
    </Modal>
  );
};

export default PatientForm;
