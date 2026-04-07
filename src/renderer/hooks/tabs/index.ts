export {
	useTabHandlers,
	type TabHandlersReturn,
	type CloseCurrentTabResult,
	useTerminalTabHandlers,
	type TerminalTabHandlersReturn,
} from './useTabHandlers';

// Sub-hooks (for direct use when only a subset of handlers is needed)
export { useFileTabHandlers, type FileTabHandlersReturn } from './useFileTabHandlers';
export { useTabCloseHandlers, type TabCloseHandlersReturn } from './useTabCloseHandlers';
export { useTabPropertyHandlers, type TabPropertyHandlersReturn } from './useTabPropertyHandlers';

// Tab export handlers (copy context, export HTML, publish gist)
export { useTabExportHandlers } from './useTabExportHandlers';
export type { UseTabExportHandlersDeps, UseTabExportHandlersReturn } from './useTabExportHandlers';

// Tab hover overlay (shared state for AITab, FileTab, TerminalTabItem)
export { useTabHoverOverlay } from './useTabHoverOverlay';
export type {
	OverlayPosition,
	UseTabHoverOverlayOptions,
	UseTabHoverOverlayReturn,
} from './useTabHoverOverlay';
