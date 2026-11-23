import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Database, Eye, EyeOff, FileSpreadsheet, Laptop, Loader2, Network } from 'lucide-react';
import Logo from '../components/ui/Logo';
import {
  FoundBackup, Role, ServerInfo, ServerProgress, SetupStatus, clientCheck, errorMessage, onServerProgress, serverInstall,
  setServerHost, setupFindBackups, setupRestore, setupSaveConfig, setupStatus,
} from '../services/api';

type Step = 'mode' | 'who' | 'install' | 'backups' | 'client' | 'done';

/** First start of the app on a laptop: host the database here or connect to the one of another laptop. */
const SetupWizard = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState<Step>('mode');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [host, setHost] = useState(true);
  const [role, setRole] = useState<Role>('reception');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ServerProgress | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [backups, setBackups] = useState<FoundBackup[]>([]);
  const [restored, setRestored] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { setupStatus().then(setStatus).catch(() => {}); }, []);

  const validate = (): string => {
    if (!/^\d{4}$/.test(code)) return 'Le code doit contenir exactement 4 chiffres.';
    if (pass.length < 8) return 'Le mot de passe du cabinet doit faire au moins 8 caractères.';
    if (host && pass !== pass2) return 'Les deux mots de passe ne sont pas identiques.';
    return '';
  };

  const save = () => setupSaveConfig({ role, passphrase: pass, code, name: name.trim() || undefined }, true);

  const next = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError('');
    setBusy(true);
    try {
      if (!host) {
        setStep('client');
        const r = await clientCheck(pass, role);
        setCheck(r);
        if (r.ok && r.host) setServerHost(r.host);
        return;
      }
      if (status?.serverInstalled) { await serverInstall(pass); await save(); setStep('done'); return; }
      setStep('install');
      const stop = await onServerProgress(setProgress);
      try { setInfo(await serverInstall(pass)); } finally { stop(); }
      setServerHost('localhost');
      await save();
      const found = await setupFindBackups().catch(() => []);
      setBackups(found.filter((b) => b.restorable));
      setStep(found.some((b) => b.restorable) ? 'backups' : 'done');
    } catch (e) {
      setError(errorMessage(e));
      setStep('who');
    } finally {
      setBusy(false);
    }
  };

  const finishClient = async () => {
    setBusy(true);
    try { await save(); setStep('done'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const restore = async (b: FoundBackup) => {
    setBusy(true);
    setError('');
    try {
      const r = await setupRestore(b.path);
      setRestored(`${r.patients} patients, ${r.treatments} actes et ${r.payments} paiements restaurés depuis ${b.name}.`);
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doctorLabel = role === 'doctor';

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand">
          <Logo size={46} />
          <div className="brand-name"><b>Centre Dentaire</b>Riad El Ansari</div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Logo size={150} className="login-seal" />
          <h2>Installation de ce poste.</h2>
          <p>Quelques questions, puis tout est prêt : base de données, comptes et sauvegardes.</p>
        </div>
        <small>Meknès</small>
      </div>

      <div className="login-panel" style={{ overflowY: 'auto' }}>
        <div className="login-box" style={{ maxWidth: 440 }}>
          {step === 'mode' && (
            <>
              <h1>Bienvenue</h1>
              <p className="sub">Où sont gardées les données du cabinet ?</p>
              <div className="stack" style={{ gap: 12 }}>
                <button type="button" className={`choice ${host ? 'on' : ''}`} onClick={() => setHost(true)}>
                  <Database /><span><b>Ce poste garde la base de données</b>
                    <small>À choisir sur un seul poste (le premier installé). Il doit rester allumé pendant les heures du cabinet.</small></span>
                </button>
                <button type="button" className={`choice ${!host ? 'on' : ''}`} onClick={() => setHost(false)}>
                  <Network /><span><b>Ce poste se connecte à un autre poste</b>
                    <small>La base de données est déjà installée sur un autre ordinateur du cabinet : il sera trouvé tout seul.</small></span>
                </button>
                {status?.portBusy && host && <span className="error" style={{ color: 'var(--bad)', fontSize: 13 }}>Un autre programme de base de données utilise déjà le port 3306 sur ce poste.</span>}
                <button className="btn btn-block" onClick={() => setStep('who')}>Continuer <ArrowRight /></button>
              </div>
            </>
          )}

          {step === 'who' && (
            <>
              <h1>Ce poste</h1>
              <p className="sub">Qui utilise cet ordinateur ?</p>
              <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); next(); }}>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className={`choice small ${!doctorLabel ? 'on' : ''}`} onClick={() => setRole('reception')}><Laptop /><b>Réception</b></button>
                  <button type="button" className={`choice small ${doctorLabel ? 'on' : ''}`} onClick={() => setRole('doctor')}><Laptop /><b>Docteur</b></button>
                </div>
                <div className="field"><label htmlFor="sw-name">Nom affiché</label>
                  <input id="sw-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={doctorLabel ? 'Dr. El Ansari' : 'Réception Principale'} /></div>
                <div className="field"><label htmlFor="sw-code">Code de connexion (4 chiffres)</label>
                  <input id="sw-code" className="input" inputMode="numeric" maxLength={4} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                  <span className="hint">C'est le code tapé sur le clavier de l'écran de connexion.</span></div>
                <div className="field"><label htmlFor="sw-pass">Mot de passe du cabinet</label>
                  <input id="sw-pass" className="input" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
                  <span className="hint">{host ? 'Choisissez-le maintenant (8 caractères minimum) : le même sera demandé sur les autres postes.' : 'Le même que sur le poste qui garde la base de données.'}</span></div>
                {host && (
                  <div className="field"><label htmlFor="sw-pass2">Confirmer le mot de passe du cabinet</label>
                    <input id="sw-pass2" className="input" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></div>
                )}
                <button type="button" className="link" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />} {showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                </button>
                {error && <span className="error" style={{ color: 'var(--bad)', fontSize: 13, fontWeight: 500 }}>{error}</span>}
                <button className="btn btn-block" type="submit" disabled={busy}>{host ? (status?.serverInstalled ? 'Enregistrer' : 'Installer la base de données') : 'Chercher le serveur'} <ArrowRight /></button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => { setError(''); setStep('mode'); }}><ArrowLeft /> Retour</button>
              </form>
            </>
          )}

          {step === 'install' && (
            <>
              <h1>Installation en cours</h1>
              <p className="sub">Ne fermez pas l'application. Une connexion Internet est nécessaire une seule fois (environ 270 Mo).</p>
              <div className="stack" style={{ gap: 12 }}>
                <div className="bar"><i style={{ width: `${progress?.percent ?? 100}%`, opacity: progress?.percent == null ? .35 : 1 }} /></div>
                <div className="row"><Loader2 className="spin" size={16} /><span>{progress?.message ?? 'Démarrage…'}</span></div>
              </div>
            </>
          )}

          {step === 'backups' && (
            <>
              <h1>Sauvegardes trouvées</h1>
              <p className="sub">Des sauvegardes Excel du cabinet existent sur cet ordinateur. Voulez-vous retrouver vos patients ?</p>
              <div className="stack" style={{ gap: 10 }}>
                {backups.map((b) => (
                  <div key={b.path} className="found">
                    <FileSpreadsheet />
                    <span><b>{b.name}</b><small>{b.folder} · {b.modified} · {Math.round(b.size / 1024)} Ko</small></span>
                    <button className="btn btn-secondary" disabled={busy} onClick={() => restore(b)}>Restaurer</button>
                  </div>
                ))}
                {error && <span className="error" style={{ color: 'var(--bad)', fontSize: 13, fontWeight: 500 }}>{error}</span>}
                <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setStep('done')}>Commencer avec une base vide</button>
              </div>
            </>
          )}

          {step === 'client' && (
            <>
              <h1>Recherche du serveur</h1>
              <p className="sub">Le poste qui garde la base de données doit être allumé.</p>
              <div className="stack" style={{ gap: 12 }}>
                {!check ? <div className="row"><Loader2 className="spin" size={16} /><span>Recherche sur le réseau…</span></div> : (
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    {check.ok ? <CheckCircle2 color="var(--ok, #16a34a)" /> : null}<span>{check.message}</span>
                  </div>
                )}
                {error && <span className="error" style={{ color: 'var(--bad)', fontSize: 13, fontWeight: 500 }}>{error}</span>}
                {check?.ok && <button className="btn btn-block" disabled={busy} onClick={finishClient}>Terminer <ArrowRight /></button>}
                {check && !check.ok && <button className="btn btn-block" onClick={next}>Réessayer</button>}
                <button className="btn btn-ghost btn-block" onClick={() => { setCheck(null); setStep('who'); }}><ArrowLeft /> Retour</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <h1>Ce poste est prêt</h1>
              <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}><CheckCircle2 color="var(--ok, #16a34a)" /><span>{host ? 'La base de données est installée et démarre avec Windows.' : 'Ce poste est relié au serveur du cabinet.'}</span></div>
                {restored && <div className="row" style={{ alignItems: 'flex-start' }}><FileSpreadsheet /><span>{restored}</span></div>}
                {host && info?.address && <p className="muted" style={{ fontSize: 13 }}>Adresse de ce poste : {info.address}. Les autres postes la trouvent seuls ; si Windows demande d'autoriser le réseau, acceptez.</p>}
                <button className="btn btn-block" onClick={onDone}>Aller à la connexion <ArrowRight /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
