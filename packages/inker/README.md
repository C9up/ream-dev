# @c9up/inker

Server-side templating module for the Ream framework. Loads `.inker` files from disk, parses them with a hand-rolled lexer + AST, and renders against a plain data object. HTML-escape by default; raw output via the explicit triple-brace form. Strict-by-default: unknown identifiers throw rather than render blank.

## File convention

Templates live as `<root>/<name>.inker` files. Resolve the root yourself (absolute path) and pass it once at construction:

```ts
import { Templates } from "@c9up/inker";

const templates = new Templates({ root: "/abs/path/to/templates" });
const html = await templates.render("invoice", { customer: { name: "Alice" }, total: 42 });
```

Interpolation is `{{ expr }}` (HTML-escaped) or `{{{ expr }}}` (raw). The `expr` is a member-access path (`customer.name`, `items[0].title`, `items["weird key"]`); arithmetic, calls, ternaries, and template literals go through registered helpers.

## Strict by default

- Missing templates throw `InkerRenderError` with `code: "E_INKER_TEMPLATE_NOT_FOUND"`.
- Unknown identifiers throw `code: "E_INKER_UNKNOWN_IDENTIFIER"` with the consumed path and the line + column of the offending interpolation.
- Parse errors throw `code: "E_INKER_PARSE_ERROR"` with a precise reason.

The full reference (file layout, cache semantics, error surface) lives at <https://ream.dev/modules/inker>.

## Testing

```sh
pnpm --filter @c9up/inker test            # full suite
pnpm --filter @c9up/inker test:coverage   # enforces v8 coverage gate
```

The coverage gate (v8 provider) is wired in `vitest.config.ts` with thresholds at `statements: 91 / functions: 98 / branches: 86 / lines: 92`. A regression that drops below any of those floors fails CI.

## Standalone use

`@c9up/inker` is a leaf package — it has zero runtime dependencies and works in any Node.js app without `@c9up/ream` or `@c9up/rosetta` installed. The `tests/integration/standalone-smoke.test.ts` test proves this by packing the workspace tarball, installing it into a synthetic consumer (no ream, no rosetta), and rendering a composite template.

The `@c9up/inker/provider` sub-path (the `InkerProvider` class) is importable without those peers as well — its `InkerAppContext` is duck-typed, so structural import never reaches the ream runtime. Wiring the provider into a real container still requires a Ream host at boot time.

