/**
 * Shrinks a picture in the browser before it is saved, so it fits the free plan
 * (files sit inside database documents). Keeps the shape, fits the longest side
 * within maxSide, and lowers quality until it is under maxBytes.
 */
export async function shrinkImage(file: File, maxSide: number, maxBytes: number): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('Use a PNG, JPG, WebP or GIF picture.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That picture is over 15 MB. Please choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That picture couldn’t be opened.'));
      i.src = url;
    });
    let side = maxSide;
    for (let round = 0; round < 6; round++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.58, 0.46]) {
        let out = c.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q);
        if (out.length * 0.75 <= maxBytes) return out;
      }
      side = Math.round(side * 0.75);
    }
    throw new Error('That picture is too detailed to fit. Try a simpler or smaller one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Data URLs are stored as text; their size in the database is about their length. */
export const dataUrlBytes = (s: string) => Math.round(s.length);
