import React, { useState } from 'react';
import { X, CreditCard, Banknote, FileText, Building2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { Payment, addPayment } from '../services/database';
import { getTodayISO } from '../utils/helpers';
import './QuickPaymentForm.css';

interface QuickPaymentFormProps {
  appointmentId: number;
  patientId: number;
  patientName: string;
  unpaidBalance?: number; // Optional unpaid balance to auto-fill
  onClose: () => void;
  onPaymentAdded: () => void;
}

const QuickPaymentForm: React.FC<QuickPaymentFormProps> = ({
  appointmentId,
  patientId,
  patientName,
  unpaidBalance,
  onClose,
  onPaymentAdded
}) => {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    amount: unpaidBalance ? unpaidBalance.toString() : '',
    amountPaid: unpaidBalance ? unpaidBalance.toString() : '',
    paymentMethod: 'espèces' as 'espèces' | 'carte' | 'chèque' | 'virement',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Montant total requis';
    }

    if (!formData.amountPaid || parseFloat(formData.amountPaid) <= 0) {
      newErrors.amountPaid = 'Montant payé requis';
    }

    if (parseFloat(formData.amountPaid || '0') > parseFloat(formData.amount || '0')) {
      newErrors.amountPaid = 'Le montant payé ne peut pas être supérieur au total';
    }

    // Additional validation for unpaid balance
    if (unpaidBalance && parseFloat(formData.amountPaid || '0') > unpaidBalance) {
      newErrors.amountPaid = `Le montant payé ne peut pas être supérieur au solde impayé (${unpaidBalance.toFixed(2)} MAD)`;
    }

    console.log('Validation results:', { formData, newErrors, unpaidBalance });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submission started...', { formData, user });
    
    if (!validateForm() || !user) {
      console.log('Validation failed or no user');
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const today = getTodayISO();
      
      const paymentData: Omit<Payment, 'id' | 'createdAt' | 'patientName' | 'collectedByName'> = {
        appointmentId,
        patientId,
        amount: parseFloat(formData.amountPaid),
        paymentMethod: formData.paymentMethod,
        collectedBy: user.id!,
        notes: formData.notes || undefined,
        paymentDate: today
      };

      console.log('Sending payment data:', paymentData);
      
      const result = await addPayment(paymentData);
      console.log('Payment added successfully:', result);
      
      // Call callbacks
      onPaymentAdded();
      onClose();
    } catch (error) {
      console.error('Payment failed:', error);
      setErrors({ submit: 'Erreur lors de l\'enregistrement du paiement: ' + ((error as any)?.message || String(error)) });
    } finally {
      setIsLoading(false);
    }
  };

  const remainingAmount = parseFloat(formData.amount || '0') - parseFloat(formData.amountPaid || '0');

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'espèces':
        return <Banknote className="w-4 h-4" />;
      case 'carte':
        return <CreditCard className="w-4 h-4" />;
      case 'chèque':
        return <FileText className="w-4 h-4" />;
      case 'virement':
        return <Building2 className="w-4 h-4" />;
      default:
        return <Banknote className="w-4 h-4" />;
    }
  };

  return (
    <div style={{zIndex: 1001, marginTop: '35px' , marginBottom: '35px'}}
      className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-[1001] p-2 pt-4 overflow-y-auto"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm h-[80vh] flex flex-col">
        <div className="flex justify-between items-start p-4 border-b border-gray-200 bg-green-600 text-white">
          <div>
            <h3 className="text-lg font-semibold">
              {unpaidBalance ? `Payer le Reste - ${patientName}` : `Encaissement - ${patientName}`}
            </h3>
            <p className="text-green-100 text-sm mt-1">
              {unpaidBalance ? `Solde impayé: ${unpaidBalance.toFixed(2)} MAD` : 'Traitement terminé'}
            </p>
          </div>
          <button onClick={onClose} className="text-green-100 hover:text-white transition-colors p-2 rounded hover:bg-green-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="form-group">
            <label htmlFor="amount">
              {unpaidBalance ? 'Montant du Solde Impayé (MAD)' : 'Montant Total du Traitement (MAD)'} <span className="required">*</span>
            </label>
            <input
              type="number"
              id="amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              step="0.01"
              min="0"
              className={errors.amount ? 'error' : ''}
              readOnly={!!unpaidBalance} // Make readonly if unpaid balance is provided
              style={unpaidBalance ? { backgroundColor: '#f7fafc', cursor: 'not-allowed' } : {}}
              required
            />
            {errors.amount && <span className="error-text">{errors.amount}</span>}
            
          </div>

          <div className="form-group">
            <label htmlFor="amountPaid">
              {unpaidBalance ? 'Montant à Payer Maintenant (MAD)' : 'Montant Payé Aujourd\'hui (MAD)'} <span className="required">*</span>
            </label>
            <input
              type="number"
              id="amountPaid"
              value={formData.amountPaid}
              onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
              placeholder="0.00"
              step="0.01"
              min="0"
              max={unpaidBalance ? unpaidBalance.toString() : undefined}
              className={errors.amountPaid ? 'error' : ''}
              required
            />
            {errors.amountPaid && <span className="error-text">{errors.amountPaid}</span>}
            {unpaidBalance && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-700">
                  Vous pouvez payer tout ({unpaidBalance.toFixed(2)} MAD) ou une partie du solde impayé
                </p>
              </div>
            )}
            
            {remainingAmount > 0 && formData.amount && formData.amountPaid && (
              <div className="remaining-amount">
                <span className="label">Restant à payer:</span>
                <span className="amount">{remainingAmount.toFixed(2)} MAD</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">
              Méthode de Paiement <span className="required">*</span>
            </label>
            <div className="payment-methods">
              {(['espèces', 'carte', 'chèque', 'virement'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: method })}
                  className={`payment-method-btn ${formData.paymentMethod === method ? 'active' : ''}`}
                >
                  {getPaymentIcon(method)}
                  <span className="capitalize">{method}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes (optionnel)</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes sur le paiement, chèque n°, etc..."
              rows={3}
            />
          </div>

          {errors.submit && (
            <div className="error-message">
              <strong>Erreur:</strong> {errors.submit}
              <details className="mt-2 text-xs">
                <summary>Détails techniques (pour le développeur)</summary>
                <pre className="mt-1 text-xs bg-gray-100 p-2 rounded">
                  {JSON.stringify({ formData, appointmentId, patientId }, null, 2)}
                </pre>
              </details>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
              disabled={isLoading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default QuickPaymentForm;