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
  /** Sandbox quick options (I090): above the status bar in portrait, under it in the rail. */
  options?: ComponentChildren;
  felt: ComponentChildren;
  actions: ComponentChildren;
  chips?: ComponentChildren;
  /** Landscape rail extras (compact EV list, step panel). */
  rail?: ComponentChildren;
  /** The EV sheet: a modal in portrait, a rail panel in landscape (give it the matching `variant`). */
  sheet?: ComponentChildren;
  toasts?: ComponentChildren;
}

/**
 * Layout shell. Portrait: status, felt, action bar, toasts, chip rack. Landscape (844x390): the felt
 * on the left and a 284 px rail on the right: the fixed action rows, the status bar under them, then
 * a scrolling body with the chip rack, toasts and step panel. The open EV sheet covers the rail
 * (never the felt) at full height until it closes. Everything that comes and goes (toasts, the
 * fold reveal, the rack) sits below the actions, so no button moves (I012).
 */
export function Table({
  orientation,
  status,
  options,
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
          <div class="sim-rail-actions">{actions}</div>
          {status}
          {options}
          {/* It scrolls when the rail is short, so keyboard users can reach it (axe). */}
          <div class="sim-rail-body" tabIndex={0} role="group" aria-label="Table details">
            {chips}
            {toasts}
            {rail}
          </div>
          {sheet ? <div class="sim-rail-sheet">{sheet}</div> : null}
        </aside>
      </section>
    );
  }
  return (
    <section class="sim-table sim-table-portrait" aria-label="Table">
      {options}
      {status}
      <div class="sim-table-felt">{felt}</div>
      <div class="sim-table-actions">{actions}</div>
      {toasts}
      {chips}
      {sheet}
    </section>
  );
}
