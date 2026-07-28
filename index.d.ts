export type StrataTag =
  | "a"
  | "abbr"
  | "address"
  | "article"
  | "aside"
  | "b"
  | "blockquote"
  | "br"
  | "caption"
  | "cite"
  | "code"
  | "col"
  | "colgroup"
  | "dd"
  | "del"
  | "details"
  | "dfn"
  | "div"
  | "dl"
  | "dt"
  | "em"
  | "figcaption"
  | "figure"
  | "footer"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "header"
  | "hr"
  | "i"
  | "img"
  | "ins"
  | "kbd"
  | "li"
  | "main"
  | "mark"
  | "nav"
  | "ol"
  | "p"
  | "pre"
  | "q"
  | "s"
  | "samp"
  | "section"
  | "small"
  | "span"
  | "strong"
  | "sub"
  | "summary"
  | "sup"
  | "table"
  | "tbody"
  | "td"
  | "tfoot"
  | "th"
  | "thead"
  | "time"
  | "tr"
  | "u"
  | "ul"
  | "var"
  | "wbr";

export interface StrataDocument {
  type: "document";
  children?: StrataNode[];
}

export type StrataNode = StrataText | StrataElement;

export interface StrataText {
  type: "text";
  value: string;
}

export interface StrataElement {
  type: "element";
  tag: StrataTag;
  attributes?: Record<string, string>;
  children?: StrataNode[];
}

export interface RenderOptions {
  maxDepth?: number;
  maxNodes?: number;
  maxOutputBytes?: number;
}

export interface RenderedFragment {
  readonly html: string;
  readonly hash: string;
  readonly nodeCount: number;
  readonly bytes: number;
}

export declare function render(
  document: StrataDocument,
  options?: RenderOptions,
): RenderedFragment;

export declare function renderJson(
  documentJson: string,
  optionsJson?: string,
): RenderedFragment;

export declare function isRenderedFragment(
  value: unknown,
): value is RenderedFragment;
