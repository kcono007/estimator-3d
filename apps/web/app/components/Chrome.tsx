'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { centsToDollarString } from '@estimator3d/engine';

import type { Refusal } from '../lib/errors';

/** Shared shell pieces. No arithmetic lives here beyond formatting cents to dollars. */

export function usd(cents: number): string {
  return `$${centsToDollarString(cents)}`;
}

/** Display-only rounding. The engine keeps full precision. */
export function qty(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

export const STEPS = [
  { key: 'projects', label: 'Projects' },
  { key: 'room', label: 'What are we building?' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'proposal', label: 'Proposal' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export function Steps({ current, projectId }: { current: StepKey; projectId?: string }) {
  const hrefFor = (key: StepKey): string | null => {
    if (key === 'projects') return '/';
    if (!projectId) return null;
    if (key === 'room') return `/projects/${projectId}`;
    return `/projects/${projectId}/${key}`;
  };

  return (
    <nav className="steps no-print" aria-label="Estimator flow">
      {STEPS.map((s, i) => {
        const href = hrefFor(s.key);
        const className = `step ${s.key === current ? 'on' : ''}`;
        const body = (
          <>
            <em>{i + 1}</em>
            {s.label}
          </>
        );
        return href ? (
          <Link key={s.key} href={href} className={className}>
            {body}
          </Link>
        ) : (
          <span key={s.key} className={`${className} disabled`}>
            {body}
          </span>
        );
      })}
    </nav>
  );
}

export function TrustBadge({ level }: { level: string }) {
  return <span className={`badge ${level}`}>{level}</span>;
}

/**
 * The four-rung ladder from the mock. Only the derived rung lights up, and the two rungs
 * M1 cannot reach are shown greyed rather than hidden — the contractor should see what is
 * still ahead of them.
 */
export function TrustLadder({
  ladder,
}: {
  ladder: readonly { rung: string; current: boolean; unavailableInM1: boolean }[];
}) {
  return (
    <div className="trust">
      {ladder.map((r) => (
        <span
          key={r.rung}
          className={`rung ${r.current ? 'on' : ''} ${r.unavailableInM1 ? 'locked' : ''}`}
          title={r.unavailableInM1 ? 'Needs human sign-off — a later milestone' : undefined}
        >
          {r.rung}
          {r.unavailableInM1 ? ' 🔒' : ''}
        </span>
      ))}
    </div>
  );
}

export function PlaceholderNotice() {
  return <div className="placeholder-banner">Placeholder pricing — not market rates.</div>;
}

export function RefusalPanel({ refusal }: { refusal: Refusal }) {
  return (
    <div className="error">
      <h2>{refusal.kind}</h2>
      <code>{refusal.code}</code>
      <p>{refusal.message}</p>
      {refusal.details.length > 0 && (
        <ul>
          {refusal.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <p className="muted-note">The engine refuses rather than guessing.</p>
      {refusal.fixHref && (
        <Link href={refusal.fixHref} className="btn ghost inline">
          {refusal.fixLabel}
        </Link>
      )}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <div className="card muted-note">Loading {what}…</div>;
}

export function StorageWarning({
  unavailable,
  writeFailed,
  dropped,
}: {
  unavailable: boolean;
  writeFailed: boolean;
  dropped: { index: number; reason: string }[];
}) {
  if (!unavailable && !writeFailed && dropped.length === 0) return null;
  return (
    <div className="card warn-card no-print">
      {unavailable && (
        <p>
          <b>This browser will not give the app storage.</b> Projects will vanish on reload.
        </p>
      )}
      {writeFailed && !unavailable && (
        <p>
          <b>The last save failed.</b> Storage may be full. Your latest change is on screen but
          not on disk.
        </p>
      )}
      {dropped.length > 0 && (
        <>
          <p>
            <b>
              {dropped.length} stored {dropped.length === 1 ? 'entry was' : 'entries were'}{' '}
              unreadable and skipped:
            </b>
          </p>
          <ul>
            {dropped.map((d, i) => (
              <li key={i}>
                {d.index >= 0 ? `entry ${d.index}: ` : ''}
                {d.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function Page({
  title,
  sub,
  step,
  projectId,
  actions,
  children,
}: {
  title: string;
  sub?: ReactNode;
  step: StepKey;
  projectId?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="top no-print">
        <div className="titlerow">
          <div>
            <h1>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
        <PlaceholderNotice />
      </header>
      <Steps current={step} {...(projectId ? { projectId } : {})} />
      {children}
    </>
  );
}
