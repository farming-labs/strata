import { isRenderedFragment, render, type StrataDocument } from "../index";
import { StaticFragment } from "../react-server";

const document: StrataDocument = {
  type: "document",
  children: [
    {
      type: "element",
      tag: "article",
      children: [{ type: "text", value: "Typed Strata content" }],
    },
  ],
};

const fragment = render(document, {
  maxDepth: 32,
  maxNodes: 1_000,
  maxOutputBytes: 1_000_000,
});

fragment.html satisfies string;
fragment.hash satisfies string;
fragment.nodeCount satisfies number;
fragment.bytes satisfies number;

isRenderedFragment(fragment);
StaticFragment({
  as: "article",
  className: "prose",
  content: fragment,
});

// @ts-expect-error Strata rejects unsupported elements before runtime.
document.children = [{ type: "element", tag: "script" }];

// @ts-expect-error StaticFragment boundaries are deliberately constrained.
StaticFragment({ as: "script", content: fragment });
