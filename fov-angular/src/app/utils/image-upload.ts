export interface UploadOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  maxSizeKb?: number;
}

export function readImageAsDataUrl(
  file: File,
  options: UploadOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Le fichier doit être une image.'));
      return;
    }

    if (options.maxSizeKb && file.size > options.maxSizeKb * 1024) {
      reject(new Error(`L'image ne doit pas dépasser ${options.maxSizeKb} Ko.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;

      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide.'));
      img.onload = () => {
        const ratio = Math.min(
          options.maxWidth / img.width,
          options.maxHeight / img.height,
          1,
        );
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = options.quality ?? 0.85;
        resolve(canvas.toDataURL(format, quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
