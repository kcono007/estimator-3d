'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  type DimSource,
  type OpeningKind,
  type Project,
  type RateEntry,
  type RoomScope,
  type Space,
  type Tier,
  type WallId,
  buildProjectEstimate,
  seedRateBook,
  takeoff,
} from '@estimator3d/engine';

import { Loading, Page, RefusalPanel, StorageWarning, TrustBadge, qty, usd } from '../../components/Chrome';
import { describeError } from '../../lib/errors';
import { goldenSpace, newId } from '../../lib/store';
import { useProject } from '../../lib/useProjects';

/**
 * Screen 2 — What are we building?
 *
 * The intake. It produces a RoomGraph the engine already accepts and a scope of item
 * codes from the seed book; it computes nothing. Live quantities and the running total
 * come back from the engine on every keystroke.
 */

const KINDS: OpeningKind[] = ['door', 'window', 'opening'];
const WALLS: WallId[] = ['N', 'S', 'E', 'W'];
const SOURCES: DimSource[] = ['measured', 'manual', 'inferred'];

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

/** Empty string means "not stated", which is not the same as zero. */
function optNum(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

function numOrNaN(raw: string): number {
  if (raw.trim() === '') return NaN;
  const n = Number(raw);
  return Number.isNaN(n) ? NaN : n;
}

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const store = useProject(id);
  const project = store.project;

  if (!store.ready) {
    return (
      <Page title="What are we building?" step="room" projectId={id}>
        <Loading what="project" />
      </Page>
    );
  }

  if (!project) {
    return (
      <Page title="Project not found" step="room">
        <div className="card">
          <p>No project with id {id} is stored in this browser.</p>
          <Link href="/" className="btn ghost inline">
            Back to projects
          </Link>
        </div>
      </Page>
    );
  }

  const update = (mutate: (draft: Project) => void) => {
    const draft: Project = JSON.parse(JSON.stringify(project));
    mutate(draft);
    store.upsert(draft);
  };

  const updateRoom = (roomId: string, mutate: (room: RoomScope) => void) =>
    update((draft) => {
      const room = draft.rooms.find((r) => r.id === roomId);
      if (room) mutate(room);
    });

  const updateSpace = (roomId: string, mutate: (space: Space) => void) =>
    updateRoom(roomId, (room) => mutate(room.space));

  // Live total, straight from the engine. A refusal is shown, never a fabricated zero.
  let liveTotal: string;
  let liveNote: string | null = null;
  try {
    const est = buildProjectEstimate(project, seedRateBook);
    liveTotal = usd(est.totals.totalCents);
  } catch (e) {
    const r = describeError(e, project.id);
    liveTotal = '—';
    liveNote = r.message;
  }

  const selectedCount = project.rooms.reduce((n, r) => n + r.selections.length, 0);

  return (
    <Page
      title={project.name}
      sub="Measure the room, then tap what you are building. Quantities come from the geometry."
      step="room"
      projectId={id}
      actions={
        <Link href={`/projects/${id}/estimate`} className="btn inline green">
          Estimate ›
        </Link>
      }
    >
      <StorageWarning
        unavailable={store.unavailable}
        writeFailed={store.writeFailed}
        dropped={store.dropped}
      />

      <div className="cols">
        <div>
          <div className="card">
            <h2>Project</h2>
            <div className="row">
              <div>
                <label htmlFor="pname">Project name</label>
                <input
                  id="pname"
                  type="text"
                  value={project.name}
                  onChange={(e) => update((d) => void (d.name = e.target.value))}
                />
              </div>
            </div>
            <div className="row c2">
              <div>
                <label htmlFor="client">Client</label>
                <input
                  id="client"
                  type="text"
                  value={project.client}
                  placeholder="Dana Johnson"
                  onChange={(e) => update((d) => void (d.client = e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  type="text"
                  value={project.address}
                  placeholder="14 Elm St"
                  onChange={(e) => update((d) => void (d.address = e.target.value))}
                />
              </div>
            </div>
          </div>

          {project.rooms.map((room, roomIndex) => (
            <RoomCard
              key={room.id}
              room={room}
              index={roomIndex}
              canDelete={project.rooms.length > 1}
              onDelete={() =>
                update((d) => void (d.rooms = d.rooms.filter((r) => r.id !== room.id)))
              }
              onSpace={(mutate) => updateSpace(room.id, mutate)}
              onRoom={(mutate) => updateRoom(room.id, mutate)}
            />
          ))}

          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              update((d) => {
                d.rooms.push({
                  id: newId('room'),
                  space: goldenSpace(`Room ${d.rooms.length + 1}`),
                  selections: [],
                });
              })
            }
          >
            + Add room
          </button>
        </div>

        <div>
          <div className="card sticky">
            <div className="totalmini">
              <div>
                <b className="money">{liveTotal}</b>
                <span>
                  live estimate · {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
                </span>
              </div>
              <Link href={`/projects/${id}/estimate`} className="btn green inline">
                Estimate ›
              </Link>
            </div>
            {liveNote && <p className="muted-note">{liveNote}</p>}
          </div>

          <div className="card">
            <h2>Pricing</h2>
            <div className="row c3">
              <div>
                <label htmlFor="rate">Labor $/hr</label>
                <input
                  id="rate"
                  type="number"
                  step="any"
                  value={project.config.laborRatePerHour}
                  onChange={(e) =>
                    update(
                      (d) =>
                        void (d.config.laborRatePerHour = numOrNaN(e.target.value) || 0),
                    )
                  }
                />
              </div>
              <div>
                <label htmlFor="op">O&amp;P %</label>
                <input
                  id="op"
                  type="number"
                  step="any"
                  value={Math.round(project.config.opPct * 1000) / 10}
                  onChange={(e) =>
                    update(
                      (d) => void (d.config.opPct = (numOrNaN(e.target.value) || 0) / 100),
                    )
                  }
                />
              </div>
              <div>
                <label htmlFor="tier">Tier</label>
                <select
                  id="tier"
                  value={project.config.tier}
                  onChange={(e) =>
                    update((d) => void (d.config.tier = e.target.value as Tier))
                  }
                >
                  <option value="good">Good</option>
                  <option value="better">Better</option>
                  <option value="best">Best</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor="assume">Assumptions (one per line)</label>
                <textarea
                  id="assume"
                  value={(project.config.assumptions ?? []).join('\n')}
                  onChange={(e) =>
                    update(
                      (d) =>
                        void (d.config.assumptions = e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean)),
                    )
                  }
                />
              </div>
              <div>
                <label htmlFor="exclude">Exclusions (one per line)</label>
                <textarea
                  id="exclude"
                  value={(project.config.exclusions ?? []).join('\n')}
                  onChange={(e) =>
                    update(
                      (d) =>
                        void (d.config.exclusions = e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean)),
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

function RoomCard({
  room,
  index,
  canDelete,
  onDelete,
  onSpace,
  onRoom,
}: {
  room: RoomScope;
  index: number;
  canDelete: boolean;
  onDelete: () => void;
  onSpace: (mutate: (space: Space) => void) => void;
  onRoom: (mutate: (room: RoomScope) => void) => void;
}) {
  const space = room.space;

  // The engine measures; a refusal is reported, not hidden behind blanks.
  let measured: ReturnType<typeof takeoff> | null = null;
  let refusal = null;
  try {
    measured = takeoff(space);
  } catch (e) {
    refusal = describeError(e);
  }

  const trades = seedRateBook.entries.reduce<Record<string, RateEntry[]>>((acc, e) => {
    (acc[e.trade] ??= []).push(e);
    return acc;
  }, {});

  const isSelected = (code: string) => room.selections.some((s) => s.code === code);

  const toggle = (code: string) =>
    onRoom((r) => {
      r.selections = isSelected(code)
        ? r.selections.filter((s) => s.code !== code)
        : [...r.selections, { code }];
    });

  const setOverride = (code: string, raw: string) =>
    onRoom((r) => {
      const value = optNum(raw);
      r.selections = r.selections.map((s) =>
        s.code === code
          ? value === undefined
            ? { code: s.code }
            : { code: s.code, qtyOverride: value }
          : s,
      );
    });

  return (
    <div className="card room">
      <div className="roomhead">
        <h2>
          Room {index + 1} <TrustBadge level={space.dimensionSource === 'measured' ? 'measurement-backed' : 'preliminary'} />
        </h2>
        {canDelete && (
          <button type="button" className="del" aria-label="Remove room" onClick={onDelete}>
            ×
          </button>
        )}
      </div>

      <div className="row">
        <div>
          <label htmlFor={`rn-${room.id}`}>Room name</label>
          <input
            id={`rn-${room.id}`}
            type="text"
            value={space.name}
            onChange={(e) => onSpace((s) => void (s.name = e.target.value))}
          />
        </div>
      </div>

      <div className="row c3">
        <div>
          <label>Width (ft)</label>
          <input
            type="number"
            step="any"
            value={Number.isNaN(space.width_ft) ? '' : space.width_ft}
            onChange={(e) => onSpace((s) => void (s.width_ft = numOrNaN(e.target.value)))}
          />
        </div>
        <div>
          <label>Depth (ft)</label>
          <input
            type="number"
            step="any"
            value={Number.isNaN(space.depth_ft) ? '' : space.depth_ft}
            onChange={(e) => onSpace((s) => void (s.depth_ft = numOrNaN(e.target.value)))}
          />
        </div>
        <div>
          <label>Height (ft)</label>
          <input
            type="number"
            step="any"
            value={Number.isNaN(space.height_ft) ? '' : space.height_ft}
            onChange={(e) => onSpace((s) => void (s.height_ft = numOrNaN(e.target.value)))}
          />
        </div>
      </div>

      <div className="row">
        <div>
          <label>Dimension source — this drives the trust label, which is derived, not chosen</label>
          <select
            value={space.dimensionSource}
            onChange={(e) =>
              onSpace((s) => void (s.dimensionSource = e.target.value as DimSource))
            }
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>Openings</h3>
      <div className="openings">
        {space.openings.map((o, i) => (
          <div className="opening" key={o.id}>
            <button
              type="button"
              className="del"
              aria-label={`Remove opening ${i + 1}`}
              onClick={() =>
                onSpace((s) => void (s.openings = s.openings.filter((x) => x.id !== o.id)))
              }
            >
              ×
            </button>
            <div>
              <label>Kind</label>
              <select
                value={o.kind}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (t) t.kind = e.target.value as OpeningKind;
                  })
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Wall</label>
              <select
                value={o.wall}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (t) t.wall = e.target.value as WallId;
                  })
                }
              >
                {WALLS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Source</label>
              <select
                value={o.dimensionSource}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (t) t.dimensionSource = e.target.value as DimSource;
                  })
                }
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Width ft</label>
              <input
                type="number"
                step="any"
                value={Number.isNaN(o.width_ft) ? '' : o.width_ft}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (t) t.width_ft = numOrNaN(e.target.value);
                  })
                }
              />
            </div>
            <div>
              <label>Height ft</label>
              <input
                type="number"
                step="any"
                value={Number.isNaN(o.height_ft) ? '' : o.height_ft}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (t) t.height_ft = numOrNaN(e.target.value);
                  })
                }
              />
            </div>
            <div>
              <label>Sill ft</label>
              <input
                type="number"
                step="any"
                value={o.sill_ft ?? ''}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (!t) return;
                    const v = optNum(e.target.value);
                    if (v === undefined) delete t.sill_ft;
                    else t.sill_ft = v;
                  })
                }
              />
            </div>
            <div>
              <label>Offset ft</label>
              <input
                type="number"
                step="any"
                value={o.offset_ft ?? ''}
                onChange={(e) =>
                  onSpace((s) => {
                    const t = s.openings.find((x) => x.id === o.id);
                    if (!t) return;
                    const v = optNum(e.target.value);
                    if (v === undefined) delete t.offset_ft;
                    else t.offset_ft = v;
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 10 }}
        onClick={() =>
          onSpace((s) => {
            s.openings.push({
              id: newId('op'),
              kind: 'window',
              wall: 'N',
              width_ft: 3,
              height_ft: 4,
              sill_ft: 3,
              dimensionSource: 'manual',
            });
          })
        }
      >
        + Add opening
      </button>

      {refusal ? (
        <div style={{ marginTop: 14 }}>
          <RefusalPanel refusal={refusal} />
        </div>
      ) : (
        measured && (
          <div className="pills">
            <span className="pill">
              Floor <b>{qty(measured.floorAreaSF)} SF</b>
            </span>
            <span className="pill">
              Wall gross <b>{qty(measured.grossWallAreaSF)} SF</b>
            </span>
            <span className="pill">
              Wall net <b>{qty(measured.netWallAreaSF)} SF</b>
            </span>
            <span className="pill">
              Perimeter <b>{qty(measured.perimeterLF)} LF</b>
            </span>
            <span className="pill">
              {measured.countsByKind.door} door · {measured.countsByKind.window} window
            </span>
          </div>
        )
      )}

      <h3>What are we building here?</h3>
      {Object.entries(trades).map(([trade, entries]) => (
        <div key={trade}>
          <h3 className="tradehead">{trade}</h3>
          <div className="items">
            {entries.map((e) => {
              const sel = room.selections.find((s) => s.code === e.code);
              return (
                <div className={`item ${sel ? 'on' : ''}`} key={e.code}>
                  <input
                    id={`sel-${room.id}-${e.code}`}
                    type="checkbox"
                    checked={!!sel}
                    onChange={() => toggle(e.code)}
                  />
                  <label htmlFor={`sel-${room.id}-${e.code}`}>
                    <b>{e.name}</b>
                    <span>
                      {e.code} · {e.unit} from {BASIS_LABEL[e.quantityBasis] ?? e.quantityBasis} ·
                      waste {Math.round(e.wasteFactor * 100)}%
                    </span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="qty"
                    title="Override the measured quantity — the line is then marked manual"
                    disabled={!sel}
                    value={sel?.qtyOverride ?? ''}
                    onChange={(ev) => setOverride(e.code, ev.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
