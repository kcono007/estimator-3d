import type { Opening, Space } from '../src/roomgraph';

/**
 * The golden room from the approved mockup (mockup-v2.html): 16 x 12 x 8, one door on S,
 * windows on N and E. Every gate number in ESTIMATOR1 traces back to this space.
 */
export function goldenRoom(): Space {
  return {
    id: 'sp-johnson-basement',
    name: 'Johnson Basement',
    width_ft: 16,
    depth_ft: 12,
    height_ft: 8,
    dimensionSource: 'measured',
    openings: [
      {
        id: 'op-door-s',
        kind: 'door',
        wall: 'S',
        width_ft: 3,
        height_ft: 6.67,
        offset_ft: 2,
        dimensionSource: 'measured',
      },
      {
        id: 'op-win-n',
        kind: 'window',
        wall: 'N',
        width_ft: 4,
        height_ft: 3,
        sill_ft: 3.5,
        offset_ft: 3,
        dimensionSource: 'measured',
      },
      {
        id: 'op-win-e',
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

/** A bare box with no openings — handy for isolating one formula at a time. */
export function plainRoom(overrides: Partial<Space> = {}): Space {
  return {
    id: 'sp-plain',
    name: 'Plain Room',
    width_ft: 10,
    depth_ft: 10,
    height_ft: 8,
    dimensionSource: 'measured',
    openings: [],
    ...overrides,
  };
}

export function opening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: 'op-1',
    kind: 'window',
    wall: 'N',
    width_ft: 3,
    height_ft: 4,
    dimensionSource: 'measured',
    ...overrides,
  };
}
