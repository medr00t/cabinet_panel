import { useState, useEffect } from 'react';
import { X, User, Calendar, Phone, Mail, AlertTriangle, FileText, Pill, UserCheck } from 'lucide-react';
import { Patient } from '../services/database';
import DateInput from './DateInput';

interface PatientFormProps {
  patient?: Patient | null;
  onSave: (patient: Omit<Patient, 'id'>) => void;
  onCancel: () => void;
}

const PatientForm = ({ patient, onSave, onCancel }: PatientFormProps) => {
  const [formData, setFormData] = useState({
    firstName: patient?.firstName || '',
    lastName: patient?.lastName || '',
    dateOfBirth: patient?.dateOfBirth || '',
    gender: patient?.gender || 'male' as const,
    phone: patient?.phone || '',
    email: patient?.email || '',
    address: patient?.address || '',
    allergies: patient?.allergies || '',
    medicalHistory: patient?.medicalHistory || '',
    medications: patient?.medications || '',
    emergencyContact: patient?.emergencyContact || '',
    emergencyPhone: patient?.emergencyPhone || '',
    notes: patient?.notes || ''
  });

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      firstName: formData.firstName,
      lastName: formData.lastName,
      dateOfBirth: formData.dateOfBirth,
      gender: formData.gender,
      phone: formData.phone,
      email: formData.email || undefined,
      address: formData.address || undefined,
      allergies: formData.allergies || undefined,
      medicalHistory: formData.medicalHistory || undefined,
      medications: formData.medications || undefined,
      emergencyContact: formData.emergencyContact || undefined,
      emergencyPhone: formData.emergencyPhone || undefined,
      notes: formData.notes || undefined
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white">
          <div className="flex items-center space-x-3">
            <User className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {patient ? 'Modifier le Patient' : 'Nouveau Patient'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-blue-100 hover:text-white transition-colors p-2 rounded hover:bg-blue-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <form id="patient-form" onSubmit={handleSubmit} className="p-4 space-y-4">
            
            {/* Informations Personnelles */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 mb-3">
              <User className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-800">Informations Personnelles</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Prénom du patient"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nom de famille"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Date de Naissance * (format: jj/mm/aaaa)
                </label>
                <DateInput
                  required
                  value={formData.dateOfBirth}
                  onChange={(value) => handleInputChange('dateOfBirth', value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sexe *
                </label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="male">Homme</option>
                  <option value="female">Femme</option>
                </select>
              </div>
            </div>
          </div>

          {/* Informations de Contact */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 mb-3">
              <Phone className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-medium text-gray-800">Informations de Contact</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="inline h-4 w-4 mr-1" />
                  Téléphone *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="inline h-4 w-4 mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="email@exemple.com"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Adresse complète"
              />
            </div>
          </div>

          {/* Medical Information */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-medium text-gray-800">Informations Médicales</h3>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <AlertTriangle className="inline h-4 w-4 mr-1 text-red-500" />
                  Allergies
                </label>
                <textarea
                  value={formData.allergies}
                  onChange={(e) => handleInputChange('allergies', e.target.value)}
                  rows={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="Allergies médicamenteuses, alimentaires, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="inline h-4 w-4 mr-1 text-blue-500" />
                  Antécédents Médicaux
                </label>
                <textarea
                  value={formData.medicalHistory}
                  onChange={(e) => handleInputChange('medicalHistory', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Maladies, opérations, traitements antérieurs..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Pill className="inline h-4 w-4 mr-1 text-green-500" />
                  Médicaments Actuels
                </label>
                <textarea
                  value={formData.medications}
                  onChange={(e) => handleInputChange('medications', e.target.value)}
                  rows={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Médicaments pris régulièrement, posologie..."
                />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 mb-3">
              <UserCheck className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-medium text-gray-800">Contact d'Urgence</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="inline h-4 w-4 mr-1" />
                  Nom du Contact
                </label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Nom et prénom"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="inline h-4 w-4 mr-1" />
                  Téléphone d'Urgence
                </label>
                <input
                  type="tel"
                  value={formData.emergencyPhone}
                  onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes Additionnelles
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                placeholder="Autres informations importantes..."
              />
            </div>
          </div>

          </form>
        </div>
        
        {/* Footer Actions */}
        <div className="flex justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="patient-form"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {patient ? 'Modifier le Patient' : 'Ajouter le Patient'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientForm;