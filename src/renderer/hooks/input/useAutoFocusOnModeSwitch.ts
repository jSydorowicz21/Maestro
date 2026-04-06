/**
 * useAutoFocusOnModeSwitch - extracted from App.tsx (Phase 13A, Task 9)
 *
 * Auto-focuses the AI input box when switching from terminal to AI mode.
 * Tracks the previous input mode and triggers focus via useFocusAfterRender.
 */

import { useRef, useEffect } from 'react';
import { useFocusAfterRender } from '../utils/useFocusAfterRender';

export function useAutoFocusOnModeSwitch(
	inputRef: React.RefObject<HTMLTextAreaElement | null>,
	inputMode: string | undefined
): void {
	const prevInputModeRef = useRef(inputMode);
	const shouldFocus = prevInputModeRef.current === 'terminal' && inputMode === 'ai';

	useFocusAfterRender(inputRef, shouldFocus, 0);

	useEffect(() => {
		prevInputModeRef.current = inputMode;
	}, [inputMode]);
}
