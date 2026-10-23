import '@material/web/all.js';
import './styles.css';
import buildProvenance from '../build-provenance.json';

const steps = [
  ['Welcome', 'Release and scope'],
  ['Host settings', 'Port and persistent data'],
  ['Prerequisites', 'Docker Engine and Compose'],
  ['Service access', 'Pairing, TLS, optional agent'],
  ['Review', 'Confirm the destination'],
  ['Install and verify', 'Pull, start, health check']
];

const content = document.querySelector('#content-scroll');
const stepList = document.querySelector('#step-list');
const backButton = document.querySelector('#back-button');
const nextButton = document.querySelector('#next-button');
const installButton = document.querySelector('#install-button');
const finishButton = document.querySelector('#finish-button');
const cancelButton = document.querySelector('#cancel-button');
const statusTitle = document.querySelector('#status-title');
const statusMessage = document.querySelector('#status-message');
const statusIndicator = document.querySelector('#status-indicator');
const toast = document.querySelector('#toast');

let state = null;
let step = 0;
let operationRunning = false;
let selectedStorage = '';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function heading(eyebrow, title, description) {
  const block = node('div', undefined, 'page-heading');
  block.append(node('p', eyebrow, 'eyebrow'));
  const h1 = node('h1', title);
  h1.tabIndex = -1;
  h1.id = 'page-title';
  block.append(h1, node('p', description, 'lead'));
  return block;
}

function card(title, body, tone = 'info') {
  const section = node('section', undefined, `info-card ${tone}`);
  section.append(node('h2', title));
  section.append(node('p', body));
  return section;
}

function status(title, message, tone = 'neutral') {
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  statusIndicator.className = `status-indicator ${tone}`;
}

function setToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 3600);
}

function renderRail() {
  stepList.replaceChildren();
  steps.forEach(([title, subtitle], index) => {
    const row = node('li', undefined, index === step ? 'active' : index < step ? 'complete' : '');
    const number = node('span', String(index + 1), 'step-number');
    const text = node('span', undefined, 'step-label');
    text.append(node('strong', title), node('small', subtitle));
    row.append(number, text);
    stepList.append(row);
  });
  document.querySelector('#rail-summary').textContent = state?.verified
    ? 'Setup is complete. The service remains running after this assistant closes.'
    : `Step ${step + 1} of ${steps.length}. Your progress is saved on this computer.`;
}

function renderWelcome() {
  content.append(heading('WATCHDOG CONTROL / SETUP', 'A clear path to a running service.', 'The assistant checks this computer, prepares the service, and verifies its health before calling setup complete.'));
  content.append(card('What this setup will do', 'The automatic setup checks the selected local Docker context. If Docker Desktop is missing, it obtains the supported package manager, verifies its downloaded files, and starts the official Docker Desktop installer. After any first-run prompts, it downloads the exact release-matched Compose setup, pulls the immutable image, starts only the Watchdog Control service, then verifies HTTPS health and a LAN URL.'));
  content.append(card('What remains under your control', 'Windows may ask for native administrator consent, a package license, or first-run setup. Review those prompts yourself. If a computer restart is required, complete it manually and reopen this assistant to resume. Existing data and unrelated Docker projects are left in place.', 'warning'));
  const release = state?.release;
  const releaseUnavailable = /HTTP 404\b/i.test(state?.releaseError || '')
    ? 'No normal product release is published yet. Setup will be available after the first verified release.'
    : state?.releaseError || 'A verified public release is not available yet. Setup cannot continue until its release manifest passes verification.';
  content.append(card('Release source', release?.tag ? `Normal release ${release.tag}; source ${release.sourceSha}; immutable image ${release.image}` : releaseUnavailable, release?.tag ? 'success' : 'warning'));
  if (state?.progressRecoveryWarning) {
    content.append(card('Previous setup progress could not be read', `${state.progressRecoveryWarning} The original file will be copied and verified before the assistant starts a fresh record.`, 'warning'));
    const row = node('label', undefined, 'choice-row');
    const acknowledgement = document.createElement('md-checkbox');
    acknowledgement.id = 'preserve-progress-confirmation';
    row.append(acknowledgement, node('span', 'I authorize preserving the unreadable progress file before starting fresh.'));
    content.append(row);
  }
  if (state?.requiresStorageSelection) content.append(card('Choose the existing service data folder', 'The previous setup record could not supply its saved location. Browse to the folder that already contains Watchdog Control data, or choose a new empty folder. No data is moved automatically.', 'warning'));
}

