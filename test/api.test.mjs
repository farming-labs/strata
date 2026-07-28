import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { isRenderedFragment, render, renderJson } = require("../index.js");
const { StaticFragment } = require("../react-server.js");

const document = {
  type: "document",
  children: [
    {
      type: "element",
      tag: "article",
      attributes: { class: "prose", id: "intro" },
      children: [
        {
          type: "element",
          tag: "h1",
          children: [{ type: "text", value: "Strata" }],
        },
        {
          type: "element",
          tag: "p",
          children: [{ type: "text", value: "Rust < Flight & HTML" }],
        },
      ],
    },
  ],
};

test("renders a typed document through the native binding", () => {
  const rendered = render(document);

  assert.equal(
    rendered.html,
    '<article class="prose" id="intro"><h1>Strata</h1><p>Rust &lt; Flight &amp; HTML</p></article>',
  );
  assert.equal(rendered.bytes, Buffer.byteLength(rendered.html));
  assert.equal(rendered.nodeCount, 5);
  assert.match(rendered.hash, /^[a-f0-9]{64}$/);
  assert.equal(isRenderedFragment(rendered), true);
  assert.equal(Object.isFrozen(rendered), true);
});

test("produces deterministic output from encoded input", () => {
  const encoded = JSON.stringify(document);
  const first = renderJson(encoded);
  const second = renderJson(encoded);

  assert.deepEqual(first, second);
});

test("rejects unsafe content at the native boundary", () => {
  assert.throws(
    () =>
      render({
        type: "document",
        children: [{ type: "element", tag: "script" }],
      }),
    /unsupported element <script>/,
  );

  assert.throws(
    () =>
      render({
        type: "document",
        children: [
          {
            type: "element",
            tag: "a",
            attributes: { href: "javascript:alert(1)" },
          },
        ],
      }),
    /unsafe URL/,
  );
});

test("enforces render limits through the public API", () => {
  assert.throws(
    () => render(document, { maxNodes: 2 }),
    /maximum node count of 2 exceeded/,
  );
});

test("creates a React-owned boundary around opaque static content", () => {
  const rendered = render(document);
  const element = StaticFragment({
    as: "article",
    content: rendered,
    className: "article-shell",
  });

  assert.equal(element.type, "article");
  assert.equal(element.props.className, "article-shell");
  assert.equal(element.props["data-strata"], rendered.hash);
  assert.deepEqual(element.props.dangerouslySetInnerHTML, {
    __html: rendered.html,
  });
});

test("does not accept unbranded HTML", () => {
  assert.throws(
    () =>
      StaticFragment({
        content: {
          html: "<script>alert(1)</script>",
          hash: "untrusted",
          nodeCount: 1,
          bytes: 25,
        },
      }),
    /must be produced by Strata render/,
  );
});
