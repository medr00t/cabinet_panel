import { X } from 'lucide-react';

interface TreatmentFormProps {
  onCancel: () => void;
}

const TreatmentForm = ({ onCancel }: TreatmentFormProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Traitements
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 text-center">
            Fonctionnalité de traitement à venir prochainement.
          </p>
        </div>

        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default TreatmentForm;