@echo off
REM Safe E2E test runner - kills zombies before and after each run
REM Prevents orphaned Electron/Playwright processes from accumulating

echo [cleanup] Killing orphaned processes before test run...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM playwright.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [run] Starting Playwright tests: %*
cd /d C:\Users\Administrator\Software\Maestro\.claude\worktrees\e2e-harness
npx playwright test %*

echo [cleanup] Killing orphaned processes after test run...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM playwright.exe >nul 2>&1
