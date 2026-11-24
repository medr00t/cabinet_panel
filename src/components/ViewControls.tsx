import { useEffect, useState } from 'react';
import { Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { getZoom, setZoom } from '../utils/viewZoom';

/** Zoom − / + (remembered) and full-screen, for every laptop's screen size. */
const ViewControls = () => {
  const [zoom, setLevel] = useState(getZoom());
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const change = (z: number) => setLevel(setZoom(z));
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <div className="view-controls no-print" role="group" aria-label="Affichage">
      <button type="button" onClick={() => change(zoom - 0.1)} title="Réduire le zoom" aria-label="Réduire le zoom"><ZoomOut size={16} /></button>
      <button type="button" className="level" onClick={() => change(1)} title="Zoom à 100 %">{Math.round(zoom * 100)} %</button>
      <button type="button" onClick={() => change(zoom + 0.1)} title="Agrandir le zoom" aria-label="Agrandir le zoom"><ZoomIn size={16} /></button>
      <button type="button" onClick={toggleFull} title={full ? 'Quitter le plein écran' : 'Plein écran'} aria-label={full ? 'Quitter le plein écran' : 'Plein écran'}>
        {full ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
    </div>
  );
};

export default ViewControls;
