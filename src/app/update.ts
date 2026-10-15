// "Check for updates" adapter. Same contract as `checkForUpdates()` in ./pwa/register (infra);
// once that module is merged, replace this body with a re-export:
//   export { checkForUpdates } from '../pwa/register';
export type UpdateCheck = 'unsupported' | 'update-available' | 'up-to-date' | 'failed';

export async function checkForUpdates(): Promise<UpdateCheck> {
  try {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return 'unsupported';
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    await reg.update();
    return reg.waiting || reg.installing ? 'update-available' : 'up-to-date';
  } catch {
    return 'failed';
  }
}

export const UPDATE_MESSAGE: Record<UpdateCheck, string> = {
  unsupported: 'Updates are not available in this copy of the app.',
  'update-available': 'A new version was found. Use the Reload button when it appears.',
  'up-to-date': 'You have the latest version.',
  failed: 'Could not check for updates. Are you offline?',
};
