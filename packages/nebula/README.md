# @c9up/nebula

> shadcn/ui, ported to Aurora, organised as atomic design. Zero runtime dependencies, copy-the-source registry, swappable CSS engine.

Part of **[Ream](https://github.com/C9up/ream)** — a Rust-powered, AdonisJS-compatible Node.js framework. Independent, publishable package.

## What this is

shadcn/ui is React. [Aurora](https://github.com/C9up/aurora) is a tagged-template DOM runtime with signals and no build step. nebula is the shadcn component set — the same markup, the same Tailwind classes, the same behaviour — written for Aurora.

Sixty components across four atomic layers, plus the headless behaviour layer Radix would otherwise provide.

## Installation

```bash
pnpm add @c9up/nebula
npx nebula init --adapter tailwind
```

`init` writes `config/nebula.ts` and the stylesheet for your chosen engine, then prints the packages to install and the build command to register. It installs nothing and edits no `package.json` of yours.

## Two ways to use it

```ts
// Import it — quickest to try
import { Button, Card, CardHeader } from '@c9up/nebula'

// Or take the source — what the library is really for
// $ npx nebula add button card
import { Button } from '#pages/atoms/Button.js'
```

`nebula add` copies the component's source into your project and hands it over. No version, no upgrade path, no wrapper to fight when a design needs one class changed. That is shadcn's premise and nebula keeps it.

```bash
npx nebula list                    # everything in the registry
npx nebula list --layer organisms
npx nebula add dialog data-table   # copies both, plus what they depend on
npx nebula add button --force      # overwrite your edited copy
```

Copies mirror the package's own layout, so `resources/pages/atoms/Button.ts` finds `../lib/cva.js` for the same reason it does inside nebula. **No import is ever rewritten** — that is where a copy-the-source CLI usually accumulates its edge cases.

## Zero runtime dependencies

shadcn stands on Radix, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `@floating-ui/dom`, `cmdk`, `sonner`, `recharts`, `@tanstack/react-table` and `react-day-picker`. None are React-agnostic, and this workspace had already decided `cn` was worth writing by hand rather than installing two packages. So:

| shadcn dependency | nebula |
| --- | --- |
| `clsx` + `tailwind-merge` | `cn` from `@c9up/aurora` — already written from scratch there |
| `class-variance-authority` | `lib/cva.ts` — reimplemented, and it runs its result through `cn` |
| Radix UI | `primitives/` — focus trap, dismissable layers, roving focus, type-ahead, presence, portals |
| `@floating-ui/dom` | `primitives/floating.ts` — offset, flip, shift, arrow, available height |
| `lucide-react` | `lib/icons.ts` — the eighteen glyphs the set needs, inlined |
| `cmdk` | `organisms/Command.ts` |
| `sonner` | `organisms/Toaster.ts` |
| `react-day-picker` + `date-fns` | `organisms/Calendar.ts` — `Date` and `Intl` |
| `@tanstack/react-table` | `organisms/DataTable.ts` — sort, filter, page, select |
| `recharts` | `organisms/Chart.ts` — line, area and bar, as inline SVG |
| `react-hook-form` | `form()` from `@c9up/aurora`, bound by `organisms/Form.ts` |
| `tw-animate-css` | four keyframes in `theme.css` |

Two of those are narrower than what they replace, on purpose:

- **Chart** draws line, area and bar over one categorical axis. Stacked negatives, dual axes and brushes are a charting library's job.
- **DataTable** works on an in-memory array. Past a few thousand rows the work belongs on the server, so it stays client-side rather than growing a half-server-side mode.

## Choose your CSS engine

nebula declares **no CSS dependency at all**, not even a peer one. You install the engine you want; `config/nebula.ts` names it; nebula generates the matching stubs and build command. Same arrangement AdonisJS uses for its asset bundler.

```ts
// config/nebula.ts
import { defineConfig } from '@c9up/nebula'

export default defineConfig({
  adapter: 'tailwind',              // 'tailwind' | 'unocss' | 'css'
  paths: {
    components: 'resources/pages',
    css: 'resources/css/app.css',
    output: 'public/app.css',
  },
})
```

| Adapter | What it does | You install |
| --- | --- | --- |
| `tailwind` | Tailwind v4, configured in CSS. What shadcn itself targets. | `tailwindcss @tailwindcss/cli` |
| `unocss` | `presetWind4` — same class syntax, no PostCSS, faster. | `unocss @unocss/cli` |
| `css` | Nothing. nebula ships a prebuilt stylesheet. | — |

All three consume the same class names, which is what lets one set of components serve all of them. Switching is a one-word change plus `nebula init`.

**The `css` adapter's limit, stated plainly.** `nebula.css` is compiled at nebula's release time and covers the components as published. Edit a copied component to add a utility nebula never used and nothing emits it — the class silently does nothing. Use it when you take the components as they are; use `tailwind` or `unocss` when you intend to retune them.

An engine with a different authoring model — Panda's recipes, StyleX — cannot go behind this interface. It would need a second version of every component.

## Atomic design

shadcn is a flat `ui/` directory. nebula sorts the same components into layers, and the layer is a property of the component: `nebula add button` knows Button is an atom.

```
resources/pages/
├── lib/          cn, cva, icons, ids, reactive props
├── primitives/   the headless layer — focus, dismissal, placement, presence
├── atoms/        one element, composing nothing from nebula
├── molecules/    assembles atoms, or owns state across several elements
├── organisms/    portals, traps focus, floats, or coordinates molecules
└── templates/    page skeletons
```

The rule is composition, not complexity. Slider is an atom though it is interactive, because it is one input. Card is a molecule though it is trivial, because it assembles parts.

<details>
<summary><strong>All 60 components</strong></summary>

**atoms (17)** — AspectRatio, Avatar, Badge, Button, Checkbox, Input, Kbd, Label, Progress, ScrollArea, Separator, Skeleton, Slider, Spinner, Switch, Textarea, Toggle

**molecules (18)** — Accordion, Alert, Breadcrumb, ButtonGroup, Card, Collapsible, Empty, Field, InputGroup, InputOTP, Item, Pagination, RadioGroup, Resizable, Table, Tabs, ToggleGroup, Typography

**organisms (22)** — AlertDialog, Calendar, Carousel, Chart, Combobox, Command, ContextMenu, DataTable, DatePicker, Dialog, Drawer, DropdownMenu, Form, HoverCard, Menubar, NavigationMenu, Popover, Select, Sheet, Sidebar, Toaster, Tooltip

**templates (3)** — AppShell, AuthLayout, SettingsLayout

</details>

## The API difference

shadcn composes through React context:

```tsx
<Tabs defaultValue="account">
  <TabsList><TabsTrigger value="account">Account</TabsTrigger></TabsList>
  <TabsContent value="account">…</TabsContent>
</Tabs>
```

Aurora has no context, and the workarounds — a factory returning bound parts, a handle threaded through props — are more machinery for less clarity. So compound components take data:

```ts
Tabs({
  defaultValue: 'account',
  items: [
    { value: 'account', label: 'Account', content: html`…` },
    { value: 'password', label: 'Password', content: html`…` },
  ],
})
```

The rendered markup is unchanged, so shadcn's CSS and its examples still read across. Free-form containers take named slots instead:

```ts
Dialog({
  trigger: 'Edit profile',
  title: 'Edit profile',
  description: "Make changes here. Click save when you're done.",
  children: [TextField({ bind: bind(profile, 'name'), label: 'Name' })],
  footer: SubmitButton({ form: profile, label: 'Save' }),
})
```

There is no `asChild`. React's Slot clones an element and merges props into it; Aurora templates are compiled markup with nothing to clone. Where shadcn writes `<Button asChild><a/></Button>`, nebula exports the variants:

```ts
html`<a href="/docs" class="${buttonVariants({ variant: 'outline' })}">Docs</a>`
```

## Reactive props

Aurora never re-renders. Any prop that can change is `Reactive<T>` — pass a constant when it never moves, an accessor when it does:

```ts
Button({ disabled: true })                  // static
Button({ disabled: () => form.submitting() }) // live
```

A value read once at setup is frozen for the lifetime of the node, so `disabled: form.submitting()` is a bug that only shows after the first submit.

## Accessibility

The headless layer is most of this package, and it is where shadcn's behaviour actually lives. What is implemented, rather than approximated:

- **Focus trap** — Tab wraps, focus returns to the trigger, and a `focusin` handler catches focus arriving by any other route.
- **Modal** — the page behind is `aria-hidden`, not merely unreachable by Tab. Trapping keyboard focus does nothing for a reader navigating by landmark.
- **Dismissable layers** — one stack. Escape reaches the topmost layer that accepts it; a pointer outside closes layers above the one it landed in and no further.
- **Roving focus** — a menu, tab list or toolbar is one tab stop.
- **Type-ahead** — accumulating buffer, and a repeated letter cycles.
- **Charts** — the same data is emitted as a visually hidden `<table>`. No ARIA makes an SVG readable.
- **Live regions** — `polite` for toasts, `assertive` for errors, mounted empty before anything arrives.

## Development

```bash
pnpm test        # 83 unit tests
pnpm typecheck
pnpm lint
pnpm registry    # regenerate registry.json from the source tree
pnpm css         # freeze nebula.css for the `css` adapter
pnpm build
```

`registry.json` is derived from the imports rather than maintained by hand, and a test asserts that every file an item ships actually resolves — the failure it guards is otherwise silent, showing up in a user's build rather than here.

## Licence

MIT
