import './sim.css';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type Orientation = 'portrait' | 'landscape';
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** `auto` follows the viewport (landscape phones only); a scene can force either. */
export function useOrientation(pref: 'auto' | Orientation = 'auto'): Orientation {
  const read = (): Orientation => {
    try {
      return typeof matchMedia === 'function' && matchMedia(LANDSCAPE_QUERY).matches
        ? 'landscape'
        : 'portrait';
    } catch {
      return 'portrait';
    }
  };
  const [auto, setAuto] = useState<Orientation>(read);
  useEffect(() => {
    if (pref !== 'auto' || typeof matchMedia !== 'function') return;
    const mq = matchMedia(LANDSCAPE_QUERY);
    const on = () => setAuto(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return pref === 'auto' ? auto : pref;
}

export interface TableProps {
  orientation: Orientation;
  status?: ComponentChildren;
  felt: ComponentChildren;
  actions: ComponentChildren;
  chips?: ComponentChildren;
  /** Landscape rail extras (compact EV list, step panel, EV sheet panel). */
  rail?: ComponentChildren;
  /** The EV sheet: a modal in portrait, a rail panel in landscape (give it the matching `variant`). */
  sheet?: ComponentChildren;
  toasts?: ComponentChildren;
}

/**
 * Layout shell. Portrait: status, felt, action bar, chip rack. Landscape (844x390): the felt on the
 * left and a 284 px rail on the right whose action buttons are always visible.
 */
export function Table({
  orientation,
  status,
  felt,
  actions,
  chips,
  rail,
  sheet,
  toasts,
}: TableProps) {
  if (orientation === 'landscape') {
    return (
      <section class="sim-table sim-table-landscape" aria-label="Table">
        <div class="sim-table-felt">{felt}</div>
        <aside class="sim-rail" aria-label="Controls">
          {toasts}
          <div class="sim-rail-actions">{actions}</div>
          {chips}
          <div class="sim-rail-body">
            {rail}
            {sheet}
          </div>
          {status}
        </aside>
      </section>
    );
  }
  return (
    <section class="sim-table sim-table-portrait" aria-label="Table">
      {toasts}
      {status}
      <div class="sim-table-felt">{felt}</div>
      <div class="sim-table-actions">{actions}</div>
      {chips}
      {sheet}
    </section>
  );
}
