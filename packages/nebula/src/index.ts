/**
 * @c9up/nebula — shadcn/ui, ported to Aurora, organised as atomic design.
 *
 * Three things are worth knowing before reading further.
 *
 * **It adds no runtime dependency.** shadcn stands on Radix, `clsx`,
 * `tailwind-merge`, `class-variance-authority`, `lucide-react`,
 * `@floating-ui/dom`, `cmdk`, `sonner`, `recharts`, `@tanstack/react-table` and
 * `react-day-picker`. None of them are React-agnostic, and the workspace had
 * already made the call that `cn` was worth writing by hand rather than
 * installing two packages. So `cva` is reimplemented, the Radix behaviour layer
 * lives in `primitives/`, the placement engine is `primitives/floating.ts`, the
 * icons are inlined, and the date maths is `Date` and `Intl`.
 *
 * **Compound components take data, not children.** shadcn composes through
 * React context — `<Tabs><TabsList><TabsTrigger>`. Aurora has no context, and
 * the workarounds are worse than the problem, so those components take an
 * `items` array and named slots. The rendered markup is unchanged, which means
 * shadcn's CSS and its examples still read across.
 *
 * **The atomic layer is a property of the component.** An atom renders its own
 * markup and composes nothing from nebula; a molecule assembles atoms or owns
 * state spanning several elements; an organism portals, traps focus, or floats;
 * a template is page layout. `nebula add button` knows Button is an atom and
 * puts it in `atoms/` without being told.
 *
 * Import from the layer barrels — `@c9up/nebula/atoms` — or take the source
 * with `nebula add`, which is the mode this library is really built for.
 */

export * from "./adapters/index.js";
export * from "./atoms/index.js";
export {
	type AdapterName,
	defaultPaths,
	defineConfig,
	isLayer,
	type Layer,
	layers,
	type NebulaConfig,
	type NebulaPaths,
	type ResolvedNebulaConfig,
	resolveConfig,
} from "./config.js";
export { type Child, type Slot, slot } from "./lib/children.js";
export * from "./lib/icons.js";
export * from "./lib/index.js";
export { fadeInOut, slideFrom, zoomInOut } from "./lib/motion.js";
export { type StyledProps, styledDiv, styledSpan } from "./lib/styled.js";
export * from "./molecules/index.js";
export * from "./organisms/index.js";
export * from "./primitives/index.js";
export * from "./templates/index.js";
