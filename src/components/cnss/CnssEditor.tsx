import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCheck2, FileText, Plus, Printer, Trash2, X } from 'lucide-react';
import CnssPage from './CnssPage';
import Field from '../ui/Field';
import DateField from '../ui/DateField';
import { CnssAct, CnssData, SavedSheet, Settings, careOf, emptyAct, actFromTreatment, newSheet, totalOf } from '../../cnss/model';
import { MAX_ACT_LINES } from '../../cnss/layout';
import { useToast } from '../../contexts/ToastContext';
import { Patient, Treatment, errorMessage, openPdf, saveCnssSheet, setSetting } from '../../services/api';
import { sheetsToPdf, toBase64 } from '../../cnss/pdf';
import { fmtDate, fullName, money } from '../../utils/format';

interface CnssEditorProps {
  patient: Patient;
  treatments: Treatment[];
  sheets: SavedSheet[];
  editing?: SavedSheet;
  settings: Settings;
  userId: number;
  onClose: () => void;
  onSaved: () => void;
}

const money2 = (n: number) => n.toFixed(2).replace('.', ',');
const CARE: { key: 'careSoins' | 'careProthese' | 'careOrtho' | 'careAutres'; label: string }[] = [
  { key: 'careSoins', label: 'Soins' }, { key: 'careProthese', label: 'Prothèse' },
  { key: 'careOrtho', label: 'Orthodontie faciale' }, { key: 'careAutres', label: 'Autres' },
];

/** Fill, check and print the CNSS "Feuille de soins dentaires" for a patient. */
const CnssEditor = ({ patient, treatments, sheets, editing, settings, userId, onClose, onSaved }: CnssEditorProps) => {
  const toast = useToast();
  const initial = useMemo(() => {
    if (editing) return { data: editing.data, names: {} as Record<string, string> };
    const billed = new Set(sheets.flatMap((s) => s.data.acts.map((a) => a.treatmentId).filter((x): x is number => x !== undefined)));
    return newSheet({ patient, treatments, settings, previous: sheets[0]?.data, alreadyBilled: billed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [data, setData] = useState<CnssData>(initial.data);
  const [names, setNames] = useState<Record<string, string>>(() => {
    const n = { ...initial.names };
    for (const a of initial.data.acts) if (!n[a.id] && a.treatmentId !== undefined) n[a.id] = treatments.find((t) => t.id === a.treatmentId)?.act ?? '';
    return n;
  });
  const [page, setPage] = useState<'recto' | 'verso'>('recto');
  const [background, setBackground] = useState(true);
  const [printBackground, setPrintBackground] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feesTouched, setFeesTouched] = useState(!!editing);
  const [careTouched, setCareTouched] = useState(!!editing);

  const set = <K extends keyof CnssData>(k: K, v: CnssData[K]) => setData((d) => ({ ...d, [k]: v }));

  // total of the fees and the ticked "Type de soins" follow the act lines until the user edits them by hand
  const setActs = (acts: CnssAct[], nextNames: Record<string, string> = names) => {
    setData((d) => {
      const next: CnssData = { ...d, acts };
      if (!feesTouched) next.fees = acts.length ? money2(totalOf(acts)) : '';
      if (!careTouched) {
        const care = { careSoins: false, careProthese: false, careOrtho: false, careAutres: false };
        for (const a of acts) if (nextNames[a.id]) care[careOf(nextNames[a.id])] = true;
        Object.assign(next, care);
      }
      return next;
    });
  };
  const updateAct = (id: string, patch: Partial<CnssAct>) => setActs(data.acts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAct = (id: string) => setActs(data.acts.filter((a) => a.id !== id));
  const addFromCarnet = (treatmentId: number) => {
    const t = treatments.find((x) => x.id === treatmentId);
    if (!t) return;
    const line = actFromTreatment(t);
    const nextNames = { ...names, [line.id]: t.act };
    setNames(nextNames);
    setActs([...data.acts, line], nextNames);
  };
  const used = new Set(data.acts.map((a) => a.treatmentId));
  const available = treatments.filter((t) => t.id !== undefined && !used.has(t.id));

  // Esc closes, but only when nothing inside the editor is being typed in
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, select')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      await saveCnssSheet({
        id: editing?.id, patientId: patient.id!, createdBy: userId, data: JSON.stringify(data),
        label: `Feuille du ${fmtDate(data.dateDentist) || fmtDate(new Date().toISOString().slice(0, 10))}`,
      });
      // clinic-wide values are remembered for the next sheets
      if (data.inp.trim() && data.inp.trim() !== (settings.cnssInp ?? '')) await setSetting('cnss_inp', data.inp);
      if (data.placeDentist.trim() && data.placeDentist.trim() !== (settings.cnssCity ?? '')) await setSetting('cnss_city', data.placeDentist);
      toast.success('Feuille CNSS enregistrée', 'Elle est dans le dossier du patient.');
      onSaved();
    } catch (e) {
      toast.error('Enregistrement impossible', errorMessage(e));
      setBusy(false);
    }
  };

  // Preferred way to print: make a PDF, open it in the default viewer / browser, then Ctrl+P there.
  const openAsPdf = async () => {
    if (data.acts.length > MAX_ACT_LINES) toast.warning('Trop d\'actes', `Seuls les ${MAX_ACT_LINES} premiers tiennent sur la feuille.`);
    setBusy(true);
    try {
      const svgs = Array.from(document.querySelectorAll<SVGSVGElement>('.print-root svg'));
      const pdf = await sheetsToPdf(svgs);
      await openPdf(`Feuille CNSS ${fullName(patient)}`, toBase64(pdf));
      toast.success('PDF ouvert', 'Appuyez sur Ctrl+P dans la fenêtre du PDF pour imprimer.');
    } catch (e) {
      toast.error('Impossible d\'ouvrir le PDF', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    if (data.acts.length > MAX_ACT_LINES) toast.warning('Trop d\'actes', `Seuls les ${MAX_ACT_LINES} premiers tiennent sur la feuille.`);
    window.print();
  };

  const total = totalOf(data.acts);
  return (
    <div className="cnss-editor" role="dialog" aria-modal="true" aria-label="Feuille de soins CNSS">
      <header className="cnss-bar">
        <div>
          <h2>Feuille de soins CNSS</h2>
          <div className="muted" style={{ fontSize: 13 }}>{fullName(patient)}{editing ? ` · ${editing.label}` : ' · nouvelle feuille'}</div>
        </div>
        <div className="row">
          <label className="check"><input type="checkbox" checked={printBackground} onChange={(e) => setPrintBackground(e.target.checked)} />Imprimer avec le formulaire</label>
          <button className="btn btn-secondary" onClick={print} title="Ouvre directement la fenêtre d'impression"><Printer /> Imprimer ici</button>
          <button className="btn btn-secondary" onClick={openAsPdf} disabled={busy} title="Ouvre la feuille en PDF : Ctrl+P pour imprimer"><FileText /> Ouvrir en PDF</button>
          <button className="btn" onClick={save} disabled={busy}><FileCheck2 /> Enregistrer dans le dossier</button>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer"><X /></button>
        </div>
      </header>

      <div className="cnss-body">
        <div className="cnss-form">
          <details open>
            <summary>Assuré(e)</summary>
            <div className="stack">
              <Field label="Nom et prénom de l'assuré(e)" htmlFor="c-iname"><input id="c-iname" className="input" value={data.insuredName} onChange={(e) => set('insuredName', e.target.value)} /></Field>
              <div className="grid-2">
                <Field label="N° d'immatriculation" htmlFor="c-immat" hint="9 chiffres"><input id="c-immat" className="input num" maxLength={9} value={data.immat} onChange={(e) => set('immat', e.target.value.replace(/\s/g, ''))} /></Field>
                <Field label="N° CIN de l'assuré(e)" htmlFor="c-icin"><input id="c-icin" className="input num" maxLength={9} value={data.insuredCin} onChange={(e) => set('insuredCin', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
              </div>
              <Field label="Lien de parenté du bénéficiaire avec l'assuré(e)">
                <div className="segmented wide" role="group">
                  {([['self', 'Lui-même'], ['spouse', 'Conjoint'], ['child', 'Enfant']] as const).map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={data.relation === v} onClick={() => set('relation', v)}>{l}</button>
                  ))}
                </div>
              </Field>
              <Field label="Adresse" htmlFor="c-addr"><textarea id="c-addr" className="textarea" rows={2} value={data.address} onChange={(e) => set('address', e.target.value)} /></Field>
              <div className="grid-2">
                <Field label="Montant des frais (DH)" htmlFor="c-fees" hint={feesTouched ? 'Saisi à la main' : 'Somme des actes'}>
                  <input id="c-fees" className="input num" value={data.fees} onChange={(e) => { setFeesTouched(true); set('fees', e.target.value); }} />
                </Field>
                <Field label="Nombre de pièces jointes" htmlFor="c-att"><input id="c-att" className="input num" inputMode="numeric" value={data.attachments} onChange={(e) => set('attachments', e.target.value.replace(/\D/g, ''))} /></Field>
              </div>
            </div>
          </details>

          <details open>
            <summary>Bénéficiaire des soins</summary>
            <div className="stack">
              <Field label="Nom et prénom" htmlFor="c-bname"><input id="c-bname" className="input" value={data.beneficiaryName} onChange={(e) => set('beneficiaryName', e.target.value)} /></Field>
              <div className="grid-2">
                <Field label="Date de naissance" htmlFor="c-dob"><DateField id="c-dob" value={data.dob} onChange={(v) => set('dob', v)} /></Field>
                <Field label="N° CIN" htmlFor="c-bcin"><input id="c-bcin" className="input num" maxLength={9} value={data.beneficiaryCin} onChange={(e) => set('beneficiaryCin', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
              </div>
              <Field label="Sexe">
                <div className="segmented" role="group">
                  <button type="button" aria-pressed={data.sex === 'M'} onClick={() => set('sex', 'M')}>M (homme)</button>
                  <button type="button" aria-pressed={data.sex === 'F'} onClick={() => set('sex', 'F')}>F (femme)</button>
                </div>
              </Field>
            </div>
          </details>

          <details open>
            <summary>Chirurgien dentiste</summary>
            <div className="stack">
              <Field label="N° INP" htmlFor="c-inp" hint="Mémorisé pour les prochaines feuilles"><input id="c-inp" className="input num" maxLength={9} value={data.inp} onChange={(e) => set('inp', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
              <Field label="Type de soins">
                <div className="checks">
                  {CARE.map(({ key, label }) => (
                    <label key={key} className="check"><input type="checkbox" checked={data[key]} onChange={(e) => { setCareTouched(true); set(key, e.target.checked); }} />{label}</label>
                  ))}
                </div>
              </Field>
              <Field label="Demande">
                <div className="checks">
                  <label className="check"><input type="checkbox" checked={data.execution} onChange={(e) => set('execution', e.target.checked)} />Exécution</label>
                  <label className="check"><input type="checkbox" checked={data.entente} onChange={(e) => set('entente', e.target.checked)} />Entente préalable</label>
                </div>
              </Field>
              <div className="grid-2">
                <Field label="N° d'entente préalable" htmlFor="c-prior"><input id="c-prior" className="input num" maxLength={9} value={data.priorAgreement} onChange={(e) => set('priorAgreement', e.target.value.toUpperCase().replace(/\s/g, ''))} /></Field>
                <Field label="Date d'accident" htmlFor="c-acc"><DateField id="c-acc" value={data.accidentDate} onChange={(v) => set('accidentDate', v)} /></Field>
              </div>
            </div>
          </details>

          <details open>
            <summary>Signatures</summary>
            <div className="grid-2">
              <Field label="Fait à (assuré)" htmlFor="c-pi"><input id="c-pi" className="input" value={data.placeInsured} onChange={(e) => set('placeInsured', e.target.value)} /></Field>
              <Field label="Le" htmlFor="c-di"><DateField id="c-di" value={data.dateInsured} onChange={(v) => set('dateInsured', v)} /></Field>
              <Field label="Fait à (dentiste)" htmlFor="c-pd"><input id="c-pd" className="input" value={data.placeDentist} onChange={(e) => set('placeDentist', e.target.value)} /></Field>
              <Field label="Le" htmlFor="c-dd"><DateField id="c-dd" value={data.dateDentist} onChange={(v) => set('dateDentist', v)} /></Field>
            </div>
          </details>

          <details open>
            <summary>Actes effectués (verso) <span className="count">{data.acts.length}</span></summary>
            <div className="stack">
              {data.acts.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Aucun acte. Ajoutez les actes du carnet de soins ou une ligne vide.</div>}
              {data.acts.map((a) => (
                <div key={a.id} className="cnss-act">
                  <div className="row-between">
                    <b style={{ fontSize: 13 }}>{names[a.id] || 'Acte'}</b>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeAct(a.id)} aria-label="Retirer cet acte"><Trash2 /></button>
                  </div>
                  <div className="grid-3" style={{ gridTemplateColumns: '0.9fr 0.75fr 1.5fr' }}>
                    <Field label="Dents"><input className="input" value={a.teeth} onChange={(e) => updateAct(a.id, { teeth: e.target.value })} /></Field>
                    <Field label="Code (4 car.)"><input className="input num" maxLength={4} value={a.code} onChange={(e) => updateAct(a.id, { code: e.target.value.toUpperCase() })} /></Field>
                    <Field label="Date"><DateField value={a.date} onChange={(v) => updateAct(a.id, { date: v })} /></Field>
                    <Field label="Lettre clé + cotation"><input className="input" value={a.coef} onChange={(e) => updateAct(a.id, { coef: e.target.value })} placeholder="ex. SC 12" /></Field>
                    <Field label="Valeur clé"><input className="input num" value={a.keyValue} onChange={(e) => updateAct(a.id, { keyValue: e.target.value })} /></Field>
                    <Field label="Montant facturé"><input className="input num" value={a.amount} onChange={(e) => updateAct(a.id, { amount: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {available.length > 0 && (
                  <select className="select" style={{ maxWidth: 330 }} value="" onChange={(e) => e.target.value && addFromCarnet(Number(e.target.value))} aria-label="Ajouter un acte du carnet">
                    <option value="">Ajouter un acte du carnet…</option>
                    {available.map((t) => <option key={t.id} value={t.id}>{fmtDate(t.treatmentDate)} · {t.tooth || '—'} · {t.act} · {money(t.quote)}</option>)}
                  </select>
                )}
                <button className="btn btn-secondary" onClick={() => setActs([...data.acts, emptyAct()])}><Plus /> Ligne vide</button>
                <span className="muted num" style={{ marginLeft: 'auto', fontSize: 13 }}>Total {money(total)}</span>
              </div>
              {data.acts.length > MAX_ACT_LINES && <div className="alert alert-warn">La feuille contient {MAX_ACT_LINES} lignes au maximum : créez une deuxième feuille pour les autres actes.</div>}
              <div className="muted" style={{ fontSize: 12.5 }}>
                Les dents des actes sont entourées sur le schéma du verso. Le code d'acte et la cotation NGAP ne figurent pas dans le carnet : saisissez-les ici.
              </div>
            </div>
          </details>
        </div>

        <div className="cnss-preview">
          <div className="cnss-preview-bar">
            <div className="segmented" role="group" aria-label="Page">
              <button type="button" aria-pressed={page === 'recto'} onClick={() => setPage('recto')}>Recto</button>
              <button type="button" aria-pressed={page === 'verso'} onClick={() => setPage('verso')}>Verso — actes</button>
            </div>
            <label className="check"><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />Afficher le formulaire</label>
          </div>
          <div className="cnss-sheet"><CnssPage page={page} data={data} background={background} /></div>
        </div>
      </div>

      {/* what is actually printed: both pages, only shown by the print stylesheet */}
      {createPortal(
        <div className="print-root" aria-hidden="true">
          <div className="print-page"><CnssPage page="recto" data={data} background={printBackground} /></div>
          <div className="print-page"><CnssPage page="verso" data={data} background={printBackground} /></div>
        </div>, document.body)}
    </div>
  );
};

export default CnssEditor;
