import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Delete, ShieldCheck } from 'lucide-react';
import Logo from '../components/ui/Logo';
import {
  User, discoverServer, errorMessage, getServerHost, login, logout, setServerHost, verifyDoctorAnswer,
} from '../services/api';
import { useUser } from '../contexts/UserContext';

type ServerState = 'searching' | 'found' | 'missing';

const Login = ({ onReconfigure }: { onReconfigure?: () => void }) => {
  const { signIn } = useUser();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [pending, setPending] = useState<User | null>(null); // doctor waiting for the security answer
  const [answer, setAnswer] = useState('');
  const [host, setHost] = useState(getServerHost());
  const [server, setServer] = useState<ServerState>('searching');
  const [editHost, setEditHost] = useState(false);
  // The code lives in a ref as well as in state: digits typed faster than a re-render must not be lost.
  const codeRef = useRef('');
  const setPin = useCallback((next: string) => { codeRef.current = next; setCode(next); }, []);

  const findServer = useCallback(async (): Promise<string | null> => {
    setServer('searching');
    try {
      const found = await discoverServer();
      if (found) { setHost(found); setServer('found'); return found; }
    } catch { /* falls through to "missing" */ }
    setServer('missing');
    return null;
  }, []);

  useEffect(() => { findServer(); }, [findServer]);

  const attempt = useCallback(async (pin: string) => {
    setBusy(true);
    setError('');
    try {
      let user: User;
      try {
        user = await login(pin);
      } catch (first) {
        // wrong code is final; a database error may just mean the server moved, so look once more
        if (!/base de données|connexion/i.test(errorMessage(first))) throw first;
        const found = await findServer();
        if (!found) throw first;
        user = await login(pin);
      }
      if (user.role === 'doctor') { setPending(user); setPin(''); }
      else signIn(user);
    } catch (e) {
      const msg = errorMessage(e);
      // only a rejected code is "Code incorrect"; anything else (e.g. missing config file) shows its real reason
      setError(/access denied|1045/i.test(msg)
        ? 'Le serveur trouvé refuse le mot de passe du cabinet. Ce poste pointe peut-être vers un autre serveur : utilisez « Reconfigurer ce poste ».'
        : /base de données|connexion/i.test(msg)
        ? 'Impossible de joindre le serveur. Vérifiez que le poste du docteur est allumé.'
        : /code invalide/i.test(msg) ? 'Code incorrect' : msg);
      setShake(true);
      window.setTimeout(() => { setShake(false); setPin(''); }, 380);
    } finally {
      setBusy(false);
    }
  }, [findServer, setPin, signIn]);

  const press = useCallback((digit: string) => {
    if (busy || pending) return;
    const next = (codeRef.current + digit).slice(0, 4);
    setPin(next);
    setError('');
    if (next.length === 4) { setServerHost(host); attempt(next); }
  }, [attempt, busy, host, pending, setPin]);

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

  const verify = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      if (await verifyDoctorAnswer(answer)) signIn(pending);
      else setError('Réponse incorrecte');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelDoctor = () => { logout(); setPending(null); setAnswer(''); setError(''); };

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
          {pending ? (
            <>
              <h1>Vérification</h1>
              <p className="sub">Bonjour {pending.name}. Répondez à la question de sécurité pour continuer.</p>
              <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <label htmlFor="answer">Réponse de sécurité</label>
                  <input id="answer" className="input" type="password" autoFocus autoComplete="off" value={answer}
                    onChange={(e) => { setAnswer(e.target.value); setError(''); }} aria-invalid={!!error} />
                  {error && <span className="error">{error}</span>}
                </div>
                <button className="btn btn-block" type="submit" disabled={busy || !answer.trim()}><ShieldCheck /> Continuer</button>
                <button type="button" className="btn btn-ghost btn-block" onClick={cancelDoctor}><ArrowLeft /> Retour</button>
              </form>
            </>
          ) : (
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

              <div className="login-foot">
                {editHost ? (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); setServerHost(host); setEditHost(false); setServer('found'); }}>
                    <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10" autoFocus spellCheck={false} aria-label="Adresse du serveur" />
                    <button className="btn btn-secondary" type="submit">OK</button>
                  </form>
                ) : (
                  <div className="server-status">
                    <span className={`dot ${server === 'missing' ? 'off' : ''}`} style={server === 'searching' ? { background: '#f59e0b' } : undefined} />
                    <span>
                      {server === 'searching' ? 'Recherche du serveur…'
                        : server === 'found' ? <>Serveur : <b>{host === 'localhost' ? 'ce poste' : host}</b></>
                          : 'Serveur introuvable'}
                    </span>
                    {server === 'missing' && <button type="button" className="link" onClick={findServer}>Réessayer</button>}
                    <button type="button" className="link" onClick={() => setEditHost(true)}>Modifier</button>
                  </div>
                )}
                {onReconfigure && <button type="button" className="link" style={{ marginTop: 10 }} onClick={onReconfigure}>Reconfigurer ce poste</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
