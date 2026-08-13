import { describe, expect, it } from 'vitest';

import { deriveTrustLevel } from '../src/roomgraph';
import { takeoff } from '../src/takeoff';
import { goldenRoom } from './fixtures';

/**
 * GATE 3 — the 16 x 12 x 8 room must yield the same numbers the approved mockup shows:
 * floor 192 SF, net wall 404 SF (rounded), perimeter 53 LF.
 */
describe('GATE 3 — golden room matches the approved mockup', () => {
  const t = takeoff(goldenRoom());

  it('floor area is 192 SF', () => {
    expect(t.floorAreaSF).toBe(192);
  });

  it('net wall area rounds to 404 SF', () => {
    // 2*(16+12)*8 = 448 gross, less (3 x 6.67) + (4 x 3) + (4 x 3) = 44.01 of openings.
    expect(Math.round(t.netWallAreaSF)).toBe(404);
    expect(t.grossWallAreaSF).toBe(448);
    expect(t.openingAreaSF).toBeCloseTo(44.01, 10);
    expect(t.netWallAreaSF).toBeCloseTo(403.99, 10);
  });

  it('perimeter is 53 LF, net of the door', () => {
    expect(t.grossPerimeterLF).toBe(56);
    expect(t.perimeterLF).toBe(53);
  });

  it('ceiling area is 192 SF and counts are 1 door / 2 windows', () => {
    expect(t.ceilingAreaSF).toBe(192);
    expect(t.countsByKind).toEqual({ door: 1, window: 2, opening: 0 });
  });

  it('an all-measured room derives measurement-backed trust', () => {
    expect(deriveTrustLevel(goldenRoom())).toBe('measurement-backed');
  });
});
