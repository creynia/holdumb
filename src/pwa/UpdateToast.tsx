// "Update available — Reload" toast. The app mounts <UpdateToast /> once, near the root.
// Imports nothing app specific (architecture.md §5.2); styled with plain inline fallbacks plus a
// `pwa-toast` class the app's stylesheet may override.
import { useEffect, useState } from 'preact/hooks';
import { onUpdateAvailable } from './register';

export function UpdateToast() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => onUpdateAvailable((fn) => setApply(() => fn)), []);
  if (!apply) return null;
  return (
    <div
      class="pwa-toast"
      role="status"
      style="position:fixed;left:16px;right:16px;bottom:calc(72px + env(safe-area-inset-bottom));z-index:1000;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;background:#0b2e4a;color:#f8f5ec;box-shadow:0 4px 16px rgb(0 0 0 / 0.35)"
    >
      <span>Update available</span>
      <button
        type="button"
        onClick={apply}
        style="min-height:44px;min-width:44px;padding:0 16px;border:0;border-radius:8px;background:#d4af37;color:#0b2e4a;font:inherit;font-weight:700"
      >
        Reload
      </button>
    </div>
  );
}
