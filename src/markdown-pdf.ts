/**
 * Main MarkdownPDF class for converting Markdown to PDF.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { Converter } from "./converter";
import { PDFOptions, RendererType } from "./renderer";
import { PDFAValidator, PDFALevel } from "./pdfa-validator";
import { AccessibilityChecker, AccessibilityLevel } from "./accessibility";
import { StreamingConverter } from "./streaming";

export interface MarkdownPDFOptions {
  /** Input markdown file or string */
  input?: string;
  /** Input as markdown string (alternative to file) */
  markdown?: string;
  /** Output PDF file path */
  output?: string;
  /** Return as buffer instead of writing to file */
  buffer?: boolean;
  /** Renderer to use */
  renderer?: RendererType;
  /** PDF options */
  pdf?: PDFOptions;
  /** CSS file or string for styling */
  css?: string;
  /** Enable PDF/A compliance */
  pdfa?: PDFALevel;
  /** Enable accessibility features */
  accessibility?: AccessibilityLevel;
  /** Enable streaming for large documents */
  streaming?: boolean;
  /** Custom remark/markdown-it plugins */
  plugins?: any[];
  /** Base URL for relative paths */
  baseUrl?: string;
  /** Template for HTML wrapper */
  template?: string;
}

export class MarkdownPDF {
  private options: MarkdownPDFOptions;
  private converter: Converter;
  private streamingConverter: StreamingConverter;

  constructor(options: MarkdownPDFOptions = {}) {
    this.options = {
      renderer: "puppeteer",
      pdfa: "none",
      accessibility: "none",
      streaming: false,
      ...options,
    };
    this.converter = new Converter({
      renderer: this.options.renderer,
      css: this.options.css,
      baseUrl: this.options.baseUrl,
      template: this.options.template,
    });
    this.streamingConverter = new StreamingConverter();
  }

  /** Convert markdown file/string to PDF. */
  async convert(): Promise<Buffer | string> {
    const input = this.options.input || this.options.markdown;
    if (!input) {
      throw new Error("Either input file or markdown string must be provided");
    }

    let markdown: string;
    if (this.options.input) {
      markdown = await fs.readFile(this.options.input, "utf-8");
    } else {
      markdown = this.options.markdown!;
    }

    let pdfBuffer: Buffer;

    if (this.options.streaming) {
      pdfBuffer = await this.streamingConverter.convert(markdown, {
        renderer: this.options.renderer,
        pdf: this.options.pdf,
        css: this.options.css,
      });
    } else {
      const result = await this.converter.convert(markdown, {
        pdf: this.options.pdf,
      });
      pdfBuffer = result.buffer;
    }

    // Apply PDF/A compliance if requested
    if (this.options.pdfa && this.options.pdfa !== "none") {
      const validator = new PDFAValidator(this.options.pdfa);
      const validation = await validator.validate(pdfBuffer);
      if (!validation.valid) {
        throw new Error(`PDF/A validation failed: ${validation.errors.join(", ")}`);
      }
      // Re-convert with PDF/A requirements
      pdfBuffer = await this.makePDFACompliant(pdfBuffer);
    }

    // Apply accessibility if requested
    if (this.options.accessibility && this.options.accessibility !== "none") {
      const checker = new AccessibilityChecker(this.options.accessibility);
      const result = await checker.check(pdfBuffer);
      if (!result.passed) {
        console.warn(`Accessibility issues: ${result.issues.join(", ")}`);
      }
    }

    if (this.options.output) {
      await fs.writeFile(this.options.output, pdfBuffer);
      return this.options.output;
    }

    if (this.options.buffer) {
      return pdfBuffer;
    }

    return pdfBuffer;
  }

  private async makePDFACompliant(buffer: Buffer): Promise<Buffer> {
    // Add PDF/A metadata, embed fonts, etc.
    // This is a simplified implementation
    return buffer;
  }

  /** Static convenience method. */
  static async fromFile(input: string, output: string, options?: Omit<MarkdownPDFOptions, "input" | "output">): Promise<string> {
    const converter = new MarkdownPDF({ input, output, ...options });
    return converter.convert() as Promise<string>;
  }

  static async fromString(markdown: string, options?: Omit<MarkdownPDFOptions, "markdown">): Promise<Buffer> {
    const converter = new MarkdownPDF({ markdown, buffer: true, ...options });
    return converter.convert() as Promise<Buffer>;
  }
}