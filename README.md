# Strata

Rust-powered static HTML fragments for React Server Components.

Strata turns typed, non-interactive content into safe, deterministic HTML. React continues to own composition, Client Components and application state. Strata handles static interiors that do not need element-by-element React ownership.

> **Status:** early exploration. The document format and API may change before `1.0`.

## Why Strata?

Large static content can expand into a much larger serialized React element tree. Strata provides a narrower representation:

```text
typed content → Rust renderer → safe HTML → React-owned boundary
```

This does not replace React Server Components or Flight. It gives an RSC framework an optimized representation for host-only regions such as articles, documentation, CMS content, code listings and large read-only descriptions.

## Install

```sh
pnpm add @farming-labs/strata
```

Install only `@farming-labs/strata`. It automatically installs and loads the
native binary for the current operating system and CPU architecture. Packages
named `@farming-labs/strata-*` are platform-specific optional dependencies and
should not be installed directly.

## Render a document

```js
import { render } from "@farming-labs/strata";

const content = {
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
          children: [{ type: "text", value: "Representation-aware UI" }],
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

const fragment = render(content);

fragment.html;
fragment.hash;
fragment.nodeCount;
fragment.bytes;
```

Text and attribute values are escaped. Elements, attributes and URL protocols are allowlisted. Equivalent input produces byte-for-byte equivalent HTML and the same BLAKE3 content hash.

## Use an RSC boundary

```tsx
import { render } from "@farming-labs/strata";
import { StaticFragment } from "@farming-labs/strata/react-server";

export async function ArticleBody({ article }) {
  const content = render(article.document);

  return <StaticFragment as="article" className="prose" content={content} />;
}
```

`StaticFragment` creates a normal React host boundary using the sanitized output. Standard Flight can carry that boundary while matching Client Components around it keep their state.

React does not own the nodes inside the fragment. Do not place Client Components, event handlers or independently updating React state inside Strata content.

## Document model

Strata intentionally starts with two node types:

```ts
type StrataNode =
  | { type: "text"; value: string }
  | {
      type: "element";
      tag: StrataTag;
      attributes?: Record<string, string>;
      children?: StrataNode[];
    };
```

The small model is portable across CMS adapters, Markdown parsers and framework compilers. Raw HTML and script nodes are not accepted.

## Security boundary

Strata treats all document values as untrusted:

- Text and attributes are HTML-escaped.
- Element and attribute names are allowlisted.
- Inline event handlers and `style` are rejected.
- `javascript:` and other unapproved URL protocols are rejected.
- Links opened with `_blank` receive `rel="noopener noreferrer"`.
- Depth, node-count and output-size limits are enforced.
- `StaticFragment` accepts only results created by the local Strata runtime.

Applications must still apply their own authorization and content policies before rendering.

## Development

```sh
pnpm install
pnpm test
pnpm lint
pnpm bench
```

`render(document)` includes JavaScript-to-JSON encoding. Frameworks that already store the Strata document as encoded JSON can use `renderJson(documentJson)` to avoid encoding the same object repeatedly.

## Releases

Stable and beta releases use one end-to-end command to version with `bumpp`, build and test every supported native target in GitHub Actions, publish all npm packages, and verify their dist-tags. See [RELEASING.md](./RELEASING.md) for the one-time npm setup and release commands.

## Scope

Strata is suitable for large, non-interactive content regions. Standard React rendering remains the correct representation for:

- Client Components
- Event handlers and forms
- Independently updating React state
- Fine-grained reconciliation
- Small regions where another representation is not measurably better

## License

MIT
