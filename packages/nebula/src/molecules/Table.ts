/**
 * Table — the styled primitives for tabular data.
 *
 * Real table elements, not a grid of divs. A `<table>` gives screen readers
 * row and column context for free ("row 3, Amount, 42"), and reproducing that
 * over divs means hand-maintaining `role="grid"`, `aria-rowindex` and
 * `aria-colindex` on every cell. The container's `overflow-x-auto` handles
 * narrow viewports without touching the semantics.
 *
 * These are the presentation layer only. `DataTable` in `organisms/` adds
 * sorting, selection and pagination on top of them.
 */

import { component, html } from "@c9up/aurora";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import type { StyledProps } from "../lib/styled.js";

export type TableProps = StyledProps;

export interface TableCellProps extends StyledProps {
	colspan?: number;
	rowspan?: number;
	/** `col` for a column header, `row` for a row header. */
	scope?: "col" | "row";
	/** Reflected as `aria-sort` — set it on the column currently sorted. */
	sort?: Reactive<"ascending" | "descending" | "none" | undefined>;
	onClick?: (event: MouseEvent) => void;
}

export const Table = component<TableProps>((props) => {
	return html`<div
		data-slot="table-container"
		class="relative w-full overflow-x-auto"
	>
		<table
			data-slot="table"
			class="${() => cn("w-full caption-bottom text-sm", read(props.class))}"
		>${slot(props.children)}</table>
	</div>`;
});

export const TableHeader = component<TableProps>((props) => {
	return html`<thead
		data-slot="table-header"
		class="${() => cn("[&_tr]:border-b", read(props.class))}"
	>${slot(props.children)}</thead>`;
});

export const TableBody = component<TableProps>((props) => {
	return html`<tbody
		data-slot="table-body"
		class="${() => cn("[&_tr:last-child]:border-0", read(props.class))}"
	>${slot(props.children)}</tbody>`;
});

export const TableFooter = component<TableProps>((props) => {
	return html`<tfoot
		data-slot="table-footer"
		class="${() => cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", read(props.class))}"
	>${slot(props.children)}</tfoot>`;
});

export interface TableRowProps extends StyledProps {
	/** Reflected as `data-state="selected"`, which the row styling keys off. */
	selected?: Reactive<boolean>;
	onClick?: (event: MouseEvent) => void;
}

export const TableRow = component<TableRowProps>((props) => {
	return html`<tr
		data-slot="table-row"
		data-state="${() => (read(props.selected) === true ? "selected" : undefined)}"
		class="${() =>
			cn(
				"hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
				read(props.class),
			)}"
		@click="${props.onClick}"
	>${slot(props.children)}</tr>`;
});

export const TableHead = component<TableCellProps>((props) => {
	return html`<th
		data-slot="table-head"
		scope="${props.scope ?? "col"}"
		colspan="${props.colspan}"
		rowspan="${props.rowspan}"
		aria-sort="${() => read(props.sort)}"
		class="${() =>
			cn(
				"text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0",
				read(props.class),
			)}"
		@click="${props.onClick}"
	>${slot(props.children)}</th>`;
});

export const TableCell = component<TableCellProps>((props) => {
	return html`<td
		data-slot="table-cell"
		colspan="${props.colspan}"
		rowspan="${props.rowspan}"
		class="${() =>
			cn(
				"p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
				read(props.class),
			)}"
	>${slot(props.children)}</td>`;
});

export const TableCaption = component<TableProps>((props) => {
	return html`<caption
		data-slot="table-caption"
		class="${() => cn("text-muted-foreground mt-4 text-sm", read(props.class))}"
	>${slot(props.children)}</caption>`;
});
