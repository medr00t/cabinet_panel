import React, { useState, useEffect } from 'react';
import { X, User, Calendar, AlertTriangle, CheckCircle, Clock, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Appointment, Patient, Payment, getPaymentsByDate, getPatientAppointments } from '../services/database';
import { getPatientFullName } from '../utils/helpers';
import QuickPaymentForm from './QuickPaymentForm';

interface PatientFinancialModalProps {
  patient: Patient;
  onClose: () => void;
  onScheduleAppointment?: () => void;
}

interface AppointmentWithPayments extends Appointment {
  payments: Payment[];
  totalPaid: number;
  expectedAmount: number; // This would ideally come from a treatment price system
  remainingBalance: number;
}

const PatientFinancialModal: React.FC<PatientFinancialModalProps> = ({
  patient,
  onClose,
  onScheduleAppointment
}) => {
  const [appointmentsWithPayments, setAppointmentsWithPayments] = useState<AppointmentWithPayments[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedAppointmentForPayment, setSelectedAppointmentForPayment] = useState<AppointmentWithPayments | null>(null);

  const loadPatientFinancialData = async () => {
    setIsLoading(true);
    try {
      // Get all appointments for this patient
      const appointments = await getPatientAppointments(patient.id!);
      
      // For each appointment, get payments (we'll need to load payments for the date range)
      const appointmentPromises = appointments.map(async (appointment) => {
        try {
          // Get payments for the appointment date
          const paymentsForDate = await getPaymentsByDate(appointment.date);
          const appointmentPayments = paymentsForDate.filter(payment => 
            payment.appointmentId === appointment.id
          );
          
          const totalPaid = appointmentPayments.reduce((sum, payment) => sum + payment.amount, 0);
          
          // Default expected amount (this should ideally come from a treatment pricing system)
          const expectedAmount = getExpectedAmount(appointment.notes || '');
          const remainingBalance = Math.max(0, expectedAmount - totalPaid);
          
          return {
            ...appointment,
            payments: appointmentPayments,
            totalPaid,
            expectedAmount,
            remainingBalance
          };
        } catch (error) {
          console.error(`Failed to load payments for appointment ${appointment.id}:`, error);
          return {
            ...appointment,
            payments: [],
            totalPaid: 0,
            expectedAmount: getExpectedAmount(appointment.notes || ''),
            remainingBalance: getExpectedAmount(appointment.notes || '')
          };
        }
      });
      
      const appointmentsWithPaymentData = await Promise.all(appointmentPromises);
      setAppointmentsWithPayments(appointmentsWithPaymentData);
      
      // Calculate total unpaid amount
      const totalUnpaidAmount = appointmentsWithPaymentData
        .filter(apt => apt.status === 'terminé')
        .reduce((sum, apt) => sum + apt.remainingBalance, 0);
      setTotalUnpaid(totalUnpaidAmount);
      
    } catch (error) {
      console.error('Failed to load patient financial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Simple function to estimate expected amount based on appointment notes
  // In a real system, this would come from a treatment pricing database
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
    // Default consultation price
    return 200;
  };

  const getStatusColor = (appointment: AppointmentWithPayments) => {
    if (appointment.status === 'terminé') {
      if (appointment.remainingBalance > 0) return 'text-orange-600 bg-orange-50';
      return 'text-green-600 bg-green-50';
    }
    if (appointment.status === 'annulé') return 'text-red-600 bg-red-50';
    return 'text-blue-600 bg-blue-50';
  };

  const getStatusIcon = (appointment: AppointmentWithPayments) => {
    if (appointment.status === 'terminé') {
      if (appointment.remainingBalance > 0) return <AlertTriangle size={16} className="text-orange-600" />;
      return <CheckCircle size={16} className="text-green-600" />;
    }
    if (appointment.status === 'annulé') return <X size={16} className="text-red-600" />;
    return <Clock size={16} className="text-blue-600" />;
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'especes': return '💵';
      case 'carte': return '💳';
      case 'cheque': return '📋';
      case 'virement': return '🏦';
      default: return '💰';
    }
  };

  useEffect(() => {
    loadPatientFinancialData();
  }, [patient.id]);

  const totalPaid = appointmentsWithPayments.reduce((sum, apt) => sum + apt.totalPaid, 0);
  const totalExpected = appointmentsWithPayments
    .filter(apt => apt.status === 'terminé')
    .reduce((sum, apt) => sum + apt.expectedAmount, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-lg shrink-0">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <User size={24} />
              Historique Financier
            </h2>
            <p className="text-indigo-100 text-lg mt-1">
              {getPatientFullName(patient)}
            </p>
            {totalUnpaid > 0 && (
              <div className="mt-2 flex items-center gap-2 bg-orange-500 bg-opacity-20 px-3 py-1 rounded-full">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">
                  Solde impayé: {totalUnpaid.toFixed(2)} MAD
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-600">Total Rendez-vous</h3>
              <p className="text-2xl font-bold text-gray-900">{appointmentsWithPayments.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-green-200">
              <h3 className="text-sm font-medium text-green-600">Total Payé</h3>
              <p className="text-2xl font-bold text-green-600">{totalPaid.toFixed(2)} MAD</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <h3 className="text-sm font-medium text-blue-600">Total Attendu</h3>
              <p className="text-2xl font-bold text-blue-600">{totalExpected.toFixed(2)} MAD</p>
            </div>
            <div className={`bg-white p-4 rounded-lg border ${totalUnpaid > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
              <h3 className={`text-sm font-medium ${totalUnpaid > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                Solde Restant
              </h3>
              <p className={`text-2xl font-bold ${totalUnpaid > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                {totalUnpaid.toFixed(2)} MAD
              </p>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {/* Content */}
          <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Chargement de l'historique financier...</p>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-800">
                  Historique des Rendez-vous et Paiements
                </h3>
                {onScheduleAppointment && (
                  <button
                    onClick={onScheduleAppointment}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      totalUnpaid > 0 
                        ? 'bg-orange-500 text-white hover:bg-orange-600' 
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {totalUnpaid > 0 && <AlertTriangle size={16} className="inline mr-2" />}
                    Nouveau RDV
                  </button>
                )}
              </div>

              {appointmentsWithPayments.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500 text-lg">Aucun rendez-vous trouvé</p>
                  <p className="text-gray-400">Ce patient n'a pas encore de rendez-vous enregistrés</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-700">Date</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Heure</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Traitement</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Statut</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Montant Attendu</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Payé</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Restant</th>
                        <th className="text-left p-4 font-semibold text-gray-700">Paiements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentsWithPayments
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((appointment) => (
                        <tr key={appointment.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="p-4">
                            <span className="font-medium">
                              {format(new Date(appointment.date), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="text-gray-600">{appointment.time}</span>
                          </td>
                          <td className="p-4">
                            <div className="text-sm">
                              <div className="font-medium text-gray-900">{appointment.treatmentType}</div>
                              <div className="text-gray-500 text-xs">
                                {appointment.notes ? appointment.notes.substring(0, 40) + (appointment.notes.length > 40 ? '...' : '') : 'Aucune note'}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${getStatusColor(appointment)}`}>
                              {getStatusIcon(appointment)}
                              {appointment.status}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-gray-900">
                              {appointment.expectedAmount.toFixed(2)} MAD
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`font-semibold ${appointment.totalPaid > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {appointment.totalPaid.toFixed(2)} MAD
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`font-semibold ${
                              appointment.remainingBalance > 0 ? 'text-orange-600' : 'text-gray-400'
                            }`}>
                              {appointment.remainingBalance.toFixed(2)} MAD
                            </span>
                            {appointment.remainingBalance > 0 && appointment.status === 'terminé' && (
                              <button
                                onClick={() => {
                                  setSelectedAppointmentForPayment(appointment);
                                  setShowPaymentForm(true);
                                }}
                                className="ml-2 px-3 py-1 bg-orange-600 text-white text-xs font-medium rounded-md hover:bg-orange-700 transition-colors flex items-center gap-1"
                                title="Payer le restant"
                              >
                                <CreditCard size={12} />
                                Payer le Reste
                              </button>
                            )}
                          </td>
                          <td className="p-4">
                            {appointment.payments.length > 0 ? (
                              <div className="space-y-1">
                                {appointment.payments.map((payment) => (
                                  <div key={payment.id} className="flex items-center gap-1 text-sm">
                                    <span>{getPaymentMethodIcon(payment.paymentMethod)}</span>
                                    <span className="font-medium">{payment.amount.toFixed(0)} MAD</span>
                                    <span className="text-gray-500 text-xs">
                                      ({format(new Date(payment.createdAt || payment.paymentDate), 'HH:mm')})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">Aucun paiement</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-600">
            Dernière mise à jour: {format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
      </div>
      
      {/* Payment Form Modal */}
      {showPaymentForm && selectedAppointmentForPayment && (
        <QuickPaymentForm
          appointmentId={selectedAppointmentForPayment.id!}
          patientId={patient.id!}
          patientName={getPatientFullName(patient)}
          unpaidBalance={selectedAppointmentForPayment.remainingBalance > 0 ? selectedAppointmentForPayment.remainingBalance : undefined}
          onClose={() => {
            setShowPaymentForm(false);
            setSelectedAppointmentForPayment(null);
          }}
          onPaymentAdded={() => {
            setShowPaymentForm(false);
            setSelectedAppointmentForPayment(null);
            loadPatientFinancialData(); // Refresh the data
          }}
        />
      )}
    </div>
  );
};

export default PatientFinancialModal;