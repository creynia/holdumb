// "Update available — Reload" notice. The Shell mounts <UpdateToast /> once, inside the top bar row
// (no added height), so it can never cover or shift the table or the ActionBar (I037).
// Imports nothing app specific (architecture.md §5.2); styled by `.toast` in app.css.
import { useEffect, useState } from 'preact/hooks';
import { onUpdateAvailable } from './register';

export function UpdateToast() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => onUpdateAvailable((fn) => setApply(() => fn)), []);
  if (!apply) return null;
  return (
    <div class="toast pwa-toast" role="status">
      <span>Update available</span>
      <button type="button" onClick={apply}>
        Reload
      </button>
    </div>
  );
}
