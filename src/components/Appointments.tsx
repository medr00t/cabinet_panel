import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Appointment, Patient, addAppointment, updateAppointment, deleteAppointment, updateAppointmentStatus, Payment, getPaymentsByDate } from '../services/database';
import { 
  getTimeSlots, 
  formatTime, 
  getPatientFullName
} from '../utils/helpers';
import SimpleAppointmentForm from './SimpleAppointmentForm';
import QuickPaymentForm from './QuickPaymentForm';
import PaymentDetailsModal from './PaymentDetailsModal';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';

interface AppointmentsProps {
  appointments: Appointment[];
  patients: Patient[];
  onUpdateAppointments: (appointments: Appointment[]) => void;
  onReloadData: () => Promise<void>;
}

const Appointments = ({ 
  appointments, 
  patients, 
  onReloadData
}: AppointmentsProps) => {
  const { user } = useUser();
  const { showSuccess, showError } = useToast();
  const isDoctor = user?.role === 'doctor';
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [paymentFormAppointment, setPaymentFormAppointment] = useState<{
    appointment: Appointment;
    patient: Patient;
  } | null>(null);
  const [appointmentPayments, setAppointmentPayments] = useState<Record<number, Payment[]>>({});
  const [viewingPayments, setViewingPayments] = useState<{
    appointment: Appointment;
    patient: Patient;
    payments: Payment[];
  } | null>(null);

  const timeSlots = getTimeSlots();

  // Load payments for appointments
  const loadPaymentsForDate = async (date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const payments = await getPaymentsByDate(dateStr);
      
      // Group payments by appointment ID
      const paymentsByAppointment: Record<number, Payment[]> = {};
      payments.forEach(payment => {
        if (payment.appointmentId) {
          if (!paymentsByAppointment[payment.appointmentId]) {
            paymentsByAppointment[payment.appointmentId] = [];
          }
          paymentsByAppointment[payment.appointmentId].push(payment);
        }
      });
      
      setAppointmentPayments(paymentsByAppointment);
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  };

  // Check if appointment has payments
  const getAppointmentPaymentStatus = (appointmentId: number) => {
    const payments = appointmentPayments[appointmentId] || [];
    if (payments.length === 0) return null;
    
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      totalPaid,
      paymentCount: payments.length,
      payments
    };
  };
  
  const getWeekDays = () => {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    return eachDayOfInterval({ start, end });
  };

  // Load payments when current date changes
  useEffect(() => {
    if (viewMode === 'week') {
      const weekDays = getWeekDays();
      weekDays.forEach(day => loadPaymentsForDate(day));
    } else {
      loadPaymentsForDate(currentDate);
    }
  }, [currentDate, viewMode]);

  // Reload payments when appointments are updated
  useEffect(() => {
    if (viewMode === 'week') {
      const weekDays = getWeekDays();
      weekDays.forEach(day => loadPaymentsForDate(day));
    } else {
      loadPaymentsForDate(currentDate);
    }
  }, [appointments]);

  const getDayAppointments = (date: Date) => {
    return appointments.filter(apt => isSameDay(new Date(apt.date), date));
  };

  const handleAddAppointment = (date?: Date, time?: string) => {
    setEditingAppointment(null);
    setSelectedDate(date || new Date());
    setSelectedTimeSlot(time || '');
    setIsFormOpen(true);
  };

  const handleEditAppointment = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setIsFormOpen(true);
  };

  const handleSaveAppointment = async (appointmentData: Omit<Appointment, 'id'>) => {
    console.log('[DEBUG] handleSaveAppointment called with:', JSON.stringify(appointmentData, null, 2));
    try {
      if (editingAppointment && editingAppointment.id) {
        // Update existing appointment
        console.log('[DEBUG] Updating existing appointment:', editingAppointment.id);
        await updateAppointment(editingAppointment.id, appointmentData);
        showSuccess(
          'Rendez-vous modifié',
          `Le rendez-vous a été mis à jour avec succès`
        );
      } else {
        // Add new appointment
        console.log('[DEBUG] Adding new appointment');
        const newAppointmentId = await addAppointment(appointmentData);
        console.log('[DEBUG] New appointment ID returned:', newAppointmentId);
        showSuccess(
          'Rendez-vous ajouté',
          `Nouveau rendez-vous créé avec succès (ID: ${newAppointmentId})`
        );
      }
      
      // Reload data from database
      console.log('[DEBUG] Reloading data...');
      await onReloadData();
      console.log('[DEBUG] Data reloaded successfully');
      
      setIsFormOpen(false);
      setEditingAppointment(null);
    } catch (error) {
      console.error('[ERROR] Failed to save appointment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showError(
        'Erreur de sauvegarde',
        `Impossible de sauvegarder le rendez-vous: ${errorMessage}`
      );
    }
  };

  const handleDeleteAppointment = async (appointmentId: number) => {
    const appointment = appointments.find(apt => apt.id === appointmentId);
    
    // Role-based restriction: only doctors can delete completed appointments
    if (appointment?.status === 'terminé' && !isDoctor) {
      showError(
        'Action non autorisée',
        'Seul le docteur peut supprimer des rendez-vous terminés.'
      );
      return;
    }
    
    // Prevent deletion of completed appointments without confirmation
    if (appointment?.status === 'terminé') {
      showError(
        'Suppression impossible',
        'Impossible de supprimer un rendez-vous terminé. Les rendez-vous terminés sont protégés pour des raisons de traçabilité.'
      );
      return;
    }

    if (confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) {
      try {
        await deleteAppointment(appointmentId);
        showSuccess(
          'Rendez-vous supprimé',
          'Le rendez-vous a été supprimé avec succès'
        );
        await onReloadData();
      } catch (error) {
        console.error('Failed to delete appointment:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        showError(
          'Erreur de suppression',
          `Impossible de supprimer le rendez-vous: ${errorMessage}`
        );
      }
    }
  };

  const handleStatusUpdate = async (appointmentId: number, newStatus: string) => {
    // Role-based restriction: only doctors can change appointment status to cancelled
    if (!isDoctor && newStatus === 'annulé') {
      showError(
        'Action non autorisée',
        'Seul le docteur peut annuler des rendez-vous.'
      );
      return;
    }
    
    try {
      // If the status is being set to 'terminé', show payment form first
      if (newStatus === 'terminé') {
        const appointment = appointments.find(apt => apt.id === appointmentId);
        const patient = patients.find(p => p.id === appointment?.patientId);
        
        if (appointment && patient) {
          // Close the appointment form modal first
          setIsFormOpen(false);
          setEditingAppointment(null);
          // Then show payment form
          setPaymentFormAppointment({ appointment, patient });
          return; // Don't update status yet, wait for payment form completion
        }
      }
      
      await updateAppointmentStatus(appointmentId, newStatus);
      await onReloadData();
      
      const statusMessages = {
        'programmé': 'Rendez-vous programmé',
        'confirmé': 'Rendez-vous confirmé',
        'en cours': 'Rendez-vous en cours',
        'terminé': 'Rendez-vous terminé',
        'annulé': 'Rendez-vous annulé'
      };
      
      showSuccess(
        'Statut mis à jour',
        statusMessages[newStatus as keyof typeof statusMessages] || `Statut changé vers: ${newStatus}`
      );
      
      // Close the appointment form modal after status update
      setIsFormOpen(false);
      setEditingAppointment(null);
    } catch (error) {
      console.error('Failed to update appointment status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showError(
        'Erreur de mise à jour',
        `Impossible de mettre à jour le statut: ${errorMessage}`
      );
    }
  };

  const handlePaymentComplete = async () => {
    try {
      if (paymentFormAppointment) {
        // Update appointment status to 'terminé' after payment is recorded
        await updateAppointmentStatus(paymentFormAppointment.appointment.id!, 'terminé');
        await onReloadData();
        showSuccess(
          'Paiement enregistré',
          'Le paiement a été enregistré et le rendez-vous est maintenant terminé'
        );
      }
    } catch (error) {
      console.error('Failed to update appointment status after payment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showError(
        'Erreur de finalisation',
        `Impossible de finaliser le rendez-vous: ${errorMessage}`
      );
    } finally {
      setPaymentFormAppointment(null);
    }
  };

  const handlePaymentCancel = () => {
    setPaymentFormAppointment(null);
  };

  const handleViewPaymentDetails = (appointment: Appointment, patient: Patient) => {
    const paymentStatus = appointment.id ? getAppointmentPaymentStatus(appointment.id) : null;
    if (paymentStatus) {
      setViewingPayments({
        appointment,
        patient,
        payments: paymentStatus.payments
      });
    } else {
      // No payments, open regular appointment edit
      handleEditAppointment(appointment);
    }
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="grid grid-cols-8 bg-gray-50 border-b">
          <div className="p-4 border-r border-gray-200">
            <span className="text-sm font-medium text-gray-600">Time</span>
          </div>
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="p-4 text-center border-r border-gray-200">
              <div className="text-sm font-medium text-gray-900">
                {format(day, 'EEE')}
              </div>
              <div className="text-lg font-bold text-gray-700">
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {timeSlots.map((time) => (
            <div key={time} className="grid grid-cols-8 border-b border-gray-100 min-h-[60px]">
              <div className="p-2 border-r border-gray-200 bg-gray-50 flex items-center">
                <span className="text-sm text-gray-600">{formatTime(time)}</span>
              </div>
              {weekDays.map((day) => {
                const dayAppointments = getDayAppointments(day).filter(apt => apt.time === time);
                return (
                  <div 
                    key={`${day.toISOString()}-${time}`} 
                    className="p-1 border-r border-gray-200 relative cursor-pointer hover:bg-gray-50"
                    onClick={() => handleAddAppointment(day, time)}
                  >
                    {dayAppointments.map((appointment) => {
                      const patient = patients.find(p => p.id === appointment.patientId);
                      return (
                        <div
                          key={appointment.id}
                          className="text-xs p-1 rounded mb-1 bg-blue-500 group relative"
                        >
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAppointment(appointment);
                            }}
                            className="cursor-pointer"
                          >
                            <div className="text-white font-medium">
                              {patient ? getPatientFullName(patient) : 'Patient Inconnu'}
                            </div>
                            <div className="text-white opacity-90">
                              {appointment.notes ? appointment.notes.substring(0, 20) + '...' : 'Rendez-vous'}
                            </div>
                            <div className="text-white opacity-75 text-xs">
                              {appointment.status}
                            </div>
                          </div>
                          
                          {/* Quick Action Buttons */}
                          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded shadow-lg p-1 flex flex-col gap-1 z-10">
                            {appointment.status !== 'terminé' && isDoctor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleStatusUpdate(appointment.id, 'terminé');
                                }}
                                className="text-xs px-1 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                                title="Marquer comme terminé"
                              >
                                ✓
                              </button>
                            )}
                            {appointment.status !== 'annulé' && isDoctor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleStatusUpdate(appointment.id, 'annulé');
                                }}
                                className="text-xs px-1 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                                title="Annuler"
                              >
                                ✕
                              </button>
                            )}
                            {((appointment.status !== 'terminé') || (appointment.status === 'terminé' && isDoctor)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleDeleteAppointment(appointment.id);
                                }}
                                className="text-xs px-1 py-0.5 bg-gray-500 text-white rounded hover:bg-gray-600"
                                title="Supprimer"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayAppointments = getDayAppointments(currentDate);
    
    return (
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            {format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })}
          </h3>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {timeSlots.map((time) => {
            const timeAppointments = dayAppointments.filter(apt => apt.time === time);
            return (
              <div key={time} className="flex border-b border-gray-100 min-h-[60px]">
                <div className="w-24 p-4 bg-gray-50 border-r border-gray-200 flex items-center">
                  <span className="text-sm text-gray-600">{formatTime(time)}</span>
                </div>
                <div 
                  className="flex-1 p-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleAddAppointment(currentDate, time)}
                >
                  {timeAppointments.map((appointment) => {
                    const patient = patients.find(p => p.id === appointment.patientId);
                    const paymentStatus = appointment.id ? getAppointmentPaymentStatus(appointment.id) : null;
                    
                    return (
                      <div
                        key={appointment.id}
                        className={`p-3 rounded-lg mb-2 group relative ${
                          appointment.status === 'terminé' 
                            ? paymentStatus 
                              ? 'bg-green-500' // Completed with payment
                              : 'bg-orange-500'  // Completed no payment yet
                            : appointment.status === 'annulé' 
                              ? 'bg-red-500' 
                              : 'bg-blue-500'
                        }`}
                      >
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (patient) {
                              handleViewPaymentDetails(appointment, patient);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <div className="text-white">
                            <div className="font-medium flex items-center justify-between">
                              <span>{patient ? getPatientFullName(patient) : 'Patient Inconnu'}</span>
                              {paymentStatus && (
                                <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded" title={`Payé: ${paymentStatus.totalPaid.toFixed(2)} MAD (${paymentStatus.paymentCount} paiement(s))`}>
                                  💰 {paymentStatus.totalPaid.toFixed(0)} MAD
                                </span>
                              )}
                            </div>
                            <div className="text-sm opacity-90">
                              {appointment.notes || 'Rendez-vous'}
                            </div>
                            <div className="text-sm opacity-75 font-medium flex items-center justify-between">
                              <span>Statut: {appointment.status}</span>
                              {appointment.status === 'terminé' && !paymentStatus && (
                                <span className="text-xs bg-yellow-500 bg-opacity-70 px-1 rounded">
                                  Paiement manquant
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Status Management Buttons */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex gap-1">
                            {appointment.status !== 'terminé' && isDoctor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleStatusUpdate(appointment.id, 'terminé');
                                }}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                title="Marquer comme terminé"
                              >
                                Terminé
                              </button>
                            )}
                            {appointment.status !== 'manqué' && appointment.status !== 'terminé' && isDoctor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleStatusUpdate(appointment.id, 'manqué');
                                }}
                                className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                                title="Marquer comme manqué"
                              >
                                Manqué
                              </button>
                            )}
                            {appointment.status !== 'annulé' && isDoctor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleStatusUpdate(appointment.id, 'annulé');
                                }}
                                className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                title="Annuler"
                              >
                                Annuler
                              </button>
                            )}
                            {((appointment.status !== 'terminé') || (appointment.status === 'terminé' && isDoctor)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (appointment.id) handleDeleteAppointment(appointment.id);
                                }}
                                className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                                title="Supprimer"
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Rendez-vous</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                viewMode === 'day' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Jour
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                viewMode === 'week' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Semaine
            </button>
          </div>
          <button
            onClick={() => handleAddAppointment()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>Nouveau Rendez-vous</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setCurrentDate(viewMode === 'day' ? subDays(currentDate, 1) : subDays(currentDate, 7))}
            className="p-2 text-gray-600 hover:text-gray-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">
            {viewMode === 'week' 
              ? `Semaine du ${format(startOfWeek(currentDate), 'd MMM yyyy', { locale: fr })}`
              : format(currentDate, 'd MMMM yyyy', { locale: fr })
            }
          </h2>
          <button
            onClick={() => setCurrentDate(viewMode === 'day' ? addDays(currentDate, 1) : addDays(currentDate, 7))}
            className="p-2 text-gray-600 hover:text-gray-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => setCurrentDate(new Date())}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Aujourd'hui
        </button>
      </div>

      {/* Calendar View */}
      {viewMode === 'week' ? renderWeekView() : renderDayView()}

      {/* Appointment Statistics */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center space-x-3">
            <Calendar className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">Total Rendez-vous</p>
              <p className="text-xl font-bold text-gray-900">{appointments.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center space-x-3">
            <Clock className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-600">Rendez-vous Aujourd'hui</p>
              <p className="text-xl font-bold text-gray-900">
                {getDayAppointments(new Date()).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center space-x-3">
            <Filter className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-600">Programmés</p>
              <p className="text-xl font-bold text-gray-900">
                {appointments.filter(apt => apt.status === 'programmé').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-purple-500 rounded flex items-center justify-center">
              <span className="text-white text-sm font-bold">%</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">Taux de Réalisation</p>
              <p className="text-xl font-bold text-gray-900">
                {appointments.length > 0 
                  ? Math.round((appointments.filter(apt => apt.status === 'terminé').length / appointments.length) * 100)
                  : 0
                }%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Form Modal */}
      {isFormOpen && (
        <SimpleAppointmentForm
          appointment={editingAppointment}
          patients={patients}
          initialDate={selectedDate}
          initialTime={selectedTimeSlot}
          onSave={handleSaveAppointment}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingAppointment(null);
          }}
          onDelete={editingAppointment ? () => handleDeleteAppointment(editingAppointment.id!) : undefined}
          onStatusUpdate={handleStatusUpdate}
        />
      )}

      {/* Payment Form Modal */}
      {paymentFormAppointment && (
        <QuickPaymentForm
          appointmentId={paymentFormAppointment.appointment.id!}
          patientId={paymentFormAppointment.patient.id!}
          patientName={getPatientFullName(paymentFormAppointment.patient)}
          onClose={handlePaymentCancel}
          onPaymentAdded={handlePaymentComplete}
        />
      )}

      {/* Payment Details Modal */}
      {viewingPayments && (
        <PaymentDetailsModal
          appointment={viewingPayments.appointment}
          patient={viewingPayments.patient}
          payments={viewingPayments.payments}
          onClose={() => setViewingPayments(null)}
        />
      )}
    </div>
  );
};

export default Appointments;