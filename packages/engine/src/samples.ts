/**
 * Reference geometry — the room the approved mockup shows.
 *
 * This lives in the engine, not in the web app, so that the room the UI seeds and the
 * room `golden.test.ts` locks are the SAME OBJECT. A copy in the UI could drift from the
 * gate without anything failing; this cannot.
 *
 * 16 x 12 x 8, one door south, windows north and east:
 *   floor 192 SF · gross wall 448 SF · net wall 403.99 SF · perimeter 53 LF
 */

import type { Space } from './roomgraph';

export interface ApprovedRoomIds {
  spaceId?: string;
  doorId?: string;
  windowNorthId?: string;
  windowEastId?: string;
}

/** A fresh copy every call — callers mutate it, so it must never be shared. */
export function approvedMockupRoom(name = 'Room 1', ids: ApprovedRoomIds = {}): Space {
  return {
    id: ids.spaceId ?? 'sp-1',
    name,
    width_ft: 16,
    depth_ft: 12,
    height_ft: 8,
    dimensionSource: 'measured',
    openings: [
      {
        id: ids.doorId ?? 'op-1',
        kind: 'door',
        wall: 'S',
        width_ft: 3,
        height_ft: 6.67,
        offset_ft: 2,
        dimensionSource: 'measured',
      },
      {
        id: ids.windowNorthId ?? 'op-2',
        kind: 'window',
        wall: 'N',
        width_ft: 4,
        height_ft: 3,
        sill_ft: 3.5,
        offset_ft: 3,
        dimensionSource: 'measured',
      },
      {
        id: ids.windowEastId ?? 'op-3',
        kind: 'window',
        wall: 'E',
        width_ft: 4,
        height_ft: 3,
        sill_ft: 3.5,
        offset_ft: 4,
        dimensionSource: 'measured',
      },
    ],
  };
}
