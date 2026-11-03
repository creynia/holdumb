// Ask the browser to keep this site's storage (lesson progress) once, at the first lesson
// completion. Never at boot; no-op where the API is missing or the call fails (I076).
let asked = false;

export async function requestPersistOnce(
  nav: { storage?: { persist?: () => Promise<boolean> } } | undefined = typeof navigator !==
  'undefined'
    ? navigator
    : undefined,
): Promise<boolean | null> {
  if (asked) return null;
  asked = true;
  try {
    const storage = nav?.storage;
    if (!storage?.persist) return null;
    return await storage.persist();
  } catch {
    return null;
  }
}

/** Test-only: reset the once-per-page guard. */
export function resetPersistAskForTests(): void {
  asked = false;
}
