import './styles.css';
import buildProvenance from '../build-provenance.json';

const steps = [
  ['Preflight', 'Release and readiness'],
  ['Destination', 'Interface, port, data'],
  ['Prerequisites', 'Container runtime'],
  ['Access', 'Pairing, TLS, agent'],
  ['Review', 'Authorize the launch'],
  ['Install', 'Pull, start, verify']
];

// Install stages, matched against the progress titles the main process reports.
const stages = [
  { label: 'Verify release', titles: ['Checking release'] },
  { label: 'Prerequisites', titles: ['Installing missing prerequisites', 'Prerequisite setup', 'Still waiting'] },
  { label: 'Write service files', titles: ['Preparing service files', 'Validating Compose configuration'] },
  { label: 'Pull pinned image', titles: ['Pulling the release image'] },
  { label: 'Start service', titles: ['Starting Watchdog Control'] },
  { label: 'Verify HTTPS and LAN', titles: ['Waiting for HTTPS health', 'Checking the host LAN address'] }
];

const content = document.querySelector('#content-scroll');
const stepList = document.querySelector('#step-list');
const flightStrip = document.querySelector('#flight-strip');
const backButton = document.querySelector('#back-button');
const nextButton = document.querySelector('#next-button');
const installButton = document.querySelector('#install-button');
const finishButton = document.querySelector('#finish-button');
const cancelButton = document.querySelector('#cancel-button');
const statusTitle = document.querySelector('#status-title');
const statusMessage = document.querySelector('#status-message');
const statusIndicator = document.querySelector('#status-indicator');
const toast = document.querySelector('#toast');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state = null;
let step = 0;
let operationRunning = false;
let selectedStorage = '';
let selectedLan = '';
let stageIndex = -1;
let operationStartedAt = 0;
let pairingRevealed = false;
let preflightShown = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function svgElement(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function button(label, className, onClick) {
  const element = node('button', label, `button ${className || ''}`.trim());
  element.type = 'button';
  if (onClick) element.addEventListener('click', onClick);
  return element;
}

function heading(eyebrow, title, description, mark) {
  const block = node('div', undefined, 'page-heading');
  if (mark) block.append(mark);
  const text = node('div');
  text.append(node('p', eyebrow, 'lab eyebrow'));
  const h1 = node('h1', title);
  h1.tabIndex = -1;
  h1.id = 'page-title';
  text.append(h1, node('p', description, 'lead'));
  block.append(text);
  return block;
}

function orbitMark(ok) {
  const mark = node('div', undefined, `orbit-mark${ok ? ' ok' : ''}`);
  mark.setAttribute('aria-hidden', 'true');
  for (const name of ['o1', 'o2', 'o3']) {
    const ring = node('div', undefined, `orbit ${name}`);
    if (name !== 'o3') ring.append(node('span', undefined, 'sat'));
    mark.append(ring);
  }
  mark.append(svgElement('<svg viewBox="0 0 34 34"><path d="M17 2l13 7.5v15L17 32 4 24.5v-15z" fill="rgba(61,232,255,.08)" stroke="#3DE8FF" stroke-width="1.6"/><path d="M10 20l3.5-7 3.5 5 3.5-5 3.5 7" stroke="#3DE8FF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
  return mark;
}

function card(title, body, tone = 'info') {
  const section = node('section', undefined, `info-card ${tone}`);
  section.append(node('h2', title));
  section.append(node('p', body));
  return section;
}

function choice(id, text, checked, danger) {
  const row = node('label', undefined, `choice-row${danger ? ' danger' : ''}`);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = Boolean(checked);
  row.append(input, node('span', text));
  return row;
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

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    setToast(`${label} copied.`);
  } catch {
    setToast('Copy is unavailable here. Select the text and copy it manually.');
  }
}

function renderRail() {
  const current = state?.verified ? steps.length : step;
  stepList.replaceChildren();
  flightStrip.replaceChildren();
  steps.forEach(([title, subtitle], index) => {
    const row = node('li', undefined, index === current ? 'active' : index < current ? 'complete' : '');
    if (index === current) row.setAttribute('aria-current', 'step');
    const number = node('span', index < current ? '✓' : String(index + 1), 'step-number');
    const text = node('span', undefined, 'step-label');
    text.append(node('strong', title), node('small', subtitle));
    row.append(number, text);
    stepList.append(row);
    flightStrip.append(node('span', undefined, index < current ? 'done' : index === current ? 'now' : ''));
  });
  document.querySelector('#rail-counter').textContent = state?.verified ? 'Flight plan · complete' : `Flight plan · ${step + 1} of ${steps.length}`;
  document.querySelector('#rail-summary').textContent = state?.verified
    ? 'Setup is complete. The service keeps running after this wizard closes.'
    : 'Progress saves on this computer. No owner password is collected here.';
}

function preflightChecks() {
  const release = state?.release;
  const releaseMissing = /HTTP 404\b/i.test(state?.releaseError || '');
  const lan = state?.lanAddresses || [];
  return [
    { label: 'Release', ok: Boolean(release?.tag), detail: release?.tag ? `${release.tag} verified` : releaseMissing ? 'No release published yet' : 'Not verified yet' },
    { label: 'Docker', ok: Boolean(state?.docker?.ready), detail: state?.docker ? (state.docker.ready ? 'Engine and Compose ready' : 'Installed during setup') : 'Checked on the next steps' },
    { label: 'Network', ok: lan.length > 0, detail: lan.length ? `${lan.length} private interface${lan.length === 1 ? '' : 's'}` : 'No private interface' },
    { label: 'Port', ok: Number.isInteger(state?.hostPort), detail: `HTTPS ${state?.hostPort ?? 8443} selected` }
  ];
}

function renderWelcome() {
  const checks = preflightChecks();
  const allReady = checks.every((check) => check.ok);
  content.append(heading('01 · Preflight', allReady ? 'Cleared for launch.' : 'Preflight complete.', 'The wizard checks this computer, prepares the service, and verifies its health before calling setup complete.', orbitMark(allReady)));
  const grid = node('section', undefined, 'checks');
  grid.setAttribute('aria-label', 'Preflight checks');
  const tiles = checks.map((check) => {
    const tile = node('div', undefined, 'check');
    const label = node('div', 'queued', 'lab');
    tile.append(label, node('div', check.label), node('div', check.detail, 'detail'));
    grid.append(tile);
    return { tile, label, check };
  });
  content.append(grid);
  const settle = ({ tile, label, check }) => {
    tile.className = `check ${check.ok ? 'ok' : 'warn'}`;
    label.textContent = check.ok ? '✓ ready' : '! attention';
  };
  if (preflightShown || reducedMotion.matches) tiles.forEach(settle);
  else {
    tiles.forEach((entry, index) => {
      window.setTimeout(() => { entry.tile.className = 'check now'; entry.label.textContent = 'scanning'; }, index * 380);
      window.setTimeout(() => settle(entry), index * 380 + 340);
    });
    preflightShown = true;
  }
  const row = node('div', undefined, 'card-grid');
  row.append(card('What this setup will do', 'Check the local Docker context, install Docker Desktop through the supported package manager if it is missing, download the release-matched Compose setup, pull the immutable image, start only the Watchdog Control service, then verify HTTPS health and a LAN address.', 'accent'));
  row.append(card('What stays yours', 'Native administrator consent, package licenses, first-run prompts and any restart stay under your control. Existing data and unrelated Docker projects are left in place.'));
  content.append(row);
  const release = state?.release;
  if (!release?.tag) {
    content.append(card('Release source', /HTTP 404\b/i.test(state?.releaseError || '')
      ? 'No normal product release is published yet. Setup becomes available after the first verified release.'
      : state?.releaseError || 'A verified public release is not available yet. Setup cannot continue until its release manifest passes verification.', 'warning'));
  }
  if (state?.progressRecoveryWarning) {
    content.append(card('Previous setup progress could not be read', `${state.progressRecoveryWarning} The original file will be copied and verified before a fresh record starts.`, 'warning'));
    content.append(choice('preserve-progress-confirmation', 'I authorize preserving the unreadable progress file before starting fresh.', false, true));
  }
  if (state?.requiresStorageSelection) content.append(card('Choose the existing service data folder', 'The previous setup record could not supply its saved location. Browse to the folder that already holds Watchdog Control data, or choose a new empty folder. No data is moved automatically.', 'warning'));
}

function renderHostSettings() {
  content.append(heading('02 · Destination', 'Where should the service listen?', 'These choices apply to this Watchdog Control service only.'));
  const addresses = state?.lanAddresses || [];
  if (!selectedLan || !addresses.includes(selectedLan)) selectedLan = state?.lanBindAddress && addresses.includes(state.lanBindAddress) ? state.lanBindAddress : addresses[0] || '';
  const label = node('div', 'Private LAN interface', 'lab');
  label.id = 'lan-label';
  const group = node('div', undefined, 'interfaces');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', 'lan-label');
  const options = addresses.map((address) => {
    const option = button('', 'interface');
    option.setAttribute('role', 'radio');
    option.dataset.address = address;
    const top = node('span', undefined, 'address');
    const bars = node('span', undefined, 'bars');
    bars.setAttribute('aria-hidden', 'true');
    bars.append(node('span'), node('span'), node('span'));
    top.append(node('span', address), bars);
    option.append(top, node('small', 'Private IPv4 on a physical adapter'));
    option.addEventListener('click', () => selectLan(address));
    option.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = addresses[(addresses.indexOf(address) + delta + addresses.length) % addresses.length];
      selectLan(next);
      group.querySelector(`[data-address="${CSS.escape(next)}"]`)?.focus();
    });
    group.append(option);
    return option;
  });
  function selectLan(address) {
    selectedLan = address;
    for (const option of options) {
      const on = option.dataset.address === address;
      option.setAttribute('aria-checked', String(on));
      option.tabIndex = on ? 0 : -1;
    }
  }
  if (!addresses.length) group.append(node('div', 'No active physical adapter has a private IPv4 address. Connect one, then reopen this step.', 'empty-interface'));
  else group.append(node('div', 'Public and virtual adapters are hidden. The port binds only to the interface you pick.', 'empty-interface'));
  selectLan(selectedLan);
  const lanSection = node('section');
  lanSection.append(label, group);
  lanSection.style.display = 'grid';
  lanSection.style.gap = '8px';
  content.append(lanSection);

  const fields = node('div', undefined, 'field-grid');
  const portCard = node('label', undefined, 'field-card');
  portCard.append(node('span', 'HTTPS port', 'lab'));
  const port = document.createElement('input');
  port.id = 'host-port';
  port.className = 'big';
  port.inputMode = 'numeric';
  port.value = String(state?.hostPort ?? 8443);
  const portHint = node('span', '', 'hint');
  const validatePort = () => {
    const value = Number(port.value);
    const valid = Number.isInteger(value) && value >= 1024 && value <= 65535;
    portHint.textContent = valid ? 'Valid. Availability is checked again before install.' : 'Choose a whole number from 1024 to 65535.';
    portHint.className = `hint ${valid ? 'ok' : 'bad'}`;
  };
  port.addEventListener('input', validatePort);
  validatePort();
  portCard.append(port, portHint);

  const storageCard = node('div', undefined, 'field-card');
  storageCard.append(node('span', 'Persistent data folder', 'lab'));
  const pathRow = node('div', undefined, 'path-row');
  const storage = document.createElement('input');
  storage.id = 'storage-path';
  storage.readOnly = true;
  storage.value = selectedStorage || state?.storageDirectory || '';
  storage.setAttribute('aria-label', 'Persistent data folder');
  const choose = button('Browse', '', async () => {
    const selected = await window.watchdogSetup.chooseStorageDirectory();
    if (selected) {
      selectedStorage = selected;
      storage.value = selected;
      await persistSettings();
    }
  });
  pathRow.append(storage, choose);
  storageCard.append(pathRow, node('span', 'Existing contents are kept. Changing this does not move data.', 'hint'));
  fields.append(portCard, storageCard);
  content.append(fields);
  if (state?.requiresStorageSelection) content.append(choice('storage-choice-confirmation', 'I verified that this folder is the intended existing data location, or a new empty folder.', state.storageChoiceConfirmed));
  content.append(card('Scope', 'The Compose port binds only to the selected private interface. No public binding is added and the firewall is not changed.', 'warning'));
}

