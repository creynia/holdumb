export const OFFLINE_COPY_URL =
  'https://github.com/creynia/holdumb/releases/download/latest-build/holdumb.html';

/** "Download offline copy" (hidden inside the single-file build, which already is one). */
export function OfflineLink() {
  if (__SINGLE_FILE__) return null;
  return (
    <p>
      <a class="btn btn-ghost" href={OFFLINE_COPY_URL} download="holdumb.html">
        Download offline copy
      </a>
    </p>
  );
}
