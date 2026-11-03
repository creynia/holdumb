import { useEffect, useState } from 'preact/hooks';
import { installAvailable, onInstallAvailable, promptInstall } from '../../pwa/install';

/** "Install app": shown only while the browser has offered an install and the app is not installed. */
export function InstallButton() {
  const [offered, setOffered] = useState(() => installAvailable());
  useEffect(() => onInstallAvailable(() => setOffered(installAvailable())), []);
  if (!offered) return null;
  return (
    <p>
      <button type="button" class="btn btn-ghost" onClick={() => void promptInstall()}>
        Install app
      </button>
    </p>
  );
}
