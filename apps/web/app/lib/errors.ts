import {
  EstimateError,
  GeometryError,
  ProjectError,
  ProposalError,
  RateBookError,
} from '@estimator3d/engine';

/**
 * Turns a typed engine refusal into something a contractor can act on.
 *
 * Every branch here corresponds to an error class the engine actually throws. Anything
 * unrecognised is re-thrown, not swallowed — an unknown failure must not be dressed up as
 * a friendly message.
 */
export interface Refusal {
  kind: string;
  code: string;
  message: string;
  details: string[];
  /** Where the contractor should go to fix it. */
  fixHref?: string;
  fixLabel?: string;
}

export function describeError(e: unknown, projectId?: string): Refusal {
  const roomHref = projectId ? `/projects/${projectId}` : undefined;

  if (e instanceof GeometryError) {
    return {
      kind: 'Geometry refused',
      code: e.code,
      message: e.message,
      details: e.openingIds.length ? [`Opening(s): ${e.openingIds.join(', ')}`] : [],
      ...(roomHref ? { fixHref: roomHref, fixLabel: 'Fix the room' } : {}),
    };
  }

  if (e instanceof ProjectError) {
    const fix =
      e.code === 'NO_SCOPE'
        ? { fixHref: roomHref, fixLabel: 'Pick what you are building' }
        : { fixHref: roomHref, fixLabel: 'Add a room' };
    return {
      kind: 'Estimate refused',
      code: e.code,
      message: e.message,
      details: e.roomId ? [`Room: ${e.roomId}`] : [],
      ...(fix.fixHref ? fix : {}),
    };
  }

  if (e instanceof EstimateError) {
    return {
      kind: 'Estimate refused',
      code: e.code,
      message: e.message,
      details: e.itemCode ? [`Item code: ${e.itemCode}`] : [],
      ...(roomHref ? { fixHref: roomHref, fixLabel: 'Fix the scope' } : {}),
    };
  }

  if (e instanceof ProposalError) {
    return {
      kind: 'Proposal refused',
      code: e.code,
      message: e.message,
      details: [
        'A proposal priced from placeholder rates must say so on its face.',
      ],
    };
  }

  if (e instanceof RateBookError) {
    return {
      kind: 'Rate book refused',
      code: e.code,
      message: 'A rate book that fails validation never prices anything.',
      details: e.issues.map((i) => `[${i.code}] ${i.message}`),
    };
  }

  throw e;
}
