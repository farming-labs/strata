import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { render } = require("../index.js");

const article = {
  type: "document",
  children: [
    {
      type: "element",
      tag: "article",
      attributes: { class: "prose" },
      children: [
        {
          type: "element",
          tag: "h1",
          children: [{ type: "text", value: "Render the static layer" }],
        },
        {
          type: "element",
          tag: "p",
          children: [
            {
              type: "text",
              value: "React owns the boundary. Strata renders the interior.",
            },
          ],
        },
      ],
    },
  ],
};

console.log(render(article));
