import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Payment, DailySummary, getPaymentsByDate, getDailySummaryByStaff, getDailySummaryAllStaff } from '../services/database';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, TrendingUp, Users, Eye, EyeOff } from 'lucide-react';
import { getTodayISO } from '../utils/helpers';
import DateInput from './DateInput';

const Financial: React.FC = () => {
  const { user } = useUser();
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [allStaffSummary, setAllStaffSummary] = useState<DailySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Role-based permissions
  const isDoctor = user?.role === 'doctor';
  const canChangeDates = isDoctor;
  const canViewAllStaff = isDoctor;
  const canViewFullDetails = isDoctor;

  const loadFinancialData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Load payments for selected date
      const paymentsData = await getPaymentsByDate(selectedDate);
      
      // Filter payments based on user role
      let filteredPayments = paymentsData;
      if (!isDoctor) {
        // Non-doctors can only see payments they collected
        filteredPayments = paymentsData.filter(payment => payment.collectedBy === user.id);
      }
      
      setPayments(filteredPayments);
      console.log('Loaded payments for user role', user.role, ':', filteredPayments);

      // Load daily summary for current user
      const summaryData = await getDailySummaryByStaff(selectedDate, user.id!);
      setDailySummary(summaryData);
      console.log('Daily summary for user', user.id, ':', summaryData);

      // Only doctors can see all staff summary
      if (canViewAllStaff) {
        const allSummaryData = await getDailySummaryAllStaff(selectedDate);
        setAllStaffSummary(allSummaryData);
        console.log('All staff summary:', allSummaryData);
      }
    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [user, selectedDate]);

  // Force non-doctors to use current date only
  useEffect(() => {
    if (user && !canChangeDates) {
      const today = getTodayISO();
      if (selectedDate !== today) {
        setSelectedDate(today);
      }
    }
  }, [user, canChangeDates]);

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'especes': return '💵';
      case 'carte': return '💳';
      case 'cheque': return '📋';
      case 'virement': return '🏦';
      default: return '💰';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Gestion Financière</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-500" />
              {canChangeDates ? (
                <DateInput
                  value={selectedDate}
                  onChange={setSelectedDate}
                />
              ) : (
                <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                  {format(new Date(selectedDate), 'dd/MM/yyyy', { locale: fr })}
                </div>
              )}
            </div>
            {canViewFullDetails && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
                {showDetails ? 'Masquer détails' : 'Voir détails'}
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-600">
          Bienvenue {user?.name} - {format(new Date(selectedDate), 'EEEE dd MMMM yyyy', { locale: fr })}
          {!canChangeDates && (
            <span className="text-sm text-orange-600 ml-2">
              (Vue limitée à vos paiements du jour)
            </span>
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Chargement des données financières...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className={`grid grid-cols-1 ${canViewAllStaff ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-800">
                    {isDoctor ? 'Mes paiements' : 'Vos paiements'}
                  </h3>
                  <p className="text-2xl font-bold text-blue-600">
                    {dailySummary?.totalCollected?.toFixed(2) || '0.00'} MAD
                  </p>
                </div>
                <TrendingUp className="text-blue-500" size={24} />
              </div>
              <p className="text-sm text-blue-600 mt-2">
                {dailySummary?.numberOfPayments || 0} transaction(s)
              </p>
            </div>

            {canViewAllStaff && (
              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-green-800">Total cabinet</h3>
                    <p className="text-2xl font-bold text-green-600">
                      {allStaffSummary.reduce((sum, s) => sum + (s.totalCollected || 0), 0).toFixed(2)} MAD
                    </p>
                  </div>
                  <Users className="text-green-500" size={24} />
                </div>
                <p className="text-sm text-green-600 mt-2">
                  {allStaffSummary.reduce((sum, s) => sum + (s.numberOfPayments || 0), 0)} transaction(s) total
                </p>
              </div>
            )}

            <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-purple-800">
                    {isDoctor ? 'Méthodes populaires' : 'Votre méthode'}
                  </h3>
                  <p className="text-lg font-bold text-purple-600">
                    {payments.length > 0 
                      ? payments.reduce((acc, p) => {
                          acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ? Object.entries(payments.reduce((acc, p) => {
                          acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>))
                        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Aucun'
                      : 'Aucun'
                      : 'Aucun'}
                  </p>
                </div>
                <div className="text-2xl">
                  {payments.length > 0 && getPaymentMethodIcon(
                    Object.entries(payments.reduce((acc, p) => {
                      acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>))
                    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'especes'
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Staff Summary (Doctor only) */}
          {canViewAllStaff && allStaffSummary.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Résumé par personnel</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {allStaffSummary.map((summary) => (
                  <div key={summary.staffId} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-700">{summary.staffName}</h4>
                    <p className="text-xl font-bold text-gray-900">
                      {summary.totalCollected?.toFixed(2) || '0.00'} MAD
                    </p>
                    <p className="text-sm text-gray-500">
                      {summary.numberOfPayments || 0} paiement(s)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Details */}
          {(canViewFullDetails ? showDetails : true) && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {isDoctor ? `Détail des paiements (${payments.length})` : `Vos paiements du jour (${payments.length})`}
              </h3>
              
              {payments.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {isDoctor ? 'Aucun paiement enregistré pour cette date' : 'Aucun paiement enregistré par vous aujourd\'hui'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left p-3">Patient</th>
                        <th className="text-left p-3">Montant</th>
                        <th className="text-left p-3">Méthode</th>
                        {canViewFullDetails && <th className="text-left p-3">Collecté par</th>}
                        <th className="text-left p-3">Heure</th>
                        {canViewFullDetails && <th className="text-left p-3">Notes</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-medium">{payment.patientName}</td>
                          <td className="p-3 font-bold text-green-600">
                            {payment.amount.toFixed(2)} MAD
                          </td>
                          <td className="p-3">
                            <span className="flex items-center gap-1">
                              <span>{getPaymentMethodIcon(payment.paymentMethod)}</span>
                              <span className="capitalize">{payment.paymentMethod}</span>
                            </span>
                          </td>
                          {canViewFullDetails && (
                            <td className="p-3">{payment.collectedByName}</td>
                          )}
                          <td className="p-3">
                            {payment.createdAt ? format(new Date(payment.createdAt), 'HH:mm') : '-'}
                          </td>
                          {canViewFullDetails && (
                            <td className="p-3 text-gray-600">
                              {payment.notes || '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Financial;