function renderHostSettings() {
  content.append(heading('DESTINATION', 'Choose where the service will run.', 'These choices apply to this Watchdog Control service only.'));
  const lan = document.createElement('md-outlined-select');
  lan.id = 'lan-bind-address';
  lan.label = 'Private LAN IPv4 interface';
  lan.setAttribute('supporting-text', 'The service listens only on this selected interface.');
  const addresses = state?.lanAddresses || [];
  if (!addresses.length) {
    const option = document.createElement('md-select-option');
    option.value = '';
    option.disabled = true;
    const headline = node('div', 'No active physical adapter has a private IPv4 address.');
    headline.slot = 'headline';
    option.append(headline);
    lan.append(option);
  } else {
    for (const address of addresses) {
      const option = document.createElement('md-select-option');
      option.value = address;
      const headline = node('div', address);
      headline.slot = 'headline';
      option.append(headline);
      lan.append(option);
    }
  }
  lan.value = state?.lanBindAddress || addresses[0] || '';
  content.append(lan);
  const port = document.createElement('md-outlined-text-field');
  port.label = 'HTTPS host port';
  port.type = 'number';
  port.min = '1024';
  port.max = '65535';
  port.value = String(state?.hostPort ?? 8443);
  port.id = 'host-port';
  port.setAttribute('supporting-text', 'Choose an unused port from 1024 to 65535.');
  content.append(port);
  const storage = document.createElement('md-outlined-text-field');
  storage.label = 'Persistent data folder';
  storage.value = selectedStorage || state?.storageDirectory || '';
  storage.readOnly = true;
  storage.id = 'storage-path';
  storage.setAttribute('supporting-text', 'Existing contents are preserved.');
  const choose = document.createElement('md-outlined-button');
  choose.textContent = 'Browse for folder';
  choose.addEventListener('click', async () => {
    const selected = await window.watchdogSetup.chooseStorageDirectory();
    if (selected) {
      selectedStorage = selected;
      storage.value = selected;
      await persistSettings();
    }
  });
  const storageRow = node('div', undefined, 'storage-row');
  storageRow.append(storage, choose);
  content.append(storageRow);
  if (state?.requiresStorageSelection) {
    const row = node('label', undefined, 'choice-row');
    const confirm = document.createElement('md-checkbox');
    confirm.id = 'storage-choice-confirmation';
    confirm.checked = Boolean(state.storageChoiceConfirmed);
    row.append(confirm, node('span', 'I verified that this folder is the intended existing data location, or a new empty folder.'));
    content.append(row);
  }
  content.append(card('Data folder changes', 'Changing this choice does not migrate data. To continue an existing installation, select the folder that already contains its service data.', 'warning'));
  content.append(card('Network scope', 'The Compose port is bound only to the selected private LAN interface. The assistant does not add a public-interface binding or change the host firewall.', 'info'));
}

function renderPrerequisites() {
  content.append(heading('PREREQUISITES', 'Confirm this host is ready.', 'The assistant checks the Docker Engine and Compose plugin on the currently selected local context.'));
  content.append(card('Docker Engine and Compose', state?.docker?.message || 'Checking the local Docker context…', state?.docker?.ready ? 'success' : 'info'));
  const check = document.createElement('md-outlined-button');
  check.textContent = 'Check again';
  check.disabled = operationRunning;
  check.addEventListener('click', async () => {
    const result = await window.watchdogSetup.checkDocker();
    state.docker = result;
    render();
    status(result.ready ? 'Ready' : 'Not ready', result.message, result.ready ? 'success' : 'warning');
  });
  content.append(check);
  content.append(card('Automatic prerequisite setup', 'When you confirm the main install action, the assistant automatically attempts the supported Docker Desktop path if no local engine is ready. This includes acquiring and verifying the Windows package manager when needed. License, first-run, and native consent prompts remain visible for you to review.', 'info'));
}

