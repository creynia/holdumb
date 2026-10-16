import { useEffect, useState } from 'preact/hooks';
import { Html } from '../components/Html';
import { Link } from '../components/Link';
import { useContent } from '../context';

export function Glossary({ query }: { query: URLSearchParams }) {
  const { glossary } = useContent();
  const [q, setQ] = useState('');
  const focus = query.get('term');
  useEffect(() => {
    if (focus) document.getElementById(`term-${focus}`)?.scrollIntoView?.();
  }, [focus]);
  const needle = q.trim().toLowerCase();
  const entries = [...glossary]
    .sort((a, b) => a.term.localeCompare(b.term))
    .filter(
      (g) =>
        !needle ||
        g.term.toLowerCase().includes(needle) ||
        g.definition.toLowerCase().includes(needle),
    );
  const bySlug = new Map(glossary.map((g) => [g.slug, g]));
  return (
    <div class="page">
      <h1>Glossary</h1>
      <input
        type="search"
        class="search"
        placeholder="Search terms"
        aria-label="Search glossary"
        value={q}
        onInput={(e) => setQ(e.currentTarget.value)}
      />
      {entries.length === 0 && <p class="muted">Nothing matches.</p>}
      <dl class="glossary">
        {entries.map((g) => (
          <div key={g.slug} id={`term-${g.slug}`} class={`card ${focus === g.slug ? 'focus' : ''}`}>
            <dt>{g.term}</dt>
            <dd>
              <Html html={g.definition} />
              {g.lessonId && (
                <p>
                  <Link to={`/learn/${g.lessonId}`}>Learn more in the lesson</Link>
                </p>
              )}
              {g.see && g.see.length > 0 && (
                <p class="muted">
                  See also:{' '}
                  {g.see.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <a href={`#/glossary?term=${encodeURIComponent(s)}`}>
                        {bySlug.get(s)?.term ?? s}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
