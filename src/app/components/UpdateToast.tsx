import { useEffect, useState } from 'preact/hooks';

export type UpdateSubscribe = (listener: (apply: () => void) => void) => () => void;

/** "Update available" toast. `apply` posts SKIP_WAITING; the SW register code reloads on controllerchange. */
export function UpdateToast({ subscribe }: { subscribe: UpdateSubscribe }) {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => subscribe((fn) => setApply(() => fn)), [subscribe]);
  if (!apply) return null;
  return (
    <div class="toast" role="status">
      <span>Update available</span>
      <button type="button" class="btn" onClick={() => apply()}>
        Reload
      </button>
      <button type="button" class="btn btn-ghost" onClick={() => setApply(null)}>
        Later
      </button>
    </div>
  );
}
