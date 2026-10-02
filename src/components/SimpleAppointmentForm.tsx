import { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, AlertTriangle, CheckCircle, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, Patient, getPatientAppointments, getPaymentsByDate } from '../services/database';
import { getTimeSlots } from '../utils/helpers';
import { useUser } from '../contexts/UserContext';
import QuickPaymentForm from './QuickPaymentForm';
import DateInput from './DateInput';

interface SimpleAppointmentFormProps {
  appointment?: Appointment | null;
  patients: Patient[];
  initialDate?: Date;
  initialTime?: string;
  onSave: (appointment: Omit<Appointment, 'id'>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onStatusUpdate?: (appointmentId: number, status: string) => void;
}

const SimpleAppointmentForm = ({ 
  appointment, 
  patients,
  initialDate,
  initialTime,
  onSave, 
  onCancel, 
  onDelete,
  onStatusUpdate
}: SimpleAppointmentFormProps) => {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    patientId: appointment?.patientId || 0,
    date: appointment?.date || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
    time: appointment?.time || initialTime || '09:00',
    treatmentType: appointment?.treatmentType || 'Consultation',
    status: appointment?.status || 'programmé',
    notes: appointment?.notes || ''
  });
  const [unpaidBalance, setUnpaidBalance] = useState<number>(0);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [unpaidAppointments, setUnpaidAppointments] = useState<number>(0);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAppointmentId, setPaymentAppointmentId] = useState<number | null>(null);

  const timeSlots = getTimeSlots();

  // Function to check for unpaid balances
  const checkUnpaidBalance = async (patientId: number) => {
    if (!patientId) {
      setUnpaidBalance(0);
      setUnpaidAppointments(0);
      return;
    }

    setIsCheckingBalance(true);
    try {
      // Get all appointments for this patient
      const appointments = await getPatientAppointments(patientId);
      
      let totalUnpaid = 0;
      let unpaidCount = 0;
      
      // Check each completed appointment for payments
      for (const apt of appointments) {
        if (apt.status === 'terminé' && apt.id) {
          try {
            // Get payments for the appointment date
            const paymentsForDate = await getPaymentsByDate(apt.date);
            const appointmentPayments = paymentsForDate.filter(payment => 
              payment.appointmentId === apt.id
            );
            
            const totalPaid = appointmentPayments.reduce((sum, payment) => sum + payment.amount, 0);
            
            // Estimate expected amount (same logic as in PatientFinancialModal)
            const expectedAmount = getExpectedAmount(apt.notes || '');
            const remainingBalance = Math.max(0, expectedAmount - totalPaid);
            
            if (remainingBalance > 0) {
              totalUnpaid += remainingBalance;
              unpaidCount++;
            }
          } catch (error) {
            console.error(`Failed to check payments for appointment ${apt.id}:`, error);
          }
        }
      }
      
      setUnpaidBalance(totalUnpaid);
      setUnpaidAppointments(unpaidCount);
    } catch (error) {
      console.error('Failed to check unpaid balance:', error);
      setUnpaidBalance(0);
      setUnpaidAppointments(0);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Simple function to estimate expected amount based on appointment notes
  const getExpectedAmount = (notes: string): number => {
    const notesLower = notes.toLowerCase();
    if (notesLower.includes('consultation')) return 150;
    if (notesLower.includes('nettoyage') || notesLower.includes('détartrage')) return 200;
    if (notesLower.includes('plombage') || notesLower.includes('carie')) return 300;
    if (notesLower.includes('extraction')) return 250;
    if (notesLower.includes('couronne')) return 800;
    if (notesLower.includes('implant')) return 1500;
    if (notesLower.includes('orthodontie')) return 500;
    if (notesLower.includes('blanchiment')) return 400;
    return 200; // Default consultation price
  };

  // Check unpaid balance when patient changes
  useEffect(() => {
    if (formData.patientId) {
      checkUnpaidBalance(formData.patientId);
    }
  }, [formData.patientId]);

  // Handle opening payment form for pending balance
  const handlePayPendingBalance = () => {
    if (formData.patientId && unpaidBalance > 0) {
      // Find the first unpaid appointment to use as the payment target
      getPatientAppointments(formData.patientId).then(appointments => {
        const unpaidAppointment = appointments.find(apt => {
          // Find completed appointments that might have pending payments
          return apt.status === 'terminé';
        });
        
        if (unpaidAppointment?.id) {
          setPaymentAppointmentId(unpaidAppointment.id);
          setShowPaymentForm(true);
        }
      }).catch(console.error);
    }
  };

  // Handle payment completion
  const handlePaymentAdded = () => {
    setShowPaymentForm(false);
    setPaymentAppointmentId(null);
    // Refresh the unpaid balance
    if (formData.patientId) {
      checkUnpaidBalance(formData.patientId);
    }
  };

  // Handle closing payment form
  const handlePaymentCancel = () => {
    setShowPaymentForm(false);
    setPaymentAppointmentId(null);
  };

  // Check if this appointment is completed and should be protected
  const isCompletedAppointment = appointment?.status === 'terminé';
  
  // Check user permissions for deleting appointments
  // Anyone can delete non-completed appointments, only doctors can delete completed appointments
  const canDeleteCompletedAppointment = user?.role === 'doctor';
  const canDeleteAppointment = !isCompletedAppointment || canDeleteCompletedAppointment;
  const shouldShowDeleteButton = onDelete && appointment && canDeleteAppointment;

  const getPatientFullName = (patient: Patient) => {
    return `${patient.firstName} ${patient.lastName}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent editing of completed appointments
    if (appointment && appointment.status === 'terminé') {
      alert('Impossible de modifier un rendez-vous terminé. Les rendez-vous terminés sont protégés pour des raisons de traçabilité.');
      return;
    }
    
    if (!formData.patientId) {
      alert('Veuillez sélectionner un patient');
      return;
    }
    onSave(formData);
  };

  // Add escape key handling
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onCancel]);

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div style={{zIndex:1000, marginTop: '35px' , marginBottom: '35px'}}
      className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-[1000] p-2 pt-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b border-gray-200 text-white ${
          isCompletedAppointment ? 'bg-green-600' : 'bg-blue-600'
        }`}>
          <div className="flex items-center space-x-3">
            <Calendar className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {isCompletedAppointment && !canDeleteCompletedAppointment ? 'Rendez-vous Terminé' : 
               appointment ? 'Modifier le Rendez-vous' : 'Nouveau Rendez-vous'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className={`transition-colors p-2 rounded ${
              isCompletedAppointment ? 'text-green-100 hover:text-white hover:bg-green-700' : 'text-blue-100 hover:text-white hover:bg-blue-700'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Protection Warning for Completed Appointments */}
          {isCompletedAppointment && !canDeleteCompletedAppointment && (
            <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-green-800">
                    Rendez-vous Terminé
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Ce rendez-vous est terminé. Consultation en mode lecture seule. 
                    Seul le docteur peut apporter des modifications.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Protection Warning for Doctor editing completed appointments */}
          {isCompletedAppointment && canDeleteCompletedAppointment && (
            <div className="p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-orange-400 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-orange-800">
                    Rendez-vous Terminé - Modification Docteur
                  </h3>
                  <p className="text-sm text-orange-700 mt-1">
                    Ce rendez-vous est terminé. Vous pouvez le modifier en tant que docteur, 
                    mais soyez prudent car cela peut affecter la traçabilité.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline h-4 w-4 mr-1" />
              Patient *
            </label>
            <select
              required
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.patientId}
              onChange={(e) => setFormData({...formData, patientId: parseInt(e.target.value)})}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              <option value="">Sélectionner un patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {getPatientFullName(patient)}
                </option>
              ))}
            </select>
            
            {/* Unpaid Balance Warning */}
            {formData.patientId && (isCheckingBalance ? (
              <div className="mt-2 text-sm text-gray-500">
                Vérification des paiements en attente...
              </div>
            ) : unpaidBalance > 0 ? (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-orange-800">
                    <AlertTriangle size={16} />
                    <span className="font-semibold">Attention: Paiements en attente</span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePayPendingBalance}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-md hover:bg-orange-700 transition-colors"
                  >
                    <CreditCard size={14} />
                    Payer Maintenant
                  </button>
                </div>
                <p className="text-sm text-orange-700 mt-1">
                  Ce patient a <strong>{unpaidBalance.toFixed(2)} MAD</strong> de solde impayé 
                  sur <strong>{unpaidAppointments}</strong> rendez-vous précédent{unpaidAppointments > 1 ? 's' : ''}.
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Considérez de régler les paiements en attente avant de programmer un nouveau rendez-vous.
                </p>
              </div>
            ) : formData.patientId && (
              <div className="mt-2 text-sm text-green-600">
                ✓ Aucun paiement en attente
              </div>
            ))}
          </div>

          {/* Treatment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type de Traitement *
            </label>
            <select
              required
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.treatmentType}
              onChange={(e) => setFormData({...formData, treatmentType: e.target.value})}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              <option value="Consultation">Consultation</option>
              <option value="Nettoyage">Nettoyage</option>
              <option value="Plombage">Plombage</option>
              <option value="Extraction">Extraction</option>
              <option value="Contrôle">Contrôle</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Date *
            </label>
            <DateInput
              required
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.date}
              onChange={(value) => setFormData({...formData, date: value})}
              className={`${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline h-4 w-4 mr-1" />
              Heure *
            </label>
            <select
              required
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.time}
              onChange={(e) => setFormData({...formData, time: e.target.value})}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Statut
            </label>
            <select
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              <option value="programmé">Programmé</option>
              <option value="confirmé">Confirmé</option>
              <option value="terminé">Terminé</option>
              <option value="manqué">Manqué</option>
              <option value="reporté">Reporté</option>
              <option value="annulé">Annulé</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={3}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="Notes sur le rendez-vous..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-start pt-6 border-t border-gray-200">
            <div className="flex flex-col space-y-3">
              {shouldShowDeleteButton && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-200 transition-all duration-200 shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Supprimer
                </button>
              )}
              {appointment && appointment.status === 'terminé' && !canDeleteCompletedAppointment && (
                <p className="text-sm text-orange-600 font-medium">
                   Rendez-vous terminé - Suppression réservée au docteur
                </p>
              )}
              {appointment && appointment.status === 'terminé' && canDeleteCompletedAppointment && (
                <p className="text-sm text-orange-600 font-medium">
                  Rendez-vous terminé et protégé
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {/* Mark as Completed Button */}
              {appointment && appointment.status !== 'terminé' && onStatusUpdate && (
                <button
                  type="button"
                  onClick={() => onStatusUpdate(appointment.id!, 'terminé')}
                  className="inline-flex items-center px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-200 transition-all duration-200 shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Marquer Terminé
                </button>
              )}
              
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 transition-all duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Annuler
              </button>
              
              <button
                type="submit"
                disabled={isCompletedAppointment && !canDeleteCompletedAppointment}
                className={`inline-flex items-center px-6 py-2.5 text-sm font-medium rounded-lg focus:ring-4 transition-all duration-200 shadow-sm ${
                  (isCompletedAppointment && !canDeleteCompletedAppointment)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed border border-gray-200' 
                    : isCompletedAppointment && canDeleteCompletedAppointment
                    ? 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200'
                }`}
              >
                {!(isCompletedAppointment && !canDeleteCompletedAppointment) && (
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={appointment ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 6v6m0 0v6m0-6h6m-6 0H6"} />
                  </svg>
                )}
                {(isCompletedAppointment && !canDeleteCompletedAppointment) ? 'Mode Lecture' :
                 appointment ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </form>
        </div>
      </div>
      
      {/* Payment Form Modal for Pending Balance */}
      {showPaymentForm && paymentAppointmentId && formData.patientId && (
        <QuickPaymentForm
          appointmentId={paymentAppointmentId}
          patientId={formData.patientId}
          patientName={patients.find(p => p.id === formData.patientId)?.firstName + ' ' + patients.find(p => p.id === formData.patientId)?.lastName || 'Patient'}
          unpaidBalance={unpaidBalance > 0 ? unpaidBalance : undefined}
          onClose={handlePaymentCancel}
          onPaymentAdded={handlePaymentAdded}
        />
      )}
    </div>
  );
};

export default SimpleAppointmentForm;