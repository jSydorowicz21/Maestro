import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusAfterRender } from '../../../../renderer/hooks/utils/useFocusAfterRender';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a ref-like object with a mock focus method */
const createFocusableRef = () => ({
	current: { focus: vi.fn() } as unknown as HTMLElement,
});

/** Create a ref pointing to null (no element mounted) */
const createNullRef = () => ({
	current: null as HTMLElement | null,
});

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFocusAfterRender', () => {
	describe('basic focus behavior', () => {
		it('should focus the element after render with default delay (0ms)', () => {
			const ref = createFocusableRef();

			renderHook(() => useFocusAfterRender(ref));

			// Focus should not have happened yet (setTimeout is pending)
			expect(ref.current.focus).not.toHaveBeenCalled();

			// Advance past the 0ms delay
			vi.advanceTimersByTime(0);

			expect(ref.current.focus).toHaveBeenCalledTimes(1);
		});

		it('should not throw when ref.current is null', () => {
			const ref = createNullRef();

			renderHook(() => useFocusAfterRender(ref));

			// Should not throw when trying to focus a null ref
			expect(() => vi.advanceTimersByTime(0)).not.toThrow();
		});
	});

	describe('delay parameter', () => {
		it('should respect a 50ms delay', () => {
			const ref = createFocusableRef();

			renderHook(() => useFocusAfterRender(ref, true, 50));

			// Should not have focused yet
			vi.advanceTimersByTime(49);
			expect(ref.current.focus).not.toHaveBeenCalled();

			// Should focus after 50ms
			vi.advanceTimersByTime(1);
			expect(ref.current.focus).toHaveBeenCalledTimes(1);
		});

		it('should respect a 100ms delay', () => {
			const ref = createFocusableRef();

			renderHook(() => useFocusAfterRender(ref, true, 100));

			vi.advanceTimersByTime(99);
			expect(ref.current.focus).not.toHaveBeenCalled();

			vi.advanceTimersByTime(1);
			expect(ref.current.focus).toHaveBeenCalledTimes(1);
		});
	});

	describe('cleanup on unmount', () => {
		it('should clear timeout when component unmounts before delay fires', () => {
			const ref = createFocusableRef();

			const { unmount } = renderHook(() => useFocusAfterRender(ref, true, 50));

			// Unmount before the timer fires
			vi.advanceTimersByTime(25);
			unmount();

			// Advance past the original delay - focus should NOT have been called
			vi.advanceTimersByTime(100);
			expect(ref.current.focus).not.toHaveBeenCalled();
		});

		it('should not interfere after focus has already fired', () => {
			const ref = createFocusableRef();

			const { unmount } = renderHook(() => useFocusAfterRender(ref, true, 0));

			// Let the timer fire
			vi.advanceTimersByTime(0);
			expect(ref.current.focus).toHaveBeenCalledTimes(1);

			// Unmounting after focus already happened should be safe
			expect(() => unmount()).not.toThrow();
		});
	});

	describe('shouldFocus parameter', () => {
		it('should not focus when shouldFocus is false', () => {
			const ref = createFocusableRef();

			renderHook(() => useFocusAfterRender(ref, false));

			vi.advanceTimersByTime(100);
			expect(ref.current.focus).not.toHaveBeenCalled();
		});

		it('should focus when shouldFocus is true (explicit)', () => {
			const ref = createFocusableRef();

			renderHook(() => useFocusAfterRender(ref, true));

			vi.advanceTimersByTime(0);
			expect(ref.current.focus).toHaveBeenCalledTimes(1);
		});

		it('should respond to shouldFocus changing from false to true', () => {
			const ref = createFocusableRef();
			let shouldFocus = false;

			const { rerender } = renderHook(() => useFocusAfterRender(ref, shouldFocus, 0));

			// Initially false - no focus
			vi.advanceTimersByTime(0);
			expect(ref.current.focus).not.toHaveBeenCalled();

			// Change to true and rerender
			shouldFocus = true;
			rerender();

			vi.advanceTimersByTime(0);
			expect(ref.current.focus).toHaveBeenCalledTimes(1);
		});

		it('should cancel pending focus when shouldFocus changes to false before firing', () => {
			const ref = createFocusableRef();
			let shouldFocus = true;

			const { rerender } = renderHook(() => useFocusAfterRender(ref, shouldFocus, 50));

			// Advance partway through the delay
			vi.advanceTimersByTime(25);
			expect(ref.current.focus).not.toHaveBeenCalled();

			// Change shouldFocus to false - should cancel the pending timeout
			shouldFocus = false;
			rerender();

			// Advance past the original delay - focus should NOT fire
			vi.advanceTimersByTime(100);
			expect(ref.current.focus).not.toHaveBeenCalled();
		});
	});
});
