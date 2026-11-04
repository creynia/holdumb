// Which table sound (if any) a driver event makes (I027). Pure and tiny: the audio itself lives in
// sound.ts, which is only loaded when Sounds is on.
import type { DriverEvent } from '../scene';
import type { SoundName } from './sound';

export function soundOf(e: DriverEvent): SoundName | null {
  if (e.type === 'action-confirmed') {
    if (e.action.type === 'deal') return 'deal';
    if (e.action.type === 'set-bet' && e.action.amount > 0) return 'chip';
    return null;
  }
  if (e.type === 'hand-settled') {
    return e.result.net > 0 ? 'win' : e.result.net < 0 ? 'lose' : 'push';
  }
  return null;
}
