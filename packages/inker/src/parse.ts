import { InkerRenderError } from "./InkerRenderError.js";
import type { Token } from "./lex.js";
import { parseBlockTag } from "./parseBlockTag.js";
import type { Expression } from "./parseExpression.js";
import { parseExpression } from "./parseExpression.js";

export interface TextNode {
	readonly kind: "Text";
	readonly value: string;
}

export interface InterpolationNode {
	readonly kind: "Interpolation";
	readonly expression: Expression;
	readonly escape: boolean;
	readonly source: string;
	readonly line: number;
	readonly column: number;
}

export interface LayoutNode {
	readonly kind: "Layout";
	readonly name: string;
	readonly raw: string;
	readonly line: number;
	readonly column: number;
}

export interface PartialNode {
	readonly kind: "Partial";
	readonly name: string;
	readonly raw: string;
	readonly line: number;
	readonly column: number;
}

export interface SlotNode {
	readonly kind: "Slot";
	readonly name: string;
	readonly line: number;
	readonly column: number;
}

export interface IfCondition {
	readonly expression: Expression;
	readonly source: string;
}

export interface IfNode {
	readonly kind: "If";
	readonly condition: IfCondition;
	readonly thenNodes: readonly InkerNode[];
	readonly elseNodes?: readonly InkerNode[];
	readonly line: number;
	readonly column: number;
}

export type EachBinding =
	| { readonly kind: "Single"; readonly name: string }
	| {
			readonly kind: "Destructured";
			readonly names: readonly [string, string];
	  };

export interface EachNode {
	readonly kind: "Each";
	readonly iterable: Expression;
	readonly iterableSource: string;
	readonly binding: EachBinding;
	readonly bodyNodes: readonly InkerNode[];
	readonly elseNodes?: readonly InkerNode[];
	readonly line: number;
	readonly column: number;
}

export interface ComponentArg {
	readonly key: string;
	readonly value: Expression;
	readonly source: string;
}

export interface ComponentNode {
	readonly kind: "Component";
	readonly name: string;
	readonly args: readonly ComponentArg[];
	readonly raw: string;
	readonly line: number;
	readonly column: number;
}

export type InkerNode =
	| TextNode
	| InterpolationNode
	| LayoutNode
	| PartialNode
	| SlotNode
	| IfNode
	| EachNode
	| ComponentNode;

export interface TemplateAst {
	readonly nodes: readonly InkerNode[];
}

export interface ParseOptions {
	templatePath?: string;
	helpers?: ReadonlySet<string>;
}

function isWhitespaceOnly(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const c = value[i];
		if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
			return false;
		}
	}
	return true;
}

interface IfFrame {
	readonly kind: "If";
	readonly line: number;
	readonly column: number;
	readonly condition: IfCondition;
	readonly thenNodes: InkerNode[];
	elseNodes: InkerNode[] | undefined;
	inElse: boolean;
}

interface EachFrame {
	readonly kind: "Each";
	readonly line: number;
	readonly column: number;
	readonly iterable: Expression;
	readonly iterableSource: string;
	readonly binding: EachBinding;
	readonly bodyNodes: InkerNode[];
	elseNodes: InkerNode[] | undefined;
	inElse: boolean;
}

type BlockFrame = IfFrame | EachFrame;

function activeNodes(frame: BlockFrame): InkerNode[] {
	if (frame.inElse) {
		if (frame.elseNodes === undefined) {
			frame.elseNodes = [];
		}
		return frame.elseNodes;
	}
	if (frame.kind === "If") return frame.thenNodes;
	return frame.bodyNodes;
}

function pushNode(
	node: InkerNode,
	rootNodes: InkerNode[],
	openBlocks: BlockFrame[],
): void {
	if (openBlocks.length === 0) {
		rootNodes.push(node);
		return;
	}
	const top = openBlocks[openBlocks.length - 1];
	if (top === undefined) {
		rootNodes.push(node);
		return;
	}
	activeNodes(top).push(node);
}

function freezeNodeList(nodes: readonly InkerNode[]): readonly InkerNode[] {
	return Object.freeze(nodes.slice());
}

