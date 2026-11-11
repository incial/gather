import type { TextItem } from './scheduleParse';

/** Pulls positioned text out of a PDF in the browser. Scanned (image-only) PDFs have no text and return []. */
export async function pdfTextItems(file: File): Promise<TextItem[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const items: TextItem[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const [, , , , x, y] = it.transform as number[];
      items.push({ str: it.str, x, y: height - y, page: p });
    }
  }
  await task.destroy();
  return items;
}
