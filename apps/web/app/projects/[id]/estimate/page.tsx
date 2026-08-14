'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  type Project,
  type Tier,
  buildProjectEstimate,
  seedRateBook,
  tierTotals,
} from '@estimator3d/engine';

import {
  Loading,
  Page,
  RefusalPanel,
  StorageWarning,
  TrustBadge,
  qty,
  usd,
} from '../../../components/Chrome';
import { describeError } from '../../../lib/errors';
import { useProject } from '../../../lib/useProjects';

/**
 * Screen 3 — Estimate.
 *
 * The priced lines the engine returns, each carrying its source and the trust label the
 * engine derived. Nothing here assigns a trust level, and nothing here computes a price;
 * if the engine refuses, the refusal is what gets rendered.
 */

const BASIS_LABEL: Record<string, string> = {
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

export default function EstimatePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const store = useProject(id);
  const project = store.project;

  if (!store.ready) {
    return (
      <Page title="Estimate" step="estimate" projectId={id}>
        <Loading what="estimate" />
      </Page>
    );
  }

  if (!project) {
    return (
      <Page title="Project not found" step="estimate">
        <div className="card">
          <p>No project with id {id} is stored in this browser.</p>
          <Link href="/" className="btn ghost inline">
            Back to projects
          </Link>
        </div>
      </Page>
    );
  }

  const setTier = (tier: Tier) => {
    const draft: Project = JSON.parse(JSON.stringify(project));
    draft.config.tier = tier;
    store.upsert(draft);
  };

  let estimate;
  try {
    estimate = buildProjectEstimate(project, seedRateBook);
  } catch (e) {
    return (
      <Page
        title="Estimate"
        sub={project.name}
        step="estimate"
        projectId={id}
        actions={
          <Link href={`/projects/${id}`} className="btn ghost inline">
            ‹ Back to the room
          </Link>
        }
      >
        <StorageWarning
          unavailable={store.unavailable}
          writeFailed={store.writeFailed}
          dropped={store.dropped}
        />
        <RefusalPanel refusal={describeError(e, project.id)} />
      </Page>
    );
  }

  const tiers = tierTotals(project, seedRateBook);

  return (
    <Page
      title="Estimate"
      sub={`${project.name} · placeholder pricing`}
      step="estimate"
      projectId={id}
      actions={
        <>
          <Link href={`/projects/${id}`} className="btn ghost inline">
            ‹ Room
          </Link>
          <Link href={`/projects/${id}/proposal`} className="btn green inline">
            Create proposal ›
          </Link>
        </>
      }
    >
      <StorageWarning
        unavailable={store.unavailable}
        writeFailed={store.writeFailed}
        dropped={store.dropped}
      />

      <div className="card">
        <div className="titlerow">
          <h2 style={{ marginBottom: 0 }}>
            {project.name} <TrustBadge level={estimate.trustLevel} />
          </h2>
          <span className="muted-note" style={{ marginTop: 0 }}>
            {estimate.rooms.length} {estimate.rooms.length === 1 ? 'room' : 'rooms'} priced
            {estimate.unscopedRoomIds.length > 0 &&
              ` · ${estimate.unscopedRoomIds.length} measured but not scoped`}
          </span>
        </div>
        <p className="muted-note">
          The trust label is derived from the dimension sources on every room, weakest link
          first — it is never chosen. Change a room&rsquo;s source on the previous screen and
          watch it move.
        </p>
      </div>

      <div className="tiercards">
        {tiers.map((t) => (
          <button
            type="button"
            key={t.tier}
            className={`tiercard ${t.tier === estimate.tier ? 'on' : ''}`}
            onClick={() => setTier(t.tier)}
          >
            <em>{t.tier}</em>
            <b className="money">{t.totalCents === null ? '—' : usd(t.totalCents)}</b>
            <i>{TIER_DESC[t.tier]}</i>
          </button>
        ))}
      </div>

      {estimate.rooms.map((room) => (
        <div className="card" key={room.roomId}>
          <div className="titlerow">
            <h2 style={{ marginBottom: 0 }}>
              {room.roomName} <TrustBadge level={room.estimate.trustLevel} />
            </h2>
            <span className="muted-note" style={{ marginTop: 0 }}>
              {qty(room.estimate.takeoff.floorAreaSF)} SF floor ·{' '}
              {qty(room.estimate.takeoff.netWallAreaSF)} SF net wall ·{' '}
              {qty(room.estimate.takeoff.perimeterLF)} LF perimeter
            </span>
          </div>

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
              {room.estimate.lines.map((l) => (
                <tr key={l.code}>
                  <td className="li-name">
                    <b>{l.name}</b>
                    <span>
                      {l.trade} · {l.code} · ${l.effectiveUnitCost.toFixed(2)}/{l.unit} at {l.tier}{' '}
                      (×{l.tierMultiplier}) · {l.laborHoursPerUnit} hr/{l.unit}
                    </span>
                    <span>
                      waste {Math.round(l.wasteFactor * 100)}% → {qty(l.qtyWithWaste)} {l.unit}{' '}
                      purchased · source {l.rateBookSource}, eff. {l.effectiveDate}
                    </span>
                  </td>
                  <td className="r">
                    {qty(l.qty)} {l.unit}
                    <span className={`qty-source ${l.qtySource}`}>{l.qtySource}</span>
                    <div className="micro">from {BASIS_LABEL[l.quantityBasis] ?? l.quantityBasis}</div>
                  </td>
                  <td className="r money">{usd(l.materialCents)}</td>
                  <td className="r money">
                    {usd(l.laborCents)}
                    <div className="micro">{qty(l.laborHours)} hrs</div>
                  </td>
                  <td className="r money">
                    <b>{usd(l.subtotalCents)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card">
        <h2>Totals</h2>
        <div className="totals">
          <div className="t">
            <span>Materials</span>
            <b className="money">{usd(estimate.totals.materialCents)}</b>
          </div>
          <div className="t">
            <span>
              Labor · {qty(estimate.totals.laborHours)} hrs @ ${estimate.laborRatePerHour}/hr
            </span>
            <b className="money">{usd(estimate.totals.laborCents)}</b>
          </div>
          <div className="t">
            <span>Subtotal</span>
            <b className="money">{usd(estimate.totals.subtotalCents)}</b>
          </div>
          <div className="t">
            <span>Overhead &amp; profit · {Math.round(estimate.opPct * 1000) / 10}%</span>
            <b className="money">{usd(estimate.totals.opCents)}</b>
          </div>
          <div className="t grand">
            <span>Total</span>
            <b className="money">{usd(estimate.totals.totalCents)}</b>
          </div>
        </div>
      </div>

      <div className="card notes">
        <h2>Basis of estimate</h2>
        <h3>Pricing source</h3>
        <ul>
          {estimate.pricingSources.map((s) => (
            <li key={`${s.source}@${s.effectiveDate}`}>
              {s.source} — effective {s.effectiveDate}
            </li>
          ))}
        </ul>
        <h3>Assumptions</h3>
        <ul>
          {estimate.assumptions.length === 0 ? (
            <li>None stated.</li>
          ) : (
            estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)
          )}
        </ul>
        <h3>Exclusions</h3>
        <ul>
          {estimate.exclusions.length === 0 ? (
            <li>None stated.</li>
          ) : (
            estimate.exclusions.map((x, i) => <li key={i}>{x}</li>)
          )}
        </ul>
        <p className="muted-note">
          Quantities are measured from the room geometry. Unit costs are seed placeholders —
          cost book integration is a later milestone.
        </p>
      </div>
    </Page>
  );
}