export function parse(
	tokens: Token[],
	options: ParseOptions = {},
): TemplateAst {
	const rootNodes: InkerNode[] = [];
	const openBlocks: BlockFrame[] = [];
	let seenLayout: { line: number; column: number } | undefined;
	let seenNonWhitespaceContent = false;

	for (const token of tokens) {
		switch (token.kind) {
			case "TEXT": {
				const node: TextNode = Object.freeze({
					kind: "Text",
					value: token.value,
				});
				pushNode(node, rootNodes, openBlocks);
				if (openBlocks.length === 0 && !isWhitespaceOnly(token.value)) {
					seenNonWhitespaceContent = true;
				}
				break;
			}
			case "INTERP_ESCAPED":
			case "INTERP_RAW": {
				const expression = parseExpression(
					token.expression,
					token.exprLine,
					token.exprColumn,
					{ templatePath: options.templatePath, helpers: options.helpers },
				);
				const node: InterpolationNode = Object.freeze({
					kind: "Interpolation",
					expression,
					escape: token.kind === "INTERP_ESCAPED",
					source: token.expression,
					line: token.line,
					column: token.column,
				});
				pushNode(node, rootNodes, openBlocks);
				if (openBlocks.length === 0) seenNonWhitespaceContent = true;
				break;
			}
			case "BLOCK_TAG": {
				const parsed = parseBlockTag(token.raw, token.line, token.column, {
					templatePath: options.templatePath,
					helpers: options.helpers,
				});
				if (parsed.kind === "Layout") {
					if (openBlocks.length > 0) {
						throw new InkerRenderError(
							"E_INKER_INVALID_LAYOUT_POSITION",
							`{% layout %} must be the first directive in the template (got at line ${token.line}, column ${token.column} inside a block)`,
							{
								line: token.line,
								column: token.column,
								templatePath: options.templatePath,
							},
						);
					}
					if (seenLayout !== undefined) {
						throw new InkerRenderError(
							"E_INKER_DUPLICATE_LAYOUT",
							`{% layout %} declared twice (first at line ${seenLayout.line}, second at line ${token.line})`,
							{
								line: token.line,
								column: token.column,
								templatePath: options.templatePath,
							},
						);
					}
					if (seenNonWhitespaceContent) {
						throw new InkerRenderError(
							"E_INKER_INVALID_LAYOUT_POSITION",
							`{% layout %} must be the first directive in the template (got at line ${token.line}, column ${token.column} after non-whitespace content)`,
							{
								line: token.line,
								column: token.column,
								templatePath: options.templatePath,
							},
						);
					}
					const last = rootNodes[rootNodes.length - 1];
					if (
						last !== undefined &&
						last.kind === "Text" &&
						isWhitespaceOnly(last.value)
					) {
						rootNodes.pop();
					}
					seenLayout = { line: token.line, column: token.column };
					rootNodes.push(parsed);
					break;
				}

				if (parsed.kind === "Partial") {
					pushNode(parsed, rootNodes, openBlocks);
					if (openBlocks.length === 0) seenNonWhitespaceContent = true;
					break;
				}

				if (parsed.kind === "Component") {
					pushNode(parsed, rootNodes, openBlocks);
					if (openBlocks.length === 0) seenNonWhitespaceContent = true;
					break;
				}

				if (parsed.kind === "BlockOpenIf") {
					const frame: IfFrame = {
						kind: "If",
						line: parsed.line,
						column: parsed.column,
						condition: parsed.condition,
						thenNodes: [],
						elseNodes: undefined,
						inElse: false,
					};
					openBlocks.push(frame);
					if (openBlocks.length === 1) seenNonWhitespaceContent = true;
					break;
				}

				if (parsed.kind === "BlockOpenEach") {
					const frame: EachFrame = {
						kind: "Each",
						line: parsed.line,
						column: parsed.column,
						iterable: parsed.iterable,
						iterableSource: parsed.iterableSource,
						binding: parsed.binding,
						bodyNodes: [],
						elseNodes: undefined,
						inElse: false,
					};
					openBlocks.push(frame);
					if (openBlocks.length === 1) seenNonWhitespaceContent = true;
					break;
				}

				if (parsed.kind === "Else") {
					if (openBlocks.length === 0) {
						throw new InkerRenderError(
							"E_INKER_UNMATCHED_BLOCK_END",
							`{% else %} with no open {% if %} or {% each %} (at line ${parsed.line}, column ${parsed.column})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					const top = openBlocks[openBlocks.length - 1];
					if (top === undefined) {
						throw new InkerRenderError(
							"E_INKER_UNMATCHED_BLOCK_END",
							`{% else %} with no open block (at line ${parsed.line}, column ${parsed.column})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					if (top.inElse) {
						throw new InkerRenderError(
							"E_INKER_INVALID_EXPRESSION",
							`Multiple {% else %} clauses in the same {% ${top.kind === "If" ? "if" : "each"} %} block (open at line ${top.line}, second else at line ${parsed.line})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					top.inElse = true;
					top.elseNodes = [];
					break;
				}

				if (parsed.kind === "BlockClose") {
					if (openBlocks.length === 0) {
						throw new InkerRenderError(
							"E_INKER_UNMATCHED_BLOCK_END",
							`{% end${parsed.closes === "If" ? "if" : "each"} %} with no open block (at line ${parsed.line}, column ${parsed.column})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					const top = openBlocks[openBlocks.length - 1];
					if (top === undefined) {
						throw new InkerRenderError(
							"E_INKER_UNMATCHED_BLOCK_END",
							`{% end${parsed.closes === "If" ? "if" : "each"} %} with no open block (at line ${parsed.line}, column ${parsed.column})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					if (top.kind !== parsed.closes) {
						const openKw = top.kind === "If" ? "if" : "each";
						const closeKw = parsed.closes === "If" ? "endif" : "endeach";
						throw new InkerRenderError(
							"E_INKER_MISMATCHED_BLOCK_END",
							`{% ${closeKw} %} does not match open {% ${openKw} %} (open at line ${top.line}, column ${top.column}; close at line ${parsed.line}, column ${parsed.column})`,
							{
								line: parsed.line,
								column: parsed.column,
								templatePath: options.templatePath,
							},
						);
					}
					openBlocks.pop();
					if (top.kind === "If") {
						const node: IfNode = Object.freeze({
							kind: "If",
							condition: top.condition,
							thenNodes: freezeNodeList(top.thenNodes),
							elseNodes:
								top.elseNodes === undefined
									? undefined
									: freezeNodeList(top.elseNodes),
							line: top.line,
							column: top.column,
						});
						pushNode(node, rootNodes, openBlocks);
					} else {
						const node: EachNode = Object.freeze({
							kind: "Each",
							iterable: top.iterable,
							iterableSource: top.iterableSource,
							binding: top.binding,
							bodyNodes: freezeNodeList(top.bodyNodes),
							elseNodes:
								top.elseNodes === undefined
									? undefined
									: freezeNodeList(top.elseNodes),
							line: top.line,
							column: top.column,
						});
						pushNode(node, rootNodes, openBlocks);
					}
					break;
				}

				break;
			}
			case "SLOT_PLACEHOLDER": {
				const node: SlotNode = Object.freeze({
					kind: "Slot",
					name: token.name,
					line: token.line,
					column: token.column,
				});
				pushNode(node, rootNodes, openBlocks);
				if (openBlocks.length === 0) seenNonWhitespaceContent = true;
				break;
			}
			default: {
				const _exhaust: never = token;
				throw new Error(
					`unreachable: unknown token kind ${JSON.stringify(_exhaust)}`,
				);
			}
		}
	}

	if (openBlocks.length > 0) {
		const top = openBlocks[openBlocks.length - 1];
		if (top === undefined) {
			throw new InkerRenderError(
				"E_INKER_UNCLOSED_BLOCK",
				"Unclosed block at EOF",
				{ templatePath: options.templatePath },
			);
		}
		const kw = top.kind === "If" ? "if" : "each";
		throw new InkerRenderError(
			"E_INKER_UNCLOSED_BLOCK",
			`{% ${kw} %} started at line ${top.line}, column ${top.column} was never closed`,
			{
				line: top.line,
				column: top.column,
				templatePath: options.templatePath,
			},
		);
	}

	return Object.freeze({ nodes: Object.freeze(rootNodes) });
}
