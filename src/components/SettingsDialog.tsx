import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import Modal from './ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useLoader } from '../hooks/useLoader';
import { changeDoctorLogin, errorMessage, getReceptionCode, setReceptionCode } from '../services/api';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/** Doctor only: own login code and security answer, and the reception code (shown, and changeable for them). */
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const toast = useToast();
  const reception = useLoader(() => getReceptionCode(), []);
  const [current, setCurrent] = useState('');
  const [newCode, setNewCode] = useState('');
  const [answer, setAnswer] = useState('');
  const [recCode, setRecCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'me' | 'rec' | null>(null);

  const saveMine = async () => {
    setBusy('me');
    try {
      await changeDoctorLogin(current, newCode, answer);
      toast.success('Modifié', 'Utilisez le nouveau code à la prochaine connexion.');
      setCurrent(''); setNewCode(''); setAnswer('');
    } catch (e) {
      toast.error('Modification impossible', errorMessage(e));
    } finally { setBusy(null); }
  };

  const saveReception = async () => {
    setBusy('rec');
    try {
      await setReceptionCode(recCode);
      toast.success('Code de la réception modifié', 'Valable dès sa prochaine connexion.');
      setRecCode('');
      await reception.reload();
    } catch (e) {
      toast.error('Modification impossible', errorMessage(e));
    } finally { setBusy(null); }
  };

  const mineReady = /^\d{4}$/.test(current) && (/^\d{4}$/.test(newCode) || answer.trim() !== '') && (newCode === '' || /^\d{4}$/.test(newCode));

  return (
    <Modal title="Paramètres" subtitle="Codes de connexion" onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
      <div className="stack" style={{ gap: 22 }}>
        <section className="stack" style={{ gap: 12 }}>
          <b>Mon code (docteur)</b>
          <div className="field"><label htmlFor="st-cur">Code actuel</label>
            <input id="st-cur" className="input" inputMode="numeric" type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} /></div>
          <div className="field"><label htmlFor="st-new">Nouveau code (4 chiffres)</label>
            <input id="st-new" className="input" inputMode="numeric" autoComplete="off" value={newCode} onChange={(e) => setNewCode(digits(e.target.value))} placeholder="laisser vide pour ne pas changer" /></div>
          <div className="field"><label htmlFor="st-ans">Nouvelle réponse de sécurité</label>
            <input id="st-ans" className="input" type="password" autoComplete="off" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="laisser vide pour ne pas changer" /></div>
          <div><button className="btn" onClick={saveMine} disabled={!mineReady || busy !== null}><KeyRound /> Enregistrer mon code</button></div>
          <span className="hint muted" style={{ fontSize: 12 }}>Ce changement s'applique à cet ordinateur.</span>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <b>Code de la réception</b>
          <div className="row">
            <span className="muted">Code actuel :</span>
            <b className="num" style={{ letterSpacing: show ? '.15em' : 0 }}>
              {reception.error ? '—' : reception.loading ? '…' : !reception.data ? 'pas encore enregistré' : show ? reception.data : '••••'}
            </b>
            {reception.data && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)} aria-label={show ? 'Masquer' : 'Afficher'}>{show ? <EyeOff /> : <Eye />}</button>}
          </div>
          <div className="field"><label htmlFor="st-rec">Nouveau code de la réception</label>
            <input id="st-rec" className="input" inputMode="numeric" autoComplete="off" value={recCode} onChange={(e) => setRecCode(digits(e.target.value))} /></div>
          <div><button className="btn" onClick={saveReception} disabled={!/^\d{4}$/.test(recCode) || busy !== null}><KeyRound /> Changer le code de la réception</button></div>
          <span className="hint muted" style={{ fontSize: 12 }}>Le poste de la réception demandera ce nouveau code à sa prochaine connexion, sans rien à refaire sur son ordinateur.</span>
        </section>
      </div>
    </Modal>
  );
};

export default SettingsDialog;
