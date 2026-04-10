/**
 * Shared utilities for Zustand stores.
 */

/**
 * Resolves a value-or-updater pattern commonly used in store setters.
 * Accepts either a direct value or a function that receives the previous value.
 *
 * @example
 * // Direct value
 * resolve('hello', 'previous') // => 'hello'
 *
 * // Updater function
 * resolve((prev) => prev + '!', 'hello') // => 'hello!'
 */
export function resolve<T>(valOrFn: T | ((prev: T) => T), prev: T): T {
	return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
}
