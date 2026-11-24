import { useState } from 'react';
import { Eye, EyeOff, KeyRound, UserPlus, UserX } from 'lucide-react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from '../contexts/ToastContext';
import { useLoader } from '../hooks/useLoader';
import { StaffMember, addStaff, changeDoctorLogin, errorMessage, getReceptionCode, listStaff, removeStaff, setReceptionCode } from '../services/api';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/** Doctor only: own login code and security answer, and the reception code (shown, and changeable for them). */
const SettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const toast = useToast();
  const reception = useLoader(() => getReceptionCode(), []);
  const [current, setCurrent] = useState('');
  const [newCode, setNewCode] = useState('');
  const [recCode, setRecCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'me' | 'rec' | 'staff' | null>(null);
  const staff = useLoader(() => listStaff(), []);
  const [staffName, setStaffName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const createStaff = async () => {
    setBusy('staff');
    try {
      await addStaff(staffName, staffCode);
      toast.success('Compte créé', `${staffName.trim()} peut se connecter avec son code.`);
      setStaffName(''); setStaffCode('');
      await staff.reload();
    } catch (e) {
      toast.error('Création impossible', errorMessage(e));
    } finally { setBusy(null); }
  };

  const saveMine = async () => {
    setBusy('me');
    try {
      await changeDoctorLogin(current, newCode);
      toast.success('Modifié', 'Utilisez le nouveau code à la prochaine connexion.');
      setCurrent(''); setNewCode('');
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

  const mineReady = /^\d{4}$/.test(current) && /^\d{4}$/.test(newCode);

  return (
    <Modal title="Paramètres" subtitle="Codes de connexion" onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
      <div className="stack" style={{ gap: 22 }}>
        <section className="stack" style={{ gap: 12 }}>
          <b>Mon code (docteur)</b>
          <div className="field"><label htmlFor="st-cur">Code actuel</label>
            <input id="st-cur" className="input" inputMode="numeric" type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} /></div>
          <div className="field"><label htmlFor="st-new">Nouveau code (4 chiffres)</label>
            <input id="st-new" className="input" inputMode="numeric" autoComplete="off" value={newCode} onChange={(e) => setNewCode(digits(e.target.value))} /></div>
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

        <section className="stack" style={{ gap: 12 }}>
          <b>Comptes de la réception</b>
          <span className="hint muted" style={{ fontSize: 12 }}>Un compte par personne : chacun se connecte avec son propre code et son nom apparaît sur les paiements qu'il encaisse.</span>
          {staff.error ? <div className="alert alert-bad">{staff.error}</div>
            : staff.loading ? <span className="muted">…</span>
              : (staff.data ?? []).length === 0 ? <span className="muted">Aucun compte pour l'instant.</span>
                : (
                  <div className="stack" style={{ gap: 6 }}>
                    {(staff.data ?? []).map((m) => (
                      <div key={m.id} className="row-between">
                        <span><b>{m.name}</b> <span className="muted num">· code {m.code}</span></span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemoving(m)}><UserX /> Retirer</button>
                      </div>
                    ))}
                  </div>
                )}
          <div className="field"><label htmlFor="st-sn">Nom</label>
            <input id="st-sn" className="input" autoComplete="off" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="ex. Nadia" /></div>
          <div className="field"><label htmlFor="st-sc">Code (4 chiffres)</label>
            <input id="st-sc" className="input" inputMode="numeric" autoComplete="off" value={staffCode} onChange={(e) => setStaffCode(digits(e.target.value))} /></div>
          <div><button className="btn" onClick={createStaff} disabled={!staffName.trim() || !/^\d{4}$/.test(staffCode) || busy !== null}><UserPlus /> Créer le compte</button></div>
        </section>
      </div>
      {removing && (
        <ConfirmDialog title="Retirer ce compte ?" confirmLabel="Retirer"
          message={`« ${removing.name} » ne pourra plus se connecter. Le compte n'est pas effacé : ses paiements et son historique restent dans le cabinet.`}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await removeStaff(removing.id);
              toast.success('Compte retiré', `${removing.name} ne peut plus se connecter.`);
              await staff.reload();
            } catch (e) {
              toast.error('Impossible de retirer le compte', errorMessage(e));
              throw e;
            }
          }} />
      )}
    </Modal>
  );
};

export default SettingsDialog;