function renderPrerequisites() {
  const ready = Boolean(state?.docker?.ready);
  content.append(heading('03 · Prerequisites', ready ? 'The container runtime is ready.' : 'Confirm this computer is ready.', 'The wizard checks the Docker Engine and Compose plugin on the currently selected local context.'));
  const runtime = card('Docker Engine and Compose', state?.docker?.message || 'Checking the local Docker context…', ready ? 'success' : state?.docker ? 'warning' : 'info');
  const actions = node('div', undefined, 'card-actions');
  const check = button('Check again', 'small', async () => {
    check.disabled = true;
    status('Checking', 'Asking the local Docker context for its engine and Compose versions.', 'working');
    const result = await window.watchdogSetup.checkDocker();
    state.docker = result;
    render();
    status(result.ready ? 'Ready' : 'Not ready', result.message, result.ready ? 'success' : 'warning');
  });
  check.disabled = operationRunning;
  actions.append(check);
  runtime.append(actions);
  content.append(runtime);
  content.append(card('Automatic prerequisite setup', 'When you start the install, the wizard tries the supported Docker Desktop path if no local engine is ready, including getting and verifying the Windows package manager. License, first-run and native consent prompts stay visible for you to review.'));
}

function renderAccess() {
  content.append(heading('04 · Access', 'Protect the service from first start.', 'The wizard creates a one-time owner pairing code and a local TLS certificate. It never asks for an owner password.'));
  const grid = node('div', undefined, 'card-grid');
  grid.append(card('TLS trust', 'The certificate covers the current LAN IPv4 addresses. After setup, export its public .cer file and import it on each client. The wizard checks the HTTPS hostname and fingerprint before reporting the LAN address as ready.'));
  grid.append(card('Owner pairing', 'The single-use pairing code is kept in a protected local file and shown once after setup. The service consumes it when the first owner is created.'));
  content.append(grid);
  content.append(choice('manage-this-computer', 'Install the optional Windows host agent on this computer.', state?.manageThisComputer));
  content.append(card('Host agent permission', 'The agent installs a machine-wide LocalSystem service for the fixed operation catalog. It needs separate consent and a native administrator prompt. If you decline, dashboard setup still completes.', 'warning'));
}

