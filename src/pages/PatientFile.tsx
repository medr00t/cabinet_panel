import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarPlus, ChevronDown, ChevronRight, ClipboardList, CreditCard, FileText, MapPin, Pencil, Phone,
  Plus, ShieldPlus, Trash2, UserX, Wallet,
} from 'lucide-react';
import RefreshButton from '../components/ui/RefreshButton';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import PatientForm from '../components/PatientForm';
import TreatmentForm from '../components/TreatmentForm';
import PaymentForm from '../components/PaymentForm';
import AppointmentForm from '../components/AppointmentForm';
import { METHODS, STATUS_BADGE, STATUS_LABEL } from '../constants';
import { useData } from '../contexts/DataContext';
import { useNav } from '../contexts/NavContext';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { useLoader } from '../hooks/useLoader';
import {
  Treatment, TreatmentPayment, errorMessage, patientTreatments, removePatient, removePayment, removeTreatment, treatmentPayments,
} from '../services/api';
import { ageOf, fmtDate, fmtTime, fullName, money } from '../utils/format';

type Tab = 'actes' | 'dossier' | 'rdv';
type Dialog =
  | { kind: 'edit-patient' } | { kind: 'new-act' } | { kind: 'edit-act'; t: Treatment } | { kind: 'pay'; t: Treatment }
  | { kind: 'new-appt' } | { kind: 'delete-act'; t: Treatment } | { kind: 'delete-payment'; p: TreatmentPayment; t: Treatment }
  | { kind: 'delete-patient' };

