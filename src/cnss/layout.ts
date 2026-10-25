// The CNSS "Feuille de soins dentaires" is one A4 sheet in landscape, folded in half: each side holds two A5 panels
// (front: instructions | form; back: prescriptions, lab and paramedical acts | acts and tooth diagram).
// The bundled scans are the two sides (src/assets/cnss/page1.jpg, page2.jpg). Page coordinates are pixels of the
// 300 dpi scan (4299 x 3035); every field below is given in the coordinates of the right-hand panel that is filled in,
// whose top-left corner is at (PANEL_X, PANEL_Y) on the page.

export const PAGE_W = 4299;
export const PAGE_H = 3035;
export const PANEL_X = 2400;
export const PANEL_Y = 60;
export const PANEL_W = 1810;
export const PANEL_H = 2660;

/** One box per digit/letter, e.g. the 9 boxes of the immatriculation number. `groups` are the printed boxes. */
export interface Comb { groups: [number, number][]; baseline: number }
const CELL = 41.7;

/** Centres of the boxes of a comb (a date has three groups: jj mm aaaa). */
export const combCells = (comb: Comb): number[] =>
  comb.groups.flatMap(([l, r]) => {
    const n = Math.max(1, Math.round((r - l) / CELL));
    const w = (r - l) / n;
    return Array.from({ length: n }, (_, i) => l + (i + 0.5) * w);
  });

export interface Line { x: number; y: number; anchor?: 'start' | 'middle' | 'end' }

export const RECTO = {
  combs: {
    immat: { groups: [[389, 763]], baseline: 478 },
    insuredCin: { groups: [[986, 1362]], baseline: 537 },
    dob: { groups: [[810, 893], [913, 997], [1010, 1184]], baseline: 1154 },
    beneficiaryCin: { groups: [[843, 1218]], baseline: 1242 },
    inp: { groups: [[208, 582]], baseline: 1468 },
    priorAgreement: { groups: [[772, 1146]], baseline: 1873 },
    accidentDate: { groups: [[792, 874], [894, 978], [992, 1165]], baseline: 1948 },
    dateInsured: { groups: [[286, 370], [388, 473], [486, 660]], baseline: 2205 },
    dateDentist: { groups: [[1165, 1248], [1267, 1352], [1364, 1538]], baseline: 2205 },
  } satisfies Record<string, Comb>,
  lines: {
    insuredName: { x: 302, y: 384 },
    address1: { x: 232, y: 714 },
    address2: { x: 232, y: 762 },
    fees: { x: 702, y: 834, anchor: 'end' },
    attachments: { x: 1128, y: 882, anchor: 'middle' },
    beneficiaryName: { x: 308, y: 1080 },
    placeInsured: { x: 296, y: 2122 },
    placeDentist: { x: 1206, y: 2122 },
  } satisfies Record<string, Line>,
  /** centres of the tick boxes */
  checks: {
    entente: [776, 220], execution: [1140, 220],
    spouse: [659, 647], child: [939, 647], self: [1248, 647],
    sexM: [1107, 1302], sexF: [1337, 1302],
    careSoins: [896, 1578], careProthese: [896, 1646], careOrtho: [896, 1712], careAutres: [896, 1778],
  } satisfies Record<string, [number, number]>,
};

export const VERSO = {
  /** x centres of the columns of "Description des actes effectués" */
  columns: { teeth: 145, date: 552, coef: 768, keyValue: 975, amount: 1181 },
  /** the four dotted boxes of the "Code des actes" column */
  codeCells: [270, 319, 368, 415],
  /** the three big rows of the table: top y and height */
  rows: [{ top: 221, height: 312 }, { top: 533, height: 293 }, { top: 826, height: 302 }],
  linesPerRow: 5,
  firstLine: 44,
  lineHeight: 58,
};

export const MAX_ACT_LINES = VERSO.rows.length * VERSO.linesPerRow;

/** Baseline of the n-th act line (0-based) on the back of the sheet. */
export const actLineY = (n: number): number => {
  const row = VERSO.rows[Math.floor(n / VERSO.linesPerRow)];
  return row.top + VERSO.firstLine + (n % VERSO.linesPerRow) * VERSO.lineHeight;
};

/**
 * The tooth diagram printed on the back numbers every quadrant 1-8 from the middle; the app uses FDI
 * numbers (11-48). Position of the printed digit next to each tooth, to circle the treated ones.
 */
export const DIAGRAM: Record<string, [number, number]> = (() => {
  const q1 = [[802, 1355], [759, 1379], [718, 1416], [691, 1458], [657, 1515], [641, 1577], [621, 1645], [610, 1716]];
  const q2 = [[885, 1355], [927, 1379], [973, 1416], [996, 1464], [1022, 1523], [1041, 1581], [1054, 1650], [1067, 1721]];
  const q3 = [[880, 2191], [925, 2174], [960, 2141], [991, 2096], [1015, 2050], [1038, 1996], [1051, 1929], [1066, 1854]];
  const q4 = [[800, 2191], [753, 2174], [709, 2138], [676, 2094], [657, 2049], [634, 1993], [619, 1931], [605, 1856]];
  const out: Record<string, [number, number]> = {};
  [q1, q2, q3, q4].forEach((q, qi) => q.forEach((p, j) => { out[`${qi + 1}${j + 1}`] = p as [number, number]; }));
  // baby teeth: the small digits of the inner arch (5x upper right, 6x upper left, 7x lower left, 8x lower right)
  const baby: Record<string, [number, number][]> = {
    '5': [[829, 1527], [814, 1532], [802, 1547], [793, 1568], [788, 1587]],
    '6': [[851, 1527], [864, 1533], [874, 1551], [881, 1570], [891, 1591]],
    '7': [[851, 2029], [864, 2027], [874, 2018], [886, 1998], [894, 1970]],
    '8': [[828, 2030], [813, 2027], [802, 2018], [795, 1999], [784, 1970]],
  };
  for (const [q, list] of Object.entries(baby)) list.forEach((p, j) => { out[`${q}${j + 1}`] = p; });
  return out;
})();
