import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { render, renderJson } = require("../index.js");

function text(value) {
  return { type: "text", value };
}

function element(tag, children, attributes) {
  return {
    type: "element",
    tag,
    ...(attributes ? { attributes } : {}),
    ...(children ? { children } : {}),
  };
}

function createDocument(sections) {
  return {
    type: "document",
    children: [
      element(
        "article",
        Array.from({ length: sections }, (_, index) =>
          element("section", [
            element("h2", [text(`Section ${index + 1}`)]),
            ...Array.from({ length: 6 }, (_, paragraph) =>
              element("p", [
                text(
                  `Paragraph ${paragraph + 1} contains deterministic content, links, formatting and enough text to exercise escaping and allocation.`,
                ),
                element("strong", [text(" Rust-rendered.")]),
              ]),
            ),
          ]),
        ),
        { class: "prose" },
      ),
    ],
  };
}

function measure(label, document, iterations) {
  const encoded = JSON.stringify(document);

  for (let index = 0; index < 20; index += 1) {
    renderJson(encoded);
  }

  let checksum = 0;
  const encodedStart = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    checksum += renderJson(encoded).bytes;
  }
  const encodedElapsed = performance.now() - encodedStart;

  const objectStart = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    checksum += render(document).bytes;
  }
  const objectElapsed = performance.now() - objectStart;

  return {
    fixture: label,
    sections: document.children[0].children.length,
    "renderJson µs": ((encodedElapsed * 1_000) / iterations).toFixed(1),
    "render(object) µs": ((objectElapsed * 1_000) / iterations).toFixed(1),
    "output KiB": (renderJson(encoded).bytes / 1_024).toFixed(1),
    checksum,
  };
}

const results = [
  measure("small", createDocument(6), 1_000),
  measure("medium", createDocument(24), 300),
  measure("large", createDocument(96), 75),
];

console.table(results);
