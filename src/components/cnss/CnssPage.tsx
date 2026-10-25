import { ReactNode } from 'react';
import page1Url from '../../assets/cnss/page1.jpg';
import page2Url from '../../assets/cnss/page2.jpg';
import { CnssData, treatedTeeth } from '../../cnss/model';
import {
  Comb as CombSpec, DIAGRAM, MAX_ACT_LINES, PAGE_H, PAGE_W, PANEL_H, PANEL_W, PANEL_X, PANEL_Y, RECTO, VERSO, actLineY, combCells,
} from '../../cnss/layout';
import { fmtDate } from '../../utils/format';

interface CnssPageProps {
  page: 'recto' | 'verso';
  data: CnssData;
  /** draw the scanned form under the ink (off = ink only, to print on an already printed form) */
  background: boolean;
  /** 'panel' = just the right-hand panel that is filled in (editor preview); 'page' = the whole A4 landscape side (printing) */
  view?: 'panel' | 'page';
  /** preview only: click a mark to remove it (to write it by hand), click its dotted outline to bring it back */
  onToggle?: (key: string) => void;
}

const INK = '#0b2a5a';
const FONT = "'Consolas', 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace";

const digitsOf = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : '');
const clean = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

const Comb = ({ comb, value }: { comb: CombSpec; value: string }) => {
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

interface Box { x: number; y: number; width: number; height: number }
const textBox = (x: number, y: number, text: string, size: number, anchor: 'start' | 'middle' | 'end' = 'start'): Box => {
  const w = Math.max(60, text.length * size * 0.62 + 16);
  return { x: anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x - 8, y: y - size - 4, width: w, height: size + 18 };
};
const combBox = (c: CombSpec): Box => {
  const left = Math.min(...c.groups.map((g) => g[0]));
  const right = Math.max(...c.groups.map((g) => g[1]));
  return { x: left - 6, y: c.baseline - 52, width: right - left + 12, height: 64 };
};
const crossBox = (at: [number, number]): Box => ({ x: at[0] - 24, y: at[1] - 24, width: 48, height: 48 });

/** One panel of the CNSS form with the data written on it. The same SVG is shown in the editor and printed. */
const CnssPage = ({ page, data, background, view = 'page', onToggle }: CnssPageProps) => {
  const hidden = new Set(data.hidden ?? []);

  /** a mark that can be removed in the preview (and is simply absent when printed) */
  const Item = ({ k, box, children }: { k: string; box: Box; children: ReactNode }) => {
    const off = hidden.has(k);
    if (!onToggle) return off ? null : <>{children}</>;
    return (
      <g className={off ? 'ink ink-off' : 'ink'} onClick={() => onToggle(k)}>
        <title>{off ? 'Cliquer pour remettre cette mention' : 'Cliquer pour retirer cette mention (à écrire à la main)'}</title>
        <rect className="hit" {...box} rx={6} />
        {!off && children}
      </g>
    );
  };
  const text = (k: string, x: number, y: number, value: string, size: number, anchor: 'start' | 'middle' | 'end' = 'start') =>
    value ? <Item key={k} k={k} box={textBox(x, y, value, size, anchor)}><text x={x} y={y} fontSize={size} textAnchor={anchor}>{value}</text></Item> : null;
  const comb = (k: string, c: CombSpec, value: string) =>
    value ? <Item key={k} k={k} box={combBox(c)}><Comb comb={c} value={value} /></Item> : null;
  const cross = (k: string, at: [number, number], on = true) =>
    on ? <Item key={k} k={k} box={crossBox(at)}><Cross at={at} /></Item> : null;

  return (
    <svg
      className={`cnss-svg ${onToggle ? 'editable' : ''}`}
      viewBox={view === 'panel' ? `${PANEL_X} ${PANEL_Y} ${PANEL_W} ${PANEL_H}` : `0 0 ${PAGE_W} ${PAGE_H}`}
      role="img" aria-label={page === 'recto' ? 'Feuille de soins dentaires, recto' : 'Feuille de soins dentaires, verso'}
    >
      {background
        ? <image href={page === 'recto' ? page1Url : page2Url} width={PAGE_W} height={PAGE_H} />
        : <rect width={PAGE_W} height={PAGE_H} fill="#fff" />}
      <g fill={INK} fontFamily={FONT} transform={`translate(${PANEL_X} ${PANEL_Y})`}>
        {page === 'recto' ? (
          <>
            {cross('entente', RECTO.checks.entente, data.entente)}
            {cross('execution', RECTO.checks.execution, data.execution)}
            {text('insuredName', RECTO.lines.insuredName.x, RECTO.lines.insuredName.y, data.insuredName, 32)}
            {comb('immat', RECTO.combs.immat, clean(data.immat))}
            {comb('insuredCin', RECTO.combs.insuredCin, clean(data.insuredCin))}
            {cross('relation', RECTO.checks[data.relation])}
            {wrap(data.address, 64).map((l, i) => text(`address${i}`, RECTO.lines[i === 0 ? 'address1' : 'address2'].x, RECTO.lines[i === 0 ? 'address1' : 'address2'].y, l, 30))}
            {text('fees', RECTO.lines.fees.x, RECTO.lines.fees.y, data.fees, 32, 'end')}
            {text('attachments', RECTO.lines.attachments.x, RECTO.lines.attachments.y, data.attachments, 32, 'middle')}

            {text('beneficiaryName', RECTO.lines.beneficiaryName.x, RECTO.lines.beneficiaryName.y, data.beneficiaryName, 32)}
            {comb('dob', RECTO.combs.dob, digitsOf(data.dob))}
            {comb('beneficiaryCin', RECTO.combs.beneficiaryCin, clean(data.beneficiaryCin))}
            {cross('sex', data.sex === 'F' ? RECTO.checks.sexF : RECTO.checks.sexM, data.sex !== '')}

            {comb('inp', RECTO.combs.inp, clean(data.inp))}
            {cross('careSoins', RECTO.checks.careSoins, data.careSoins)}
            {cross('careProthese', RECTO.checks.careProthese, data.careProthese)}
            {cross('careOrtho', RECTO.checks.careOrtho, data.careOrtho)}
            {cross('careAutres', RECTO.checks.careAutres, data.careAutres)}
            {comb('priorAgreement', RECTO.combs.priorAgreement, clean(data.priorAgreement))}
            {comb('accidentDate', RECTO.combs.accidentDate, digitsOf(data.accidentDate))}

            {text('placeInsured', RECTO.lines.placeInsured.x, RECTO.lines.placeInsured.y, data.placeInsured, 30)}
            {comb('dateInsured', RECTO.combs.dateInsured, digitsOf(data.dateInsured))}
            {text('placeDentist', RECTO.lines.placeDentist.x, RECTO.lines.placeDentist.y, data.placeDentist, 30)}
            {comb('dateDentist', RECTO.combs.dateDentist, digitsOf(data.dateDentist))}
          </>
        ) : (
          <>
            {data.acts.slice(0, MAX_ACT_LINES).map((a, n) => {
              const y = actLineY(n);
              const line = [a.teeth, a.code, fmtDate(a.date), a.coef, a.keyValue, a.amount].some(Boolean);
              return line ? (
                <Item key={a.id} k={`act:${a.id}`} box={{ x: 50, y: y - 34, width: 1710, height: 48 }}>
                  <g fontSize={28}>
                    <text x={VERSO.columns.teeth} y={y} textAnchor="middle">{a.teeth}</text>
                    {a.code.toUpperCase().slice(0, 4).split('').map((ch, i) => <text key={i} x={VERSO.codeCells[i]} y={y} textAnchor="middle">{ch}</text>)}
                    <text x={VERSO.columns.date} y={y} textAnchor="middle">{fmtDate(a.date)}</text>
                    <text x={VERSO.columns.coef} y={y} textAnchor="middle">{a.coef}</text>
                    <text x={VERSO.columns.keyValue} y={y} textAnchor="middle">{a.keyValue}</text>
                    <text x={VERSO.columns.amount} y={y} textAnchor="middle">{a.amount}</text>
                  </g>
                </Item>
              ) : null;
            })}
            {treatedTeeth(data.acts).map((t) => {
              if (!DIAGRAM[t]) return null;
              const [cx, cy] = DIAGRAM[t];
              const r = Number(t[0]) >= 5 ? 12 : 25;
              return (
                <Item key={`tooth:${t}`} k={`tooth:${t}`} box={{ x: cx - r - 4, y: cy - r - 4, width: 2 * r + 8, height: 2 * r + 8 }}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={r === 12 ? 3 : 4.5} />
                </Item>
              );
            })}
          </>
        )}
      </g>
    </svg>
  );
};

export default CnssPage;
