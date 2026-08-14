'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  PLACEHOLDER_PRICING_NOTICE,
  type Project,
  type Tier,
  buildProposal,
  seedRateBook,
} from '@estimator3d/engine';

import {
  Loading,
  Page,
  RefusalPanel,
  StorageWarning,
  TrustLadder,
  usd,
} from '../../../components/Chrome';
import { describeError } from '../../../lib/errors';
import { todayIso } from '../../../lib/store';
import { useProject } from '../../../lib/useProjects';

/**
 * Screen 4 — Proposal. The contractor-facing output.
 *
 * Printable with the browser's own print dialog and a print stylesheet — no PDF library,
 * no service, no dependency.
 *
 * The engine refuses to build this at all without a pricing notice that actually warns,
 * so the notice on the page cannot be removed by editing this file alone.
 */

export default function ProposalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const store = useProject(id);
  const project = store.project;

  if (!store.ready) {
    return (
      <Page title="Proposal" step="proposal" projectId={id}>
        <Loading what="proposal" />
      </Page>
    );
  }

  if (!project) {
    return (
      <Page title="Project not found" step="proposal">
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

  let proposal;
  try {
    proposal = buildProposal(project, seedRateBook, {
      preparedOn: todayIso(),
      pricingNotice: PLACEHOLDER_PRICING_NOTICE,
    });
  } catch (e) {
    return (
      <Page
        title="Proposal"
        sub={project.name}
        step="proposal"
        projectId={id}
        actions={
          <Link href={`/projects/${id}/estimate`} className="btn ghost inline">
            ‹ Back to the estimate
          </Link>
        }
      >
        <RefusalPanel refusal={describeError(e, project.id)} />
      </Page>
    );
  }

  return (
    <Page
      title="Proposal"
      sub={`${proposal.projectName}${proposal.client ? ` · ${proposal.client}` : ''}`}
      step="proposal"
      projectId={id}
      actions={
        <>
          <Link href={`/projects/${id}/estimate`} className="btn ghost inline">
            ‹ Estimate
          </Link>
          <button type="button" className="btn inline" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </>
      }
    >
      <StorageWarning
        unavailable={store.unavailable}
        writeFailed={store.writeFailed}
        dropped={store.dropped}
      />

      <article className="proposal">
        <header className="prop-head">
          <div>
            <h2>{proposal.projectName}</h2>
            <div className="muted-note" style={{ marginTop: 2 }}>
              {proposal.client || 'Client not set'}
              {proposal.address ? ` · ${proposal.address}` : ''}
              {' · prepared '}
              {proposal.preparedOn}
            </div>
          </div>
          <div className="prop-total">
            <span>Total · {proposal.estimate.tier}</span>
            <b className="money">{usd(proposal.totalCents)}</b>
          </div>
        </header>

        {/* Comes from the engine, which refuses to build a proposal without it. */}
        <p className="pricing-notice">{proposal.pricingNotice}</p>

        <section>
          <h3>Measurement confidence</h3>
          <TrustLadder ladder={proposal.trustLadder} />
          <p className="fineprint">
            This proposal is <b>{proposal.trustLevel}</b>. The label is derived from where each
            dimension came from — it is never set by hand. Field-verified and contract-ready
            require a human sign-off that this milestone does not yet provide.
          </p>
        </section>

        <section>
          <h3>Options</h3>
          <div className="tiercards">
            {proposal.tiers.map((t) => (
              <button
                type="button"
                key={t.tier}
                className={`tiercard ${t.selected ? 'on' : ''}`}
                onClick={() => setTier(t.tier)}
              >
                <em>{t.tier}</em>
                <b className="money">{t.totalCents === null ? '—' : usd(t.totalCents)}</b>
                <i>{t.description}</i>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Scope of work</h3>
          <ul className="scopelist">
            {proposal.scope.map((s, i) => (
              <li key={i}>
                <b>{s.name}</b>
                <span>
                  {s.roomName} · {s.trade} · {s.qtyLabel}
                  <span className={`qty-source ${s.qtySource}`}>{s.qtySource}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Measurements</h3>
          <table className="lines">
            <thead>
              <tr>
                <th>Room</th>
                <th>Dimensions</th>
                <th className="r">Floor</th>
                <th className="r">Wall (net)</th>
                <th className="r">Perimeter</th>
                <th className="r">Openings</th>
              </tr>
            </thead>
            <tbody>
              {proposal.measurements.map((m, i) => (
                <tr key={i}>
                  <td>{m.roomName}</td>
                  <td>{m.dimensions}</td>
                  <td className="r">{m.floorAreaSF} SF</td>
                  <td className="r">{m.netWallAreaSF} SF</td>
                  <td className="r">{m.perimeterLF} LF</td>
                  <td className="r">
                    {m.doors} door · {m.windows} window
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Assumptions</h3>
          <ul className="fineprint">
            {proposal.assumptions.length === 0 ? (
              <li>None stated.</li>
            ) : (
              proposal.assumptions.map((a, i) => <li key={i}>{a}</li>)
            )}
          </ul>
          <h3>Exclusions</h3>
          <ul className="fineprint">
            {proposal.exclusions.length === 0 ? (
              <li>None stated.</li>
            ) : (
              proposal.exclusions.map((x, i) => <li key={i}>{x}</li>)
            )}
          </ul>
        </section>

        <footer className="prop-foot">
          <p className="fineprint">
            Pricing source:{' '}
            {proposal.pricingSources
              .map((s) => `${s.source} (effective ${s.effectiveDate})`)
              .join(', ')}
            . <b>{proposal.pricingNotice}</b> Quantities are computed from the measured room
            geometry; unit costs are seed placeholders and licensed cost data is a later
            milestone. Not contract-ready until flagged dimensions are field-verified.
          </p>
        </footer>
      </article>

      <p className="muted-note no-print">
        Print uses your browser&rsquo;s own dialog — choose &ldquo;Save as PDF&rdquo; there if
        you want a file. No PDF library and no service is involved, so nothing leaves this
        machine.
      </p>
    </Page>
  );
}
