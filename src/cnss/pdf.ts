// Turns the sheet pages (SVG) into a PDF without any library: each page is drawn to a canvas, saved as
// a JPEG and embedded in a minimal hand-written PDF file (A4, one image per page).

const enc = new TextEncoder();

interface PdfPage { jpeg: Uint8Array; width: number; height: number }

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 22.7; // 8 mm

export function jpegPagesToPdf(pages: PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: string | Uint8Array) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); size += u.length; };
  const begin = (n: number) => { offsets[n] = size; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ');
  begin(2); push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((p, i) => {
    const [page, content, image] = [3 + 3 * i, 4 + 3 * i, 5 + 3 * i];
    const scale = Math.min((A4_W - 2 * MARGIN) / p.width, (A4_H - 2 * MARGIN) / p.height);
    const w = p.width * scale;
    const h = p.height * scale;
    const stream = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((A4_W - w) / 2).toFixed(2)} ${((A4_H - h) / 2).toFixed(2)} cm /Im0 Do Q`;
    begin(page);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`);
    begin(content);
    push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    begin(image);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });

  const count = 3 + 3 * pages.length;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });

/** SVG drawn as an image cannot load files, so the scanned form is inlined as a data URI first. */
async function svgToJpeg(svg: SVGSVGElement, width: number): Promise<PdfPage> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  for (const img of Array.from(clone.querySelectorAll('image'))) {
    const url = img.getAttribute('href') ?? '';
    const data = await blobToDataUri(await (await fetch(url)).blob());
    img.setAttribute('href', data);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', data);
  }
  const [vw, vh] = (svg.getAttribute('viewBox') ?? '0 0 1810 2660').split(/\s+/).slice(2).map(Number);
  const height = Math.round((width * vh) / vw);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Impossible de dessiner la feuille'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.93));
  if (!blob) throw new Error('Impossible de créer l\'image de la feuille');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** The printable sheet as PDF bytes (2480 px wide pages, about 300 dpi on A4). */
export async function sheetsToPdf(svgs: SVGSVGElement[]): Promise<Uint8Array> {
  const pages: PdfPage[] = [];
  for (const svg of svgs) pages.push(await svgToJpeg(svg, 2480));
  return jpegPagesToPdf(pages);
}

export const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
