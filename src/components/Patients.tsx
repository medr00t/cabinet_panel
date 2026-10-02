import { useState } from 'react';
import { Search, Plus, Edit, Trash2, User, Users, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import { Patient, addPatient, updatePatient, deletePatient } from '../services/database';
import { formatDate } from '../utils/helpers';
import PatientForm from './PatientForm.tsx';
import PatientFinancialModal from './PatientFinancialModal';

interface PatientsProps {
  patients: Patient[];
  onReloadData: () => Promise<void>;
}

const Patients = ({ patients, onReloadData }: PatientsProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [viewingFinancialPatient, setViewingFinancialPatient] = useState<Patient | null>(null);

  const filteredPatients = patients.filter(patient =>
    `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (patient.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    patient.phone.includes(searchQuery)
  );

  const getPatientFullName = (patient: Patient) => {
    return `${patient.firstName} ${patient.lastName}`;
  };

  const getAge = (birthDate: string) => {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleAddPatient = () => {
    setEditingPatient(null);
    setIsFormOpen(true);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    setIsFormOpen(true);
  };

  const handleViewFinancial = (patient: Patient) => {
    setViewingFinancialPatient(patient);
  };

  const handleDeletePatient = async (patientId: number) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce patient?')) {
      try {
        await deletePatient(patientId);
        await onReloadData();
        if (selectedPatient?.id === patientId) {
          setSelectedPatient(null);
        }
      } catch (error) {
        console.error('Failed to delete patient:', error);
        alert('Erreur lors de la suppression du patient');
      }
    }
  };

  const handleSavePatient = async (patientData: Omit<Patient, 'id'>) => {
    try {
      console.log('Saving patient data:', patientData);
      
      if (editingPatient && editingPatient.id) {
        // Update existing patient
        console.log('Updating existing patient with ID:', editingPatient.id);
        await updatePatient(editingPatient.id, patientData);
      } else {
        // Add new patient
        console.log('Adding new patient');
        const patientId = await addPatient(patientData);
        console.log('Patient added successfully with ID:', patientId);
      }
      
      // Reload data from database
      await onReloadData();
      
      setIsFormOpen(false);
      setEditingPatient(null);
    } catch (error) {
      console.error('Failed to save patient - Full error details:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Patient data that failed:', patientData);
      alert(`Erreur lors de la sauvegarde du patient: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Gestion des Patients</h1>
        <button
          onClick={handleAddPatient}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Nouveau Patient</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-md">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search style={{top: "25%"}} className="absolute left-3 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Rechercher des patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg">{searchQuery ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}</p>
                <p className="text-sm text-gray-400 mt-2">
                  {searchQuery ? 'Essayez avec un autre terme' : 'Commencez par ajouter un patient'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedPatient?.id === patient.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{getPatientFullName(patient)}</p>
                        <p className="text-sm text-gray-600">Âge: {patient.dateOfBirth ? getAge(patient.dateOfBirth) : 'Non renseigné'}</p>
                        <p className="text-sm text-gray-600">{patient.phone}</p>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewFinancial(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-green-600"
                          title="Voir l'historique financier"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPatient(patient);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Modifier le patient"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (patient.id) handleDeletePatient(patient.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Patient Details */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md">
          {selectedPatient ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {getPatientFullName(selectedPatient)}
                    </h2>
                    <p className="text-gray-600">
                      {selectedPatient.gender === 'male' ? 'Homme' : selectedPatient.gender === 'female' ? 'Femme' : 'Autre'} • Âge {selectedPatient.dateOfBirth ? getAge(selectedPatient.dateOfBirth) : 'Non renseigné'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleEditPatient(selectedPatient)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
                >
                  <Edit className="h-4 w-4" />
                  <span>Modifier</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">Informations de Contact</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Phone className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-900">{selectedPatient.phone}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-900">{selectedPatient.email}</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <MapPin className="h-5 w-5 text-gray-400 mt-1" />
                      <div className="text-gray-900">
                        <p>Adresse disponible prochainement</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">Contact d'Urgence</h3>
                  <div className="space-y-3">
                    <p className="text-gray-500">Informations à venir prochainement</p>
                  </div>
                </div>

                {/* Medical History */}
                <div className="md:col-span-2 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">Antécédents Médicaux</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 font-medium">Allergies</p>
                      <div className="mt-1">
                        <p className="text-gray-500">À renseigner</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 font-medium">Médicaments</p>
                      <div className="mt-1">
                        <p className="text-gray-500">À renseigner</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 font-medium">Pathologies</p>
                      <div className="mt-1">
                        <p className="text-gray-500">À renseigner</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insurance Information */}
                <div className="md:col-span-2 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">Informations d'Assurance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Assureur</p>
                      <p className="text-gray-900">À renseigner</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Numéro de Police</p>
                      <p className="text-gray-900">À renseigner</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Numéro de Groupe</p>
                      <p className="text-gray-900">À renseigner</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 text-sm text-gray-600">
                <p>Patient ajouté le: {selectedPatient.createdAt ? formatDate(selectedPatient.createdAt) : 'Date inconnue'}</p>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-500">
              <User className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">Sélectionnez un patient pour voir les détails</p>
              <p className="text-sm text-gray-400 mt-2">Les informations du patient apparaîtront ici</p>
            </div>
          )}
        </div>
      </div>

      {/* Patient Form Modal */}
      {isFormOpen && (
        <PatientForm
          patient={editingPatient}
          onSave={handleSavePatient}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingPatient(null);
          }}
        />
      )}

      {/* Patient Financial Modal */}
      {viewingFinancialPatient && (
        <PatientFinancialModal
          patient={viewingFinancialPatient}
          onClose={() => setViewingFinancialPatient(null)}
          onScheduleAppointment={() => {
            setViewingFinancialPatient(null);
            // Could integrate with appointment scheduling here
          }}
        />
      )}
    </div>
  );
};

export default Patients;