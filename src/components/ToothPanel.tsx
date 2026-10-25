import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Patient, ToothStatus, errorMessage, saveToothMark } from '../services/api';
import { STATUS, STATUS_ORDER, ToothState, toothName } from '../teeth';
import { fmtDate, money } from '../utils/format';

interface ToothPanelProps {
  patient: Patient;
  tooth: string;
  state?: ToothState;
  userId: number;
  onChanged: () => Promise<void>;
  onAddAct: (tooth: string) => void;
  onClose: () => void;
}

/** Detail of one tooth: its state, a remark, and every act done on it. */
const ToothPanel = ({ patient, tooth, state, userId, onChanged, onAddAct, onClose }: ToothPanelProps) => {
  const toast = useToast();
  const saved = state?.mark?.note ?? '';
  const [note, setNote] = useState(saved);
  const [busy, setBusy] = useState(false);
  const manual: ToothStatus = state?.mark?.status ?? '';
  const effective = state?.status ?? '';
  const info = effective ? STATUS[effective] : null;

  const save = async (status: ToothStatus, text: string, done: string) => {
    setBusy(true);
    try {
      await saveToothMark({ patientId: patient.id!, tooth, status, note: text.trim() || undefined, updatedBy: userId });
      await onChanged();
      toast.success(done);
    } catch (e) {
      toast.error('Enregistrement impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const origin = !effective ? 'Aucun soin enregistré'
    : state?.source === 'mark' ? 'Défini à la main'
      : `D'après « ${state?.statusAct?.act} » du ${fmtDate(state?.statusAct?.treatmentDate)}`;

  return (
    <aside className="card tooth-panel" aria-label={`Dent ${tooth}`}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3>Dent {tooth}</h3>
          <div className="sub">{toothName(tooth)}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fermer"><X /></button>
      </div>

      <div>
        {info
          ? <span className="badge plain" style={{ background: info.soft, color: info.color }}>{info.label}</span>
          : <span className="badge plain">Saine / non renseignée</span>}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{origin}</div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>État de la dent</div>
        <div className="status-grid">
          <button className="status-opt" aria-pressed={manual === ''} disabled={busy} onClick={() => save('', note, 'État automatique')}
            title="L'état suit les actes enregistrés">
            <i style={{ borderColor: '#94a3b8', borderStyle: 'dashed' }} />Selon les actes
          </button>
          {STATUS_ORDER.map((key) => (
            <button key={key} className="status-opt" aria-pressed={manual === key} disabled={busy} onClick={() => save(key, note, `Dent ${tooth} : ${STATUS[key].label.toLowerCase()}`)}>
              <i style={{ borderColor: STATUS[key].color, background: STATUS[key].soft }} />{STATUS[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="tooth-note">Remarque</label>
        <textarea id="tooth-note" className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Ex. sensible au froid, à surveiller, ancienne obturation…" />
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || note.trim() === saved.trim()}
          onClick={() => save(manual, note, 'Remarque enregistrée')}>Enregistrer la remarque</button>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Actes sur cette dent {state?.acts.length ? `(${state.acts.length})` : ''}</div>
        {state?.acts.length ? (
          <div className="tooth-acts">
            {[...state.acts].reverse().map((a) => (
              <div key={a.id} className="tooth-act">
                <div className="row-between"><b>{a.act}</b><span className="num muted">{money(a.quote)}</span></div>
                <div className="d">{fmtDate(a.treatmentDate)}</div>
                {a.notes && <div className="n">{a.notes}</div>}
              </div>
            ))}
          </div>
        ) : <div className="muted" style={{ fontSize: 13 }}>Aucun acte enregistré sur cette dent.</div>}
      </div>

      <button className="btn" onClick={() => onAddAct(tooth)}><Plus /> Ajouter un acte sur la {tooth}</button>
    </aside>
  );
};

export default ToothPanel;
