/**
 * DataTable — a table with sorting, filtering, paging and row selection.
 *
 * shadcn wraps `@tanstack/react-table`, a headless engine with column
 * grouping, virtualisation, pinning and faceted filters. nebula implements the
 * four features its own examples actually use, over the `Table` molecule.
 *
 * The scope line is drawn where the data does. Everything here operates on an
 * in-memory array: sorting compares values, filtering scans rows, paging
 * slices. That is the right answer up to a few thousand rows and the wrong one
 * beyond, where the work belongs on the server — so rather than growing a
 * half-server-side mode, the component stays client-side and honest about it.
 *
 * A generic function rather than `component<P>`: `component` needs a concrete
 * prop type, and `Row` has to stay open so `cell` receives the caller's own
 * row type instead of a record of unknowns.
 *
 * `aria-sort` on the sorted column is the part hand-rolled tables always miss.
 * The little chevron says which column is sorted to anyone who can see it; the
 * attribute is what says it to everyone else.
 */

import { html, signal, type TemplateResult } from "@c9up/aurora";
import { Checkbox } from "../atoms/Checkbox.js";
import { Input } from "../atoms/Input.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import {
	ChevronDownIcon,
	ChevronsUpDownIcon,
	ChevronUpIcon,
} from "../lib/icons.js";
import { Pagination } from "../molecules/Pagination.js";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../molecules/Table.js";

export interface Column<Row> {
	key: string;
	header: Child;
	/** Renders the cell. Defaults to the row's property of the same key. */
	cell?: (row: Row) => Child;
	sortable?: boolean;
	/** What to compare when sorting. Defaults to the rendered property. */
	sortValue?: (row: Row) => string | number;
	class?: string;
}

export interface DataTableProps<Row> {
	columns: readonly Column<Row>[];
	rows: readonly Row[];
	/** Stable identity per row — used for selection and as the render key. */
	rowKey: (row: Row) => string;
	/** Rows per page. Omit to show everything. */
	pageSize?: number;
	/** Show a filter box. Provide `filterMatch` to say what it searches. */
	filterPlaceholder?: string;
	filterMatch?: (row: Row, query: string) => boolean;
	/** Add a checkbox column. */
	selectable?: boolean;
	onSelectionChange?: (keys: readonly string[]) => void;
	emptyMessage?: Child;
	class?: string;
}

type SortDirection = "asc" | "desc";

