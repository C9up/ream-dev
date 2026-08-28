/**
 * Class composition — re-exported from Aurora rather than reimplemented here.
 *
 * `@c9up/aurora` already ships `clsx` + `tailwind-merge` written from scratch
 * with no dependencies (its `src/cn.ts`, targeting the Tailwind v4 utility
 * set). nebula is a peer of aurora, never a fork of it: one class-merge
 * implementation in the workspace, one place to fix a mis-grouped utility.
 *
 * This module exists so every nebula component imports `./lib/cn.js` and not
 * `@c9up/aurora` directly. That indirection is what lets the registry rewrite
 * a single import line when it copies a component into a host app.
 */

export { type ClassValue, clsx, cn, twMerge } from "@c9up/aurora";
