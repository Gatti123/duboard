// Client-side image compression: longest side <= 1280px, JPEG ~0.82. Typically 150-400 KB per photo.
const MAX_SIDE = 1280;
const QUALITY = 0.82;

// Small copy for feed cards: longest side <= 480px, JPEG ~0.7 (typically 20-40 KB).
export const makeThumb = (file) => compressImage(file, 480, 0.7);

export async function compressImage(file, maxSide = MAX_SIDE, quality = QUALITY) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadViaImg(file);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG/WebP transparency -> white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('compress_failed');
  return new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
    img.src = url;
  });
}