function renderAccess() {
  content.append(heading('SERVICE ACCESS', 'Protect the service from first start.', 'The assistant creates a one-time owner-pairing code and a local TLS certificate. It never collects an owner password.'));
  content.append(card('TLS trust', 'The service certificate contains the current LAN IPv4 addresses. After setup, export its public .cer file and import it through each client’s normal trust controls. The assistant checks the HTTPS hostname and the certificate fingerprint before reporting the LAN URL as ready.', 'info'));
  content.append(card('Owner pairing', 'The single-use pairing code is stored in a protected local file and shown once after setup. The service consumes it when the first owner account is created.', 'info'));
  const row = node('label', undefined, 'choice-row');
  const agent = document.createElement('md-checkbox');
  agent.id = 'manage-this-computer';
  agent.checked = Boolean(state?.manageThisComputer);
  const label = node('span', 'Install the optional Windows host agent on this computer.');
  row.append(agent, label);
  content.append(row);
  content.append(card('Host agent permission', 'The agent installs a machine-wide LocalSystem service for the fixed management operation catalog. It requires separate explicit consent and a native administrator prompt. If consent is cancelled, dashboard setup can still complete.', 'warning'));
}

function renderReview() {
  content.append(heading('REVIEW', 'Confirm this computer and data location.', 'The install step checks the local engine again before writing configuration or starting the service.'));
  content.append(card('Release', state?.release?.tag ? `${state.release.tag} · ${state.release.sourceSha} · ${state.release.image}` : 'No verified normal release is available.', state?.release?.tag ? 'success' : 'warning'));
  content.append(card('Destination', `${state?.docker?.context || 'Local Docker context not verified'} · ${state?.lanBindAddress || 'No private LAN interface selected'} · HTTPS port ${state?.hostPort} · ${state?.storageDirectory || selectedStorage || 'No data folder selected'}`));
  const row = node('label', undefined, 'choice-row confirm-row');
  const confirm = document.createElement('md-checkbox');
  confirm.id = 'start-confirmation';
  confirm.checked = Boolean(state?.startConfirmed);
  const label = node('span', `I reviewed this destination at ${state?.lanBindAddress || 'no private LAN address selected'} and authorize setup to install missing prerequisites, pull the release image, and start the Watchdog Control service.`);
  row.append(confirm, label);
  content.append(row);
  if (state?.manageThisComputer) {
    const consent = node('label', undefined, 'choice-row confirm-row');
    const check = document.createElement('md-checkbox');
    check.id = 'agent-consent';
    check.checked = Boolean(state?.agentConsent);
    consent.append(check, node('span', 'I authorize a machine-wide host agent and will review the native administrator prompt.'));
    content.append(consent);
  }
}

function renderOperation() {
  const interrupted = !operationRunning && !state?.verified && state?.summary === 'Setup started.';
  content.append(heading(state?.verified ? 'SETUP COMPLETE' : operationRunning ? 'INSTALL AND VERIFY' : 'SETUP NEEDS ATTENTION', state?.verified ? 'The service is running.' : operationRunning ? 'Preparing the Watchdog Control service.' : 'Review and resume setup.', state?.verified ? 'The service stays running after this assistant closes.' : operationRunning ? 'Progress is shown here. Cancelling does not remove a service or data that has already started.' : 'The assistant checks the current host again before continuing. Existing files and services remain in place.'));
  if (state?.verified) {
    content.append(card('Verified LAN address', state.lanUrl || 'Unavailable', state.lanUrl ? 'success' : 'warning'));
    content.append(card('Release identity', `${state.release?.tag || 'unknown'} · ${state.release?.sourceSha || 'unknown'} · ${state.release?.image || 'unknown'}`));
    content.append(card('TLS certificate SHA-256', state.certificateFingerprint || 'Unavailable'));
    const certificateButton = document.createElement('md-outlined-button');
    certificateButton.textContent = 'Export public certificate (.cer)';
    certificateButton.addEventListener('click', async () => {
      certificateButton.disabled = true;
      try {
        const result = await window.watchdogSetup.exportCertificate();
        if (result.exported) setToast(`Public certificate saved as ${result.fileName}. Import it on each client before connecting.`);
      } catch (error) {
        status('Certificate export did not complete', error.message || 'The public certificate could not be exported.', 'warning');
      } finally {
        certificateButton.disabled = false;
      }
    });
    content.append(certificateButton);
    if (state.pairingCode) content.append(card('Single-use owner-pairing code', state.pairingCode, 'success'));
    content.append(card('Host agent', state.agentStatus || 'Not selected', state.agentStatus?.startsWith('Installed') ? 'success' : 'info'));
    if (state.agentStatus?.startsWith('Pending')) {
      const retry = document.createElement('md-outlined-button');
      retry.textContent = 'Retry host-agent setup';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        const result = await window.watchdogSetup.retryAgent();
        state = { ...state, ...result };
        render();
      });
      content.append(retry);
    }
  } else {
    if (operationRunning) {
      const progress = document.createElement('md-linear-progress');
      progress.indeterminate = true;
      progress.setAttribute('aria-label', 'Setup operation in progress');
      content.append(progress);
      const log = node('ol', undefined, 'operation-list');
      log.id = 'operation-log';
      for (const item of state?.operationLog || []) log.append(node('li', item));
      content.append(log);
    } else {
      content.append(card('Setup needs attention', interrupted ? 'The previous run stopped before saving a verified result. Retry to check the current host and continue safely.' : state?.summary || 'The service has not passed every required verification step.', 'warning'));
      content.append(card('Recovery', 'Review the saved release, LAN interface, port, and data folder. The assistant checks the current Docker context again, keeps existing files and services, and does not automatically remove an incomplete installation.', 'info'));
      const retrySetup = document.createElement('md-outlined-button');
      retrySetup.textContent = 'Review settings and retry';
      retrySetup.addEventListener('click', async () => {
        await persistSettings();
        step = 4;
        state = await window.watchdogSetup.saveProgress({ lastStep: step });
        render();
      });
      content.append(retrySetup);
    }
  }
}

