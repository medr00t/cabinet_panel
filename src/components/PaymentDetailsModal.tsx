import React from 'react';
import { X, User, Calendar, Clock, CreditCard, Banknote, FileText, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Appointment, Patient, Payment } from '../services/database';
import { getPatientFullName } from '../utils/helpers';

interface PaymentDetailsModalProps {
  appointment: Appointment;
  patient: Patient;
  payments: Payment[];
  onClose: () => void;
}

const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  appointment,
  patient,
  payments,
  onClose
}) => {
  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'especes': return <Banknote size={16} className="text-green-600" />;
      case 'carte': return <CreditCard size={16} className="text-blue-600" />;
      case 'cheque': return <FileText size={16} className="text-orange-600" />;
      case 'virement': return <Building2 size={16} className="text-purple-600" />;
      default: return <Banknote size={16} className="text-gray-600" />;
    }
  };

  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div style={{zIndex:1000, marginTop: '35px' , marginBottom: '35px'}}
      className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-[1000] p-2 pt-4 overflow-y-auto"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div>
            <h2 className="text-xl font-bold">Détails des Paiements</h2>
            <p className="text-blue-100 text-sm mt-1">
              Rendez-vous du {format(new Date(appointment.date), 'dd MMMM yyyy', { locale: fr })} à {appointment.time}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-blue-100 hover:text-white transition-colors p-2 rounded hover:bg-blue-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {/* Content */}
          <div className="p-4">
            {/* Appointment Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <User size={18} />
              Informations du rendez-vous
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Patient</label>
                <p className="font-semibold">{getPatientFullName(patient)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Statut</label>
                <p className={`font-semibold ${
                  appointment.status === 'terminé' ? 'text-green-600' :
                  appointment.status === 'annulé' ? 'text-red-600' :
                  'text-blue-600'
                }`}>
                  {appointment.status}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Date</label>
                <p className="flex items-center gap-1">
                  <Calendar size={14} />
                  {format(new Date(appointment.date), 'dd/MM/yyyy', { locale: fr })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Heure</label>
                <p className="flex items-center gap-1">
                  <Clock size={14} />
                  {appointment.time}
                </p>
              </div>
              {appointment.notes && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-600">Notes</label>
                  <p className="text-gray-700">{appointment.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-green-800 mb-2">Résumé des paiements</h3>
            <div className="flex items-center justify-between">
              <span className="text-green-700">Total payé:</span>
              <span className="text-2xl font-bold text-green-600">{totalAmount.toFixed(2)} MAD</span>
            </div>
            <p className="text-sm text-green-600 mt-1">
              {payments.length} paiement{payments.length > 1 ? 's' : ''} enregistré{payments.length > 1 ? 's' : ''}
            </p>
          </div>

          {/* Payment Details */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Détail des paiements</h3>
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon(payment.paymentMethod)}
                      <span className="font-semibold capitalize">
                        {payment.paymentMethod}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">
                      {payment.amount.toFixed(2)} MAD
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="font-medium text-gray-600">Collecté par:</label>
                      <p>{payment.collectedByName}</p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">Date:</label>
                      <p>{format(new Date(payment.paymentDate), 'dd/MM/yyyy', { locale: fr })}</p>
                    </div>
                    {payment.createdAt && (
                      <div>
                        <label className="font-medium text-gray-600">Heure d'enregistrement:</label>
                        <p>{format(new Date(payment.createdAt), 'HH:mm', { locale: fr })}</p>
                      </div>
                    )}
                    {payment.notes && (
                      <div className="md:col-span-2">
                        <label className="font-medium text-gray-600">Notes:</label>
                        <p className="text-gray-700">{payment.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Fermer
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailsModal;