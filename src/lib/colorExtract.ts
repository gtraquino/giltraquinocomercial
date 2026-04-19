function rgbToHsl(r: number, g: number, b: number): string {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Quantize colors and pick the two most prominent (skipping near-white/black)
function extractPalette(data: Uint8ClampedArray): [number, number, number][] {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < data.length; i += 4 * 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Skip near-white/black/grey
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 30 || min > 230 || max - min < 15) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r; existing.g += g; existing.b += b; existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  return sorted.slice(0, 3).map((c) => [
    Math.round(c.r / c.count),
    Math.round(c.g / c.count),
    Math.round(c.b / c.count),
  ]);
}

export async function extractColorsFromImage(url: string): Promise<{ primary: string; accent: string } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const palette = extractPalette(data);
        if (palette.length === 0) return resolve(null);
        const [p, a] = palette;
        resolve({
          primary: rgbToHsl(p[0], p[1], p[2]),
          accent: a ? rgbToHsl(a[0], a[1], a[2]) : rgbToHsl(p[0], p[1], p[2]),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
