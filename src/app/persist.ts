// Ask the browser to keep this site's storage (lesson progress). Asked once ever: the answer is
// stored in settings, so a refusal is not asked again on later visits (I076).
export type PersistAsked = 'no' | 'granted' | 'denied';
type PersistNav = {
  storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> };
};

export async function requestPersistOnce(
  nav: PersistNav | undefined,
  asked: PersistAsked,
  save: (outcome: 'granted' | 'denied') => void,
): Promise<boolean | null> {
  if (asked !== 'no') return null;
  try {
    const storage = nav?.storage;
    if (!storage?.persist) return null;
    if (storage.persisted && (await storage.persisted())) {
      save('granted');
      return true;
    }
    const ok = await storage.persist();
    save(ok ? 'granted' : 'denied');
    return ok;
  } catch {
    save('denied');
    return null;
  }
}

export type StorageState = 'persistent' | 'best-effort' | null;

/** Whether the browser keeps this site's storage. null when the API is missing (line hidden). */
export async function storageState(
  nav: { storage?: { persisted?: () => Promise<boolean> } } | undefined = typeof navigator !==
  'undefined'
    ? navigator
    : undefined,
): Promise<StorageState> {
  try {
    const p = nav?.storage?.persisted;
    if (!p) return null;
    return (await p.call(nav?.storage)) ? 'persistent' : 'best-effort';
  } catch {
    return null;
  }
}
