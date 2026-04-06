import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEventListener } from '../../../../renderer/hooks/utils/useEventListener';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch a native event on the given target */
const fireEvent = (target: EventTarget, event: Event) => {
	target.dispatchEvent(event);
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	addSpy = vi.spyOn(window, 'addEventListener');
	removeSpy = vi.spyOn(window, 'removeEventListener');
});

afterEach(() => {
	addSpy.mockRestore();
	removeSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEventListener', () => {
	describe('attach and detach', () => {
		it('should attach a listener on mount', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('keydown', handler));

			expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), undefined);
		});

		it('should remove the listener on unmount', () => {
			const handler = vi.fn();

			const { unmount } = renderHook(() => useEventListener('keydown', handler));
			unmount();

			expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), undefined);
		});

		it('should call the handler when the event fires', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('keydown', handler));

			const event = new KeyboardEvent('keydown', { key: 'Escape' });
			fireEvent(window, event);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(event);
		});

		it('should not call the handler after unmount', () => {
			const handler = vi.fn();

			const { unmount } = renderHook(() => useEventListener('keydown', handler));
			unmount();

			fireEvent(window, new KeyboardEvent('keydown', { key: 'Escape' }));

			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe('handler ref stability', () => {
		it('should update the handler without re-attaching the listener', () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			const { rerender } = renderHook(({ handler }) => useEventListener('keydown', handler), {
				initialProps: { handler: handler1 },
			});

			// Initial attach
			const initialAddCount = addSpy.mock.calls.length;

			// Rerender with a new handler
			rerender({ handler: handler2 });

			// addEventListener should NOT have been called again
			expect(addSpy.mock.calls.length).toBe(initialAddCount);

			// The new handler should be called when the event fires
			const event = new KeyboardEvent('keydown', { key: 'Enter' });
			fireEvent(window, event);

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledWith(event);
		});
	});

	describe('custom element target', () => {
		it('should attach to a custom HTML element', () => {
			const element = document.createElement('div');
			const elAddSpy = vi.spyOn(element, 'addEventListener');
			const elRemoveSpy = vi.spyOn(element, 'removeEventListener');
			const handler = vi.fn();

			const { unmount } = renderHook(() => useEventListener('click', handler, element));

			expect(elAddSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined);

			const event = new MouseEvent('click');
			fireEvent(element, event);
			expect(handler).toHaveBeenCalledTimes(1);

			unmount();
			expect(elRemoveSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined);

			elAddSpy.mockRestore();
			elRemoveSpy.mockRestore();
		});

		it('should attach to document', () => {
			const docAddSpy = vi.spyOn(document, 'addEventListener');
			const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
			const handler = vi.fn();

			const { unmount } = renderHook(() => useEventListener('visibilitychange', handler, document));

			expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function), undefined);

			unmount();
			expect(docRemoveSpy).toHaveBeenCalledWith(
				'visibilitychange',
				expect.any(Function),
				undefined
			);

			docAddSpy.mockRestore();
			docRemoveSpy.mockRestore();
		});
	});

	describe('null element handling', () => {
		it('should not attach a listener when element is null', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('keydown', handler, null));

			// Should not have been called on window either
			const keydownCalls = addSpy.mock.calls.filter((call) => call[0] === 'keydown');
			expect(keydownCalls).toHaveLength(0);
		});

		it('should not throw when element is null', () => {
			const handler = vi.fn();

			expect(() => {
				renderHook(() => useEventListener('keydown', handler, null));
			}).not.toThrow();
		});
	});

	describe('options support', () => {
		it('should pass capture option to addEventListener', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('keydown', handler, window, { capture: true }));

			expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
		});

		it('should pass passive option to addEventListener', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('wheel', handler, window, { passive: true }));

			expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: true });
		});

		it('should pass boolean option (capture shorthand) to addEventListener', () => {
			const handler = vi.fn();

			renderHook(() => useEventListener('keydown', handler, window, true));

			expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
		});
	});
});
