/** WP0 stub body helper. The owning work package replaces every caller with a real body. */
export function todo(wp: string, what: string): never {
  throw new Error(`TODO(${wp}): ${what}`);
}
