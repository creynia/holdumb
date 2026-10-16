import { landscapeLayout } from './landscape';
import { portraitLayout } from './portrait';
import type { FeltLayout } from './types';

export * from './types';
export { portraitLayout, landscapeLayout };

export function layoutFor(kind: FeltLayout['id']): FeltLayout {
  return kind === 'landscape' ? landscapeLayout : portraitLayout;
}
