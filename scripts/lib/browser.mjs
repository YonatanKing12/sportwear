// Shared headless-Chromium launcher for the QA and catalog scripts.
// Uses the Playwright-managed Chromium (PLAYWRIGHT_BROWSERS_PATH); override with SW_CHROMIUM_PATH.
// In cloud sessions the SessionStart hook adds the network proxy's CA to the browser trust store,
// so TLS verification stays on.
import { chromium } from 'playwright';

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.SW_CHROMIUM_PATH || undefined,
  });
}
