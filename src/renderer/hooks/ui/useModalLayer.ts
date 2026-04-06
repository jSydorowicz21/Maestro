/**
 * useModalLayer - Reusable hook for modal/overlay layer stack registration
 *
 * This hook encapsulates the common pattern of registering a layer with the
 * centralized layer stack. It handles:
 * - Layer registration on mount (modal or overlay)
 * - Layer unregistration on unmount
 * - Handler updates when the escape callback changes
 * - Type-appropriate defaults (modals: strict focus trap, blocks lower layers;
 *   overlays: no focus trap, does not block lower layers)
 *
 * Usage:
 * ```tsx
 * // Modal (default)
 * function MyModal({ onClose }: { onClose: () => void }) {
 *   useModalLayer(MODAL_PRIORITIES.MY_MODAL, 'My Modal', onClose);
 *   return <div>...</div>;
 * }
 *
 * // Overlay
 * function MyOverlay({ onClose }: { onClose: () => void }) {
 *   useModalLayer(MODAL_PRIORITIES.MY_OVERLAY, 'My Overlay', onClose, {
 *     type: 'overlay',
 *     allowClickOutside: true,
 *   });
 *   return <div>...</div>;
 * }
 * ```
 *
 * For modals with custom escape handling (e.g., checking for nested overlays):
 * ```tsx
 * const handleEscape = useCallback(() => {
 *   if (subOverlayOpen) {
 *     closeSubOverlay();
 *     return;
 *   }
 *   onClose();
 * }, [subOverlayOpen, onClose]);
 *
 * useModalLayer(MODAL_PRIORITIES.MY_MODAL, 'My Modal', handleEscape);
 * ```
 */

import { useEffect, useRef } from 'react';
import { useLayerStack } from '../../contexts/LayerStackContext';
import type { FocusTrapMode, LayerType } from '../../types/layer';

export interface UseModalLayerOptions {
	/** Whether the layer is currently active. When false, the layer is not registered. Defaults to true */
	isOpen?: boolean;
	/** Layer type. Defaults to 'modal' */
	type?: LayerType;
	/** Whether the modal has unsaved changes (modal-only) */
	isDirty?: boolean;
	/** Callback to confirm closing when dirty - return false to prevent close (modal-only) */
	onBeforeClose?: () => boolean | Promise<boolean>;
	/** Focus trap behavior. Defaults to 'strict' for modals, 'none' for overlays */
	focusTrap?: FocusTrapMode;
	/** Whether this layer blocks interaction with layers below. Defaults to true for modals, false for overlays */
	blocksLowerLayers?: boolean;
	/** Whether this layer captures keyboard focus. Defaults to true for modals, false for overlays */
	capturesFocus?: boolean;
	/** Whether clicking outside the overlay should close it (overlay-only). Defaults to true */
	allowClickOutside?: boolean;
}

/**
 * Register a modal or overlay with the layer stack
 *
 * @param priority - Layer priority from MODAL_PRIORITIES constant
 * @param ariaLabel - Accessibility label for the layer
 * @param onEscape - Callback when Escape is pressed (typically onClose)
 * @param options - Additional options for layer configuration
 *
 * @example
 * // Simple modal (default)
 * useModalLayer(MODAL_PRIORITIES.SETTINGS, 'Settings', onClose);
 *
 * @example
 * // Modal with dirty check
 * useModalLayer(MODAL_PRIORITIES.EDITOR, 'Editor', onClose, {
 *   isDirty: hasUnsavedChanges,
 *   onBeforeClose: async () => {
 *     return await confirmDiscard();
 *   }
 * });
 *
 * @example
 * // Overlay layer
 * useModalLayer(MODAL_PRIORITIES.FILE_PREVIEW, 'File Preview', onClose, {
 *   type: 'overlay',
 *   allowClickOutside: false,
 * });
 */
export function useModalLayer(
	priority: number,
	ariaLabel: string,
	onEscape: () => void,
	options: UseModalLayerOptions = {}
): void {
	const {
		isOpen = true,
		type = 'modal',
		isDirty,
		onBeforeClose,
		allowClickOutside = true,
	} = options;

	// Defaults differ by layer type
	const isOverlay = type === 'overlay';
	const focusTrap = options.focusTrap ?? (isOverlay ? 'none' : 'strict');
	const blocksLowerLayers = options.blocksLowerLayers ?? !isOverlay;
	const capturesFocus = options.capturesFocus ?? !isOverlay;

	const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
	const layerIdRef = useRef<string>();

	// Register layer on mount (only when isOpen is true)
	useEffect(() => {
		if (!isOpen) return;

		const layerConfig = isOverlay
			? {
					type: 'overlay' as const,
					priority,
					blocksLowerLayers,
					capturesFocus,
					focusTrap,
					ariaLabel,
					allowClickOutside,
					onEscape,
				}
			: {
					type: 'modal' as const,
					priority,
					blocksLowerLayers,
					capturesFocus,
					focusTrap,
					ariaLabel,
					isDirty,
					onBeforeClose,
					onEscape,
				};

		const id = registerLayer(layerConfig);
		layerIdRef.current = id;

		return () => {
			if (layerIdRef.current) {
				unregisterLayer(layerIdRef.current);
				layerIdRef.current = undefined;
			}
		};
	}, [
		isOpen,
		registerLayer,
		unregisterLayer,
		isOverlay,
		priority,
		ariaLabel,
		blocksLowerLayers,
		capturesFocus,
		focusTrap,
		isDirty,
		onBeforeClose,
		allowClickOutside,
	]);

	// Update handler when onEscape changes (without re-registering)
	useEffect(() => {
		if (isOpen && layerIdRef.current) {
			updateLayerHandler(layerIdRef.current, onEscape);
		}
	}, [isOpen, onEscape, updateLayerHandler]);
}
