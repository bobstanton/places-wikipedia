declare module "*.css";


declare const Prism: {
  highlight?: (code: string, grammar: Prism.Grammar, language: string) => string;
  highlightElement?: (element: Element) => void;
  languages: Record<string, Prism.Grammar>;
} | undefined;

declare namespace Prism {
  interface Grammar {
    [key: string]: unknown;
  }
}
