import { CalendarDays, LayoutDashboard, LogOut, Users, Wallet } from 'lucide-react';
import BrandMark from './components/ui/BrandMark';
import { DataProvider, useData } from './contexts/DataContext';
import { NavProvider, Route, useNav } from './contexts/NavContext';
import { useUser } from './contexts/UserContext';
import { getServerHost } from './services/api';
import { today } from './utils/format';
import Login from './pages/Login';
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
          <div className="brand-mark"><BrandMark /></div>
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
          <button className="logout" onClick={signOut}><LogOut /> Se déconnecter</button>
        </div>
      </aside>
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
  if (!user) return <Login />;
  return (
    <DataProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </DataProvider>
  );
};

export default App;
