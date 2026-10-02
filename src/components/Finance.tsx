import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { Patient } from '../services/database';

interface FinanceProps {
  patients: Patient[];
}

const Finance = ({ patients }: FinanceProps) => {
  // Placeholder component for financial management
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Finances</h1>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenus du Mois</p>
              <p className="text-2xl font-bold text-green-600">0 €</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Paiements en Attente</p>
              <p className="text-2xl font-bold text-yellow-600">0 €</p>
            </div>
            <Calendar className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Patients</p>
              <p className="text-2xl font-bold text-blue-600">{patients.length}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Taux de Collecte</p>
              <p className="text-2xl font-bold text-purple-600">0%</p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestion Financière</h2>
        <p className="text-gray-600">
          Cette section sera développée pour inclure la gestion des paiements, 
          les factures et les rapports financiers.
        </p>
      </div>
    </div>
  );
};

export default Finance;