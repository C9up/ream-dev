/**
 * Templates — page skeletons.
 *
 * Atomic design's fourth level, and the one shadcn does not have: it stops at
 * organisms and ships "blocks" as copy-paste examples instead. The gap shows
 * up as drift — two pages in the same product with different header heights
 * and different content padding, because each was assembled from organisms by
 * hand.
 *
 * A template is layout only. It positions slots and owns no state, no data and
 * no behaviour, which is what keeps it usable for pages it was not written
 * with in mind.
 */

export { AppShell, type AppShellProps } from "./AppShell.js";
export { AuthLayout, type AuthLayoutProps } from "./AuthLayout.js";
export {
	SettingsLayout,
	type SettingsLayoutProps,
	type SettingsSection,
} from "./SettingsLayout.js";
