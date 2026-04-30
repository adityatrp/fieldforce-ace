// Compress an image file to approximately the target size (KB) using
// progressive quality + dimension downscaling. Returns a JPEG Blob/File.
// Aim for ~200 KB per upload (range 100–250 KB) to keep storage + bandwidth low.
const TARGET_KB = 200;
const MAX_DIM = 1600;

export async function compressImage(
  file: File,
  targetKB: number = TARGET_KB
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  // Scale down if needed
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, quality);
  // Iteratively reduce quality
  while (blob && blob.size / 1024 > targetKB && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  // If still too large, downscale dimensions
  while (blob && blob.size / 1024 > targetKB && (canvas.width > 800 || canvas.height > 800)) {
    canvas.width = Math.round(canvas.width * 0.85);
    canvas.height = Math.round(canvas.height * 0.85);
    const c2 = canvas.getContext('2d');
    if (!c2) break;
    c2.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, quality);
  }

  if (!blob) return file;
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}