const PatientFile = ({ patientId }: { patientId: number }) => {
  const { user, isDoctor } = useUser();
  const { patients, appointments, version, refresh, loading } = useData();
  const { go } = useNav();
  const toast = useToast();
  const patient = patients.find((p) => p.id === patientId);

  const [tab, setTab] = useState<Tab>('actes');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<Record<number, TreatmentPayment[]>>({});

  const ledger = useLoader(() => patientTreatments(patientId), [patientId, version]);
  // a refresh also re-reads the payment history of the rows that are expanded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { open.forEach((id) => { loadHistory(id); }); }, [version]);
  const lines = ledger.data ?? [];

  const totals = useMemo(() => {
    const quote = lines.reduce((s, t) => s + t.quote, 0);
    const paid = lines.reduce((s, t) => s + t.totalPaid, 0);
    return { quote, paid, due: Math.round((quote - paid) * 100) / 100 };
  }, [lines]);
  const myAppointments = useMemo(
    () => appointments.filter((a) => a.patientId === patientId).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [appointments, patientId],
  );

  const loadHistory = async (id: number) => {
    try { const rows = await treatmentPayments(id); setHistory((h) => ({ ...h, [id]: rows })); }
    catch (e) { toast.error('Impossible de charger les paiements', errorMessage(e)); }
  };
  const toggleRow = (id: number) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else { next.add(id); loadHistory(id); }
    setOpen(next);
  };
  // after any change: reload this ledger, the global balances, and any open payment history
  const changed = async () => {
    setDialog(null);
    await Promise.all([ledger.reload(), refresh(), ...[...open].map(loadHistory)]);
  };
  const fail = (title: string) => (e: unknown) => { toast.error(title, errorMessage(e)); throw e; };

  if (!patient) {
    return (
      <div className="page">
        <button className="crumb" onClick={() => go({ page: 'patients' })}><ArrowLeft /> Patients</button>
        {loading ? <div className="skeleton" style={{ height: 160 }} />
          : <div className="card"><EmptyState icon={<UserX />} title="Patient introuvable" text="Ce dossier n'existe plus." /></div>}
      </div>
    );
  }

  const age = ageOf(patient.dateOfBirth);
  const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

  return (
    <div className="page">
      <div className="row-between" style={{ marginBottom: 14 }}>
        <button className="crumb" style={{ margin: 0 }} onClick={() => go({ page: 'patients' })}><ArrowLeft /> Patients</button>
        <RefreshButton />
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="file-head">
          <Avatar first={patient.firstName} last={patient.lastName} large />
          <div className="grow">
            <div className="row" style={{ gap: 10 }}>
              <h1>{patient.lastName.toUpperCase()} {patient.firstName}</h1>
              {patient.billetNumber && <span className="billet">N° {patient.billetNumber}</span>}
            </div>
            <div className="file-meta">
              <span>{patient.gender === 'female' ? 'Femme' : 'Homme'}{age !== null ? `, ${age} ans` : ''}</span>
              <span><Phone />{patient.phone}</span>
              {patient.address && <span><MapPin />{patient.address}</span>}
              {patient.insurance && <span><ShieldPlus />{patient.insurance}</span>}
            </div>
            {patient.allergies && <div className="badge badge-bad plain" style={{ marginTop: 10 }}>Allergies : {patient.allergies}</div>}
          </div>
          <div className="row" style={{ alignSelf: 'flex-start' }}>
            <button className="btn btn-secondary" onClick={() => setDialog({ kind: 'new-appt' })}><CalendarPlus /> Rendez-vous</button>
            <button className="btn btn-secondary" onClick={() => setDialog({ kind: 'edit-patient' })}><Pencil /> Modifier</button>
            {isDoctor && <button className="btn btn-ghost btn-icon" aria-label="Supprimer le patient" title="Supprimer le patient" onClick={() => setDialog({ kind: 'delete-patient' })}><Trash2 /></button>}
          </div>
        </div>
        <div className="balance-strip">
          <div><div className="k">Total des devis</div><div className="v num">{money(totals.quote).replace(/ DH$/, '')}<small>DH</small></div></div>
          <div className="paid"><div className="k">Total payé</div><div className="v num">{money(totals.paid).replace(/ DH$/, '')}<small>DH</small></div></div>
          <div className={totals.due > 0.005 ? 'due' : 'paid'}><div className="k">Reste à payer</div>
            <div className="v num">{totals.due > 0.005 ? <>{money(totals.due).replace(/ DH$/, '')}<small>DH</small></> : lines.length ? 'Soldé' : '—'}</div></div>
        </div>
      </section>

      <div className="tabs" role="tablist">
        {([['actes', 'Actes et paiements', lines.length], ['dossier', 'Dossier clinique', 0], ['rdv', 'Rendez-vous', myAppointments.length]] as const).map(([id, label, count]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}{count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === 'actes' && (
          <section className="card">
            <div className="card-head">
              <h2>Carnet de soins</h2>
              <button className="btn" onClick={() => setDialog({ kind: 'new-act' })}><Plus /> Ajouter un acte</button>
            </div>
            {ledger.error ? <div style={{ padding: 20 }}><div className="alert alert-bad">{ledger.error}</div></div>
              : ledger.loading ? <div style={{ padding: 20, display: 'grid', gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}</div>
                : lines.length === 0 ? (
                  <EmptyState icon={<ClipboardList />} title="Aucun acte enregistré"
                    text="Ajoutez chaque ligne du carnet papier : date, dent, acte, devis et somme déjà payée."
                    action={<button className="btn" onClick={() => setDialog({ kind: 'new-act' })}><Plus /> Ajouter un acte</button>} />
                ) : (
                  <div className="table-wrap">
                    <table className="table ledger">
                      <thead>
                        <tr><th style={{ width: 30 }} /><th>Date</th><th>Désignation</th><th>Acte médical</th><th className="r">Devis</th><th className="r">Payé</th><th className="r">Reste</th><th /></tr>
                      </thead>
                      <tbody>
                        {lines.map((t) => {
                          const reste = Math.round((t.quote - t.totalPaid) * 100) / 100;
                          const isOpen = open.has(t.id!);
                          return (
                            <Fragment key={t.id}>
                              <tr>
                                <td><button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleRow(t.id!)} aria-expanded={isOpen} aria-label="Détail des paiements">{isOpen ? <ChevronDown /> : <ChevronRight />}</button></td>
                                <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.treatmentDate)}</td>
                                <td className="tooth">{t.tooth || <span className="muted">—</span>}</td>
                                <td><div className="act">{t.act}</div>{t.notes && <div className="note">{t.notes}</div>}</td>
                                <td className="r num">{money(t.quote)}</td>
                                <td className="r num">{t.totalPaid > 0 ? money(t.totalPaid) : <span className="muted">—</span>}</td>
                                <td className="r num">{reste > 0.005 ? <span className="money-due">{money(reste)}</span> : <span className="badge badge-ok">Soldé</span>}</td>
                                <td>
                                  <div className="actions">
                                    {reste > 0.005 && <button className="btn btn-sm" onClick={() => setDialog({ kind: 'pay', t })}><Wallet /> Encaisser</button>}
                                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Modifier l'acte" title="Modifier" onClick={() => setDialog({ kind: 'edit-act', t })}><Pencil /></button>
                                    {isDoctor && <button className="btn btn-ghost btn-icon btn-sm" aria-label="Supprimer l'acte" title="Supprimer" onClick={() => setDialog({ kind: 'delete-act', t })}><Trash2 /></button>}
                                  </div>
                                </td>
                              </tr>
                              {isOpen && (history[t.id!]?.length ? history[t.id!].map((p) => (
                                <tr key={`p${p.id}`} className="sub">
                                  <td /><td className="num">{fmtDate(p.paymentDate)}</td><td />
                                  <td><CreditCard size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Paiement · {methodLabel(p.paymentMethod)}</td>
                                  <td /><td className="r num">{money(p.amount)}</td><td />
                                  <td><div className="actions">{isDoctor && <button className="btn btn-ghost btn-icon btn-sm" aria-label="Supprimer le paiement" onClick={() => setDialog({ kind: 'delete-payment', p, t })}><Trash2 /></button>}</div></td>
                                </tr>
                              )) : (
                                <tr className="sub"><td /><td colSpan={7}>{history[t.id!] ? 'Aucun paiement enregistré pour cet acte.' : 'Chargement…'}</td></tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr><td /><td colSpan={3}>Total</td><td className="r num">{money(totals.quote)}</td><td className="r num">{money(totals.paid)}</td>
                          <td className="r num">{totals.due > 0.005 ? <span className="money-due">{money(totals.due)}</span> : <span className="money-ok">Soldé</span>}</td><td /></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
          </section>
        )}

        {tab === 'dossier' && (
          <section className="card"><div className="card-body">
            <div className="info-grid">
              <div className="info-block">
                <h3>Identité</h3>
                <dl className="facts">
                  <dt>N° Billet</dt><dd>{patient.billetNumber ?? '—'}</dd>
                  <dt>Date de naissance</dt><dd>{patient.dateOfBirth ? `${fmtDate(patient.dateOfBirth)}${age !== null ? ` (${age} ans)` : ''}` : '—'}</dd>
                  <dt>Sexe</dt><dd>{patient.gender === 'female' ? 'Femme' : 'Homme'}</dd>
                  <dt>Téléphone</dt><dd>{patient.phone}</dd>
                  <dt>Adresse</dt><dd>{patient.address ?? '—'}</dd>
                  <dt>Couverture médicale</dt><dd>{patient.insurance ?? '—'}</dd>
                  <dt>E-mail</dt><dd>{patient.email ?? '—'}</dd>
                  <dt>Personne à prévenir</dt><dd>{patient.emergencyContact ? `${patient.emergencyContact}${patient.emergencyPhone ? ` · ${patient.emergencyPhone}` : ''}` : '—'}</dd>
                </dl>
              </div>
              <div className="stack">
                <div className="info-block"><h3>R.C. — renseignements cliniques</h3>{patient.medicalHistory ? <p>{patient.medicalHistory}</p> : <p className="none">Aucun renseignement.</p>}</div>
                <div className="info-block"><h3>Devis / plan de traitement</h3>{patient.notes ? <p>{patient.notes}</p> : <p className="none">Aucun plan enregistré.</p>}</div>
                <div className="info-block"><h3>Allergies</h3>{patient.allergies ? <p>{patient.allergies}</p> : <p className="none">Aucune connue.</p>}</div>
                <div className="info-block"><h3>Médicaments en cours</h3>{patient.medications ? <p>{patient.medications}</p> : <p className="none">Aucun.</p>}</div>
              </div>
            </div>
            <div style={{ marginTop: 22 }}><button className="btn btn-secondary" onClick={() => setDialog({ kind: 'edit-patient' })}><Pencil /> Modifier le dossier</button></div>
          </div></section>
        )}

        {tab === 'rdv' && (
          <section className="card">
            <div className="card-head"><h2>Rendez-vous</h2><button className="btn" onClick={() => setDialog({ kind: 'new-appt' })}><CalendarPlus /> Planifier</button></div>
            {myAppointments.length === 0 ? <EmptyState icon={<FileText />} title="Aucun rendez-vous" text="Ce patient n'a pas encore de rendez-vous." />
              : myAppointments.map((a) => (
                <button key={a.id} className="list-row" onClick={() => go({ page: 'agenda', date: a.date })}>
                  <span className="time-tag" style={{ width: 96 }}>{fmtDate(a.date)}</span>
                  <span className="num" style={{ width: 48, fontWeight: 600 }}>{fmtTime(a.time)}</span>
                  <span className="grow t1">{a.treatmentType}</span>
                  <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>
                </button>
              ))}
          </section>
        )}
      </div>

      {dialog?.kind === 'edit-patient' && <PatientForm patient={patient} onClose={() => setDialog(null)} onSaved={async () => { toast.success('Dossier mis à jour'); setDialog(null); await refresh(); }} />}
      {dialog?.kind === 'new-act' && <TreatmentForm patient={patient} userId={user!.id} onClose={() => setDialog(null)} onSaved={async () => { toast.success('Acte ajouté'); await changed(); }} />}
      {dialog?.kind === 'edit-act' && <TreatmentForm patient={patient} userId={user!.id} treatment={dialog.t} onClose={() => setDialog(null)} onSaved={async () => { toast.success('Acte modifié'); await changed(); }} />}
      {dialog?.kind === 'pay' && <PaymentForm treatment={dialog.t} onClose={() => setDialog(null)} onSaved={async () => { toast.success('Paiement enregistré'); await changed(); }} />}
      {dialog?.kind === 'new-appt' && (
        <AppointmentForm patients={patients} appointments={appointments} defaultPatientId={patient.id} canCancel={isDoctor} onClose={() => setDialog(null)}
          onSaved={async () => { toast.success('Rendez-vous planifié'); setDialog(null); await refresh(); }} />
      )}
      {dialog?.kind === 'delete-act' && (
        <ConfirmDialog danger title="Supprimer cet acte ?" confirmLabel="Supprimer"
          message={`« ${dialog.t.act} » du ${fmtDate(dialog.t.treatmentDate)} sera supprimé${dialog.t.totalPaid > 0 ? `, ainsi que ses ${money(dialog.t.totalPaid)} de paiements enregistrés` : ''}. Cette action est définitive.`}
          onClose={() => setDialog(null)} onConfirm={async () => { await removeTreatment(dialog.t.id!).catch(fail('Suppression impossible')); toast.success('Acte supprimé'); await changed(); }} />
      )}
      {dialog?.kind === 'delete-payment' && (
        <ConfirmDialog danger title="Supprimer ce paiement ?" confirmLabel="Supprimer"
          message={`Le paiement de ${money(dialog.p.amount)} du ${fmtDate(dialog.p.paymentDate)} sera retiré. Le reste à payer de l'acte augmentera d'autant.`}
          onClose={() => setDialog(null)} onConfirm={async () => { await removePayment(dialog.p.id).catch(fail('Suppression impossible')); toast.success('Paiement supprimé'); await changed(); }} />
      )}
      {dialog?.kind === 'delete-patient' && (
        <ConfirmDialog danger title="Supprimer ce patient ?" confirmLabel="Supprimer le dossier"
          message={`Le dossier de ${fullName(patient)} et ses rendez-vous seront supprimés. Impossible si des actes ou paiements sont enregistrés.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => { await removePatient(patient.id!).catch(fail('Suppression impossible')); toast.success('Patient supprimé'); await refresh(); go({ page: 'patients' }); }} />
      )}
    </div>
  );
};

export default PatientFile;
