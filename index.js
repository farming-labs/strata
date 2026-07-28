"use strict";

const native = require("./binding.js");

const renderedFragments = new WeakSet();

function addBrand(rendered) {
  renderedFragments.add(rendered);
  return Object.freeze(rendered);
}

function render(document, options) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("Strata render() expects a document object");
  }

  return renderJson(
    JSON.stringify(document),
    options === undefined ? undefined : JSON.stringify(options),
  );
}

function renderJson(documentJson, optionsJson) {
  if (typeof documentJson !== "string") {
    throw new TypeError("Strata renderJson() expects a JSON string");
  }
  if (optionsJson !== undefined && typeof optionsJson !== "string") {
    throw new TypeError("Strata renderJson() options must be a JSON string");
  }

  return addBrand(native.renderJson(documentJson, optionsJson));
}

function isRenderedFragment(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    renderedFragments.has(value) &&
    typeof value.html === "string" &&
    typeof value.hash === "string",
  );
}

module.exports = {
  isRenderedFragment,
  render,
  renderJson,
};
