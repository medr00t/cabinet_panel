import { useState, useEffect } from 'react';
import { Users, Calendar, LayoutDashboard, Menu, X, DollarSign } from 'lucide-react';
import { TabType } from './types';
import { getPatients, getAppointments, Patient, Appointment } from './services/database';
import { useUser } from './contexts/UserContext';
import Dashboard from './components/Dashboard';
import Patients from './components/Patients';
import Appointments from './components/Appointments';
import Financial from './components/Financial';
import Login from './components/Login';
import Header from './components/Header';
import ToastContainer from './components/ToastContainer';
import './App.css';

function App() {
  const { isAuthenticated, login } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize database and load data only when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const init = async () => {
        try {
          await loadData();
        } catch (error) {
          console.error('Failed to initialize app:', error);
        } finally {
          setLoading(false);
        }
      };
      init();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Disable right-click context menu globally
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const loadData = async () => {
    console.log('[DEBUG] App.loadData called');
    try {
      const [patientsData, appointmentsData] = await Promise.all([
        getPatients(),
        getAppointments()
      ]);
      console.log('[DEBUG] Loaded patients:', patientsData.length);
      console.log('[DEBUG] Loaded appointments:', appointmentsData.length, appointmentsData);
      setPatients(patientsData as Patient[]);
      setAppointments(appointmentsData as Appointment[]);
    } catch (error) {
      console.error('[ERROR] Failed to load data:', error);
    }
  };

  const navigation = [
    {
      name: 'Tableau de Bord',
      icon: LayoutDashboard,
      tab: 'dashboard' as TabType,
      description: 'Vue d\'ensemble'
    },
    {
      name: 'Patients',
      icon: Users,
      tab: 'patients' as TabType,
      description: 'Gestion des patients'
    },
    {
      name: 'Rendez-vous',
      icon: Calendar,
      tab: 'appointments' as TabType,
      description: 'Planning'
    },
    {
      name: 'Finances',
      icon: DollarSign,
      tab: 'financial' as TabType,
      description: 'Gestion financière'
    }
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            patients={patients}
            appointments={appointments}
            onNavigate={setActiveTab}
          />
        );
      case 'patients':
        return (
          <Patients
            patients={patients}
            onReloadData={loadData}
          />
        );
      case 'appointments':
        return (
          <Appointments
            appointments={appointments}
            patients={patients}
            onUpdateAppointments={setAppointments}
            onReloadData={loadData}
          />
        );
      case 'financial':
        return <Financial />;
      default:
        return <div>Tab not found</div>;
    }
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  // Show loading only when authenticated but data is still loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }
 

  return (
    <div 
      className="flex h-screen bg-gray-100 overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300 flex flex-col shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 shrink-0 bg-blue-600 text-white">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white truncate">Centre Dentaire</h1>
                <h2 className="text-base font-semibold text-blue-100 truncate">Riad El Ansari</h2>
                <p className="text-xs text-blue-200 truncate">Système de Gestion</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-blue-100 hover:text-white rounded-lg hover:bg-blue-700 shrink-0 transition-colors"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => (
            <button
              key={item.tab}
              onClick={() => setActiveTab(item.tab)}
              className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-colors ${
                activeTab === item.tab
                  ? 'bg-blue-100 text-blue-700 border-r-4 border-blue-500'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={!sidebarOpen ? item.name : undefined}
            >
              <item.icon className="h-6 w-6 shrink-0" />
              {sidebarOpen && (
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 truncate">{item.description}</div>
                </div>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        {sidebarOpen && (
          <div className="p-4 border-t border-gray-200 shrink-0 bg-gray-50">
            <div className="text-xs text-gray-500 text-center">
              Centre Dentaire Riad El Ansari v2.0
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header with user info and logout */}
        <Header />
        
        {/* Page Title Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 md:px-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-800 truncate">
                {navigation.find(nav => nav.tab === activeTab)?.name}
              </h2>
              <p className="text-sm text-gray-600 truncate">
                {navigation.find(nav => nav.tab === activeTab)?.description}
              </p>
            </div>
            <div className="flex items-center space-x-4 shrink-0">
              <div className="text-sm text-gray-600 hidden md:block">
                {new Date().toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6">
          <div className="h-full">
            {renderActiveTab()}
          </div>
        </div>
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

export default App;
