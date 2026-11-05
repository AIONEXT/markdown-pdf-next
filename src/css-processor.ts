/**
 * CSS processor with PostCSS for optimization and font handling.
 */

import * as fs from "fs/promises";
import * as path from "path";
import postcss from "postcss";
import postcssImport from "postcss-import";
import postcssUrl from "postcss-url";
import postcssCustomProperties from "postcss-custom-properties";
import postcssNested from "postcss-nested";
import cssTree from "css-tree";

export interface CSSProcessorOptions {
  baseUrl?: string;
  minify?: boolean;
  embedFonts?: boolean;
  autoprefixer?: boolean;
}

export class CSSProcessor {
  async process(css: string, options: CSSProcessorOptions = {}): Promise<string> {
    const { baseUrl = process.cwd(), minify = true, embedFonts = true } = options;

    const plugins = [
      postcssImport({ path: [baseUrl] }),
      postcssUrl({ url: "inline", maxSize: 10 * 1024 }), // Inline < 10KB
      postcssCustomProperties({ preserve: false }),
      postcssNested(),
    ];

    let result = await postcss(plugins).from(css, { from: path.join(baseUrl, "styles.css") });

    if (embedFonts) {
      result = await this.embedFonts(result, baseUrl);
    }

    if (minify) {
      result = await this.minify(result);
    }

    return result.css;
  }

  private async embedFonts(css: postcss.Result, baseUrl: string): Promise<postcss.Result> {
    // Find @font-face rules and inline font files
    const ast = cssTree.parse(css.css);
    const fontFaces: Array<{ family: string; src: string }> = [];

    cssTree.walk(ast, (node) => {
      if (node.type === "Atrule" && node.name === "font-face") {
        const src = node.prelude ? cssTree.generate(node.prelude) : "";
        const familyMatch = src.match(/font-family:\s*['"]?([^'";]+)['"]?/);
        const srcMatch = src.match(/src:\s*([^;]+)/);
        if (familyMatch && srcMatch) {
          fontFaces.push({ family: familyMatch[1], src: srcMatch[1] });
        }
      }
    });

    // For each font, try to inline
    for (const font of fontFaces) {
      const urls = font.src.match(/url\(['"]?([^'")]+)['"]?\)/g);
      if (urls) {
        for (const url of urls) {
          const fontUrl = url.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
          if (fontUrl && !fontUrl.startsWith("data:")) {
            try {
              const fontPath = path.resolve(baseUrl, fontUrl);
              const fontData = await fs.readFile(fontPath);
              const base64 = fontData.toString("base64");
              const mime = this.getMimeType(path.extname(fontUrl));
              const dataUrl = `data:${mime};base64,${base64}`;
              css.css = css.css.replace(fontUrl, dataUrl);
            } catch {
              // Font not found, skip
            }
          }
        }
      }
    }

    return css;
  }

  private getMimeType(ext: string): string {
    const types: Record<string, string> = {
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
      ".eot": "application/vnd.ms-fontobject",
    };
    return types[ext.toLowerCase()] || "application/octet-stream";
  }

  private async minify(css: postcss.Result): Promise<postcss.Result> {
    const ast = cssTree.parse(css.css);
    cssTree.optimize(ast);
    css.css = cssTree.generate(ast);
    return css;
  }
}