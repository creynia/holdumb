import type { Page } from '@playwright/test';

/**
 * Seeds app settings (holdumb:v1) before the first load of a test page, once per distinct patch:
 * later reloads keep whatever the app saved (the guard is keyed by the patch, so a second call with
 * another patch still applies). Independent of the Settings screen's controls.
 */
export async function seedSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.addInitScript((p) => {
    try {
      const tag = `__holdumb_seeded:${JSON.stringify(p)}`;
      if (sessionStorage.getItem(tag)) return;
      sessionStorage.setItem(tag, '1');
      const key = 'holdumb:v1';
      const raw = localStorage.getItem(key);
      const cur = (raw ? JSON.parse(raw) : { version: 1 }) as Record<string, unknown>;
      cur.version = 1;
      cur.settings = { ...(cur.settings ?? {}), ...p };
      localStorage.setItem(key, JSON.stringify(cur));
    } catch {
      /* storage blocked: the test will show it */
    }
  }, patch);
}
