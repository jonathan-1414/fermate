import { strToU8, zipSync } from 'fflate';
import type { Score } from '../model/types';
import { moduleById } from '../modules';
import { renderScoreToCanvas } from '../render/renderScore';
import { renderFullSystemsToCanvases } from '../render/renderFull';
import { baseFileName } from './filename';

/**
 * Builds the files for handing in: the Fermate file, the PDF, or both in one ZIP file.
 * The file name follows [klasse]_[name(n)]_[jjjj-mm-tt].
 */
export type Format = 'fermate' | 'pdf';

export async function buildHandIn(score: Score, formats: Format[], date: Date): Promise<File> {
  const base = baseFileName(score.meta, date);
  const parts: Array<{ name: string; type: string; bytes: Uint8Array }> = [];
  if (formats.includes('fermate')) {
    parts.push({ name: `${base}.fermate`, type: 'application/json', bytes: fermateBytes(score) });
  }
  if (formats.includes('pdf')) {
    parts.push({ name: `${base}.pdf`, type: 'application/pdf', bytes: await pdfBytes(score, date) });
  }
  if (parts.length === 0) throw new Error('No format chosen');
  if (parts.length === 1) return new File([parts[0].bytes as BlobPart], parts[0].name, { type: parts[0].type });
  const zip = zipSync(Object.fromEntries(parts.map((p) => [p.name, p.bytes])));
  return new File([zip as BlobPart], `${base}.zip`, { type: 'application/zip' });
}

/** The Fermate file: the score as readable JSON (with format and version). */
export function fermateBytes(score: Score): Uint8Array {
  return strToU8(JSON.stringify(score, null, 2));
}

/** Date as the PDF shows it, e.g. 13.11.2026. */
export function germanDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

/** The PDF: Modul 1 on one page A4 landscape, the full version in lines on A4 portrait pages. */
async function pdfBytes(score: Score, date: Date): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf'); // loaded only when needed
  const module = moduleById(score.moduleId);
  const pdf = new jsPDF({ orientation: module.overwrite ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
  if (module.overwrite) fullMusic(pdf, score, date);
  else modul1Music(pdf, score, date);
  return new Uint8Array(pdf.output('arraybuffer'));
}

const MARGIN = 15;

/** Title, name(s), class and date at the top of the first page. Returns where the music starts. */
function pageHead(pdf: Pdf, score: Score, date: Date): number {
  let y = MARGIN + 4;
  const { title, names, className } = score.meta;
  pdf.setFont('helvetica', 'bold');
  if (title) {
    pdf.setFontSize(18);
    pdf.text(title, MARGIN, y);
    y += 9;
  }
  pdf.setFontSize(11);
  const lines: Array<[string, string]> = [
    [names.length > 1 ? 'Namen:' : 'Name:', names.join(', ')],
    ['Klasse:', className],
    ['Datum:', germanDate(date)],
  ];
  for (const [label, value] of lines) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value, MARGIN + 18, y);
    y += 6;
  }
  return y + 6;
}

/** Modul 1: the music as one high-resolution picture (about 300 dpi when printed). */
function modul1Music(pdf: Pdf, score: Score, date: Date): void {
  const y = pageHead(pdf, score, date);
  const width = pdf.internal.pageSize.getWidth() - 2 * MARGIN;
  const canvas = renderScoreToCanvas(score, 4.5, moduleById(score.moduleId).showRests);
  const height = (width * canvas.height) / canvas.width;
  // 'FAST' compresses the picture (black notes on white: small), otherwise the PDF gets very large.
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y, width, height, undefined, 'FAST');
}

/** Width of a printed line in drawing units: the staff gets about 8 mm high on paper. */
const PRINT_WIDTH = 860;
/** Room between two lines of music (mm). */
const SYSTEM_GAP = 4;

/**
 * Full version: the lines of music below each other, a new page when the next line does not
 * fit any more. Page numbers when there is more than one page.
 */
function fullMusic(pdf: Pdf, score: Score, date: Date): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const width = pageWidth - 2 * MARGIN;
  const bottom = pageHeight - MARGIN - 6; // room for the page number
  // About 300 dpi when printed.
  const scale = ((width / 25.4) * 300) / PRINT_WIDTH;
  let y = pageHead(pdf, score, date);
  for (const canvas of renderFullSystemsToCanvases(score, PRINT_WIDTH, scale)) {
    const height = (width * canvas.height) / canvas.width;
    if (y + height > bottom && y > MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y, width, height, undefined, 'FAST');
    y += height + SYSTEM_GAP;
  }
  const pages = pdf.getNumberOfPages();
  if (pages > 1) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.text(`Seite ${page} von ${pages}`, pageWidth / 2, pageHeight - MARGIN, { align: 'center' });
    }
  }
}
