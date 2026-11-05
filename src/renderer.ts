/**
 * PDF renderer abstraction supporting Puppeteer and Playwright.
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export type RendererType = "puppeteer" | "playwright";

export interface PDFOptions {
  format?: "A3" | "A4" | "A5" | "Legal" | "Letter" | "Tabloid";
  landscape?: boolean;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  scale?: number;
  preferCSSPageSize?: boolean;
  tagged?: boolean; // For accessibility
}

export interface RendererOptions {
  headless?: boolean;
  args?: string[];
  executablePath?: string;
}

export class Renderer {
  private type: RendererType;
  private options: RendererOptions;
  private browser: any;
  private puppeteer: any;
  private playwright: any;

  constructor(type: RendererType = "puppeteer", options: RendererOptions = {}) {
    this.type = type;
    this.options = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...options,
    };
  }

  async init(): Promise<void> {
    if (this.type === "puppeteer") {
      this.puppeteer = await import("puppeteer");
      this.browser = await this.puppeteer.default.launch({
        headless: this.options.headless,
        args: this.options.args,
        executablePath: this.options.executablePath,
      });
    } else {
      this.playwright = await import("playwright");
      this.browser = await this.playwright.chromium.launch({
        headless: this.options.headless,
        args: this.options.args,
        executablePath: this.options.executablePath,
      });
    }
  }

  async render(html: string, pdfOptions: PDFOptions = {}): Promise<Buffer> {
    if (!this.browser) {
      await this.init();
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-pdf-"));
    const htmlPath = path.join(tempDir, "document.html");
    await fs.writeFile(htmlPath, html);

    let pdfBuffer: Buffer;

    if (this.type === "puppeteer") {
      pdfBuffer = await this.renderWithPuppeteer(htmlPath, pdfOptions);
    } else {
      pdfBuffer = await this.renderWithPlaywright(htmlPath, pdfOptions);
    }

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return pdfBuffer;
  }

  private async renderWithPuppeteer(htmlPath: string, options: PDFOptions): Promise<Buffer> {
    const page = await this.browser.newPage();
    try {
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });

      const pdfOptions = {
        format: options.format || "A4",
        landscape: options.landscape || false,
        margin: options.margin || { top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" },
        printBackground: options.printBackground !== false,
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || "",
        footerTemplate: options.footerTemplate || "",
        scale: options.scale || 1,
        preferCSSPageSize: options.preferCSSPageSize || false,
        tagged: options.tagged || false,
      };

      const buffer = await page.pdf(pdfOptions);
      return Buffer.from(buffer);
    } finally {
      await page.close();
    }
  }

  private async renderWithPlaywright(htmlPath: string, options: PDFOptions): Promise<Buffer> {
    const page = await this.browser.newPage();
    try {
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

      const buffer = await page.pdf({
        format: options.format || "A4",
        landscape: options.landscape || false,
        margin: options.margin || { top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" },
        printBackground: options.printBackground !== false,
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || "",
        footerTemplate: options.footerTemplate || "",
        scale: options.scale || 1,
        tagged: options.tagged || false,
      });

      return Buffer.from(buffer);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}