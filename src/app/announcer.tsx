import { useEffect, useState } from 'preact/hooks';
import { ANNOUNCE_EVENT, announce, subscribeAnnouncements } from '../sim/ui/announcer';
import type { AnnounceOptions } from '../sim/ui/announcer';

/**
 * The app's only live regions: one polite, one assertive (real errors), both visually hidden.
 * Mounted once in main.tsx. Everything else calls `announce()` (src/sim/ui/announcer.ts) or, from
 * layers that may not import the sim (the PWA), dispatches a `holdumb:announce` window event.
 */
export function Announcer() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  useEffect(
    () =>
      subscribeAnnouncements((p, text) => {
        const set = p === 'assertive' ? setAssertive : setPolite;
        // Clear first, then write on the next frame: an identical repeat ("Correct." twice) is then
        // a real DOM change, which screen readers need to speak it again.
        set('');
        requestAnimationFrame(() => set(text));
      }),
    [],
  );
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string } & AnnounceOptions>).detail;
      if (d?.text) announce(d.text, d);
    };
    window.addEventListener(ANNOUNCE_EVENT, on);
    return () => window.removeEventListener(ANNOUNCE_EVENT, on);
  }, []);
  return (
    <div class="announcer" data-testid="announcer">
      <div role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </div>
  );
}
