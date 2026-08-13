import {
  type Estimate,
  EstimateError,
  GeometryError,
  type QuantityBasis,
  RateBookError,
  type Tier,
  buildEstimate,
  centsToDollarString,
  seedRateBook,
} from '@estimator3d/engine';

import EstimateForm, { type CatalogEntry } from './EstimateForm';
import {
  type FormState,
  type SearchParams,
  parseFormState,
  toConfig,
  toSelections,
  toSpace,
} from './params';

/**
 * The one page. It reads the query string, hands it to the engine, and renders whatever
 * the engine returns — including a refusal. Every number on screen was computed by
 * @estimator3d/engine in this process; this file does no arithmetic beyond formatting.
 */

// searchParams is a per-request input, so this route is rendered on demand.
export const dynamic = 'force-dynamic';

const BASIS_LABEL: Record<QuantityBasis, string> = {
  floorAreaSF: 'floor area',
  ceilingAreaSF: 'ceiling area',
  grossWallAreaSF: 'gross wall area',
  netWallAreaSF: 'net wall area',
  perimeterLF: 'perimeter',
  doorCount: 'door count',
  windowCount: 'window count',
  openingCount: 'opening count',
};

const TIER_DESC: Record<Tier, string> = {
  good: 'Solid materials, standard finish',
  better: 'Upgraded materials, most popular',
  best: 'Premium materials & finish',
};

const catalog: CatalogEntry[] = seedRateBook.entries.map((e) => ({
  code: e.code,
  trade: e.trade,
  name: e.name,
  unit: e.unit,
  basisLabel: BASIS_LABEL[e.quantityBasis],
  wasteFactor: e.wasteFactor,
}));

