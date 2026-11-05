/**
 * Core markdown to HTML converter.
 */

import * as fs from "fs/promises";
import * as path from "path";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import toc from "markdown-it-toc-done-right";
import { Renderer } from "./renderer";
import { CSSProcessor } from "./css-processor";

export interface ConversionOptions {
  pdf?: any;
  css?: string;
  baseUrl?: string;
  template?: string;
}

export interface ConversionResult {
  html: string;
  buffer: Buffer;
  metadata: {
    title?: string;
    wordCount: number;
    pageCount?: number;
  };
}

export class Converter {
  private md: MarkdownIt;
  private renderer: Renderer;
  private cssProcessor: CSSProcessor;
  private baseUrl: string;
  private template: string;

  constructor(options: { renderer?: any; css?: string; baseUrl?: string; template?: string }) {
    this.md = MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })
      .use(anchor, { permalink: anchor.permalink.headerLink() })
      .use(toc);

    this.renderer = new Renderer(options.renderer);
    this.cssProcessor = new CSSProcessor();
    this.baseUrl = options.baseUrl || process.cwd();
    this.template = options.template || this.getDefaultTemplate();
  }

  async convert(markdown: string, options: ConversionOptions = {}): Promise<ConversionResult> {
    // Process markdown to HTML
    let html = this.md.render(markdown);

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1] : undefined;

    // Process CSS
    let css = options.css || "";
    if (css && !css.startsWith("<style") && !css.includes("{")) {
      // It's a file path
      css = await fs.readFile(path.resolve(this.baseUrl, css), "utf-8");
    }
    css = await this.cssProcessor.process(css, { baseUrl: this.baseUrl });

    // Wrap in template
    html = this.wrapInTemplate(html, css, title);

    // Render to PDF
    const buffer = await this.renderer.render(html, options.pdf);

    return {
      html,
      buffer,
      metadata: {
        title,
        wordCount: markdown.split(/\s+/).length,
      },
    };
  }

  private wrapInTemplate(content: string, css: string, title?: string): string {
    return this.template
      .replace("{{content}}", content)
      .replace("{{css}}", css)
      .replace("{{title}}", title || "Document");
  }

  private getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>{{css}}</style>
  <style>
    @page { margin: 2cm; size: A4; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    h1, h2, h3, h4, h5, h6 { color: #111; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2.5em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-family: 'Monaco', 'Consolas', monospace; }
    pre { background: #f8f8f8; padding: 1em; border-radius: 4px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; padding-left: 1em; color: #666; margin: 1em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 0.5em 1em; text-align: left; }
    th { background: #f4f4f4; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .toc { border: 1px solid #eee; padding: 1em; margin: 2em 0; border-radius: 4px; }
    .toc ul { list-style: none; padding-left: 1.5em; }
  </style>
</head>
<body>
  {{content}}
</body>
</html>`;
  }
}