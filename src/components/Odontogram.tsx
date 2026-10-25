import { KeyboardEvent, useMemo } from 'react';
import { STATUS, ToothKind, ToothState, toothKind, toothName } from '../teeth';

interface OdontogramProps {
  states: Record<string, ToothState>;
  /** teeth ticked in a multi-select (act form) */
  selected?: Set<string>;
  /** tooth whose detail panel is open */
  active?: string | null;
  onToothClick: (tooth: string) => void;
  /** baby teeth instead of the permanent set */
  deciduous?: boolean;
  /** teeth are displayed but cannot be clicked (e.g. when a whole zone is chosen) */
  locked?: boolean;
  /** pixel width of the permanent-teeth chart; the smaller baby-teeth chart keeps the same tooth size */
  maxWidth?: number;
}

// The chart is the classic view from above: two horseshoe arches facing each other, front teeth at the
// top (upper jaw) and at the bottom (lower jaw), numbered FDI around the outside. The patient's right is
// on the left of the screen, exactly like a dentist facing the patient.

/** mesio-distal width (mm) of the 8 (permanent) / 5 (baby) teeth of one quadrant, from the front teeth backwards */
const WIDTH_MM = { permanent: [9, 7, 8, 7, 7, 11, 10, 10], deciduous: [6.5, 5.2, 6.8, 7.6, 9.2] };
/** bucco-lingual depth (mm) */
const DEPTH_MM = { permanent: [7.5, 6.5, 8, 9, 9, 11, 11, 10.5], deciduous: [5.5, 5, 6.5, 8, 9] };
const PX_PER_MM = 4.3;
const GAP = 2;          // px between neighbouring crowns
const SWEEP = 0.66 * Math.PI; // how far round the ellipse the arch runs (a horseshoe, not a full oval)
const ASPECT = 1.14;    // arch is wider than deep
const PAD = 54;         // room for the numbers around the arches
const ARCH_GAP = 44;    // between the back teeth of the two jaws

interface Spot { code: string; x: number; y: number; rot: number; w: number; d: number; nx: number; ny: number }
interface Layout { spots: Spot[]; width: number; height: number; upperLabel: { x: number; y: number }; lowerLabel: { x: number; y: number } }

const buildLayout = (deciduous: boolean): Layout => {
  const kind = deciduous ? 'deciduous' : 'permanent';
  const widths = WIDTH_MM[kind];
  const depths = DEPTH_MM[kind];
  const half = widths.reduce((s, w) => s + w * PX_PER_MM, 0) + GAP * (widths.length - 1);

  // arc length of the unit ellipse (a = ASPECT, b = 1) from the front to t, sampled finely
  const STEPS = 800;
  const cum: number[] = [0];
  for (let i = 1; i <= STEPS; i++) {
    const t0 = ((i - 1) / STEPS) * SWEEP;
    const t1 = (i / STEPS) * SWEEP;
    const tm = (t0 + t1) / 2;
    cum.push(cum[i - 1] + Math.hypot(ASPECT * Math.cos(tm), Math.sin(tm)) * (t1 - t0));
  }
  const scale = half / cum[STEPS];
  const rx = ASPECT * scale;
  const ry = scale;
  const tAt = (s: number): number => {
    const target = (s / half) * cum[STEPS];
    let lo = 0;
    let hi = STEPS;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
    return (lo / STEPS) * SWEEP;
  };

  const backY = -Math.cos(SWEEP) * ry;            // y of the last molar relative to the arch centre
  const cyUpper = PAD + ry;
  const cyLower = cyUpper + 2 * backY + ARCH_GAP;
  const cx = PAD + rx + 30;
  const height = cyLower + ry + PAD;
  const width = 2 * (rx + PAD + 30);

  const spots: Spot[] = [];
  const quadrants = deciduous ? ['5', '6', '7', '8'] : ['1', '2', '3', '4'];
  const place = (quadrant: string, side: -1 | 1, upper: boolean) => {
    let used = 0;
    widths.forEach((wMm, j) => {
      const w = wMm * PX_PER_MM;
      const t = tAt(used + w / 2);
      used += w + GAP;
      const ex = rx * Math.sin(t) * side;       // point on the ellipse
      const ey = -ry * Math.cos(t);
      const tx = rx * Math.cos(t) * side;       // tangent
      const ty = ry * Math.sin(t);
      const rot = (Math.atan2(upper ? ty : -ty, tx) * 180) / Math.PI;
      const nxRaw = ex / (rx * rx);             // outward normal of the ellipse
      const nyRaw = ey / (ry * ry);
      const len = Math.hypot(nxRaw, nyRaw) || 1;
      const ny = (nyRaw / len) * (upper ? 1 : -1);
      spots.push({
        code: `${quadrant}${j + 1}`, x: cx + ex, y: (upper ? cyUpper : cyLower) + (upper ? ey : -ey),
        rot, w: w * 0.94, d: depths[j] * PX_PER_MM, nx: nxRaw / len, ny,
      });
    });
  };
  place(quadrants[0], -1, true);   // 1x: upper, patient's right = left of the screen
  place(quadrants[1], 1, true);    // 2x
  place(quadrants[2], 1, false);   // 3x
  place(quadrants[3], -1, false);  // 4x
  return { spots, width, height, upperLabel: { x: cx, y: cyUpper - ry * 0.05 }, lowerLabel: { x: cx, y: cyLower + ry * 0.05 } };
};

