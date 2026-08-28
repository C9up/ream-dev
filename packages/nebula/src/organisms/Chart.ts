/**
 * Chart — line, area and bar charts drawn as inline SVG.
 *
 * shadcn's Chart is a theming wrapper around Recharts. nebula cannot follow it
 * there — Recharts is React — and a zero-dependency port of a full charting
 * library is not a thing to promise. So the scope is stated plainly: three
 * chart types over one categorical axis and one numeric axis, which is what
 * the shadcn chart examples are and what dashboards overwhelmingly need.
 *
 * Anything beyond that — stacked bars with negative values, dual axes, brushes,
 * candlesticks — is a charting library's job, and an app needing one should
 * install one rather than have this component grow into a bad copy.
 *
 * The colours come from `--chart-1` … `--chart-5`, so a chart re-themes with
 * the rest of the design system instead of carrying its own palette.
 *
 * An SVG chart is invisible to a screen reader whatever ARIA is put on it, so
 * the same data is emitted as a real `<table>`, visually hidden. That is the
 * only approach that actually works: the reader gets rows and values it can
 * navigate, not a described picture.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface ChartSeries {
	key: string;
	label: string;
	/** Any CSS colour. Defaults to `--chart-1`…`--chart-5` by position. */
	color?: string;
}

/** One row: a category plus one numeric value per series key. */
export type ChartDatum = Record<string, string | number>;

export interface ChartProps {
	data: readonly ChartDatum[];
	series: readonly ChartSeries[];
	/** Key in each datum holding the category label. */
	categoryKey: string;
	type?: "line" | "area" | "bar";
	height?: number;
	/** Announced as the chart's name, and used as the data table's caption. */
	label: string;
	/** Draw horizontal gridlines. Default `true`. */
	grid?: boolean;
	class?: Reactive<string>;
}

const VIEWBOX_WIDTH = 600;
const PADDING = { top: 8, right: 8, bottom: 24, left: 40 };

function colorFor(series: ChartSeries, index: number): string {
	return series.color ?? `var(--chart-${(index % 5) + 1})`;
}

function numberAt(datum: ChartDatum, key: string): number {
	const value = datum[key];
	return typeof value === "number" ? value : 0;
}

function categoryAt(datum: ChartDatum, key: string): string {
	const value = datum[key];
	return typeof value === "string" ? value : String(value ?? "");
}

/**
 * The value range the Y axis covers.
 *
 * Anchored at zero whenever the data is non-negative. A bar chart whose axis
 * starts at the minimum value exaggerates every difference — the classic
 * misleading chart — and it is not a choice worth exposing as an option.
 */
export function valueRange(
	data: readonly ChartDatum[],
	series: readonly ChartSeries[],
): { min: number; max: number } {
	let min = 0;
	let max = 0;
	for (const datum of data) {
		for (const entry of series) {
			const value = numberAt(datum, entry.key);
			if (value < min) min = value;
			if (value > max) max = value;
		}
	}
	// A flat all-zero dataset would divide by zero when scaling.
	if (min === max) return { min, max: max + 1 };
	return { min, max };
}

