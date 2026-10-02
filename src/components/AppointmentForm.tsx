import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, Patient } from '../services/database';
import DateInput from './DateInput';

interface AppointmentFormProps {
  appointment?: Appointment | null;
  patients: Patient[];
  initialDate?: Date;
  initialTime?: string;
  onSave: (appointment: Omit<Appointment, 'id'>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const AppointmentForm = ({ 
  appointment, 
  patients, 
  initialDate,
  initialTime,
  onSave, 
  onCancel, 
  onDelete 
}: AppointmentFormProps) => {
  const [formData, setFormData] = useState({
    patientId: appointment?.patientId || 0,
    date: appointment?.date || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')),
    time: appointment?.time || initialTime || '09:00',
    treatmentType: appointment?.treatmentType || 'consultation',
    status: appointment?.status || 'programmé',
    notes: appointment?.notes || ''
  });

  const timeSlots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
                     '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
  
  const statusOptions = [
    'programmé',
    'confirmé', 
    'en cours',
    'terminé',
    'annulé'
  ] as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientId) {
      alert('Veuillez sélectionner un patient');
      return;
    }
    onSave(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getPatientFullName = (patient: Patient) => {
    return `${patient.firstName} ${patient.lastName}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {appointment ? 'Modifier Rendez-vous' : 'Nouveau Rendez-vous'}
          </h2>
          <div className="flex items-center space-x-2">
            {appointment && onDelete && (
              <button
                onClick={onDelete}
                className="text-red-600 hover:text-red-800 p-2"
                title="Supprimer le rendez-vous"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient *
            </label>
            <select
              required
              value={formData.patientId}
              onChange={(e) => handleInputChange('patientId', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={0}>Sélectionner un patient</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {getPatientFullName(patient)}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <DateInput
                required
                value={formData.date}
                onChange={(value) => handleInputChange('date', value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Heure *
              </label>
              <select
                required
                value={formData.time}
                onChange={(e) => handleInputChange('time', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {timeSlots.map(time => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Treatment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de traitement *
            </label>
            <select
              required
              value={formData.treatmentType}
              onChange={(e) => handleInputChange('treatmentType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="consultation">Consultation</option>
              <option value="nettoyage">Nettoyage</option>
              <option value="plombage">Plombage</option>
              <option value="extraction">Extraction</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Statut
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Notes additionnelles ou instructions spéciales..."
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {appointment ? 'Modifier' : 'Planifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentForm;