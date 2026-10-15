// WP0 placeholder. TODO(table-ui) replaces it.
import type { DecisionPreview } from '../math/types';

export function EvSheet({ preview }: { preview: DecisionPreview | null }) {
  return (
    <div class="ev-sheet" data-testid="ev-sheet">
      {preview ? `${preview.options.length} options` : 'No decision yet'}
    </div>
  );
}
