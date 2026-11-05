/**
 * Font manager for downloading, caching, and embedding fonts.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

export interface FontConfig {
  family: string;
  weight?: number;
  style?: "normal" | "italic";
  source: "google" | "local" | "url";
  url?: string;
  localPath?: string;
  subset?: string[]; // Unicode ranges to subset
}

export interface FontFace {
  family: string;
  weight: number;
  style: string;
  data: Buffer;
  format: "woff2" | "woff" | "ttf" | "otf";
  subset?: string[];
}

export class FontManager {
  private cacheDir: string;
  private fonts: Map<string, FontFace> = new Map();

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(os.tmpdir(), "md-pdf-fonts");
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Load a font from Google Fonts.
   */
  async loadGoogleFont(config: Omit<FontConfig, "source">): Promise<FontFace> {
    const { family, weight = 400, style = "normal", subset = ["latin"] } = config;

    const cacheKey = this.getCacheKey("google", family, weight, style, subset);
    if (this.fonts.has(cacheKey)) {
      return this.fonts.get(cacheKey)!;
    }

    // Build Google Fonts URL
    const subsetParam = subset.join(",");
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap&subset=${subsetParam}`;

    // Fetch CSS to get actual font URLs
    const response = await fetch(url);
    const css = await response.text();

    // Parse CSS for font URLs
    const fontUrls = this.parseGoogleFontCSS(css, weight, style);
    if (fontUrls.length === 0) {
      throw new Error(`No font URLs found for ${family}`);
    }

    // Download the first available format (prefer woff2)
    const fontUrl = fontUrls.find(f => f.format === "woff2") || fontUrls[0];
    const fontData = await this.downloadFont(fontUrl.url);

    const fontFace: FontFace = {
      family,
      weight,
      style,
      data: fontData,
      format: fontUrl.format,
      subset,
    };

    // Cache to disk
    await this.cacheFont(cacheKey, fontFace);
    this.fonts.set(cacheKey, fontFace);

    return fontFace;
  }

  /**
   * Load a local font file.
   */
  async loadLocalFont(config: FontConfig): Promise<FontFace> {
    const { family, weight = 400, style = "normal", localPath } = config;
    if (!localPath) throw new Error("localPath required for local font");

    const cacheKey = this.getCacheKey("local", family, weight, style);
    if (this.fonts.has(cacheKey)) {
      return this.fonts.get(cacheKey)!;
    }

    const fontData = await fs.readFile(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const format = ext === ".woff2" ? "woff2" : ext === ".woff" ? "woff" : ext === ".ttf" ? "ttf" : "otf";

    const fontFace: FontFace = {
      family,
      weight,
      style,
      data: fontData,
      format,
    };

    await this.cacheFont(cacheKey, fontFace);
    this.fonts.set(cacheKey, fontFace);

    return fontFace;
  }

  /**
   * Load a font from a URL.
   */
  async loadUrlFont(config: FontConfig): Promise<FontFace> {
    const { family, weight = 400, style = "normal", url } = config;
    if (!url) throw new Error("url required for url font");

    const cacheKey = this.getCacheKey("url", family, weight, style, [url]);
    if (this.fonts.has(cacheKey)) {
      return this.fonts.get(cacheKey)!;
    }

    const fontData = await this.downloadFont(url);
    const format = this.detectFormat(url, fontData);

    const fontFace: FontFace = {
      family,
      weight,
      style,
      data: fontData,
      format,
    };

    await this.cacheFont(cacheKey, fontFace);
    this.fonts.set(cacheKey, fontFace);

    return fontFace;
  }

  /**
   * Get a cached font face.
   */
  getFont(family: string, weight = 400, style = "normal"): FontFace | undefined {
    const cacheKey = this.getCacheKey("any", family, weight, style);
    return this.fonts.get(cacheKey);
  }

  /**
   * Generate @font-face CSS for loaded fonts.
   */
  generateFontFaceCSS(): string {
    const faces: string[] = [];
    for (const [, font] of this.fonts) {
      const base64 = font.data.toString("base64");
      const mime = this.getMimeType(font.format);
      faces.push(`@font-face {
  font-family: '${font.family}';
  font-weight: ${font.weight};
  font-style: ${font.style};
  src: url(data:${mime};base64,${base64}) format('${font.format}');
  font-display: swap;
}`);
    }
    return faces.join("\n");
  }

  private getCacheKey(source: string, family: string, weight: number, style: string, extra?: string[]): string {
    const parts = [source, family, weight.toString(), style, ...(extra || [])];
    return crypto.createHash("md5").update(parts.join("|")).digest("hex");
  }

  private parseGoogleFontCSS(css: string, weight: number, style: string): Array<{ url: string; format: string }> {
    const urls: Array<{ url: string; format: string }> = [];
    const regex = /url\(([^)]+)\)\s*format\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = regex.exec(css)) !== null) {
      urls.push({ url: match[1], format: match[2] });
    }
    // Sort: woff2 first, then woff, then others
    return urls.sort((a, b) => {
      const order = { woff2: 0, woff: 1, ttf: 2, otf: 3 };
      return (order[a.format as keyof typeof order] || 99) - (order[b.format as keyof typeof order] || 99);
    });
  }

  private async downloadFont(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download font: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private detectFormat(url: string, data: Buffer): "woff2" | "woff" | "ttf" | "otf" {
    // Check file extension
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === ".woff2") return "woff2";
    if (ext === ".woff") return "woff";
    if (ext === ".ttf") return "ttf";
    if (ext === ".otf") return "otf";

    // Check magic bytes
    if (data.length >= 4) {
      const magic = data.subarray(0, 4);
      if (magic[0] === 0x77 && magic[1] === 0x4F && magic[2] === 0x46 && magic[3] === 0x32) return "woff2"; // wOF2
      if (magic[0] === 0x77 && magic[1] === 0x4F && magic[2] === 0x46 && magic[3] === 0x46) return "woff";  // wOFF
      if (magic[0] === 0x00 && magic[1] === 0x01 && magic[2] === 0x00 && magic[3] === 0x00) return "ttf";  // TrueType
      if (magic[0] === 0x4F && magic[1] === 0x54 && magic[2] === 0x54 && magic[3] === 0x4F) return "otf";  // OTTO
    }
    return "woff2"; // Default
  }

  private async cacheFont(key: string, font: FontFace): Promise<void> {
    const fontFile = path.join(this.cacheDir, `${key}.${font.format}`);
    await fs.writeFile(fontFile, font.data);

    const metaFile = path.join(this.cacheDir, `${key}.json`);
    await fs.writeFile(metaFile, JSON.stringify({
      family: font.family,
      weight: font.weight,
      style: font.style,
      format: font.format,
      subset: font.subset,
    }));
  }

  private getMimeType(format: string): string {
    const types: Record<string, string> = {
      woff2: "font/woff2",
      woff: "font/woff",
      ttf: "font/ttf",
      otf: "font/otf",
    };
    return types[format] || "application/octet-stream";
  }
}