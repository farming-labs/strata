import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { isRenderedFragment, render } from "@farming-labs/strata";
import { StaticFragment } from "@farming-labs/strata/react-server";

const rendered = render({
  type: "document",
  children: [
    {
      type: "element",
      tag: "article",
      attributes: { class: "intro" },
      children: [
        {
          type: "element",
          tag: "h1",
          children: [{ type: "text", value: "Fresh install" }],
        },
        {
          type: "element",
          tag: "p",
          children: [{ type: "text", value: "Rust < Flight & HTML" }],
        },
      ],
    },
  ],
});

assert.equal(
  rendered.html,
  '<article class="intro"><h1>Fresh install</h1><p>Rust &lt; Flight &amp; HTML</p></article>',
);
assert.equal(isRenderedFragment(rendered), true);

const element = React.createElement(StaticFragment, {
  as: "main",
  className: "article-shell",
  content: rendered,
});
const html = renderToStaticMarkup(element);

assert.equal(
  html,
  '<main class="article-shell" data-strata="' +
    rendered.hash +
    '">' +
    rendered.html +
    "</main>",
);
assert.equal(html.includes("<script"), false);
