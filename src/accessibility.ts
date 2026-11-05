/**
 * Accessibility checker for WCAG 2.1 / PDF/UA compliance.
 */

import { PDFDocument } from "pdf-lib";

export type AccessibilityLevel = "none" | "A" | "AA" | "AAA";

export interface AccessibilityResult {
  passed: boolean;
  level: AccessibilityLevel;
  issues: AccessibilityIssue[];
  score: number; // 0-100
}

export interface AccessibilityIssue {
  rule: string;
  level: "error" | "warning" | "info";
  message: string;
  page?: number;
  element?: string;
  wcagCriterion?: string;
}

export class AccessibilityChecker {
  private level: AccessibilityLevel;

  constructor(level: AccessibilityLevel = "AA") {
    this.level = level;
  }

  async check(pdfBuffer: Buffer): Promise<AccessibilityResult> {
    const issues: AccessibilityIssue[] = [];

    try {
      const pdf = await PDFDocument.load(pdfBuffer);

      // Check tagged PDF
      this.checkTaggedPDF(pdf, issues);

      // Check document structure
      this.checkDocumentStructure(pdf, issues);

      // Check alt text for images
      this.checkImages(pdf, issues);

      // Check headings
      this.checkHeadings(pdf, issues);

      // Check tables
      this.checkTables(pdf, issues);

      // Check forms
      this.checkForms(pdf, issues);

      // Check links
      this.checkLinks(pdf, issues);

      // Check color contrast
      this.checkColorContrast(pdf, issues);

      // Check language
      this.checkLanguage(pdf, issues);

      // Check reading order
      this.checkReadingOrder(pdf, issues);

      const passed = issues.filter(i => i.level === "error").length === 0;
      const score = this.calculateScore(issues);

      return { passed, level: this.level, issues, score };
    } catch (error) {
      return {
        passed: false,
        level: this.level,
        issues: [{ rule: "parse", level: "error", message: `Failed to parse PDF: ${error}` }],
        score: 0,
      };
    }
  }

  private checkTaggedPDF(pdf: any, issues: AccessibilityIssue[]): void {
    if (!pdf.isTagged()) {
      issues.push({
        rule: "tagged-pdf",
        level: "error",
        message: "PDF is not tagged (required for accessibility)",
        wcagCriterion: "1.3.1",
      });
    }
  }

  private checkDocumentStructure(pdf: any, issues: AccessibilityIssue[]): void {
    const structureTree = pdf.getStructureTree();
    if (!structureTree) {
      issues.push({
        rule: "structure-tree",
        level: "error",
        message: "Missing document structure tree",
        wcagCriterion: "1.3.1",
      });
    }
  }

  private checkImages(pdf: any, issues: AccessibilityIssue[]): void {
    // Check for figures without alt text
    const figures = pdf.getElementsByTagName("Figure");
    for (const figure of figures) {
      if (!figure.getAttribute("Alt")) {
        issues.push({
          rule: "image-alt",
          level: "error",
          message: "Image missing alternative text",
          element: "Figure",
          wcagCriterion: "1.1.1",
        });
      }
    }
  }

  private checkHeadings(pdf: any, issues: AccessibilityIssue[]): void {
    const headings = pdf.getElementsByTagName("H1", "H2", "H3", "H4", "H5", "H6");
    let prevLevel = 0;
    for (const heading of headings) {
      const level = parseInt(heading.tagName[1]);
      if (level > prevLevel + 1) {
        issues.push({
          rule: "heading-order",
          level: "warning",
          message: `Heading level jumps from H${prevLevel} to H${level}`,
          wcagCriterion: "1.3.1",
        });
      }
      prevLevel = level;
    }
  }

  private checkTables(pdf: any, issues: AccessibilityIssue[]): void {
    const tables = pdf.getElementsByTagName("Table");
    for (const table of tables) {
      if (!table.getAttribute("Summary")) {
        issues.push({
          rule: "table-summary",
          level: "warning",
          message: "Table missing summary attribute",
          wcagCriterion: "1.3.1",
        });
      }
      // Check for TH elements
      const ths = table.getElementsByTagName("TH");
      if (ths.length === 0) {
        issues.push({
          rule: "table-headers",
          level: "error",
          message: "Table missing header cells (TH)",
          wcagCriterion: "1.3.1",
        });
      }
    }
  }

  private checkForms(pdf: any, issues: AccessibilityIssue[]): void {
    const fields = pdf.getElementsByTagName("Form");
    for (const field of fields) {
      if (!field.getAttribute("TU")) {
        issues.push({
          rule: "form-tooltip",
          level: "error",
          message: "Form field missing tooltip (TU)",
          wcagCriterion: "3.3.2",
        });
      }
    }
  }

  private checkLinks(pdf: any, issues: AccessibilityIssue[]): void {
    const links = pdf.getElementsByTagName("Link");
    for (const link of links) {
      if (!link.getAttribute("Alt") && !link.textContent) {
        issues.push({
          rule: "link-text",
          level: "warning",
          message: "Link missing accessible text",
          wcagCriterion: "2.4.4",
        });
      }
    }
  }

  private checkColorContrast(pdf: any, issues: AccessibilityIssue[]): void {
    // Simplified - would need full rendering
    issues.push({
      rule: "color-contrast",
      level: "info",
      message: "Color contrast verification requires visual inspection",
      wcagCriterion: "1.4.3",
    });
  }

  private checkLanguage(pdf: any, issues: AccessibilityIssue[]): void {
    const metadata = pdf.getMetadata();
    if (!metadata.language) {
      issues.push({
        rule: "document-language",
        level: "error",
        message: "Document language not specified",
        wcagCriterion: "3.1.1",
      });
    }
  }

  private checkReadingOrder(pdf: any, issues: AccessibilityIssue[]): void {
    const structureTree = pdf.getStructureTree();
    if (structureTree && !structureTree.isLogicalOrder()) {
      issues.push({
        rule: "reading-order",
        level: "error",
        message: "Document reading order is not logical",
        wcagCriterion: "1.3.2",
      });
    }
  }

  private calculateScore(issues: AccessibilityIssue[]): number {
    const weights = { error: 10, warning: 5, info: 1 };
    const total = issues.reduce((sum, i) => sum + weights[i.level], 0);
    return Math.max(0, 100 - total);
  }
}