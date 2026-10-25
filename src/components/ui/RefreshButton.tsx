import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

/** Re-reads everything from the shared database (what the other laptops just entered). */
const RefreshButton = () => {
  const { refresh } = useData();
  const [spinning, setSpinning] = useState(false);
  const busy = useRef(false);

  const click = async () => {
    if (busy.current) return;
    busy.current = true;
    setSpinning(true);
    const minimum = new Promise((r) => window.setTimeout(r, 600)); // always give visible feedback
    await Promise.all([refresh(), minimum]);
    setSpinning(false);
    busy.current = false;
  };

  return (
    <button type="button" className={`btn btn-secondary btn-icon ${spinning ? 'spin' : ''}`} onClick={click}
      title="Actualiser (F5)" aria-label="Actualiser">
      <RefreshCw />
    </button>
  );
};

export default RefreshButton;
