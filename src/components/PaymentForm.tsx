import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Payment, Appointment, getAppointments } from '../services/database';
import './PaymentForm.css';

interface PaymentFormProps {
  onClose: () => void;
  onSubmit: (payment: Omit<Payment, 'id' | 'createdAt'>) => void;
  selectedDate: string;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onClose, onSubmit, selectedDate }) => {
  const [formData, setFormData] = useState({
    appointmentId: '',
    patientId: 0,
    patientName: '',
    amount: '',
    paymentMethod: 'espèces' as 'espèces' | 'carte' | 'chèque' | 'virement',
    notes: ''
  });

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    loadAppointments();
  }, []);

  useEffect(() => {
    // Filter appointments for selected date with 'terminé' status
    const filtered = appointments.filter(apt => 
      apt.date === selectedDate && apt.status === 'terminé'
    );
    setFilteredAppointments(filtered);
  }, [appointments, selectedDate]);

  const loadAppointments = async () => {
    try {
      const appointmentsData = await getAppointments();
      setAppointments(appointmentsData as Appointment[]);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    }
  };

  const handleAppointmentChange = (appointmentId: string) => {
    const appointment = appointments.find(apt => apt.id?.toString() === appointmentId);
    if (appointment) {
      setFormData({
        ...formData,
        appointmentId,
        patientId: appointment.patientId,
        patientName: appointment.patientName || ''
      });
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.appointmentId) {
      newErrors.appointmentId = 'Veuillez sélectionner un rendez-vous';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Veuillez entrer un montant valide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const paymentData: Omit<Payment, 'id' | 'createdAt'> = {
        appointmentId: parseInt(formData.appointmentId),
        patientId: formData.patientId,
        patientName: formData.patientName,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod,
        collectedBy: 0, // Will be set by parent component
        collectedByName: '',
        notes: formData.notes || undefined,
        paymentDate: selectedDate
      };

      await onSubmit(paymentData);
    } catch (error) {
      console.error('Failed to add payment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payment-form-overlay">
      <div className="payment-form-modal">
        <div className="modal-header">
          <h3>Ajouter un Paiement</h3>
          <button onClick={onClose} className="close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-group">
            <label htmlFor="appointment">
              Rendez-vous <span className="required">*</span>
            </label>
            <select
              id="appointment"
              value={formData.appointmentId}
              onChange={(e) => handleAppointmentChange(e.target.value)}
              className={errors.appointmentId ? 'error' : ''}
              required
            >
              <option value="">Sélectionner un rendez-vous</option>
              {filteredAppointments.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {appointment.time} - {appointment.patientName} ({appointment.treatmentType})
                </option>
              ))}
            </select>
            {errors.appointmentId && (
              <span className="error-text">{errors.appointmentId}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="amount">
              Montant (MAD) <span className="required">*</span>
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
              required
            />
            {errors.amount && (
              <span className="error-text">{errors.amount}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">
              Méthode de Paiement <span className="required">*</span>
            </label>
            <select
              id="paymentMethod"
              value={formData.paymentMethod}
              onChange={(e) => setFormData({ 
                ...formData, 
                paymentMethod: e.target.value as 'espèces' | 'carte' | 'chèque' | 'virement'
              })}
              required
            >
              <option value="espèces">Espèces</option>
              <option value="carte">Carte Bancaire</option>
              <option value="chèque">Chèque</option>
              <option value="virement">Virement</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes (optionnel)</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes additionnelles..."
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Ajout...' : 'Ajouter le Paiement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;