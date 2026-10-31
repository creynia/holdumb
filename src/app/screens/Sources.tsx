import { Link } from '../components/Link';
import { SourceEntry } from '../components/SourceEntry';
import { useContent } from '../context';

export function Sources() {
  const { sources } = useContent();
  return (
    <div class="page sources">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Sources</h1>
      <p class="muted">
        Every figure in this app is computed by the app itself, in exact arithmetic or exhaustive
        enumeration, and cross-checked against the published references below. The rules and
        strategies are the standard ones; these are the places they&apos;re documented.
      </p>
      {sources.map((g) => (
        <section key={g.group} data-group={g.group}>
          <h2>{g.group}</h2>
          <ul class="source-list">
            {g.items.map((it) => (
              <li key={it.id} id={`source-${it.id}`}>
                <SourceEntry s={it} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