/** Display-only rounding. The engine keeps full precision. */
function qty(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

function usd(cents: number): string {
  return `$${centsToDollarString(cents)}`;
}

type Outcome =
  | { ok: true; estimate: Estimate; tierTotals: { tier: Tier; totalCents: number }[] }
  | { ok: false; kind: string; code: string; message: string; details: string[] };

function compute(form: FormState): Outcome {
  const space = toSpace(form);
  const selections = toSelections(form);
  const config = toConfig(form);

  try {
    const estimate = buildEstimate(space, selections, seedRateBook, config);
    const tierTotals = (['good', 'better', 'best'] as Tier[]).map((tier) => ({
      tier,
      totalCents: buildEstimate(space, selections, seedRateBook, { ...config, tier }).totals
        .totalCents,
    }));
    return { ok: true, estimate, tierTotals };
  } catch (e) {
    if (e instanceof GeometryError) {
      return {
        ok: false,
        kind: 'Geometry refused',
        code: e.code,
        message: e.message,
        details: e.openingIds.length ? [`Opening(s): ${e.openingIds.join(', ')}`] : [],
      };
    }
    if (e instanceof RateBookError) {
      return {
        ok: false,
        kind: 'Rate book refused',
        code: e.code,
        message: 'A rate book that fails validation never prices anything.',
        details: e.issues.map((i) => `[${i.code}] ${i.message}`),
      };
    }
    if (e instanceof EstimateError) {
      return {
        ok: false,
        kind: 'Estimate refused',
        code: e.code,
        message: e.message,
        details: e.itemCode ? [`Item code: ${e.itemCode}`] : [],
      };
    }
    throw e;
  }
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  const form = parseFormState(searchParams ?? {});
  const outcome = compute(form);

  return (
    <>
      <header className="top">
        <h1>Leap 3D Estimator — M1</h1>
        <div className="sub">
          Type a room. The engine measures it and prices it. AI proposes, rules calculate, the
          contractor approves.
        </div>
        <div className="placeholder-banner">Placeholder pricing — not market rates.</div>
      </header>

      <div className="cols">
        <div>
          <EstimateForm initial={form} catalog={catalog} />
        </div>
        <div>{outcome.ok ? <Result outcome={outcome} /> : <Refusal outcome={outcome} />}</div>
      </div>

      <footer className="foot">
        Quantities computed by <code>@estimator3d/engine</code> from the room geometry above —
        deterministic, in-process, no network and no AI in the number path. Every quantity names
        its source; every price names its rate book and effective date.
      </footer>
    </>
  );
}

function Refusal({ outcome }: { outcome: Extract<Outcome, { ok: false }> }) {
  return (
    <div className="error">
      <h2>{outcome.kind}</h2>
      <code>{outcome.code}</code>
      <p>{outcome.message}</p>
      {outcome.details.length > 0 && (
        <ul>
          {outcome.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
        The engine refuses rather than guessing. Fix the input and calculate again.
      </p>
    </div>
  );
}

function Result({ outcome }: { outcome: Extract<Outcome, { ok: true }> }) {
  const { estimate: est, tierTotals } = outcome;
  const t = est.takeoff;

  return (
    <>
      <div className="card">
        <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{est.spaceName}</span>
          <span className={`badge ${est.trustLevel}`}>{est.trustLevel}</span>
        </h2>
        <div className="pills">
          <span className="pill">
            Floor <b>{qty(t.floorAreaSF)} SF</b>
          </span>
          <span className="pill">
            Ceiling <b>{qty(t.ceilingAreaSF)} SF</b>
          </span>
          <span className="pill">
            Wall gross <b>{qty(t.grossWallAreaSF)} SF</b>
          </span>
          <span className="pill">
            Wall net <b>{qty(t.netWallAreaSF)} SF</b>
          </span>
          <span className="pill">
            Perimeter <b>{qty(t.perimeterLF)} LF</b>
          </span>
          <span className="pill">
            Openings{' '}
            <b>
              {t.countsByKind.door} door · {t.countsByKind.window} window ·{' '}
              {t.countsByKind.opening} open
            </b>
          </span>
        </div>
        <p style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
          Trust level is derived from the dimension sources on the space and its openings — it is
          never set by hand. Net wall area is gross wall less every opening; perimeter is net of
          door widths.
        </p>
      </div>

      <div className="tiercards">
        {tierTotals.map(({ tier, totalCents }) => (
          <div key={tier} className={`tiercard ${tier === est.tier ? 'on' : ''}`}>
            <em>{tier}</em>
            <b className="money">{usd(totalCents)}</b>
            <i style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'normal' }}>
              {TIER_DESC[tier]}
            </i>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Line items</h2>
        <table className="lines">
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Quantity</th>
              <th className="r">Material</th>
              <th className="r">Labor</th>
              <th className="r">Line</th>
            </tr>
          </thead>
          <tbody>
            {est.lines.map((l) => (
              <tr key={l.code}>
                <td className="li-name">
                  <b>{l.name}</b>
                  <span>
                    {l.trade} · {l.code} · ${l.effectiveUnitCost.toFixed(2)}/{l.unit} at{' '}
                    {l.tier} (x{l.tierMultiplier}) · {l.laborHoursPerUnit} hr/{l.unit}
                  </span>
                  <span>
                    waste {Math.round(l.wasteFactor * 100)}% → {qty(l.qtyWithWaste)} {l.unit}{' '}
                    purchased · source {l.rateBookSource}, eff. {l.effectiveDate}
                  </span>
                </td>
                <td className="r">
                  {qty(l.qty)} {l.unit}
                  <span className={`qty-source ${l.qtySource}`}>{l.qtySource}</span>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    from {BASIS_LABEL[l.quantityBasis]}
                  </div>
                </td>
                <td className="r money">{usd(l.materialCents)}</td>
                <td className="r money">
                  {usd(l.laborCents)}
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    {qty(l.laborHours)} hrs
                  </div>
                </td>
                <td className="r money">
                  <b>{usd(l.subtotalCents)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals">
          <div className="t">
            <span>Material</span>
            <b className="money">{usd(est.totals.materialCents)}</b>
          </div>
          <div className="t">
            <span>
              Labor · {qty(est.totals.laborHours)} hrs @ ${est.laborRatePerHour}/hr
            </span>
            <b className="money">{usd(est.totals.laborCents)}</b>
          </div>
          <div className="t">
            <span>Subtotal</span>
            <b className="money">{usd(est.totals.subtotalCents)}</b>
          </div>
          <div className="t">
            <span>Overhead &amp; profit · {Math.round(est.opPct * 1000) / 10}%</span>
            <b className="money">{usd(est.totals.opCents)}</b>
          </div>
          <div className="t grand">
            <span>Total</span>
            <b className="money">{usd(est.totals.totalCents)}</b>
          </div>
        </div>
      </div>

      <div className="card notes">
        <h2>Basis of estimate</h2>
        <h3>Pricing source</h3>
        <ul>
          {est.pricingSources.map((s) => (
            <li key={`${s.source}@${s.effectiveDate}`}>
              {s.source} — effective {s.effectiveDate}
            </li>
          ))}
        </ul>
        <h3>Assumptions</h3>
        <ul>
          {est.assumptions.length === 0 ? (
            <li>None stated.</li>
          ) : (
            est.assumptions.map((a, i) => <li key={i}>{a}</li>)
          )}
        </ul>
        <h3>Exclusions</h3>
        <ul>
          {est.exclusions.length === 0 ? (
            <li>None stated.</li>
          ) : (
            est.exclusions.map((x, i) => <li key={i}>{x}</li>)
          )}
        </ul>
      </div>
    </>
  );
}
