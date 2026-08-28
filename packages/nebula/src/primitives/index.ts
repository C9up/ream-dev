/**
 * Headless primitives — the behaviour layer nebula owns instead of Radix.
 *
 * shadcn/ui is styling on top of Radix. Radix is React-only, so porting the
 * styling alone would leave every interactive component inert. These modules
 * are that missing half, written against Aurora's signals and DOM: focus
 * management, layer dismissal, placement, presence, roving focus, type-ahead
 * and controlled/uncontrolled state.
 *
 * They are deliberately usable on their own. A component the registry does not
 * ship — an app's own combobox, a bespoke overlay — should be able to reach
 * for the same trap and the same layer stack rather than growing a second,
 * subtly different implementation next door.
 */

export {
	type Controllable,
	type ControllableOptions,
	controllable,
} from "./controllable.js";
export {
	type DismissableLayer,
	type DismissableOptions,
	type DismissReason,
	dismissable,
	layerCount,
} from "./dismissable.js";
export {
	type Align,
	type AutoPosition,
	type AutoPositionOptions,
	autoPosition,
	type Placement,
	type Position,
	type PositionOptions,
	type Rect,
	resolvePosition,
	type Side,
	type Viewport,
} from "./floating.js";
export {
	type FloatingSurfaceOptions,
	floatingSurface,
} from "./floatingSurface.js";
export {
	firstFocusable,
	focusableWithin,
	focusSilently,
	isFocusable,
	isVisible,
} from "./focusable.js";
export {
	type FocusTrap,
	type FocusTrapOptions,
	focusTrap,
} from "./focusTrap.js";
export { type ModalSurfaceOptions, modalSurface } from "./modalSurface.js";
export { type Portal, type PortalOptions, portal } from "./portal.js";
export {
	onExitFinished,
	type Presence,
	type PresenceState,
	presence,
} from "./presence.js";
export {
	type Orientation,
	type RovingFocus,
	type RovingFocusOptions,
	rovingFocus,
} from "./rovingFocus.js";
export { isScrollLocked, lockScroll } from "./scrollLock.js";
export {
	type Typeahead,
	type TypeaheadOptions,
	typeahead,
} from "./typeahead.js";