export function DataTable<Row>(props: DataTableProps<Row>): TemplateResult {
	const sortKey = signal<string | undefined>(undefined);
	const sortDirection = signal<SortDirection>("asc");
	const query = signal("");
	const page = signal(1);
	const selected = signal<readonly string[]>([]);

	function readCell(row: Row, column: Column<Row>): Child {
		if (column.cell !== undefined) return column.cell(row);
		return propertyOf(row, column.key);
	}

	function sortableValue(row: Row, column: Column<Row>): string | number {
		if (column.sortValue !== undefined) return column.sortValue(row);
		const value = propertyOf(row, column.key);
		return typeof value === "number" ? value : String(value ?? "");
	}

	function filtered(): readonly Row[] {
		const needle = query().trim().toLowerCase();
		if (needle === "" || props.filterMatch === undefined) return props.rows;
		return props.rows.filter(
			(row) => props.filterMatch?.(row, needle) === true,
		);
	}

	function sorted(): readonly Row[] {
		const key = sortKey();
		const rows = filtered();
		if (key === undefined) return rows;

		const column = props.columns.find((entry) => entry.key === key);
		if (column === undefined) return rows;

		const direction = sortDirection() === "asc" ? 1 : -1;
		// A copy: sorting the caller's array in place would reorder their data as
		// a side effect of rendering it.
		return [...rows].sort((left, right) => {
			const a = sortableValue(left, column);
			const b = sortableValue(right, column);
			if (typeof a === "number" && typeof b === "number")
				return (a - b) * direction;
			return String(a).localeCompare(String(b)) * direction;
		});
	}

	function pageCount(): number {
		if (props.pageSize === undefined) return 1;
		return Math.max(1, Math.ceil(sorted().length / props.pageSize));
	}

	function visible(): readonly Row[] {
		const rows = sorted();
		if (props.pageSize === undefined) return rows;
		// Clamp: filtering down to fewer pages while on the last one would
		// otherwise show an empty table with no way back.
		const current = Math.min(page(), pageCount());
		const from = (current - 1) * props.pageSize;
		return rows.slice(from, from + props.pageSize);
	}

	function toggleSort(column: Column<Row>): void {
		if (column.sortable === false) return;
		if (sortKey() === column.key) {
			sortDirection(sortDirection() === "asc" ? "desc" : "asc");
			return;
		}
		sortKey(column.key);
		sortDirection("asc");
	}

	function setSelection(keys: readonly string[]): void {
		selected(keys);
		props.onSelectionChange?.(keys);
	}

	function toggleRow(key: string): void {
		const current = selected();
		setSelection(
			current.includes(key)
				? current.filter((entry) => entry !== key)
				: [...current, key],
		);
	}

	/**
	 * The header checkbox acts on the *visible* page, not the whole dataset.
	 *
	 * Selecting rows the user cannot see — and may have filtered away on
	 * purpose — is the behaviour behind every "I deleted more than I meant to"
	 * story about a bulk action.
	 */
	function toggleAllVisible(): void {
		const keys = visible().map(props.rowKey);
		const allSelected = keys.every((key) => selected().includes(key));
		if (allSelected) {
			setSelection(selected().filter((key) => !keys.includes(key)));
		} else {
			const merged = new Set([...selected(), ...keys]);
			setSelection([...merged]);
		}
	}

	function ariaSortFor(
		column: Column<Row>,
	): "ascending" | "descending" | "none" | undefined {
		if (column.sortable === false) return undefined;
		if (sortKey() !== column.key) return "none";
		return sortDirection() === "asc" ? "ascending" : "descending";
	}

	function sortIcon(column: Column<Row>): Child {
		if (column.sortable === false) return null;
		if (sortKey() !== column.key) {
			return ChevronsUpDownIcon({ class: "ml-2 size-3.5 opacity-50" });
		}
		return sortDirection() === "asc"
			? ChevronUpIcon({ class: "ml-2 size-3.5" })
			: ChevronDownIcon({ class: "ml-2 size-3.5" });
	}

	const columnCount =
		props.columns.length + (props.selectable === true ? 1 : 0);

	return html`<div data-slot="data-table" class="${cn("flex flex-col gap-4", props.class)}">
		${
			props.filterMatch === undefined
				? null
				: Input({
						type: "search",
						placeholder: props.filterPlaceholder ?? "Filter…",
						class: "max-w-sm",
						onInput: (value) => {
							query(value);
							page(1);
						},
					})
		}
		${Table({
			children: [
				TableHeader({
					children: TableRow({
						children: [
							props.selectable === true
								? TableHead({
										class: "w-10",
										children: Checkbox({
											label: "Select all rows on this page",
											checked: () => {
												const keys = visible().map(props.rowKey);
												return (
													keys.length > 0 &&
													keys.every((key) => selected().includes(key))
												);
											},
											indeterminate: () => {
												const keys = visible().map(props.rowKey);
												const chosen = keys.filter((key) =>
													selected().includes(key),
												).length;
												return chosen > 0 && chosen < keys.length;
											},
											onCheckedChange: toggleAllVisible,
										}),
									})
								: null,
							...props.columns.map((column) =>
								TableHead({
									class: cn(
										column.sortable === false
											? ""
											: "cursor-pointer select-none",
										column.class,
									),
									sort: () => ariaSortFor(column),
									onClick: () => toggleSort(column),
									children: html`<span class="inline-flex items-center"
										>${column.header}${() => sortIcon(column)}</span
									>`,
								}),
							),
						],
					}),
				}),
				TableBody({
					children: () => {
						const rows = visible();
						if (rows.length === 0) {
							return TableRow({
								children: TableCell({
									colspan: columnCount,
									class: "h-24 text-center",
									children: props.emptyMessage ?? "No results.",
								}),
							});
						}
						return rows.map((row) => renderRow(row));
					},
				}),
			],
		})}
		${
			props.pageSize === undefined
				? null
				: Pagination({
						page: () => Math.min(page(), pageCount()),
						pageCount,
						onPageChange: (next) => page(next),
					})
		}
	</div>`;

	function renderRow(row: Row): Child {
		const key = props.rowKey(row);
		return TableRow({
			selected: () => selected().includes(key),
			children: [
				props.selectable === true
					? TableCell({
							children: Checkbox({
								label: `Select row ${key}`,
								checked: () => selected().includes(key),
								onCheckedChange: () => toggleRow(key),
							}),
						})
					: null,
				...props.columns.map((column) =>
					TableCell({ class: column.class, children: readCell(row, column) }),
				),
			],
		});
	}
}

/**
 * Read a property by name from a row of unknown shape.
 *
 * `Row` is the caller's own type and may be an interface, which cannot be
 * indexed by an arbitrary string. The guard turns the lookup into a checked
 * read that yields `undefined` for a missing key — a blank cell — instead of
 * an assertion that it exists.
 */
function propertyOf(row: unknown, key: string): Child {
	if (typeof row !== "object" || row === null) return null;
	if (!(key in row)) return null;
	const value = Reflect.get(row, key);
	if (value === null || value === undefined) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	return String(value);
}
