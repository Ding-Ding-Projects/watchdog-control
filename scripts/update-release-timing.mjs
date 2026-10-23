import { execFileSync } from 'node:child_process';
import { readReleaseTiming, publicationTimingSection } from './release-timing.mjs';

const repository = process.env.RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const tag = process.env.RELEASE_TAG || '';
const runId = process.env.WORKFLOW_RUN_ID || '';
const sourceCommit = process.env.SOURCE_COMMIT || '';
if (!repository || !tag || !runId || !sourceCommit) throw new Error('Release repository, tag, workflow run id, and source commit are required.');

const run = args => execFileSync('gh', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
const before = JSON.parse(run(['api', `repos/${repository}/releases/tags/${tag}`]));
if (before.draft !== false || before.prerelease !== false) throw new Error('Workflow timing can only be added to a normal published release.');

const timing = await readReleaseTiming(repository, runId, tag, sourceCommit);
const marker = /\n?## Release publication timing\n[\s\S]*$/u;
const baseNotes = (before.body || '').replace(marker, '').trimEnd();
const notes = `${baseNotes}\n\n${publicationTimingSection(timing)}\n`;
run(['release', 'edit', tag, '--repo', repository, '--notes', notes]);

const after = JSON.parse(run(['api', `repos/${repository}/releases/tags/${tag}`]));
if (after.body !== notes || after.published_at !== before.published_at) throw new Error('The stored workflow timing note did not read back exactly.');
process.stdout.write(`Recorded and verified release publication timing for ${tag}: ${timing.runStartedAt} to ${timing.releasePublishedAt} (${timing.elapsedToPublication}).\n`);
