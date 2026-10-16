import type { UpdateCheck } from '../pwa/register';

export { checkForUpdates } from '../pwa/register';
export type { UpdateCheck };

export const UPDATE_MESSAGE: Record<UpdateCheck, string> = {
  unsupported: 'Updates are not available in this copy of the app.',
  'update-available': 'A new version was found. Use the Reload button when it appears.',
  'up-to-date': 'You have the latest version.',
  failed: 'Could not check for updates. Are you offline?',
};
