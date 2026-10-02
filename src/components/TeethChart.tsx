// TeethChart component - simplified for dental practice

interface TeethChartProps {
  onToothClick: (toothNumber: number) => void;
}

const TeethChart = ({ onToothClick }: TeethChartProps) => {
  // Adult teeth numbering (1-32)
  const upperTeeth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const lowerTeeth = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17];

  const getToothColor = () => {
    return '#f3f4f6'; // Default color for all teeth
  };

  const getToothTooltip = (toothNumber: number) => {
    return `Dent #${toothNumber} - Cliquer pour plus de détails`;
  };

  const Tooth = ({ number, isUpper = true }: { number: number; isUpper?: boolean }) => (
    <div
      className="relative group cursor-pointer"
      onClick={() => onToothClick(number)}
      title={getToothTooltip(number)}
    >
      <div
        className="w-8 h-12 rounded-t-lg border-2 border-gray-300 hover:border-blue-500 transition-all duration-200 transform hover:scale-110"
        style={{ 
          backgroundColor: getToothColor(),
          borderRadius: isUpper ? '8px 8px 4px 4px' : '4px 4px 8px 8px'
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-gray-700">{number}</span>
        </div>
      </div>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        {getToothTooltip(number)}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800"></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Upper Teeth */}
      <div>
        <h4 className="text-sm font-medium text-gray-600 mb-2 text-center">Mâchoire Supérieure</h4>
        <div className="flex justify-center space-x-1">
          {upperTeeth.map(toothNumber => (
            <Tooth key={toothNumber} number={toothNumber} isUpper={true} />
          ))}
        </div>
      </div>

      {/* Lower Teeth */}
      <div>
        <h4 className="text-sm font-medium text-gray-600 mb-2 text-center">Mâchoire Inférieure</h4>
        <div className="flex justify-center space-x-1">
          {lowerTeeth.map(toothNumber => (
            <Tooth key={toothNumber} number={toothNumber} isUpper={false} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
          <span className="text-gray-600">Aucun traitement</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-600">Planifié</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span className="text-gray-600">En cours</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-600">Terminé</span>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        Cliquez sur une dent pour ajouter un traitement
      </div>
    </div>
  );
};

export default TeethChart;