const LAYOUTS = { permanent: buildLayout(false), deciduous: buildLayout(true) };

/** Outline of a crown seen from above, centred on (0,0), long side along x. */
const shape = (kind: ToothKind, w: number, d: number): string => {
  const hw = w / 2;
  const hd = d / 2;
  switch (kind) {
    case 'incisor': {
      const r = Math.min(hd, 7);
      return `M${-hw + r} ${-hd} H${hw - r} Q${hw} ${-hd} ${hw} ${-hd + r} V${hd - r} Q${hw} ${hd} ${hw - r} ${hd} H${-hw + r} Q${-hw} ${hd} ${-hw} ${hd - r} V${-hd + r} Q${-hw} ${-hd} ${-hw + r} ${-hd} Z`;
    }
    case 'canine':
      return `M${-hw} ${hd * 0.1} Q${-hw * 0.7} ${-hd * 0.8} 0 ${-hd} Q${hw * 0.7} ${-hd * 0.8} ${hw} ${hd * 0.1} Q${hw * 0.55} ${hd} 0 ${hd} Q${-hw * 0.55} ${hd} ${-hw} ${hd * 0.1} Z`;
    case 'premolar':
      return `M${-hw * 0.92} ${-hd * 0.35} Q${-hw * 0.7} ${-hd} 0 ${-hd} Q${hw * 0.7} ${-hd} ${hw * 0.92} ${-hd * 0.35} Q${hw} ${hd * 0.5} ${hw * 0.55} ${hd * 0.92} Q0 ${hd * 1.05} ${-hw * 0.55} ${hd * 0.92} Q${-hw} ${hd * 0.5} ${-hw * 0.92} ${-hd * 0.35} Z`;
    default: {
      const r = Math.min(hw, hd) * 0.42;
      return `M${-hw + r} ${-hd} H${hw - r} Q${hw} ${-hd} ${hw} ${-hd + r} V${hd - r} Q${hw} ${hd} ${hw - r} ${hd} H${-hw + r} Q${-hw} ${hd} ${-hw} ${hd - r} V${-hd + r} Q${-hw} ${-hd} ${-hw + r} ${-hd} Z`;
    }
  }
};

/** Fissure lines drawn on the biting surface (what makes premolars and molars look like teeth). */
const fissures = (kind: ToothKind, w: number, d: number): string => {
  const hw = w / 2;
  const hd = d / 2;
  if (kind === 'premolar') return `M${-hw * 0.5} ${hd * 0.05} Q0 ${-hd * 0.2} ${hw * 0.5} ${hd * 0.05}`;
  if (kind === 'molar') return `M${-hw * 0.62} ${0} Q0 ${-hd * 0.22} ${hw * 0.62} ${0} M0 ${-hd * 0.62} Q${hw * 0.16} 0 0 ${hd * 0.62}`;
  return '';
};

interface ToothProps { spot: Spot; state?: ToothState; selected: boolean; active: boolean; onClick: () => void }