function render() {
  renderRail();
  content.replaceChildren();
  const done = Boolean(state?.verified);
  const current = done ? 5 : step;
  switch (current) {
    case 0: renderWelcome(); break;
    case 1: renderHostSettings(); break;
    case 2: renderPrerequisites(); break;
    case 3: renderAccess(); break;
    case 4: renderReview(); break;
    default: renderOperation(); break;
  }
  backButton.disabled = operationRunning || done || step === 0;
  nextButton.hidden = done || step >= 4 || step === 5;
  installButton.hidden = done || step !== 4 || operationRunning;
  finishButton.hidden = !done;
  nextButton.disabled = operationRunning;
  cancelButton.disabled = false;
  const title = document.querySelector('#page-title');
  if (title) requestAnimationFrame(() => title.focus());
  renderRail();
}

async function persistSettings() {
  const portField = document.querySelector('#host-port');
  const manage = document.querySelector('#manage-this-computer');
  const confirmation = document.querySelector('#start-confirmation');
  const agentConsent = document.querySelector('#agent-consent');
  const patch = {
    hostPort: portField ? Number(portField.value) : state?.hostPort,
    lanBindAddress: document.querySelector('#lan-bind-address')?.value || state?.lanBindAddress,
    storageDirectory: selectedStorage || state?.storageDirectory,
    manageThisComputer: manage ? manage.checked : state?.manageThisComputer,
    startConfirmed: confirmation ? confirmation.checked : state?.startConfirmed,
    agentConsent: agentConsent ? agentConsent.checked : state?.agentConsent,
    storageChoiceConfirmed: document.querySelector('#storage-choice-confirmation')?.checked ?? state?.storageChoiceConfirmed
  };
  state = await window.watchdogSetup.saveSettings(patch);
}

nextButton.addEventListener('click', async () => {
  if (step === 0 && state?.progressRecoveryWarning) {
    if (!document.querySelector('#preserve-progress-confirmation')?.checked) {
      status('Preserve progress first', 'The unreadable progress file must be copied and verified before a new setup record can be written.', 'warning');
      return;
    }
    try {
      state = await window.watchdogSetup.preserveProgress();
      step = 1;
      render();
    } catch (error) {
      status('Progress preservation did not complete', error.message, 'warning');
    }
    return;
  }
  await persistSettings();
  if (step === 1) {
    const port = Number(document.querySelector('#host-port')?.value);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      status('Check the port', 'Choose a whole number from 1024 to 65535.', 'warning');
      return;
    }
    const lanBindAddress = document.querySelector('#lan-bind-address')?.value || '';
    if (!lanBindAddress || !(state?.lanAddresses || []).includes(lanBindAddress)) {
      status('Choose a private LAN interface', 'Connect a physical network adapter with a private IPv4 address before continuing.', 'warning');
      return;
    }
    if (!state.storageDirectory) {
      status('Choose a data folder', 'Select a folder before continuing.', 'warning');
      return;
    }
    if (state.requiresStorageSelection && !state.storageChoiceConfirmed) {
      status('Confirm the data folder', 'Verify that this is the existing service data location or a new empty folder.', 'warning');
      return;
    }
  }
  if (step === 2) {
    const result = await window.watchdogSetup.checkDocker();
    state.docker = result;
    if (!result.ready) status('Setup will install the prerequisite', result.message, 'warning');
  }
  step = Math.min(step + 1, 5);
  state = await window.watchdogSetup.saveProgress({ lastStep: step });
  render();
});

