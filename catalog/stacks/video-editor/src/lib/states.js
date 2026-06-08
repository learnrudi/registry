import fs from 'fs/promises';
import path from 'path';
import {
  artifactPath,
  loadProject,
  pathExists,
  readJson,
  writeProject
} from './files.js';

export const RunState = {
  EMPTY: 'empty',
  IMPORTED: 'imported',
  TRANSCRIBED: 'transcribed',
  CLUSTERED: 'clustered',
  ANALYZED: 'analyzed',
  PLANNED: 'planned',
  RENDERED: 'rendered',
  REVIEWED: 'reviewed'
};

export const RUN_STATE_ORDER = [
  RunState.EMPTY,
  RunState.IMPORTED,
  RunState.TRANSCRIBED,
  RunState.CLUSTERED,
  RunState.ANALYZED,
  RunState.PLANNED,
  RunState.RENDERED,
  RunState.REVIEWED
];

export const STATE_DESCRIPTIONS = {
  [RunState.EMPTY]: 'No initialized run artifacts exist.',
  [RunState.IMPORTED]: 'Source media is copied and probe metadata exists.',
  [RunState.TRANSCRIBED]: 'Source transcript exists.',
  [RunState.CLUSTERED]: 'Transcript clusters exist for planning.',
  [RunState.ANALYZED]: 'Analysis artifacts exist for silence, cut safety, narration, chapters, or insights.',
  [RunState.PLANNED]: 'Composition keep ranges are populated.',
  [RunState.RENDERED]: 'At least one render exists.',
  [RunState.REVIEWED]: 'Review artifacts exist.'
};

export const VALID_TRANSITIONS = {
  [RunState.EMPTY]: [RunState.IMPORTED],
  [RunState.IMPORTED]: [RunState.TRANSCRIBED, RunState.ANALYZED],
  [RunState.TRANSCRIBED]: [RunState.CLUSTERED, RunState.ANALYZED],
  [RunState.CLUSTERED]: [RunState.ANALYZED, RunState.PLANNED],
  [RunState.ANALYZED]: [RunState.PLANNED],
  [RunState.PLANNED]: [RunState.RENDERED],
  [RunState.RENDERED]: [RunState.REVIEWED],
  [RunState.REVIEWED]: []
};

function stateRank(state) {
  return RUN_STATE_ORDER.indexOf(state);
}

export function isKnownRunState(state) {
  return stateRank(state) !== -1;
}

export function compareRunStates(left, right) {
  const leftRank = stateRank(left);
  const rightRank = stateRank(right);
  if (leftRank === -1 || rightRank === -1) {
    throw new Error(`Unknown run state comparison: ${left} -> ${right}`);
  }
  return leftRank - rightRank;
}

export function maxRunState(left, right) {
  return compareRunStates(left, right) >= 0 ? left : right;
}

export function canTransition(currentState, nextState) {
  if (currentState === nextState) {
    return true;
  }

  if (!isKnownRunState(currentState) || !isKnownRunState(nextState)) {
    return false;
  }

  if (compareRunStates(currentState, nextState) > 0) {
    return false;
  }

  const queue = [...(VALID_TRANSITIONS[currentState] || [])];
  const seen = new Set([currentState]);

  while (queue.length > 0) {
    const state = queue.shift();
    if (state === nextState) {
      return true;
    }
    if (seen.has(state)) {
      continue;
    }
    seen.add(state);
    queue.push(...(VALID_TRANSITIONS[state] || []));
  }

  return false;
}

function assertKnownState(state) {
  if (!isKnownRunState(state)) {
    throw new Error(`Unknown run state: ${state}`);
  }
}

async function readOptionalJson(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    return await readJson(filePath);
  } catch (_) {
    return null;
  }
}

async function hasRenderArtifact(runDir, project) {
  const rendersDir = artifactPath(runDir, project, 'renders');
  try {
    const entries = await fs.readdir(rendersDir);
    return entries.some((entry) => /\.(mp4|mov|m4v)$/i.test(entry));
  } catch (_) {
    return false;
  }
}

async function artifactExists(runDir, project, key) {
  if (!project.artifacts?.[key]) {
    return false;
  }
  return pathExists(artifactPath(runDir, project, key));
}

export async function collectRunArtifactState(runDir, project) {
  const compositionPath = artifactPath(runDir, project, 'composition');
  const composition = await readOptionalJson(compositionPath);
  const chapters = composition?.timeline?.chapters || [];
  const keepRanges = composition?.timeline?.keepRanges || [];

  return {
    source: await pathExists(path.join(runDir, project.sourceLink)),
    probe: await artifactExists(runDir, project, 'probe'),
    transcriptSource: await artifactExists(runDir, project, 'transcriptSource'),
    transcriptClusters: await artifactExists(runDir, project, 'transcriptClusters'),
    silence: await artifactExists(runDir, project, 'silence'),
    cutAudit: await artifactExists(runDir, project, 'cutAudit'),
    narration: await artifactExists(runDir, project, 'narration'),
    insights: await artifactExists(runDir, project, 'insights'),
    chapters: chapters.length > 0,
    planned: keepRanges.length > 0,
    render: await hasRenderArtifact(runDir, project),
    review: await artifactExists(runDir, project, 'review')
  };
}

export function stateFromArtifacts(artifacts) {
  let state = RunState.EMPTY;

  if (artifacts.source && artifacts.probe) state = RunState.IMPORTED;
  if (artifacts.transcriptSource) state = RunState.TRANSCRIBED;
  if (artifacts.transcriptClusters) state = RunState.CLUSTERED;
  if (
    artifacts.silence ||
    artifacts.cutAudit ||
    artifacts.narration ||
    artifacts.insights ||
    artifacts.chapters
  ) {
    state = RunState.ANALYZED;
  }
  if (artifacts.planned) state = RunState.PLANNED;
  if (artifacts.render) state = RunState.RENDERED;
  if (artifacts.review) state = RunState.REVIEWED;

  return state;
}

export async function resolveRunState(runDir, projectArg = null) {
  const project = projectArg || (await loadProject(runDir)).project;
  const artifactState = await collectRunArtifactState(runDir, project);
  const derivedState = stateFromArtifacts(artifactState);
  const persistedState = project.state || null;
  const currentState = persistedState && isKnownRunState(persistedState)
    ? maxRunState(persistedState, derivedState)
    : derivedState;

  return {
    state: currentState,
    derivedState,
    persistedState,
    description: STATE_DESCRIPTIONS[currentState],
    validNextStates: VALID_TRANSITIONS[currentState] || [],
    artifacts: artifactState
  };
}

export async function advanceRunState(runDir, nextState) {
  assertKnownState(nextState);

  const { project, projectPath } = await loadProject(runDir);
  const stateInfo = await resolveRunState(runDir, project);
  const currentState = stateInfo.state;
  const targetState = maxRunState(currentState, nextState);

  if (!canTransition(currentState, targetState)) {
    throw new Error(`Illegal run state transition: ${currentState} -> ${targetState}`);
  }

  if (project.state === targetState) {
    return { state: targetState, previousState: currentState, changed: false };
  }

  await writeProject(projectPath, {
    ...project,
    state: targetState,
    stateUpdatedAt: new Date().toISOString()
  });

  return { state: targetState, previousState: currentState, changed: true };
}
