const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { render } = require("@farming-labs/strata");
const { StaticFragment } = require("@farming-labs/strata/react-server");

const rendered = render({
  type: "document",
  children: [{ type: "text", value: "CommonJS works" }],
});
const html = renderToStaticMarkup(
  React.createElement(StaticFragment, {
    as: "section",
    content: rendered,
  }),
);

assert.equal(
  html,
  '<section data-strata="' + rendered.hash + '">CommonJS works</section>',
);
