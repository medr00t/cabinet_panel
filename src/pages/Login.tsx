import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import Logo from '../components/ui/Logo';
import { errorMessage, login } from '../services/api';
import ViewControls from '../components/ViewControls';
import { useUser } from '../contexts/UserContext';

const Login = () => {
  const { signIn } = useUser();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  // The code lives in a ref as well as in state: digits typed faster than a re-render must not be lost.
  const codeRef = useRef('');
  const setPin = useCallback((next: string) => { codeRef.current = next; setCode(next); }, []);

  const attempt = useCallback(async (pin: string) => {
    setBusy(true);
    setError('');
    try {
      signIn(await login(pin));
    } catch (e) {
      const msg = errorMessage(e);
      setError(/code invalide/i.test(msg) ? 'Code incorrect'
        : /base de données|connexion/i.test(msg) ? 'Le serveur ne répond pas. Vérifiez que le poste du serveur est allumé.' : msg);
      setShake(true);
      window.setTimeout(() => { setShake(false); setPin(''); }, 380);
    } finally {
      setBusy(false);
    }
  }, [setPin, signIn]);

  const press = useCallback((digit: string) => {
    if (busy) return;
    const next = (codeRef.current + digit).slice(0, 4);
    setPin(next);
    setError('');
    if (next.length === 4) attempt(next);
  }, [attempt, busy, setPin]);

  // keyboard entry (not while typing in the server field or the answer field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin(codeRef.current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, setPin]);

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand">
          <Logo size={46} />
          <div className="brand-name"><b>Centre Dentaire</b>Riad El Ansari</div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Logo size={150} className="login-seal" />
          <h2>Le dossier de chaque patient, au même endroit.</h2>
          <p>Actes, devis, paiements et rendez-vous, partagés en temps réel entre la réception et le cabinet.</p>
        </div>
        <small>Meknès</small>
      </div>

      <div className="login-panel">
        <div className="login-box">
          {(
            <>
              <h1>Connexion</h1>
              <p className="sub">Saisissez votre code à 4 chiffres.</p>
              <div className={`pin ${shake ? 'shake' : ''}`} aria-label={`${code.length} chiffres saisis sur 4`}>
                {[0, 1, 2, 3].map((i) => <i key={i} className={i < code.length ? 'on' : ''} />)}
              </div>
              <div style={{ minHeight: 22, textAlign: 'center', marginBottom: 14 }}>
                {error ? <span className="error" style={{ color: 'var(--bad)', fontSize: 13, fontWeight: 500, display: 'block', wordBreak: 'break-word' }}>{error}</span>
                  : busy ? <span className="muted" style={{ fontSize: 13 }}>Connexion…</span> : null}
              </div>
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                  <button key={k} type="button" className="key" onClick={() => press(k)} disabled={busy}>{k}</button>
                ))}
                <button type="button" className="key fn" onClick={() => setPin('')} disabled={busy || !code}>Effacer</button>
                <button type="button" className="key" onClick={() => press('0')} disabled={busy}>0</button>
                <button type="button" className="key fn" onClick={() => setPin(codeRef.current.slice(0, -1))} disabled={busy || !code} aria-label="Supprimer"><Delete size={20} /></button>
              </div>

              <div className="login-foot"><ViewControls /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
