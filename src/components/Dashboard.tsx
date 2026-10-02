import { Users, Calendar, Clock, CheckCircle } from 'lucide-react';
import { Patient, Appointment } from '../services/database';
import { TabType } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getTodayISO } from '../utils/helpers';

interface DashboardProps {
  patients: Patient[];
  appointments: Appointment[];
  onNavigate: (tab: TabType) => void;
}

const Dashboard = ({ patients, appointments, onNavigate }: DashboardProps) => {
  // Calculate stats
  const totalPatients = patients.length;
  const todayISO = getTodayISO();
  const todayAppointments = appointments.filter(apt => 
    apt.date === todayISO
  );
  const pendingAppointments = appointments.filter(apt => apt.status === 'programmé');
  const completedToday = appointments.filter(apt => 
    apt.date === todayISO && apt.status === 'terminé'
  );

  const stats = [
    {
      title: 'Total Patients',
      value: totalPatients,
      icon: Users,
      color: 'blue',
      onClick: () => onNavigate('patients')
    },
    {
      title: 'RDV Aujourd\'hui',
      value: todayAppointments.length,
      icon: Calendar,
      color: 'green',
      onClick: () => onNavigate('appointments')
    },
    {
      title: 'RDV en Attente',
      value: pendingAppointments.length,
      icon: Clock,
      color: 'yellow',
      onClick: () => onNavigate('appointments')
    },
    {
      title: 'Terminés Aujourd\'hui',
      value: completedToday.length,
      icon: CheckCircle,
      color: 'purple',
      onClick: () => onNavigate('appointments')
    }
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'green':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'yellow':
        return 'bg-yellow-50 border-yellow-200 text-yellow-700';
      case 'purple':
        return 'bg-purple-50 border-purple-200 text-purple-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  // Get recent appointments (next 5)
  const recentAppointments = appointments
    .filter(apt => new Date(apt.date) >= new Date())
    .sort((a, b) => new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Bienvenue au Centre Dentaire Riad El Ansari
        </h1>
        <p className="text-gray-600">
          {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            onClick={stat.onClick}
            className={`p-6 rounded-lg border-2 cursor-pointer hover:shadow-md transition-shadow ${getColorClasses(stat.color)}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-75">{stat.title}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
              </div>
              <stat.icon className="h-8 w-8 opacity-75" />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Appointments */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Rendez-vous d'Aujourd'hui
          </h3>
          {todayAppointments.length > 0 ? (
            <div className="space-y-3">
              {todayAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{appointment.patientName}</p>
                    <p className="text-sm text-gray-600">{appointment.treatmentType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{appointment.time}</p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                      appointment.status === 'terminé' ? 'bg-green-100 text-green-800' :
                      appointment.status === 'confirmé' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {appointment.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Aucun rendez-vous aujourd'hui</p>
          )}
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Prochains Rendez-vous
          </h3>
          {recentAppointments.length > 0 ? (
            <div className="space-y-3">
              {recentAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{appointment.patientName}</p>
                    <p className="text-sm text-gray-600">{appointment.treatmentType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(appointment.date), 'dd/MM', { locale: fr })}
                    </p>
                    <p className="text-xs text-gray-600">{appointment.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Aucun rendez-vous à venir</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions Rapides</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('patients')}
            className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left"
          >
            <Users className="h-6 w-6 text-blue-600 mb-2" />
            <h4 className="font-medium text-blue-900">Ajouter un Patient</h4>
            <p className="text-sm text-blue-700">Créer un nouveau dossier patient</p>
          </button>
          <button
            onClick={() => onNavigate('appointments')}
            className="p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left"
          >
            <Calendar className="h-6 w-6 text-green-600 mb-2" />
            <h4 className="font-medium text-green-900">Programmer un RDV</h4>
            <p className="text-sm text-green-700">Planifier un nouveau rendez-vous</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;