const Tooth = ({ spot, state, selected, active, onClick }: ToothProps) => {
  const { code, x, y, rot, w, d, nx, ny } = spot;
  const kind = toothKind(code);
  const status = state?.status || '';
  const info = status ? STATUS[status] : null;
  const absent = status === 'absente';
  const hasNote = !!state?.mark?.note;
  const fill = absent ? 'none' : info ? info.soft : '#ffffff';
  const stroke = info ? info.color : '#8a99ad';
  const on = selected || active;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };
  const radius = Math.max(w, d) / 2;

  return (
    <g
      className={`tooth ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`} role="button" tabIndex={0}
      aria-pressed={on} aria-label={`Dent ${code}, ${toothName(code)}${info ? `, ${info.label}` : ''}`}
      onClick={onClick} onKeyDown={onKey}
    >
      <title>{`${code} · ${toothName(code)}${info ? ` — ${info.label}` : ''}`}</title>
      <text className={`tooth-no ${on ? 'on' : ''}`} x={x + nx * (radius + 15)} y={y + ny * (radius + 15) + 4} textAnchor="middle">{code}</text>
      <g transform={`translate(${x} ${y})`}>
        {on && <circle className="halo" r={radius + 6} />}
        <circle r={radius + 5} fill="transparent" />
        <g transform={`rotate(${rot})`}>
          <path
            className="crown" d={shape(kind, w, d)} fill={fill} stroke={stroke} strokeWidth={absent ? 1.6 : 1.8} strokeLinejoin="round"
            strokeDasharray={absent ? '4 3' : undefined} opacity={absent ? 0.75 : 1}
          />
          {!absent && status !== 'implant' && fissures(kind, w, d) && (
            <path d={fissures(kind, w, d)} fill="none" stroke={info ? info.color : '#8a99ad'} strokeWidth={1.2} strokeLinecap="round" opacity={0.75} />
          )}
          {status === 'carie' && <circle r={Math.min(w, d) * 0.17} fill="#d14b3b" />}
          {status === 'soigne' && <rect x={-w * 0.17} y={-d * 0.17} width={w * 0.34} height={d * 0.34} rx={3} fill="#2f78c4" opacity={0.9} />}
          {status === 'devitalise' && (kind === 'molar'
            ? <><circle cx={-w * 0.2} cy={-d * 0.18} r={2.4} fill="#7c4dd0" /><circle cx={w * 0.2} cy={-d * 0.18} r={2.4} fill="#7c4dd0" /><circle cx={0} cy={d * 0.22} r={2.4} fill="#7c4dd0" /></>
            : <circle r={2.8} fill="#7c4dd0" />)}
          {status === 'couronne' && <path d={shape(kind, w * 0.66, d * 0.66)} fill="none" stroke="#b7791f" strokeWidth={1.4} opacity={0.8} />}
          {status === 'implant' && <><circle r={Math.min(w, d) * 0.28} fill="#fff" stroke="#0f766e" strokeWidth={1.8} /><circle r={Math.min(w, d) * 0.11} fill="#0f766e" /></>}
          {absent && (
            <g stroke="#64748b" strokeWidth={2} strokeLinecap="round">
              <line x1={-w * 0.22} y1={-d * 0.22} x2={w * 0.22} y2={d * 0.22} /><line x1={w * 0.22} y1={-d * 0.22} x2={-w * 0.22} y2={d * 0.22} />
            </g>
          )}
        </g>
        {hasNote && <circle cx={radius * 0.72} cy={-radius * 0.72} r={4.4} fill="#f59e0b" stroke="#fff" strokeWidth={1.6} />}
      </g>
    </g>
  );
};

const Odontogram = ({ states, selected, active, onToothClick, deciduous, locked, maxWidth = 460 }: OdontogramProps) => {
  const layout = useMemo(() => (deciduous ? LAYOUTS.deciduous : LAYOUTS.permanent), [deciduous]);
  const ratio = layout.width / LAYOUTS.permanent.width;

  return (
    <svg
      className={`odonto ${locked ? 'locked' : ''}`} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Schéma dentaire"
      style={{ maxWidth: Math.round(maxWidth * ratio) }}
    >
      <text className="arch-label" x={layout.upperLabel.x} y={layout.upperLabel.y} textAnchor="middle">Maxillaire</text>
      <text className="arch-label" x={layout.lowerLabel.x} y={layout.lowerLabel.y} textAnchor="middle">Mandibule</text>
      {layout.spots.map((spot) => (
        <Tooth
          key={spot.code} spot={spot} state={states[spot.code]} selected={selected?.has(spot.code) ?? false}
          active={active === spot.code} onClick={() => { if (!locked) onToothClick(spot.code); }}
        />
      ))}
    </svg>
  );
};

export default Odontogram;
