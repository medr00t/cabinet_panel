import rectoUrl from '../../assets/cnss/recto.jpg';
import versoUrl from '../../assets/cnss/verso.jpg';
import { CnssData, treatedTeeth } from '../../cnss/model';
import { DIAGRAM, MAX_ACT_LINES, PAGE_H, PAGE_W, RECTO, VERSO, actLineY, combCells } from '../../cnss/layout';
import { fmtDate } from '../../utils/format';

interface CnssPageProps {
  page: 'recto' | 'verso';
  data: CnssData;
  /** draw the scanned form under the ink (off = ink only, to print on an already printed form) */
  background: boolean;
}

const INK = '#0b2a5a';
const FONT = "'Consolas', 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace";

const digitsOf = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : '');
const clean = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

const Comb = ({ comb, value }: { comb: { groups: [number, number][]; baseline: number }; value: string }) => {
  const cells = combCells(comb);
  return (
    <>
      {value.slice(0, cells.length).split('').map((ch, i) => (
        <text key={i} x={cells[i]} y={comb.baseline - 6} textAnchor="middle" fontSize={36} fontWeight={600}>{ch}</text>
      ))}
    </>
  );
};

const Cross = ({ at }: { at: [number, number] }) => (
  <path d={`M${at[0] - 14} ${at[1] - 14} L${at[0] + 14} ${at[1] + 14} M${at[0] + 14} ${at[1] - 14} L${at[0] - 14} ${at[1] + 14}`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
);

const wrap = (text: string, width: number): string[] => {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    let cur = '';
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if ((cur + ' ' + word).trim().length > width && cur) { lines.push(cur); cur = word; } else cur = (cur + ' ' + word).trim();
    }
    lines.push(cur);
  }
  return lines.slice(0, 2);
};

/** One panel of the CNSS form with the data written on it. The same SVG is shown in the editor and printed. */
const CnssPage = ({ page, data, background }: CnssPageProps) => (
  <svg className="cnss-svg" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} role="img" aria-label={page === 'recto' ? 'Feuille de soins dentaires, recto' : 'Feuille de soins dentaires, actes effectués'}>
    {background
      ? <image href={page === 'recto' ? rectoUrl : versoUrl} width={PAGE_W} height={PAGE_H} />
      : <rect width={PAGE_W} height={PAGE_H} fill="#fff" />}
    <g fill={INK} fontFamily={FONT}>
      {page === 'recto' ? (
        <>
          {data.entente && <Cross at={RECTO.checks.entente} />}
          {data.execution && <Cross at={RECTO.checks.execution} />}
          <text {...RECTO.lines.insuredName} fontSize={32}>{data.insuredName}</text>
          <Comb comb={RECTO.combs.immat} value={clean(data.immat)} />
          <Comb comb={RECTO.combs.insuredCin} value={clean(data.insuredCin)} />
          <Cross at={RECTO.checks[data.relation]} />
          {wrap(data.address, 64).map((l, i) => <text key={i} {...(i === 0 ? RECTO.lines.address1 : RECTO.lines.address2)} fontSize={30}>{l}</text>)}
          <text x={RECTO.lines.fees.x} y={RECTO.lines.fees.y} textAnchor="end" fontSize={32}>{data.fees}</text>
          <text x={RECTO.lines.attachments.x} y={RECTO.lines.attachments.y} textAnchor="middle" fontSize={32}>{data.attachments}</text>

          <text {...RECTO.lines.beneficiaryName} fontSize={32}>{data.beneficiaryName}</text>
          <Comb comb={RECTO.combs.dob} value={digitsOf(data.dob)} />
          <Comb comb={RECTO.combs.beneficiaryCin} value={clean(data.beneficiaryCin)} />
          {data.sex === 'M' && <Cross at={RECTO.checks.sexM} />}
          {data.sex === 'F' && <Cross at={RECTO.checks.sexF} />}

          <Comb comb={RECTO.combs.inp} value={clean(data.inp)} />
          {data.careSoins && <Cross at={RECTO.checks.careSoins} />}
          {data.careProthese && <Cross at={RECTO.checks.careProthese} />}
          {data.careOrtho && <Cross at={RECTO.checks.careOrtho} />}
          {data.careAutres && <Cross at={RECTO.checks.careAutres} />}
          <Comb comb={RECTO.combs.priorAgreement} value={clean(data.priorAgreement)} />
          <Comb comb={RECTO.combs.accidentDate} value={digitsOf(data.accidentDate)} />

          <text {...RECTO.lines.placeInsured} fontSize={30}>{data.placeInsured}</text>
          <Comb comb={RECTO.combs.dateInsured} value={digitsOf(data.dateInsured)} />
          <text {...RECTO.lines.placeDentist} fontSize={30}>{data.placeDentist}</text>
          <Comb comb={RECTO.combs.dateDentist} value={digitsOf(data.dateDentist)} />
        </>
      ) : (
        <>
          {data.acts.slice(0, MAX_ACT_LINES).map((a, n) => {
            const y = actLineY(n);
            return (
              <g key={a.id} fontSize={28}>
                <text x={VERSO.columns.teeth} y={y} textAnchor="middle">{a.teeth}</text>
                {a.code.toUpperCase().slice(0, 4).split('').map((ch, i) => <text key={i} x={VERSO.codeCells[i]} y={y} textAnchor="middle">{ch}</text>)}
                <text x={VERSO.columns.date} y={y} textAnchor="middle">{fmtDate(a.date)}</text>
                <text x={VERSO.columns.coef} y={y} textAnchor="middle">{a.coef}</text>
                <text x={VERSO.columns.keyValue} y={y} textAnchor="middle">{a.keyValue}</text>
                <text x={VERSO.columns.amount} y={y} textAnchor="middle">{a.amount}</text>
              </g>
            );
          })}
          {treatedTeeth(data.acts).map((t) => DIAGRAM[t] && <circle key={t} cx={DIAGRAM[t][0]} cy={DIAGRAM[t][1]} r={Number(t[0]) >= 5 ? 12 : 25} fill="none" stroke={INK} strokeWidth={Number(t[0]) >= 5 ? 3 : 4.5} />)}
        </>
      )}
    </g>
  </svg>
);

export default CnssPage;
