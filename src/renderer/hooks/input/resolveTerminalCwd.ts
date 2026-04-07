import type { Session } from '../../types';

/**
 * Result of resolving a terminal cd command.
 */
export interface CwdResolution {
	/** Updated local shell CWD */
	newShellCwd: string;
	/** Updated remote CWD (for SSH sessions) */
	newRemoteCwd: string | undefined;
	/** Whether the local CWD changed */
	cwdChanged: boolean;
	/** Whether the remote CWD changed */
	remoteCwdChanged: boolean;
}

/**
 * Resolve the new working directory after a cd command in terminal mode.
 * Handles bare cd, relative paths, absolute paths, tilde expansion,
 * and SSH remote sessions.
 *
 * NOTE: For relative/absolute cd targets this only computes the candidate path.
 * The caller must verify the directory exists before applying the change.
 */
export async function resolveTerminalCwd(
	activeSession: Session,
	trimmedInput: string
): Promise<CwdResolution> {
	const isRemoteSession =
		!!activeSession.sshRemoteId || !!activeSession.sessionSshRemoteConfig?.enabled;
	let newShellCwd = activeSession.shellCwd || activeSession.cwd;
	let newRemoteCwd = activeSession.remoteCwd;
	let cwdChanged = false;
	let remoteCwdChanged = false;

	// Get the current CWD based on whether this is a remote or local session
	const currentCwd = isRemoteSession
		? activeSession.remoteCwd ||
			activeSession.sessionSshRemoteConfig?.workingDirOverride ||
			activeSession.cwd
		: activeSession.shellCwd || activeSession.cwd;

	// Handle bare "cd" command - go to session's original directory (or remote working dir for SSH)
	if (trimmedInput === 'cd') {
		if (isRemoteSession) {
			remoteCwdChanged = true;
			newRemoteCwd = activeSession.sessionSshRemoteConfig?.workingDirOverride || activeSession.cwd;
		} else {
			cwdChanged = true;
			newShellCwd = activeSession.cwd;
		}
		return { newShellCwd, newRemoteCwd, cwdChanged, remoteCwdChanged };
	}

	const cdMatch = trimmedInput.match(/^cd\s+(.+)$/);
	if (!cdMatch) {
		return { newShellCwd, newRemoteCwd, cwdChanged, remoteCwdChanged };
	}

	const targetPath = cdMatch[1].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
	let candidatePath: string;

	if (targetPath === '~' || targetPath.startsWith('~/')) {
		// For remote sessions, ~ should expand to session's base directory
		if (isRemoteSession) {
			const basePath =
				activeSession.sessionSshRemoteConfig?.workingDirOverride || activeSession.cwd;
			if (targetPath === '~') {
				candidatePath = basePath;
			} else {
				// ~/subpath
				const subPath = targetPath.slice(2); // Remove ~/
				candidatePath = basePath + (basePath.endsWith('/') ? '' : '/') + subPath;
			}
		} else {
			// Local: navigate to session's original directory
			if (targetPath === '~') {
				candidatePath = activeSession.cwd;
			} else {
				candidatePath =
					activeSession.cwd + (activeSession.cwd.endsWith('/') ? '' : '/') + targetPath.slice(2);
			}
		}
	} else if (targetPath.startsWith('/')) {
		// Absolute path
		candidatePath = targetPath;
	} else if (targetPath === '..') {
		// Go up one directory
		const parts = currentCwd.split('/').filter(Boolean);
		parts.pop();
		candidatePath = '/' + parts.join('/');
	} else if (targetPath.startsWith('../')) {
		// Relative path going up
		const parts = currentCwd.split('/').filter(Boolean);
		const upCount = targetPath.split('/').filter((p) => p === '..').length;
		for (let i = 0; i < upCount; i++) parts.pop();
		const remainingPath = targetPath
			.split('/')
			.filter((p) => p !== '..')
			.join('/');
		candidatePath = '/' + [...parts, ...remainingPath.split('/').filter(Boolean)].join('/');
	} else {
		// Relative path going down
		candidatePath = currentCwd + (currentCwd.endsWith('/') ? '' : '/') + targetPath;
	}

	// Verify the directory exists before updating CWD
	// Pass SSH remote ID for remote sessions - use sessionSshRemoteConfig.remoteId as fallback
	// because sshRemoteId is only set after AI agent spawns, not for terminal-only SSH sessions
	const sshIdForVerify =
		activeSession.sshRemoteId || activeSession.sessionSshRemoteConfig?.remoteId || undefined;
	try {
		await window.maestro.fs.readDir(candidatePath, sshIdForVerify);
		// Directory exists, update the appropriate CWD
		if (isRemoteSession) {
			remoteCwdChanged = true;
			newRemoteCwd = candidatePath;
		} else {
			cwdChanged = true;
			newShellCwd = candidatePath;
		}
	} catch {
		// Directory doesn't exist, keep the current CWD
		// The shell will show its own error message
	}

	return { newShellCwd, newRemoteCwd, cwdChanged, remoteCwdChanged };
}
