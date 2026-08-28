/**
 * Molecules — assemblies of atoms, and small state machines.
 *
 * A component lands here when it composes other nebula components, or owns
 * state that spans more than one element (Accordion's open set, Tabs'
 * selection, InputOTP's characters). What it does *not* do is escape its own
 * DOM position: nothing here portals, traps focus, or floats. Those are
 * organisms.
 *
 * Compound components are data-driven — `Accordion({ items: [...] })`, not
 * `<Accordion><AccordionItem>`. shadcn's compound API is a React-context
 * artifact; Aurora has no context, and the alternatives (a factory returning
 * bound parts, a handle threaded through props) are more machinery for less
 * clarity. The rendered markup is unchanged, so shadcn's CSS and its examples
 * still read across.
 */

export {
	Accordion,
	type AccordionItem,
	type AccordionProps,
} from "./Accordion.js";
export {
	Alert,
	AlertDescription,
	type AlertProps,
	AlertTitle,
	type AlertVariants,
	alertVariants,
} from "./Alert.js";
export { Breadcrumb, type BreadcrumbProps, type Crumb } from "./Breadcrumb.js";
export {
	ButtonGroup,
	type ButtonGroupProps,
	ButtonGroupSeparator,
	ButtonGroupText,
} from "./ButtonGroup.js";
export {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	type CardProps,
	CardTitle,
} from "./Card.js";
export { Collapsible, type CollapsibleProps } from "./Collapsible.js";
export {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	type EmptyProps,
	EmptyTitle,
} from "./Empty.js";
export {
	Field,
	FieldGroup,
	type FieldIds,
	type FieldProps,
	FieldSeparator,
	fieldIds,
} from "./Field.js";
export {
	InputGroup,
	InputGroupAddon,
	type InputGroupProps,
	inputGroupControlClasses,
} from "./InputGroup.js";
export { InputOTP, type InputOTPProps } from "./InputOTP.js";
export {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	type ItemProps,
	ItemSeparator,
	ItemTitle,
	type ItemVariants,
	itemVariants,
} from "./Item.js";
export {
	type PageSlot,
	Pagination,
	type PaginationProps,
	pageWindow,
} from "./Pagination.js";
export {
	RadioGroup,
	type RadioGroupProps,
	type RadioOption,
} from "./RadioGroup.js";
export { Resizable, type ResizableProps } from "./Resizable.js";
export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	type TableCellProps,
	TableFooter,
	TableHead,
	TableHeader,
	type TableProps,
	TableRow,
	type TableRowProps,
} from "./Table.js";
export { type TabItem, Tabs, type TabsProps } from "./Tabs.js";
export {
	ToggleGroup,
	type ToggleGroupItem,
	type ToggleGroupProps,
} from "./ToggleGroup.js";
export {
	Blockquote,
	H1,
	H2,
	H3,
	H4,
	InlineCode,
	Large,
	Lead,
	List,
	Muted,
	P,
	Small,
	type TypographyProps,
} from "./Typography.js";
