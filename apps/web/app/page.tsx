'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  EstimateError,
  GeometryError,
  type Project,
  ProjectError,
  buildProjectEstimate,
  seedRateBook,
} from '@estimator3d/engine';

import { Loading, Page, StorageWarning, usd } from './components/Chrome';
import { useProjects } from './lib/useProjects';
import { newProject } from './lib/store';

/**
 * Screen 1 — Projects.
 *
 * A list, and a way to start a new one. Each row shows a total when the project can be
 * priced and says "draft" when it cannot, because a project with no scope selected has no
 * total and printing $0 next to it would be a lie.
 */

const THUMBS = ['📐', '🛁', '🚪', '🪟', '🧱', '🪜'];

function thumbFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return THUMBS[sum % THUMBS.length] ?? '📐';
}

/** The engine decides whether there is a number. We never invent one. */
function summarise(project: Project): { amount: string; status: string } {
  try {
    const est = buildProjectEstimate(project, seedRateBook);
    return { amount: usd(est.totals.totalCents), status: est.trustLevel };
  } catch (e) {
    if (e instanceof ProjectError) {
      return { amount: 'draft', status: e.code === 'NO_SCOPE' ? 'no scope yet' : 'no rooms yet' };
    }
    if (e instanceof GeometryError) return { amount: '—', status: 'geometry needs fixing' };
    if (e instanceof EstimateError) return { amount: '—', status: 'scope needs fixing' };
    throw e;
  }
}

export default function ProjectsPage() {
  const store = useProjects();
  const router = useRouter();
  const [name, setName] = useState('');

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const project = newProject(trimmed === '' ? 'Untitled Project' : trimmed);
    store.upsert(project);
    setName('');
    router.push(`/projects/${project.id}`);
  };

  return (
    <Page
      title="Projects"
      sub="Measure a room, choose the scope, price it, and hand over a proposal you can explain."
      step="projects"
    >
      <StorageWarning
        unavailable={store.unavailable}
        writeFailed={store.writeFailed}
        dropped={store.dropped}
      />

      <div className="card">
        <h2>Start a new project</h2>
        <form onSubmit={create} className="newproj">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Johnson Basement"
            aria-label="New project name"
          />
          <button type="submit" className="btn">
            ＋ New project
          </button>
        </form>
        <p className="muted-note">
          Every new project starts on the golden room from the approved mockup — 16 × 12 × 8, a
          door south, windows north and east. Change it on the next screen.
        </p>
      </div>

      {!store.ready ? (
        <Loading what="projects" />
      ) : store.projects.length === 0 ? (
        <div className="card empty">
          <b>No projects yet.</b>
          <p className="muted-note">
            Name one above and it will be saved in this browser — it survives a reload, and it
            never leaves this machine.
          </p>
        </div>
      ) : (
        <div className="projlist">
          {store.projects.map((p) => {
            const { amount, status } = summarise(p);
            const rooms = p.rooms.length;
            return (
              <div className="card proj" key={p.id}>
                <Link href={`/projects/${p.id}`} className="proj-main">
                  <div className="thumb">{thumbFor(p.id)}</div>
                  <div className="meta">
                    <b>{p.name}</b>
                    <span>
                      Created {p.createdAt} · {rooms} {rooms === 1 ? 'room' : 'rooms'} ·{' '}
                      {p.client.trim() === '' ? 'no client set' : p.client} · {status}
                    </span>
                  </div>
                  <div className={`amt ${amount === 'draft' || amount === '—' ? 'soft' : ''}`}>
                    {amount}
                  </div>
                </Link>
                <button
                  type="button"
                  className="del"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete "${p.name}"? This removes it from this browser and cannot be undone.`,
                      )
                    ) {
                      store.remove(p.id);
                    }
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <footer className="foot">
        Projects are stored in this browser only — no account, no server, no database. Pricing
        comes from the seed rate book, which is placeholder data, and every quantity is computed
        by <code>@estimator3d/engine</code> from the room geometry.
      </footer>
    </Page>
  );
}
