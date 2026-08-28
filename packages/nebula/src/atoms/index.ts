/**
 * Atoms — one element, no nebula components inside.
 *
 * The dividing line the whole library is organised on: an atom renders its own
 * markup and composes nothing from nebula. It may hold local state (Avatar
 * tracks whether its image loaded) and it may be interactive (Checkbox,
 * Slider), but the moment it reaches for another nebula component it belongs a
 * layer up.
 *
 * Applied strictly, that rule puts things where a reader expects them. Card is
 * a molecule despite being simpler than Slider, because it assembles parts.
 * Slider is an atom despite being interactive, because it is one input.
 */

export { AspectRatio, type AspectRatioProps } from "./AspectRatio.js";
export { Avatar, type AvatarProps } from "./Avatar.js";
export {
	Badge,
	type BadgeProps,
	type BadgeVariants,
	badgeVariants,
} from "./Badge.js";
export {
	Button,
	type ButtonProps,
	type ButtonVariants,
	buttonVariants,
} from "./Button.js";
export { Checkbox, type CheckboxProps, checkboxClasses } from "./Checkbox.js";
export { Input, type InputProps, inputClasses } from "./Input.js";
export { Kbd, type KbdProps } from "./Kbd.js";
export { Label, type LabelProps, labelClasses } from "./Label.js";
export { Progress, type ProgressProps } from "./Progress.js";
export {
	ScrollArea,
	type ScrollAreaProps,
	scrollAreaClasses,
} from "./ScrollArea.js";
export { Separator, type SeparatorProps } from "./Separator.js";
export { Skeleton, type SkeletonProps } from "./Skeleton.js";
export { Slider, type SliderProps, sliderClasses } from "./Slider.js";
export { Spinner, type SpinnerProps } from "./Spinner.js";
export { Switch, type SwitchProps, switchTrackClasses } from "./Switch.js";
export { Textarea, type TextareaProps, textareaClasses } from "./Textarea.js";
export {
	Toggle,
	type ToggleProps,
	type ToggleVariants,
	toggleVariants,
} from "./Toggle.js";
