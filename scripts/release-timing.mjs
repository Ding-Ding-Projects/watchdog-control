import { execFileSync } from 'node:child_process';

const run = args => execFileSync('gh', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

export async function readReleaseTiming(repository, runId, tag, sourceCommit) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('RELEASE_REPOSITORY is malformed.');
  if (!/^\d+$/.test(runId)) throw new Error('WORKFLOW_RUN_ID is malformed.');
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('RELEASE_TAG is malformed.');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_COMMIT must be the full workflow source SHA.');

  const workflow = JSON.parse(run(['api', `repos/${repository}/actions/runs/${runId}`]));
  if (String(workflow.id) !== runId || workflow.head_sha !== sourceCommit || workflow.repository?.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('The workflow run does not match the expected source and repository.');
  }
  const runStartedAt = Date.parse(workflow.run_started_at || '');
  if (!Number.isFinite(runStartedAt)) throw new Error('The workflow run start timestamp is unavailable.');

  const release = JSON.parse(run(['api', `repos/${repository}/releases/tags/${tag}`]));
  const releasePublishedAt = Date.parse(release.published_at || '');
  if (!Number.isFinite(releasePublishedAt) || releasePublishedAt < runStartedAt) throw new Error('The release publication timestamp is unavailable or precedes the workflow run.');

  const seconds = Math.floor((releasePublishedAt - runStartedAt) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return {
    runStartedAt: new Date(runStartedAt).toISOString(),
    releasePublishedAt: new Date(releasePublishedAt).toISOString(),
    elapsedToPublication: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`,
  };
}

export function publicationTimingSection(timing) {
  return [
    '## Release publication timing',
    `- Workflow run started: ${timing.runStartedAt}`,
    `- Normal release published: ${timing.releasePublishedAt}`,
    `- Elapsed to publication: ${timing.elapsedToPublication}`,
  ].join('\n');
}
