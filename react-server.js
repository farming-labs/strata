"use strict";

const React = require("react");
const { isRenderedFragment } = require("./index.js");

const ALLOWED_BOUNDARIES = new Set([
  "article",
  "aside",
  "div",
  "footer",
  "header",
  "main",
  "nav",
  "section",
  "span",
]);

function StaticFragment({
  as = "div",
  content,
  children,
  dangerouslySetInnerHTML,
  ...props
}) {
  if (!isRenderedFragment(content)) {
    throw new TypeError(
      "StaticFragment content must be produced by Strata render()",
    );
  }
  if (!ALLOWED_BOUNDARIES.has(as)) {
    throw new TypeError(`StaticFragment does not support a <${as}> boundary`);
  }
  if (children !== undefined || dangerouslySetInnerHTML !== undefined) {
    throw new TypeError(
      "StaticFragment owns its children and dangerouslySetInnerHTML",
    );
  }

  return React.createElement(as, {
    ...props,
    "data-strata": content.hash,
    dangerouslySetInnerHTML: { __html: content.html },
  });
}

module.exports = {
  StaticFragment,
};
