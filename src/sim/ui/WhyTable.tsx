import './sim.css';
import { formatPct } from '../engine';
import type { WhyBreakdown } from '../math';
import { fmtAnteUnits, typographic } from './text';

const n = (v: bigint) => v.toLocaleString('en-US');

/** "Why?" rows (simulator.md 2.5): each case, how often it happens, what it pays, what it adds. */
export function WhyTable({ why, id }: { why: WhyBreakdown; id?: string }) {
  return (
    <div class="sim-why" id={id} data-testid="why-table">
      {why.rows.length > 0 ? (
        <table class="sim-why-table">
          <caption>Cases: {why.casesLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col" class="num">
                Chance
              </th>
              <th scope="col" class="num">
                Net (antes)
              </th>
              <th scope="col" class="num">
                Adds
              </th>
            </tr>
          </thead>
          <tbody>
            {why.rows.map((r) => (
              <tr key={r.id} data-row={r.id}>
                <th scope="row">
                  {r.label}
                  <span class="sim-why-count">
                    {n(r.count)} of {n(r.outOf)}
                  </span>
                  {r.blindBonusAnte ? (
                    <span class="sim-why-count">
                      includes Blind bonus {typographic(fmtAnteUnits(r.blindBonusAnte))}
                    </span>
                  ) : null}
                </th>
                <td class="num">{formatPct(r.probability, 1)}</td>
                <td class="num">{typographic(fmtAnteUnits(r.netAnte))}</td>
                <td class="num">{typographic(fmtAnteUnits(r.contribution))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="sim-why-count">Cases: {why.casesLabel}</p>
      )}
      <p class="sim-why-formula">{typographic(why.formula)}</p>
      {why.note ? <p class="sim-why-note">{why.note}</p> : null}
    </div>
  );
}
