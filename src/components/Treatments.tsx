import { useState } from 'react';
import { Search } from 'lucide-react';
import { Patient } from '../types';
import TeethChart from './TeethChart';
import TreatmentForm from './TreatmentForm';

interface TreatmentsProps {
  patients: Patient[];
}

const Treatments = ({ patients }: TreatmentsProps) => {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  const filteredPatients = patients.filter(patient =>
    `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (patient.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    patient.phone.includes(searchQuery)
  );

  const handleToothClick = (_toothNumber: number) => {
    if (!selectedPatient) return;
    setIsFormOpen(true);
  };

  const getPatientFullName = (patient: Patient) => {
    return `${patient.firstName} ${patient.lastName}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Traitements</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Patient List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow-md">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Rechercher patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {searchQuery ? 'Aucun patient trouvé' : 'Aucun patient pour le moment'}
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
                    <div>
                      <p className="font-medium text-gray-900">{getPatientFullName(patient)}</p>
                      <p className="text-sm text-gray-600">{patient.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teeth Chart and Treatment Details */}
        <div className="lg:col-span-3 space-y-6">
          {selectedPatient ? (
            <>
              {/* Patient Header */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {getPatientFullName(selectedPatient)}
                </h2>
                <p className="text-gray-600">
                  Fonctionnalité de traitement à venir prochainement.
                </p>
              </div>

              {/* Teeth Chart */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Schéma Dentaire</h3>
                <TeethChart onToothClick={handleToothClick} />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-500">
              <p className="text-xl mb-2">Sélectionnez un patient pour voir les traitements</p>
              <p>Choisissez un patient dans la liste pour voir son schéma dentaire</p>
            </div>
          )}
        </div>
      </div>

      {/* Treatment Form Modal */}
      {isFormOpen && selectedPatient && (
        <TreatmentForm
          onCancel={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
};

export default Treatments;