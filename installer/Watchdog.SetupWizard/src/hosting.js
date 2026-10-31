function element(tag, text) {
  const value = document.createElement(tag);
  if (text) value.textContent = text;
  return value;
}

export function hostingMode(state) {
  const label = element('label', 'Hosting method');
  const select = element('select');
  select.id = 'hosting-mode';
  select.setAttribute('aria-label', 'Hosting method');
  for (const [value, title] of [['native', 'Native Windows process (no Docker required)'], ['docker', 'Docker Compose']]) {
    const option = element('option', title); option.value = value; select.append(option);
  }
  select.value = state.hostingMode || 'native';
  label.append(select);
  const startupLabel = element('label'); startupLabel.className = 'choice-row';
  const startup = element('md-checkbox'); startup.id = 'startup-enabled'; startup.checked = Boolean(state.startupEnabled);
  startupLabel.append(startup, element('span', 'Start when you sign in. No administrator rights or automatic sign-in changes.'));
  const wrapper = element('div'); wrapper.append(label, startupLabel);
  return wrapper;
}


export function tunnelSettings(state, notify, notificationOnly = false) {
  const section = element('section'); section.className = 'info-card';
  section.append(element('h2', 'Optional temporary public access'));
  const label = element('label'); label.className = 'choice-row';
  const checkbox = element('md-checkbox'); checkbox.id = 'tunnel-enabled'; checkbox.checked = Boolean(state.tunnelEnabled);
  label.append(checkbox, element('span', 'Enable a free Cloudflare Quick Tunnel for this hosting session.'));
  if (!notificationOnly) section.append(label, element('p', 'This opt-in exposes the authenticated dashboard at a temporary HTTPS address. Addresses can change, have no availability guarantee, and are shown only after health, assets, and sign-in protection pass verification. The assistant retries disconnected tunnels with bounded backoff.'));
  section.append(element('h3', 'Discord notifications'));
  const configured = element('p', state.hosting?.webhookConfigured ? 'A protected webhook is configured.' : 'No webhook is configured.');
  configured.setAttribute('role', 'status');
  const input = element('md-outlined-text-field');
  input.label = 'Discord webhook URL'; input.type = 'password'; input.autocomplete = 'off';
  input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
  input.setAttribute('supporting-text', 'Saved with Windows protection for this user. The value is never shown again.');
  const actions = element('div'); actions.className = 'hosting-actions';
  for (const [title, action] of [
    ['Save webhook', async () => { const value = input.value; input.value = ''; await window.watchdogSetup.saveWebhook(value); configured.textContent = 'A protected webhook is configured.'; }],
    ['Remove webhook', async () => { input.value = ''; await window.watchdogSetup.removeWebhook(); configured.textContent = 'No webhook is configured.'; }],
    ['Send test notification', async () => { await window.watchdogSetup.testWebhook(); }]
  ]) {
    const button = element('md-outlined-button', title);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await action(); notify(`${title}: completed.`); }
      catch (error) { notify(error.message || 'Notification settings could not be updated.'); }
      finally { input.value = ''; button.disabled = false; }
    });
    actions.append(button);
  }
  section.append(configured, input, actions, element('p', 'Saving authorizes automatic messages containing each newly verified temporary address. No pairing code, password, or webhook value is included. Test sends one message to your configured channel.'));
  return section;
}

export function liveHosting(state, notify, onStopped) {
  const section = element('section'); section.className = 'info-card'; section.id = 'live-hosting';
  section.append(element('h2', 'Live hosting'));
  const startup = state.hosting?.startup;
  section.append(element('p', `Start when you sign in: ${startup?.verified ? startup.enabled ? 'enabled and verified' : 'disabled and verified' : 'not yet verified'}.`));
  const startupButton = element('md-outlined-button', startup?.enabled ? 'Disable sign-in startup' : 'Enable sign-in startup');
  startupButton.addEventListener('click', async () => {
    startupButton.disabled = true;
    try { await window.watchdogSetup.configureStartup(!startup?.enabled); notify('Sign-in startup setting saved and verified.'); }
    catch (error) { notify(error.message); }
    finally { startupButton.disabled = false; }
  });
  section.append(startupButton);
  const live = state.hosting || {};
  section.append(element('p', `Supervisor: ${live.phase || 'not started'}. Tunnel: ${live.tunnel || 'off'}. Notification: ${live.notification || 'not configured'}.`));
  for (const [target, title, url] of [['local', 'LAN dashboard', state.verified ? state.lanUrl : null], ['public', 'Verified temporary address', live.publicUrl]]) {
    if (!url) continue;
    const row = element('div'); row.className = 'hosting-url';
    row.append(element('strong', title));
    const link = element('a', url); link.href = url;
    link.addEventListener('click', async event => { event.preventDefault(); try { await window.watchdogSetup.useUrl(target, 'open'); } catch (error) { notify(error.message); } });
    row.append(link);
    const copy = element('md-outlined-button', 'Copy address');
    copy.addEventListener('click', async () => { try { await window.watchdogSetup.useUrl(target, 'copy'); notify('Verified address copied.'); } catch (error) { notify(error.message); } });
    row.append(copy); section.append(row);
  }
  if (state.tunnelEnabled && !live.publicUrl) section.append(element('p', 'No verified public address is currently available. Local hosting can remain ready while tunnel verification or recovery is pending.'));
  if (!['stopped', 'unavailable', 'failed', undefined].includes(live.phase)) {
    const stop = element('md-outlined-button', 'Stop owned hosting session');
    stop.addEventListener('click', async () => {
      stop.disabled = true;
      try { await window.watchdogSetup.stopHosting(); notify('Stop requested. Waiting for the owned supervisor to release its processes.'); onStopped(); }
      catch (error) { notify(error.message); stop.disabled = false; }
    });
    section.append(stop, element('p', state.hostingMode === 'docker' ? 'Stopping this session closes its tunnel. The Compose controller remains running.' : 'Stopping closes this session’s native controller and tunnel. Persistent data is retained.'));
  }
  return section;
}
