/**
 * Streaming converter for large documents.
 */

import { Converter, ConversionOptions } from "./converter";
import { Renderer } from "./renderer";

export interface StreamOptions {
  chunkSize?: number; // Characters per chunk
  renderer?: any;
  pdf?: any;
  css?: string;
  onProgress?: (progress: { processed: number; total: number; percentage: number }) => void;
}

export class StreamingConverter {
  private converter: Converter;

  constructor() {
    this.converter = new Converter();
  }

  async convert(markdown: string, options: StreamOptions = {}): Promise<Buffer> {
    const { chunkSize = 50000, onProgress } = options;

    // Split markdown into chunks by headings
    const chunks = this.splitByHeadings(markdown, chunkSize);

    if (chunks.length === 1) {
      // Small document, convert normally
      const result = await this.converter.convert(markdown, options);
      return result.buffer;
    }

    // Convert each chunk to HTML
    const htmlChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await this.converter.convert(chunks[i], options);
      htmlChunks.push(result.html);

      if (onProgress) {
        onProgress({
          processed: i + 1,
          total: chunks.length,
          percentage: Math.round(((i + 1) / chunks.length) * 100),
        });
      }
    }

    // Combine HTML chunks
    const combinedHtml = this.combineHTMLChunks(htmlChunks);

    // Render combined HTML to PDF
    const renderer = new Renderer(options.renderer);
    const pdfBuffer = await renderer.render(combinedHtml, options.pdf);
    await renderer.close();

    return pdfBuffer;
  }

  private splitByHeadings(markdown: string, maxSize: number): string[] {
    const lines = markdown.split("\n");
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const line of lines) {
      const isHeading = line.match(/^#{1,6}\s/);

      if (isHeading && currentSize > 0 && currentSize + line.length > maxSize) {
        chunks.push(currentChunk.join("\n"));
        currentChunk = [line];
        currentSize = line.length;
      } else {
        currentChunk.push(line);
        currentSize += line.length + 1;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));
    }

    return chunks;
  }

  private combineHTMLChunks(htmlChunks: string[]): string {
    // Extract body content from each chunk
    const bodies = htmlChunks.map(html => {
      const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      return match ? match[1] : html;
    });

    // Get head from first chunk
    const headMatch = htmlChunks[0].match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const head = headMatch ? `<head>${headMatch[1]}</head>` : "<head></head>";

    return `<!DOCTYPE html>
<html>
${head}
<body>
${bodies.join("\n")}
</body>
</html>`;
  }
}