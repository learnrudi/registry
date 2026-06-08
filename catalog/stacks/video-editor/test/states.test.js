import assert from 'assert/strict';
import {
  RunState,
  canTransition,
  stateFromArtifacts
} from '../src/lib/states.js';

assert.equal(canTransition(RunState.EMPTY, RunState.IMPORTED), true);
assert.equal(canTransition(RunState.IMPORTED, RunState.PLANNED), true);
assert.equal(canTransition(RunState.PLANNED, RunState.ANALYZED), false);
assert.equal(canTransition(RunState.REVIEWED, RunState.RENDERED), false);

assert.equal(stateFromArtifacts({}), RunState.EMPTY);
assert.equal(
  stateFromArtifacts({
    source: true,
    probe: true
  }),
  RunState.IMPORTED
);
assert.equal(
  stateFromArtifacts({
    source: true,
    probe: true,
    transcriptSource: true,
    transcriptClusters: true,
    silence: true
  }),
  RunState.ANALYZED
);
assert.equal(
  stateFromArtifacts({
    source: true,
    probe: true,
    transcriptSource: true,
    planned: true,
    render: true,
    review: true
  }),
  RunState.REVIEWED
);

console.log('state tests passed');