function renderReview() {
  content.append(heading('05 · Review', 'Authorize the launch.', 'The install checks the local engine again before writing configuration or starting the service.'));
  const grid = node('div', undefined, 'card-grid');
  grid.append(card('Release', state?.release?.tag ? `${state.release.tag} · ${state.release.sourceSha} · ${state.release.image}` : 'No verified normal release is available.', state?.release?.tag ? 'success' : 'warning'));
  grid.append(card('Destination', `${state?.docker?.context || 'Local Docker context not verified'} · ${state?.lanBindAddress || 'No private LAN interface'} · HTTPS ${state?.hostPort} · ${state?.storageDirectory || selectedStorage || 'No data folder'}`, 'accent'));
  content.append(grid);
  content.append(choice('start-confirmation', `I reviewed this destination at ${state?.lanBindAddress || 'no private LAN address'} and authorize setup to install missing prerequisites, pull the release image, and start the Watchdog Control service.`, state?.startConfirmed));
  if (state?.manageThisComputer) content.append(choice('agent-consent', 'I authorize a machine-wide host agent and will review the native administrator prompt.', state?.agentConsent, true));
}

function stageFromTitle(title) {
  const index = stages.findIndex((stage) => stage.titles.includes(title));
  return index;
}

function formatElapsed() {
  if (!operationStartedAt) return '';
  const seconds = Math.max(0, Math.round((Date.now() - operationStartedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderMission() {
  content.append(heading('06 · Install mission', 'Bringing the service online.', 'You can keep this window open or close it. Progress resumes where it stopped and nothing already started is removed.'));
  const mission = node('div', undefined, 'mission');
  const left = node('div', undefined, 'mission-left');
  const ring = node('div', undefined, 'progress-ring');
  ring.id = 'progress-ring';
  ring.append(svgElement('<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="track" cx="100" cy="100" r="90"/><circle class="arc" cx="100" cy="100" r="90"/><circle class="dash" cx="100" cy="100" r="97"/><g class="satellite"><circle cx="100" cy="3" r="4" fill="#A891FF"/></g></svg>'));
  const readout = node('div', undefined, 'readout');
  readout.append(node('strong', '0/6'), node('span', 'starting', 'lab'));
  ring.append(readout);
  ring.setAttribute('role', 'progressbar');
  ring.setAttribute('aria-valuemin', '0');
  ring.setAttribute('aria-valuemax', String(stages.length));
  left.append(ring);
  const list = node('ol', undefined, 'stages');
  list.id = 'stage-list';
  list.setAttribute('aria-label', 'Install stages');
  for (const stage of stages) {
    const item = node('li');
    item.append(node('span', stage.label), node('span', 'next'));
    list.append(item);
  }
  left.append(list);
  const right = node('div');
  right.style.display = 'flex';
  right.style.flexDirection = 'column';
  right.style.minHeight = '0';
  const consoleBox = node('section', undefined, 'console');
  consoleBox.setAttribute('aria-label', 'Operation log');
  consoleBox.append(node('div', 'Live log · secrets are never shown', 'lab'));
  const log = node('ol', undefined, 'operation-list');
  log.id = 'operation-log';
  consoleBox.append(log);
  const copyLog = button('Copy log', 'small', () => copy((state?.operationLog || []).join('\n'), 'Log'));
  const copyRow = node('div', undefined, 'card-actions');
  copyRow.append(copyLog);
  right.append(consoleBox, copyRow);
  mission.append(left, right);
  content.append(mission);
  updateMission();
}

function updateMission() {
  const ring = document.querySelector('#progress-ring');
  if (!ring) return;
  const done = Math.max(0, stageIndex);
  const fraction = stageIndex < 0 ? 0.04 : (done + 0.5) / stages.length;
  ring.querySelector('.arc').style.strokeDashoffset = String(565 * (1 - fraction));
  ring.querySelector('strong').textContent = `${Math.max(0, stageIndex) + (stageIndex >= 0 ? 1 : 0)}/${stages.length}`;
  ring.querySelector('.lab').textContent = stageIndex >= 0 ? stages[stageIndex].label : 'starting';
  ring.setAttribute('aria-valuenow', String(Math.max(0, stageIndex)));
  ring.setAttribute('aria-valuetext', stageIndex >= 0 ? `Stage ${stageIndex + 1} of ${stages.length}: ${stages[stageIndex].label}` : 'Starting');
  document.querySelectorAll('#stage-list li').forEach((item, index) => {
    item.className = index < stageIndex ? 'done' : index === stageIndex ? 'now' : '';
    item.lastChild.textContent = index < stageIndex ? '✓' : index === stageIndex ? formatElapsed() || 'now' : 'next';
  });
  renderOperationLog();
}

function renderOperationLog() {
  const log = document.querySelector('#operation-log');
  if (!log) return;
  const items = (state?.operationLog || []).map((entry) => {
    const item = node('li');
    if (typeof entry === 'object' && entry) {
      item.append(node('time', entry.time), document.createTextNode(entry.message));
    } else {
      item.textContent = String(entry);
    }
    return item;
  });
  if (operationRunning) {
    const cursor = node('li');
    cursor.append(node('span', undefined, 'cursor'));
    items.push(cursor);
  }
  log.replaceChildren(...items);
  log.parentElement.scrollTop = log.parentElement.scrollHeight;
}

function renderAttention() {
  const interrupted = !state?.verified && state?.summary === 'Setup started.';
  content.append(heading('06 · Install', 'Setup needs attention.', 'The wizard checks the current computer again before continuing. Existing files and services stay in place.'));
  content.append(card('What happened', interrupted ? 'The previous run stopped before saving a verified result. Retry to check the current computer and continue safely.' : state?.summary || 'The service has not passed every required verification step.', 'warning'));
  const recovery = card('Recovery', 'Review the saved release, interface, port and data folder. The wizard checks the Docker context again, keeps existing files and services, and never removes an incomplete installation automatically.');
  const actions = node('div', undefined, 'card-actions');
  actions.append(button('Review settings and retry', 'primary small', async () => {
    await persistSettings();
    step = 4;
    state = await window.watchdogSetup.saveProgress({ lastStep: step });
    render();
  }));
  recovery.append(actions);
  content.append(recovery);
  if ((state?.operationLog || []).length) {
    const consoleBox = node('section', undefined, 'console');
    consoleBox.append(node('div', 'Last run log', 'lab'));
    const log = node('ol', undefined, 'operation-list');
    log.id = 'operation-log';
    consoleBox.append(log);
    content.append(consoleBox);
    renderOperationLog();
  }
}

function renderComplete() {
  const block = node('div', undefined, 'all-clear');
  const mark = node('div', undefined, 'clear-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.append(node('span', undefined, 'burst'), node('span', undefined, 'burst b'));
  mark.append(svgElement('<svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="40" fill="rgba(124,255,178,.10)" stroke="#7CFFB2" stroke-width="2"/><path class="tick" d="M26 43l11 11 21-23" stroke="#7CFFB2" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
  const text = node('div');
  text.append(node('p', 'All clear', 'lab eyebrow'));
  const h1 = node('h1', 'The service is running.');
  h1.tabIndex = -1;
  h1.id = 'page-title';
  text.append(h1, node('p', 'It keeps running after this wizard closes.', 'lead'));
  block.append(mark, text);
  block.classList.add('page-heading');
  text.querySelector('.eyebrow').style.color = 'var(--ok)';
  content.append(block);

  const urlCard = node('section', undefined, `info-card ${state.lanUrl ? 'accent' : 'warning'}`);
  urlCard.append(node('h2', state.lanUrl ? 'Open from any device on your network' : 'Verified LAN address'));
  const urlRow = node('div', undefined, 'url-card');
  urlRow.append(node('div', state.lanUrl || 'Unavailable', 'mono-value'));
  if (state.lanUrl) {
    const actions = node('div', undefined, 'action-group');
    actions.append(button('Copy', '', () => copy(state.lanUrl, 'Address')));
    actions.append(button('Open dashboard', 'primary', async () => {
      const result = await window.watchdogSetup.openDashboard?.();
      if (!result?.opened) setToast('The dashboard address could not be opened from here. Copy it into a browser instead.');
    }));
    urlRow.append(actions);
  }
  urlCard.append(urlRow);
  content.append(urlCard);

  const grid = node('div', undefined, 'card-grid');
  if (state.pairingCode) {
    const pairing = node('section', undefined, 'info-card');
    pairing.append(node('h2', 'Owner pairing code · shown once'));
    const value = node('div', pairingRevealed ? state.pairingCode : '•••• •••• •••• ••••', `mono-value secret${pairingRevealed ? '' : ' masked'}`);
    value.setAttribute('aria-live', 'polite');
    const actions = node('div', undefined, 'card-actions');
    const reveal = button(pairingRevealed ? 'Hide' : 'Reveal', 'small', () => {
      pairingRevealed = !pairingRevealed;
      value.textContent = pairingRevealed ? state.pairingCode : '•••• •••• •••• ••••';
      value.className = `mono-value secret${pairingRevealed ? '' : ' masked'}`;
      reveal.textContent = pairingRevealed ? 'Hide' : 'Reveal';
    });
    actions.append(reveal, button('Copy', 'small', () => copy(state.pairingCode, 'Pairing code')));
    pairing.append(value, actions);
    grid.append(pairing);
  }
  const certificate = node('section', undefined, 'info-card');
  certificate.append(node('h2', 'TLS certificate SHA-256'));
  const fingerprint = node('p', state.certificateFingerprint || 'Unavailable', 'mono');
  fingerprint.style.fontSize = '11.5px';
  const certificateActions = node('div', undefined, 'card-actions');
  const exportButton = button('Export public .cer', 'small', async () => {
    exportButton.disabled = true;
    try {
      const result = await window.watchdogSetup.exportCertificate();
      if (result.exported) setToast(`Public certificate saved as ${result.fileName}. Import it on each client before connecting.`);
    } catch (error) {
      status('Certificate export did not complete', error.message || 'The public certificate could not be exported.', 'warning');
    } finally {
      exportButton.disabled = false;
    }
  });
  certificateActions.append(exportButton);
  certificate.append(fingerprint, certificateActions);
  grid.append(certificate);
  const agentInstalled = state.agentStatus?.startsWith('Installed');
  const agent = card('Host agent', state.agentStatus || 'Not selected', agentInstalled ? 'success' : 'info');
  agent.append(node('p', `Release ${state.release?.tag || 'unknown'} · source ${(state.release?.sourceSha || 'unknown').slice(0, 12)}`, 'mono'));
  agent.lastChild.style.cssText = 'font-size:11.5px;color:var(--muted);margin-top:6px';
  if (state.agentStatus?.startsWith('Pending')) {
    const actions = node('div', undefined, 'card-actions');
    const retry = button('Retry host agent setup', 'small', async () => {
      retry.disabled = true;
      const result = await window.watchdogSetup.retryAgent();
      state = { ...state, ...result };
      render();
    });
    actions.append(retry);
    agent.append(actions);
  }
  grid.append(agent);
  content.append(grid);
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
    default:
      if (done) renderComplete();
      else if (operationRunning) renderMission();
      else renderAttention();
      break;
  }
  backButton.disabled = operationRunning || done || step === 0;
  nextButton.hidden = done || step >= 4;
  installButton.hidden = done || step !== 4 || operationRunning;
  finishButton.hidden = !done;
  nextButton.disabled = operationRunning;
  nextButton.textContent = step === 0 ? 'Start guided setup' : step === 3 ? 'Review' : 'Next';
  cancelButton.disabled = false;
  cancelButton.classList.toggle('danger', operationRunning);
  const title = document.querySelector('#page-title');
  if (title) requestAnimationFrame(() => title.focus({ preventScroll: true }));
}

async function persistSettings() {
  const portField = document.querySelector('#host-port');
  const manage = document.querySelector('#manage-this-computer');
  const confirmation = document.querySelector('#start-confirmation');
  const agentConsent = document.querySelector('#agent-consent');
  const patch = {
    hostPort: portField ? Number(portField.value) : state?.hostPort,
    lanBindAddress: (step === 1 ? selectedLan : '') || state?.lanBindAddress,
    storageDirectory: selectedStorage || state?.storageDirectory,
    manageThisComputer: manage ? manage.checked : state?.manageThisComputer,
    startConfirmed: confirmation ? confirmation.checked : state?.startConfirmed,
    agentConsent: agentConsent ? agentConsent.checked : state?.agentConsent,
    storageChoiceConfirmed: document.querySelector('#storage-choice-confirmation')?.checked ?? state?.storageChoiceConfirmed
  };
  state = await window.watchdogSetup.saveSettings(patch);
}

function logEntry(message) {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  state.operationLog = [...(state.operationLog || []), { time, message }].slice(-100);
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
    if (!selectedLan || !(state?.lanAddresses || []).includes(selectedLan)) {
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
    status('Separate consent required', 'The optional machine-wide host agent needs its own checkbox and native administrator prompt.', 'warning');
    return;
  }
  step = 5;
  operationRunning = true;
  operationStartedAt = Date.now();
  stageIndex = -1;
  state.operationLog = [];
  render();
  status('Setup started', 'Checking prerequisites. The wizard continues automatically.', 'working');
  const clock = window.setInterval(updateMission, 1000);
  try {
    state = { ...state, ...(await window.watchdogSetup.install()) };
    status(state.verified ? 'Setup complete' : 'Setup remains incomplete', state.summary || 'Read the exact step result in the log.', state.verified ? 'success' : 'warning');
  } catch (error) {
    status('Setup remains incomplete', error.message || 'The operation stopped without a verified result.', 'warning');
  } finally {
    window.clearInterval(clock);
    operationRunning = false;
    render();
  }
});

cancelButton.addEventListener('click', async () => {
  if (operationRunning) {
    status('Cancellation requested', 'The wizard waits for an active package installer to finish before returning. It never removes anything already started.', 'warning');
    await window.watchdogSetup.cancel();
    return;
  }
  window.close();
});

finishButton.addEventListener('click', () => window.close());

window.watchdogSetup.onProgress((event) => {
  if (event.type === 'step') {
    status(event.title, event.message, event.tone || 'working');
    const index = stageFromTitle(event.title);
    if (index >= 0) stageIndex = Math.max(stageIndex, index);
    logEntry(event.message);
    updateMission();
  }
  if (event.type === 'state') {
    state = { ...state, ...event.state };
    if (!operationRunning) render();
  }
});

function formatBuildTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return '';
  return `built ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

try {
  const provenance = buildProvenance;
  if (provenance?.schemaVersion !== 1 || typeof provenance.version !== 'string' || !Number.isFinite(Date.parse(provenance.builtAtUtc))) {
    throw new Error('Build provenance is unavailable.');
  }
  document.querySelector('#version-label').textContent = `v${provenance.version}`;
  document.querySelector('#updated-label').textContent = formatBuildTime(provenance.builtAtUtc);
} catch {
  document.querySelector('#version-label').textContent = 'Version unavailable';
  document.querySelector('#updated-label').textContent = 'Build time unavailable';
}

state = await window.watchdogSetup.loadState();
selectedStorage = state.storageDirectory || '';
selectedLan = state.lanBindAddress || '';
step = Math.max(0, Math.min(state.lastStep || 0, 5));
if (state.verified) status('Service running', 'Setup was verified earlier. The service keeps running after this wizard closes.', 'success');
else if (step === 5) status('Setup needs attention', state.summary || 'The last run did not reach a verified result.', 'warning');
if (state.progressRecoveryWarning) {
  step = 0;
  status('Progress could not be read', 'The original progress file is preserved. Choose the intended data folder before starting fresh.', 'warning');
}
window.watchdogSetup.onOperationProgress((event) => {
  status(event.title, event.message, event.tone || 'working');
  const index = stageFromTitle(event.title);
  if (index >= 0) stageIndex = Math.max(stageIndex, index);
  logEntry(event.message);
  updateMission();
});
render();

window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
