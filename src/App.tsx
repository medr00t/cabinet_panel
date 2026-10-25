import { useEffect, useRef, useState } from 'react';
import { CalendarDays, FileSpreadsheet, LayoutDashboard, LogOut, Users, Wallet } from 'lucide-react';
import Logo from './components/ui/Logo';
import { DataProvider, useData } from './contexts/DataContext';
import { NavProvider, Route, useNav } from './contexts/NavContext';
import { useUser } from './contexts/UserContext';
import { useToast } from './contexts/ToastContext';
import { errorMessage, exportBackup, getServerHost } from './services/api';
import { today } from './utils/format';
import BackupDialog from './components/BackupDialog';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import { setupStatus } from './services/api';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientFile from './pages/PatientFile';
import Agenda from './pages/Agenda';
import Caisse from './pages/Caisse';
import './styles/theme.css';
import './styles/ui.css';
import './styles/app.css';

const NAV: { page: Route['page']; label: string; icon: typeof Users }[] = [
  { page: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { page: 'patients', label: 'Patients', icon: Users },
  { page: 'agenda', label: 'Rendez-vous', icon: CalendarDays },
  { page: 'caisse', label: 'Caisse', icon: Wallet },
];

const Shell = () => {
  const { user, signOut, isDoctor } = useUser();
  const { route, go } = useNav();
  const { appointments, error } = useData();
  const toast = useToast();
  const [backingUp, setBackingUp] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  // Excel backup on the doctor's machine: automatically after each login, and on demand.
  const backup = async (automatic: boolean) => {
    setBackingUp(true);
    try {
      const r = await exportBackup(!automatic);
      toast.success(automatic ? 'Sauvegarde Excel du mois mise à jour' : 'Sauvegarde Excel complète terminée',
        `${r.newPatients} nouveau${r.newPatients > 1 ? 'x' : ''} patient${r.newPatients > 1 ? 's' : ''} ce mois, ${r.treatments} actes → ${r.path}`);
    } catch (e) {
      toast.error('Sauvegarde Excel impossible', errorMessage(e));
    } finally {
      setBackingUp(false);
    }
  };
  const autoBackupDone = useRef(false);
  useEffect(() => {
    if (isDoctor && !autoBackupDone.current) { autoBackupDone.current = true; backup(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDoctor]);

  const todayCount = appointments.filter((a) => a.date === today() && (a.status === 'programmé' || a.status === 'confirmé')).length;
  const activePage = route.page === 'patient' ? 'patients' : route.page;
  const host = getServerHost();

  const open = (page: Route['page']) => {
    if (page === 'agenda') go({ page: 'agenda' });
    else if (page === 'dashboard' || page === 'patients' || page === 'caisse') go({ page });
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={46} />
          <div className="brand-name"><b>Centre Dentaire</b>Riad El Ansari</div>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          <div className="nav-label">Cabinet</div>
          {NAV.map(({ page, label, icon: Icon }) => (
            <button key={page} className="nav-item" aria-current={activePage === page ? 'page' : undefined} onClick={() => open(page)}>
              <Icon /> {label}
              {page === 'agenda' && todayCount > 0 && <span className="pill">{todayCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="server-line">
            <span className={`dot ${error ? 'off' : ''}`} />
            {error ? 'Serveur injoignable' : `Connecté · ${host === 'localhost' ? 'ce poste' : host}`}
          </div>
          <div className="me">
            <span className="avatar">{(user?.name ?? '?').replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase()}</span>
            <div>
              <div className="me-name">{user?.name}</div>
              <div className="me-role">{isDoctor ? 'Docteur' : 'Réception'}</div>
            </div>
          </div>
          {isDoctor && (
            <button className="logout" onClick={() => setBackupOpen(true)} disabled={backingUp} title="Sauvegardes Excel : sauvegarder maintenant ou restaurer">
              <FileSpreadsheet /> {backingUp ? 'Sauvegarde…' : 'Sauvegarde Excel'}
            </button>
          )}
          <button className="logout" onClick={signOut}><LogOut /> Se déconnecter</button>
        </div>
      </aside>
      {backupOpen && <BackupDialog onClose={() => setBackupOpen(false)} />}
      <main className="main">
        {route.page === 'dashboard' && <Dashboard />}
        {route.page === 'patients' && <Patients />}
        {route.page === 'patient' && <PatientFile patientId={route.patientId} />}
        {route.page === 'agenda' && <Agenda initialDate={route.date} />}
        {route.page === 'caisse' && <Caisse />}
      </main>
    </div>
  );
};

const App = () => {
  const { user } = useUser();
  // 'wizard' on a laptop that was never set up, or when the login screen asks to reconfigure
  const [setup, setSetup] = useState<'checking' | 'wizard' | 'done'>('checking');
  useEffect(() => {
    setupStatus().then((s) => setSetup(s.configExists ? 'done' : 'wizard')).catch(() => setSetup('done'));
  }, []);
  if (setup === 'checking') return null;
  if (setup === 'wizard') return <SetupWizard onDone={() => setSetup('done')} />;
  if (!user) return <Login onReconfigure={() => setSetup('wizard')} />;
  return (
    <DataProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </DataProvider>
  );
};

export default App;
