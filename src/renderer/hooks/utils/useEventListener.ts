/**
 * useEventListener.ts
 *
 * A hook that manages addEventListener/removeEventListener pairs.
 * Replaces the common pattern of adding a listener in useEffect and
 * removing it in the cleanup function.
 *
 * Uses a ref for the handler so the listener is never re-attached
 * when only the handler function identity changes.
 */

import { useEffect, useRef } from 'react';

/**
 * Attaches an event listener on mount and removes it on unmount.
 * The handler is stored in a ref so the listener is stable across renders,
 * avoiding unnecessary remove/re-add cycles when the handler identity changes.
 *
 * @param eventName - The event name to listen for (e.g. 'keydown', 'resize')
 * @param handler - The event handler callback
 * @param element - The target element (defaults to window). Pass null to skip attaching.
 * @param options - Optional AddEventListenerOptions (e.g. { capture: true, passive: true })
 */
export function useEventListener<K extends keyof WindowEventMap>(
	eventName: K,
	handler: (event: WindowEventMap[K]) => void,
	element?: Window | null,
	options?: boolean | AddEventListenerOptions
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
	eventName: K,
	handler: (event: DocumentEventMap[K]) => void,
	element: Document | null,
	options?: boolean | AddEventListenerOptions
): void;
export function useEventListener<K extends keyof HTMLElementEventMap>(
	eventName: K,
	handler: (event: HTMLElementEventMap[K]) => void,
	element: HTMLElement | null,
	options?: boolean | AddEventListenerOptions
): void;
// Catch-all for custom event names (e.g. 'maestro:openFileTab')
export function useEventListener(
	eventName: string,
	handler: (event: Event) => void,
	element?: EventTarget | null,
	options?: boolean | AddEventListenerOptions
): void;
export function useEventListener(
	eventName: string,
	handler: (event: Event) => void,
	element: EventTarget | null | undefined = typeof window !== 'undefined' ? window : null,
	options?: boolean | AddEventListenerOptions
): void {
	// Keep a stable ref to the latest handler so the listener never needs re-attaching
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	// Serialize options for the dependency array. Boolean options and object options
	// both need a stable representation to avoid unnecessary re-attaches.
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		if (!element) return;

		const listener = (event: Event) => {
			handlerRef.current(event);
		};

		const currentOptions = optionsRef.current;
		element.addEventListener(eventName, listener, currentOptions);

		return () => {
			element.removeEventListener(eventName, listener, currentOptions);
		};
	}, [eventName, element]);
}
