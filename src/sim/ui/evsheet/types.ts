// The EV sheet's props, moved out of EvSheet.tsx (I082); EvSheet.tsx re-exports the type.
import type { OptionKey } from '../../scene';
import type { BetterAlternative, DecisionPreview, PreviewRequest } from '../../math';
import type { EvMode } from '../types';

export interface EvSheetProps {
  /** null while the flop EV is still computing (shows a skeleton; Confirm stays enabled). */
  preview: DecisionPreview | null;
  /** The option the player tapped. */
  selected: OptionKey;
  onSelect?: (k: OptionKey) => void;
  /** Omit for a read-only result sheet: no Confirm/Cancel, rows not selectable. */
  onConfirm?: (k: OptionKey) => void;
  onCancel?: () => void;
  /** `error`: the EV could not be computed. Shows "EV not available"; Confirm still works. */
  error?: boolean;
  /** 0..1 progress of a running preview. */
  progress?: number;
  /** `sheet`: modal dialog (portrait); `rail`: panel in the landscape rail; `inline`: plain panel. */
  variant?: 'sheet' | 'rail' | 'inline';
  /**
   * EV visibility (D11, D40): `before` the full sheet; `after` EV hidden until the move is made;
   * `never` no option rows and no numbers at all (the sheet is then only the confirm step).
   */
  evMode?: EvMode;
  /**
   * Opened as the confirm step (D40): a Mistake or Big mistake shows its warning at once and the
   * primary reads "Do it anyway". Otherwise the primary reads "Confirm <label>".
   */
  confirming?: boolean;
  /** A tiered confirm waiting for the preview: "Checking your move…" and Cancel only. */
  checking?: boolean;
  /** Set once the move is made in evMode 'after': shows the result card and the full sheet. */
  chosen?: OptionKey | null;
  onContinue?: () => void;
  /** `basic` = EV + badge; `full` = + alternative + Why? */
  detail?: 'basic' | 'full';
  whyOpen?: boolean;
  onWhyToggle?: (open: boolean) => void;
  /** Adds "about $x an hour" to the cost line. */
  handsPerHour?: number;
  /** Options a scene forbids are hidden. */
  allowed?: readonly OptionKey[];
  /** math.betterAlternative(...) for the selected option; renders curriculum 8.4 copy. */
  alternative?: BetterAlternative | null;
  /** Move focus into the sheet when it opens even when it is not modal (opened by Details, I092). */
  focusOnOpen?: boolean;
  /** The cards behind the preview. On the river it adds the dealer-outs facts (lesson 12). */
  request?: PreviewRequest | null;
}
