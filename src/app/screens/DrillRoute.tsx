import { Drill as ClassicDrill } from './Drill';
import type { DrillDeps } from './Drill';
import { DrillShowdown } from './DrillShowdown';

/**
 * The /drill route: `?mode=showdown` is "read the showdown" (I061); anything else is the action
 * drill. A wrapper rather than a branch inside Drill, whose many hooks must not change per query.
 */
export function Drill(props: { query: URLSearchParams; deps?: DrillDeps }) {
  const mode = props.query.get('mode');
  if (mode === 'showdown') return <DrillShowdown query={props.query} />;
  return <ClassicDrill {...props} />;
}