export const Chart = component<ChartProps>((props) => {
	const titleId = uid("chart-title");
	const height = props.height ?? 240;
	const type = props.type ?? "line";
	const { min, max } = valueRange(props.data, props.series);

	const plotWidth = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
	const plotHeight = height - PADDING.top - PADDING.bottom;

	const y = (value: number): number =>
		PADDING.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

	/** Centre of the slot for index `i`, so points sit above their labels. */
	const x = (index: number): number => {
		const count = Math.max(props.data.length, 1);
		const step = plotWidth / count;
		return PADDING.left + step * index + step / 2;
	};

	const gridLines = [0, 0.25, 0.5, 0.75, 1].map(
		(fraction) => PADDING.top + plotHeight * fraction,
	);

	function linePath(series: ChartSeries): string {
		return props.data
			.map(
				(datum, index) =>
					`${index === 0 ? "M" : "L"}${x(index)},${y(numberAt(datum, series.key))}`,
			)
			.join(" ");
	}

	function areaPath(series: ChartSeries): string {
		if (props.data.length === 0) return "";
		const baseline = y(Math.max(min, 0));
		return `${linePath(series)} L${x(props.data.length - 1)},${baseline} L${x(0)},${baseline} Z`;
	}

	return html`<figure
		data-slot="chart"
		class="${() => cn("w-full", read(props.class))}"
	>
		<svg
			viewBox="${`0 0 ${VIEWBOX_WIDTH} ${height}`}"
			role="img"
			aria-labelledby="${titleId}"
			preserveAspectRatio="none"
			class="h-auto w-full overflow-visible"
		>
			<title id="${titleId}">${props.label}</title>
			${
				props.grid === false
					? null
					: gridLines.map(
							(position) => html`<line
							x1="${PADDING.left}"
							x2="${VIEWBOX_WIDTH - PADDING.right}"
							y1="${position}"
							y2="${position}"
							stroke="var(--border)"
							stroke-width="1"
						/>`,
						)
			}
			${props.series.map((series, seriesIndex) =>
				type === "bar"
					? renderBars(series, seriesIndex)
					: renderCurve(series, seriesIndex),
			)}
			${props.data.map(
				(datum, index) => html`<text
					x="${x(index)}"
					y="${height - 6}"
					text-anchor="middle"
					font-size="10"
					fill="var(--muted-foreground)"
				>${categoryAt(datum, props.categoryKey)}</text>`,
			)}
		</svg>
		<figcaption class="sr-only">${renderDataTable()}</figcaption>
		<div data-slot="chart-legend" class="mt-2 flex flex-wrap justify-center gap-4 text-xs">
			${props.series.map(
				(series, index) => html`<span class="flex items-center gap-1.5">
					<span
						aria-hidden="true"
						class="size-2 shrink-0 rounded-[2px]"
						style="${`background:${colorFor(series, index)}`}"
					></span>
					<span class="text-muted-foreground">${series.label}</span>
				</span>`,
			)}
		</div>
	</figure>`;

	function renderCurve(
		series: ChartSeries,
		index: number,
	): ReturnType<typeof html> {
		const color = colorFor(series, index);
		return html`<g>
			${
				type === "area"
					? html`<path d="${areaPath(series)}" fill="${color}" fill-opacity="0.15" />`
					: null
			}
			<path
				d="${linePath(series)}"
				fill="none"
				stroke="${color}"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</g>`;
	}

	function renderBars(
		series: ChartSeries,
		seriesIndex: number,
	): ReturnType<typeof html> {
		const count = Math.max(props.data.length, 1);
		const slot = plotWidth / count;
		// Share each slot between the series so grouped bars sit side by side,
		// with a quarter of the slot left as the gap between groups.
		const barWidth = (slot * 0.75) / props.series.length;
		const baseline = y(Math.max(min, 0));

		return html`<g fill="${colorFor(series, seriesIndex)}">
			${props.data.map((datum, index) => {
				const top = y(numberAt(datum, series.key));
				const left =
					PADDING.left + slot * index + slot * 0.125 + barWidth * seriesIndex;
				return html`<rect
					x="${left}"
					y="${Math.min(top, baseline)}"
					width="${barWidth}"
					height="${Math.abs(baseline - top)}"
					rx="2"
				/>`;
			})}
		</g>`;
	}

	/** The same numbers as a real table, for anything that cannot see the SVG. */
	function renderDataTable(): ReturnType<typeof html> {
		return html`<table>
			<caption>${props.label}</caption>
			<thead>
				<tr>
					<th scope="col">${props.categoryKey}</th>
					${props.series.map((series) => html`<th scope="col">${series.label}</th>`)}
				</tr>
			</thead>
			<tbody>
				${props.data.map(
					(datum) => html`<tr>
						<th scope="row">${categoryAt(datum, props.categoryKey)}</th>
						${props.series.map((series) => html`<td>${numberAt(datum, series.key)}</td>`)}
					</tr>`,
				)}
			</tbody>
		</table>`;
	}
});
