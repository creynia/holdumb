import type { LessonSource } from '../../content/types';

/** Title (linked when it has a url), author and note: shared by the Sources screen and lessons. */
export function SourceEntry({ s }: { s: LessonSource }) {
  return (
    <>
      {s.url ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer">
          {s.title}
        </a>
      ) : (
        <span>{s.title}</span>
      )}
      {s.author && <span class="muted">{`, ${s.author}`}</span>}
      {s.note && <span class="muted source-note">{s.note}</span>}
    </>
  );
}