backButton.addEventListener('click', async () => {
  await persistSettings();
  step = Math.max(0, step - 1);
  state = await window.watchdogSetup.saveProgress({ lastStep: step });
  render();
});

installButton.addEventListener('click', async () => {
  await persistSettings();
  if (!state.startConfirmed) {
    status('Review the destination', 'Select the authorization checkbox before starting setup.', 'warning');
    return;
  }
  if (state.manageThisComputer && !state.agentConsent) {
    status('Separate consent required', 'The optional machine-wide host agent requires its own checkbox and native administrator prompt.', 'warning');
    return;
  }
  step = 5;
  operationRunning = true;
  state.operationLog = [];
  render();
  status('Setup started', 'The assistant is checking prerequisites and will continue automatically.', 'working');
  try {
    state = { ...state, ...(await window.watchdogSetup.install()) };
    status(state.verified ? 'Setup complete' : 'Setup remains incomplete', state.summary || 'Read the exact step result below.', state.verified ? 'success' : 'warning');
  } catch (error) {
    status('Setup remains incomplete', error.message || 'The operation stopped without a verified result.', 'warning');
  } finally {
    operationRunning = false;
    render();
  }
});

cancelButton.addEventListener('click', async () => {
  if (operationRunning) {
    status('Cancellation requested', 'The assistant will wait for an active package installer to finish before returning. It will not remove anything already started.', 'warning');
    await window.watchdogSetup.cancel();
    return;
  }
  window.close();
});

finishButton.addEventListener('click', () => window.close());

window.watchdogSetup.onProgress((event) => {
  if (event.type === 'step') {
    status(event.title, event.message, event.tone || 'working');
    state.operationLog = [...(state.operationLog || []), event.message].slice(-100);
    renderOperationLog();
  }
  if (event.type === 'state') {
    state = { ...state, ...event.state };
    render();
  }
});

function renderOperationLog() {
  const log = document.querySelector('#operation-log');
  if (!log) return;
  log.replaceChildren(...(state.operationLog || []).map((item) => node('li', item)));
}

function formatBuildTime(value) {
  if (!value) return 'Updated: unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return 'Updated: unavailable';
  return `Updated: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium', timeZoneName: 'short' }).format(date)}`;
}

try {
  const provenance = buildProvenance;
  if (provenance?.schemaVersion !== 1 || typeof provenance.version !== 'string' || !Number.isFinite(Date.parse(provenance.builtAtUtc))) {
    throw new Error('Build provenance is unavailable.');
  }
  document.querySelector('#version-label').textContent = `Version ${provenance?.version || 'unavailable'}`;
  document.querySelector('#updated-label').textContent = formatBuildTime(provenance?.builtAtUtc);
} catch {
  document.querySelector('#version-label').textContent = 'Version unavailable';
  document.querySelector('#updated-label').textContent = 'Build time unavailable';
}

state = await window.watchdogSetup.loadState();
selectedStorage = state.storageDirectory || '';
step = Math.max(0, Math.min(state.lastStep || 0, 5));
if (state.progressRecoveryWarning) {
  step = 0;
  content.append(card('Previous setup progress needs review', state.progressRecoveryWarning, 'warning'));
  status('Progress could not be read', 'The original progress file is preserved. Choose the intended data folder before starting fresh.', 'warning');
}
window.watchdogSetup.onOperationProgress((event) => {
  state.operationLog = [...(state.operationLog || []), event.message].slice(-100);
  status(event.title, event.message, event.tone || 'working');
  renderOperationLog();
});
render();

window.addEventListener('resize', () => document.body.classList.toggle('compact', window.innerWidth < 900));
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
