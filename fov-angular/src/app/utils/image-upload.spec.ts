import { readImageAsDataUrl, UploadOptions } from './image-upload';

describe('readImageAsDataUrl', () => {
  const defaultOptions: UploadOptions = {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.85,
    maxSizeKb: 2048,
  };

  function createMockFile(name: string, type: string, sizeBytes: number): File {
    // Build a File whose reported size matches sizeBytes without allocating 100MB.
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
    return file;
  }

  // ── Global mocks (restored after each test) ────────────────────
  let originalFileReader: typeof FileReader;
  let originalImage: typeof Image;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalFileReader = globalThis.FileReader;
    originalImage = globalThis.Image;
    originalCreateElement = document.createElement;
  });

  afterEach(() => {
    (globalThis as any).FileReader = originalFileReader;
    (globalThis as any).Image = originalImage;
    document.createElement = originalCreateElement;
  });

  // ── Validation guards ─────────────────────────────────────────
  describe('validation', () => {
    it('should reject non-image files', async () => {
      const file = createMockFile('doc.pdf', 'application/pdf', 1024);
      await expectAsync(
        readImageAsDataUrl(file, defaultOptions),
      ).toBeRejectedWithError(/image/);
    });

    it('should reject files exceeding maxSizeKb', async () => {
      const file = createMockFile('big.png', 'image/png', 3 * 1024 * 1024);
      await expectAsync(
        readImageAsDataUrl(file, defaultOptions),
      ).toBeRejectedWithError(/2048 Ko/);
    });

    it('should accept files exactly at maxSizeKb', async () => {
      const file = createMockFile('ok.png', 'image/png', 2048 * 1024);

      installFileReaderSuccess('data:image/png;base64,fake');
      installImageLoad(100, 100);
      installCanvasMock();

      const result = await readImageAsDataUrl(file, defaultOptions);
      expect(result).toBeTruthy();
    });

    it('should skip size check when maxSizeKb is undefined', async () => {
      const file = createMockFile('huge.jpg', 'image/jpeg', 100 * 1024 * 1024);
      const opts: UploadOptions = { maxWidth: 400, maxHeight: 400 };

      installFileReaderSuccess('data:image/jpeg;base64,fake');
      installImageLoad(100, 100);
      installCanvasMock();

      const result = await readImageAsDataUrl(file, opts);
      expect(result).toBeTruthy();
    });
  });

  // ── Image processing ──────────────────────────────────────────
  describe('image processing', () => {
    it('should resize image to fit within maxWidth/maxHeight', async () => {
      const file = createMockFile('photo.jpg', 'image/jpeg', 1024);

      installFileReaderSuccess('data:image/jpeg;base64,fake');
      installImageLoad(2000, 1000);
      const canvasState = installCanvasMock();

      const result = await readImageAsDataUrl(file, defaultOptions);

      expect(canvasState.width).toBe(400);
      expect(canvasState.height).toBe(200);
      expect(result).toBeTruthy();
    });

    it('should not upscale images smaller than max dimensions', async () => {
      const file = createMockFile('small.png', 'image/png', 512);

      installFileReaderSuccess('data:image/png;base64,fake');
      installImageLoad(100, 50);
      const canvasState = installCanvasMock();

      await readImageAsDataUrl(file, defaultOptions);

      // ratio = min(400/100, 400/50, 1) = 1
      expect(canvasState.width).toBe(100);
      expect(canvasState.height).toBe(50);
    });

    it('should use image/png format for PNG files', async () => {
      const file = createMockFile('icon.png', 'image/png', 512);

      installFileReaderSuccess('data:image/png;base64,fake');
      installImageLoad(50, 50);
      const canvasState = installCanvasMock();

      await readImageAsDataUrl(file, defaultOptions);

      expect(canvasState.toDataURLFormat).toBe('image/png');
    });

    it('should use image/jpeg format for non-PNG files', async () => {
      const file = createMockFile('photo.webp', 'image/webp', 512);

      installFileReaderSuccess('data:image/webp;base64,fake');
      installImageLoad(50, 50);
      const canvasState = installCanvasMock();

      await readImageAsDataUrl(file, defaultOptions);

      expect(canvasState.toDataURLFormat).toBe('image/jpeg');
    });

    it('should resolve original dataUrl when canvas context is null', async () => {
      const file = createMockFile('photo.jpg', 'image/jpeg', 512);

      installFileReaderSuccess('data:image/jpeg;base64,originalData');
      installImageLoad(100, 100);

      document.createElement = ((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => null,
            toDataURL: () => '',
          } as any;
        }
        return originalCreateElement.call(document, tag);
      }) as typeof document.createElement;

      const result = await readImageAsDataUrl(file, defaultOptions);
      expect(result).toBe('data:image/jpeg;base64,originalData');
    });
  });

  // ── Error paths ───────────────────────────────────────────────
  describe('error handling', () => {
    it('should reject when FileReader fails', async () => {
      const file = createMockFile('broken.jpg', 'image/jpeg', 512);

      (globalThis as any).FileReader = class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        result = '';
        readAsDataURL(): void {
          setTimeout(() => this.onerror?.(), 0);
        }
      };

      await expectAsync(
        readImageAsDataUrl(file, defaultOptions),
      ).toBeRejectedWithError(/Impossible de lire/);
    });

    it('should reject when Image fails to load', async () => {
      const file = createMockFile('corrupt.jpg', 'image/jpeg', 512);

      installFileReaderSuccess('data:image/jpeg;base64,corrupt');

      (globalThis as any).Image = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 0;
        height = 0;
        set src(_v: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      };

      await expectAsync(
        readImageAsDataUrl(file, defaultOptions),
      ).toBeRejectedWithError(/invalide/);
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────

function installFileReaderSuccess(dataUrl: string): void {
  (globalThis as any).FileReader = class {
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result = '';
    readAsDataURL(): void {
      this.result = dataUrl;
      setTimeout(() => this.onload?.(), 0);
    }
  };
}

function installImageLoad(width: number, height: number): void {
  (globalThis as any).Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = width;
    height = height;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  };
}

interface CanvasState {
  width: number;
  height: number;
  toDataURLFormat: string;
}

/**
 * Replaces document.createElement('canvas') with a controllable mock.
 * Other tags fall back to the real implementation.
 */
function installCanvasMock(): CanvasState {
  const state: CanvasState = { width: 0, height: 0, toDataURLFormat: '' };
  const realCreate = document.createElement.bind(document);

  document.createElement = ((tag: string) => {
    if (tag === 'canvas') {
      return {
        set width(v: number) { state.width = v; },
        get width() { return state.width; },
        set height(v: number) { state.height = v; },
        get height() { return state.height; },
        getContext: () => ({
          drawImage: () => { /* noop */ },
        }),
        toDataURL: (format: string) => {
          state.toDataURLFormat = format;
          return `data:${format};base64,mockOutput`;
        },
      } as any;
    }
    return realCreate(tag);
  }) as typeof document.createElement;

  return state;
}
