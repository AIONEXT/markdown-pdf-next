/**
 * PDF/A validator for compliance checking.
 */

import { PDFDocument } from "pdf-lib";

export type PDFALevel = "none" | "1b" | "2b" | "3b";

export interface ValidationResult {
  valid: boolean;
  level: PDFALevel;
  errors: string[];
  warnings: string[];
  metadata: {
    title?: string;
    author?: string;
    creationDate?: Date;
    modificationDate?: Date;
    producer?: string;
  };
}

export class PDFAValidator {
  private level: PDFALevel;

  constructor(level: PDFALevel = "1b") {
    this.level = level;
  }

  async validate(pdfBuffer: Buffer): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const pdf = await PDFDocument.load(pdfBuffer);

      // Check basic requirements
      this.checkMetadata(pdf, errors, warnings);
      this.checkFonts(pdf, errors, warnings);
      this.checkColors(pdf, errors, warnings);
      this.checkTransparency(pdf, errors, warnings);

      // Level-specific checks
      if (this.level === "2b" || this.level === "3b") {
        this.checkCompression(pdf, errors, warnings);
      }
      if (this.level === "3b") {
        this.checkEmbeddedFiles(pdf, errors, warnings);
      }

      return {
        valid: errors.length === 0,
        level: this.level,
        errors,
        warnings,
        metadata: this.extractMetadata(pdf),
      };
    } catch (error) {
      return {
        valid: false,
        level: this.level,
        errors: [`Failed to parse PDF: ${error}`],
        warnings: [],
        metadata: {},
      };
    }
  }

  private checkMetadata(pdf: any, errors: string[], warnings: string[]): void {
    const metadata = pdf.getMetadata();
    if (!metadata.title) warnings.push("Missing document title");
    if (!metadata.author) warnings.push("Missing author");
    if (!metadata.creationDate) warnings.push("Missing creation date");
    if (!metadata.producer) warnings.push("Missing producer");
  }

  private checkFonts(pdf: any, errors: string[], warnings: string[]): void {
    // Check that all fonts are embedded
    const fonts = pdf.getFontDictionary();
    for (const [, fontRef] of fonts) {
      const font = pdf.lookup(fontRef);
      if (!font.embedded) {
        errors.push(`Font not embedded: ${font.name}`);
      }
      // Check for prohibited fonts in PDF/A
      if (this.isProhibitedFont(font.name)) {
        errors.push(`Prohibited font in PDF/A: ${font.name}`);
      }
    }
  }

  private isProhibitedFont(fontName: string): boolean {
    // PDF/A prohibits certain fonts
    const prohibited = ["Symbol", "ZapfDingbats"];
    return prohibited.some(p => fontName.includes(p));
  }

  private checkColors(pdf: any, errors: string[], warnings: string[]): void {
    // PDF/A requires device-independent colors
    // This is a simplified check
    warnings.push("Color space validation requires full PDF parsing");
  }

  private checkTransparency(pdf: any, errors: string[], warnings: string[]): void {
    // PDF/A-1b prohibits transparency
    if (this.level === "1b") {
      warnings.push("Transparency check requires full PDF parsing");
    }
  }

  private checkCompression(pdf: any, errors: string[], warnings: string[]): void {
    // PDF/A-2b/3b allow compression
    warnings.push("Compression validation requires full PDF parsing");
  }

  private checkEmbeddedFiles(pdf: any, errors: string[], warnings: string[]): void {
    // PDF/A-3b allows embedded files
    warnings.push("Embedded files validation requires full PDF parsing");
  }

  private extractMetadata(pdf: any): ValidationResult["metadata"] {
    const meta = pdf.getMetadata();
    return {
      title: meta.title,
      author: meta.author,
      creationDate: meta.creationDate,
      modificationDate: meta.modificationDate,
      producer: meta.producer,
    };
  }
}