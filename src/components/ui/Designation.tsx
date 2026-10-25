import { parseDesignation } from '../../teeth';

/** Tooth numbers / zones of an act, as small pills. */
const Designation = ({ text }: { text: string }) => {
  const d = parseDesignation(text);
  if (!d.teeth.length && !d.zones.length && !d.other) return <span className="muted">—</span>;
  return (
    <span className="designation">
      {d.teeth.map((t) => <span key={t} className="tooth-chip">{t}</span>)}
      {d.zones.map((z) => <span key={z} className="tooth-chip zone">{z}</span>)}
      {d.other && <span className="tooth-chip zone">{d.other}</span>}
    </span>
  );
};

export default Designation;
