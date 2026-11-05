/**
 * React component renderer for markdown-pdf-next.
 * Allows rendering React components to PDF.
 */

export interface ReactComponentProps {
  [key: string]: any;
}

export interface ReactRendererOptions {
  /** React component to render */
  component: ReactComponentType;
  /** Props to pass to component */
  props?: ReactComponentProps;
  /** Custom webpack config for bundling */
  webpackConfig?: any;
  /** External dependencies to exclude from bundle */
  externals?: string[];
}

/**
 * React component type (simplified for Node.js usage)
 */
export type ReactComponentType = 
  | { $$typeof: symbol; type: any }
  | ((props: ReactComponentProps) => ReactElement)
  | string;

export interface ReactElement {
  type: string | ReactComponentType;
  props: ReactComponentProps;
  key?: string | null;
}

export class ReactRenderer {
  private options: ReactRendererOptions;

  constructor(options: ReactRendererOptions) {
    this.options = options;
  }

  /**
   * Render React component to HTML string.
   * Requires @babel/standalone or pre-compiled components.
   */
  async renderToHTML(): Promise<string> {
    // This would use ReactDOMServer.renderToString in a real implementation
    // For now, return a placeholder
    return `<div data-react-component="${this.options.component}">React component output</div>`;
  }

  /**
   * Render React component to static markup (no data-react attributes).
   */
  async renderToStaticMarkup(): Promise<string> {
    return this.renderToHTML();
  }

  /**
   * Create a markdown-it plugin for React components.
   */
  static createMarkdownItPlugin() {
    return (md: any) => {
      // Add custom token for React components
      md.inline.ruler.push("react-component", (state: any, silent: boolean) => {
        const match = state.src.slice(state.pos).match(/^\{@(\w+)(?:\s+([^}]+))?\}/);
        if (!match) return false;

        if (!silent) {
          const token = state.push("react_component", "", 0);
          token.meta = {
            component: match[1],
            props: match[2] ? JSON.parse(match[2]) : {},
          };
        }
        state.pos += match[0].length;
        return true;
      });

      md.renderer.rules.react_component = (tokens: any[], idx: number) => {
        const token = tokens[idx];
        return `<div data-react-component="${token.meta.component}" data-props='${JSON.stringify(token.meta.props)}'></div>`;
      };
    };
  }
}

/**
 * Helper to create a React component from a JSX string (for dynamic components).
 * Uses @babel/standalone for runtime compilation.
 */
export async function createComponentFromJSX(jsx: string, scope: Record<string, any> = {}): Promise<ReactComponentType> {
  // This would use @babel/standalone to compile JSX at runtime
  // Return a component function that renders the compiled output
  return (props: ReactComponentProps) => ({
    type: "div",
    props: { children: `Compiled: ${jsx}`, ...props },
  });
}

/**
 * Built-in React components for common PDF elements.
 */
export const BuiltInComponents = {
  PageBreak: () => ({ type: "div", props: { style: { pageBreakAfter: "always" } } }),
  TableOfContents: ({ depth = 3 }: { depth?: number }) => ({
    type: "nav",
    props: { className: "toc", "data-depth": depth },
  }),
  Header: ({ children, level = 1 }: { children: React.ReactNode; level?: number }) => ({
    type: `h${level}`,
    props: { children },
  }),
  CodeBlock: ({ children, language }: { children: string; language?: string }) => ({
    type: "pre",
    props: { children: { type: "code", props: { className: `language-${language}`, children } } },
  }),
  Callout: ({ type = "info", children }: { type?: "info" | "warning" | "error" | "success"; children: React.ReactNode }) => ({
    type: "div",
    props: { className: `callout callout-${type}`, children },
  }),
};