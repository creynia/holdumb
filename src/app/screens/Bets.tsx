import {
  BLIND_PAYTABLES,
  PAYTABLE_PRESET_IDS,
  TRIPS_PAYTABLES,
  WAGER_IDS,
  formatPct,
} from '../../sim';
import type { WagerId } from '../../sim';
import { Html } from '../components/Html';
import { Link } from '../components/Link';
import { TierBadge } from '../components/TierBadge';
import { TRIPS_EDGE, payRows, wagerTierOf } from '../bets';
import { useContent, useStore } from '../context';
import { NotFound } from './NotFound';
import { HAND_LABEL } from './handLabels';

const NAME: Record<WagerId, string> = {
  ante: 'Ante',
  blind: 'Blind',
  play: 'Play',
  trips: 'Trips',
};

function PayTable({ rows }: { rows: { category: string; pays: string }[] }) {
  return (
    <table class="bets">
      <thead>
        <tr>
          <th>Hand</th>
          <th class="num">Pays</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category}>
            <td>{HAND_LABEL[r.category] ?? r.category}</td>
            <td class="num">{r.pays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Paytables (`#/bets`): the four wagers, the Blind table and every Trips preset. */
export function BetsList() {
  const content = useContent();
  const store = useStore();
  const current = store.settings.paytable;
  return (
    <div class="page">
      <Link to="/more" class="back">
        {'←'} More
      </Link>
      <h1>Paytables</h1>
      <ul class="plain">
        {WAGER_IDS.map((w) => (
          <li key={w} class="card">
            <Link to={`/bets/${w}`}>
              <strong>{NAME[w]}</strong>
            </Link>
            <p class="muted">{content.bets[w]?.summary ?? ''}</p>
          </li>
        ))}
      </ul>
      <section class="card" data-section="blind">
        <h2>Blind pays on a win</h2>
        <PayTable rows={payRows(BLIND_PAYTABLES['blind-standard'])} />
        <p class="muted">Winning hands below a straight push.</p>
      </section>
      <section data-section="trips">
        <h2>Trips paytables</h2>
        {PAYTABLE_PRESET_IDS.map((id) => {
          const edge = TRIPS_EDGE[id];
          return (
            <article key={id} class="card trips-preset" data-preset={id}>
              <header class="row">
                <h3>{TRIPS_PAYTABLES[id].label}</h3>
                {id === current && <span class="badge tier-good">In use</span>}
                {edge && <TierBadge tier={wagerTierOf(edge)} />}
                {edge && <span class="muted">House edge {formatPct(edge, 3)}</span>}
              </header>
              <PayTable rows={payRows(TRIPS_PAYTABLES[id])} />
            </article>
          );
        })}
        <p class="muted">
          Change the table you practise on in <Link to="/settings">Settings</Link>.
        </p>
      </section>
    </div>
  );
}

export function BetDetail({ id }: { id: string }) {
  const content = useContent();
  const store = useStore();
  if (!(WAGER_IDS as readonly string[]).includes(id)) return <NotFound what="That wager" />;
  const w = id as WagerId;
  const copy = content.bets[w];
  const lesson = copy?.lessonId ? content.lessons.find((l) => l.id === copy.lessonId) : undefined;
  const tripsId = store.settings.paytable;
  const edge = w === 'trips' ? TRIPS_EDGE[tripsId] : undefined;
  return (
    <div class="page">
      <Link to="/bets" class="back">
        {'←'} Paytables
      </Link>
      <h1>{copy?.name ?? NAME[w]}</h1>
      {edge && (
        <p>
          <TierBadge tier={wagerTierOf(edge)} />{' '}
          <span class="muted">House edge {formatPct(edge, 3)}</span>
        </p>
      )}
      {copy ? (
        <>
          <p class="lead">{copy.summary}</p>
          <Html html={copy.howItWorks} />
          {copy.tip && <p class="tip">{copy.tip}</p>}
        </>
      ) : (
        <p class="muted">No description yet.</p>
      )}
      {w === 'blind' && <PayTable rows={payRows(BLIND_PAYTABLES['blind-standard'])} />}
      {w === 'trips' && <PayTable rows={payRows(TRIPS_PAYTABLES[tripsId])} />}
      <div class="row">
        <Link to="/play" class="btn">
          Try it at the table
        </Link>
        {lesson && (
          <Link to={`/learn/${lesson.id}`} class="btn btn-ghost">
            Lesson: {lesson.title}
          </Link>
        )}
      </div>
    </div>
  );
}
