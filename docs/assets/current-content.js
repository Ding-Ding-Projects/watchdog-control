(() => {
  const data = window.WATCHDOG_DOCS;

  data.workflows = [
    {
      id: 'health',
      title: 'Assess host health',
      summary: 'Review the last collected host status and distinguish an unavailable observation from a healthy result.',
      state: 'Source implemented; runtime pending',
      article: 'architecture',
      steps: [
        'Open the authenticated dashboard and select the enrolled Windows computer.',
        'Review the host status timestamp before interpreting service, process, storage, or network values.',
        'Treat missing or stale data as unknown. The local product build has not yet been exercised against a live host.',
        'Open the relevant feature article before requesting a typed host action.'
      ]
    },
    {
      id: 'service',
      title: 'Inspect a service or process',
      summary: 'Use the fixed operation catalog to review a target and its impact before requesting a change.',
      state: 'Source implemented; runtime pending',
      article: 'features',
      steps: [
        'Confirm the selected Windows computer and current operator identity.',
        'Review the bounded service or process record and its latest observation time.',
        'Choose one supported operation identifier and review its exact target.',
        'Confirm the action in the authenticated product and inspect the resulting audit record.'
      ]
    },
    {
      id: 'power',
      title: 'Review a restart or shutdown',
      summary: 'The product source requires a short-lived challenge, a renewed confirmation, and a recorded outcome.',
      state: 'Source implemented; runtime pending',
      article: 'security',
      steps: [
        'Confirm the selected computer and its most recent status.',
        'Review the exact restart or shutdown action and its consequence.',
        'Request the short-lived challenge, reauthenticate, and type the required confirmation.',
        'If the connection drops, query fresh host status and the operation record before considering a retry.'
      ]
    },
    {
      id: 'recover',
      title: 'Resume an interrupted setup',
      summary: 'Use the saved setup step to continue after native consent, Docker first-run setup, or a user-performed restart.',
      state: 'Source implemented; native run pending',
      article: 'operations',
      steps: [
        'Reopen the same portable setup assistant after the host is available.',
        'Review the saved release, selected port, and data folder.',
        'Choose Review settings and retry to recheck the current host.',
        'Let the setup tool recheck the selected hosting mode and network, then report the real result.'
      ]
    },
    {
      id: 'quick-host',
      title: 'Host the service with one click',
      summary: 'Choose native hosting without Docker, or explicitly select Compose on a ready local engine.',
      state: '0.3.2 native setup verified; visual acceptance pending',
      article: 'operations',
      steps: [
        'Launch the portable single-file setup tool directly. It does not need to be installed.',
        'On the welcome screen, review the selected LAN URL and persistent data folder.',
        'Select the hosting action when the chosen mode, LAN address, port and data-folder checks are ready.',
        'Wait while native mode stages and starts its bundled controller, or Compose verifies its release configuration and starts the named service, then checks HTTPS health.',
        'Open the displayed URL from an intended LAN client and verify certificate trust before entering owner credentials.'
      ]
    },
    {
      id: 'install',
      title: 'Install the dashboard on a Windows computer',
      summary: 'The tailored assistant stages its bundled native controller by default; Compose separately resolves its required local engine and published image.',
      state: '0.3.2 native setup verified; visual acceptance pending',
      article: 'operations',
      steps: [
        'Review the normal release manifest and confirm the local Windows computer as the destination.',
        'Choose an unused HTTPS port and persistent data folder.',
        'Confirm the selected hosting mode and service start. Only Compose requires its local-engine prerequisite flow; optional host-agent installation has separate consent.',
        'If Windows requires a restart, perform it manually and reopen the assistant.',
        'Verify the release identity, HTTPS health, LAN URL, and certificate fingerprint.'
      ]
    }
  ];

  const implemented = 'Implemented in source; runtime not verified';
  data.workflows.push({
    id: 'remote-agent',
    title: 'Run Slop Machine remotely',
    summary: 'Sign the codex command-line tool in with a device code, start remote control, and pair a phone from the dashboard.',
    state: 'Implemented in source; Windows host verification pending',
    article: 'remote-agent',
    steps: [
      'Open Slop Machine in the dashboard and select the computer.',
      'Run a status check to confirm the tool, its version, and whether it is signed in.',
      'Start sign-in, open the sign-in page on any device, and enter the one-time code shown in the dashboard.',
      'Start remote control, create a pairing code, and enter it in the ChatGPT phone app under Remote.'
    ]
  });

  data.siteInventory = [
    ["native-hosting", "Host directly on Windows", "0.3.2 native setup verified; release and visual acceptance pending", "Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured."],
    ['container-hosting', 'Run the controller and tunnel in one container', 'Source implemented; container runtime pending', 'Use the published immutable image with mounted TLS files and optional container-owned temporary access. Discord reads only an explicitly mounted webhook file. Choose one tunnel owner. Local Docker execution and notification delivery remain unverified.'],
    ['host-health', 'Host health and freshness', implemented, 'The controller and Windows agent define live host records. A real enrolled host and fresh observation have not been verified.'],
    ['services-processes', 'Services and processes', implemented, 'The dashboard and server define typed, target-bound operations. Runtime inspection and action results remain unverified.'],
    ['event-logs', 'Event log inspection', implemented, 'The agent and dashboard define bounded event records. No live host query has been exercised.'],
    ['storage-network', 'Storage and network state', implemented, 'The agent and dashboard define volume and adapter records. Live values and remote access remain unverified.'],
    ['updates-firewall', 'Updates and firewall state', implemented, 'The current workflow is read-only. No remote update or firewall mutation is available.'],
    ['operation-catalog', 'Typed operation catalog', implemented, 'Eight typed operations validate current host targets. Destructive service and process actions require exact phrases, while restart and shutdown use a single-use 90-second challenge. Live authorization and execution remain unverified.'],
    ['power-actions', 'Restart and shutdown', implemented, 'The source implements a short-lived challenge, exact confirmation, and audit path. No host power action has been run.'],
    ['identity-audit', 'Authentication, pairing, and audit', implemented, 'Source includes first-owner pairing, sessions, agent enrollment, revocation, and audit records. Installed behavior remains unverified.'],
    ["deployment-recovery", "Deployment and recovery", "0.3.2 native setup verified; release and visual acceptance pending", "Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured."],
    ["setup-assistant", "Automatic setup assistant", "0.3.2 native setup verified; release and visual acceptance pending", "Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured."],
    ['http-api', 'Controller HTTP API', 'Implemented in source; runtime pending', 'The source defines the LAN API and the Postman category/master collection covers its routes. No live request has been exercised.']
  ];

  data.wiki = [
    {"id": "native-hosting", "title": "Native hosting and temporary access", "state": "0.3.2 native setup verified; release and visual acceptance pending", "body": ["Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured.", "Historical renderer-only screenshots and earlier package results retain their original provenance in the hosting evidence archive."]},
    {id:'remote-agent',title:'Slop Machine remote control',state:'Source implemented; Windows host verification pending',body:['The dashboard drives the codex command-line tool on a paired computer: status, device-code sign-in assist, remote control start and stop, and phone pairing.','One-time codes stay in controller memory and never reach disk or the audit log.','A Windows host run has not been verified yet.']},
    {"id": "overview", "title": "Project overview", "state": "0.3.2 native setup verified; release and visual acceptance pending", "body": ["Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured.", "Historical renderer-only screenshots and earlier package results retain their original provenance in the hosting evidence archive."]},
    {id:'architecture',title:'System architecture',state:'Source implemented; runtime pending',body:['The implementation separates the browser dashboard, authenticated controller API, and Windows host agent.','The server validates fixed operation identifiers and target records. The agent polls for approved work and returns bounded results.','The source builds locally; network, authorization, and installed-host behavior remain unverified.']},
    {id:'security',title:'Security and identity',state:'Source implemented; runtime pending',body:['The product source includes first-owner pairing, authenticated sessions, agent enrollment, revocation, TLS pinning, and audit records.','The browser does not receive an arbitrary shell form. Server-side operation checks and exact confirmation paths are defined in source.','No installed runtime or real host action has been verified.']},
    {id:'host-health',title:'Host health and status',state:'Source implemented; runtime pending',body:['The Windows agent collects host identity and bounded health records. The controller provides the records to an authenticated dashboard.','The local root build passed. A live host heartbeat and observation timestamp have not been confirmed.']},
    {id:'services',title:'Services and processes',state:'Source implemented; runtime pending',body:['The dashboard defines bounded service and process views with target-specific typed actions.','The server validates the target against the latest host snapshot. Live inspection and operation results are pending.']},
    {id:'events',title:'Event logs',state:'Source implemented; runtime pending',body:['The Windows agent gathers bounded event records for the dashboard.','No native host query or rendered event record has been inspected.']},
    {id:'storage-network',title:'Storage and network state',state:'Source implemented; runtime pending',body:['The agent reports volume capacity and network adapter records.','No real host or client-to-host network view has been verified.']},
    {id:'updates-firewall',title:'Updates and firewall state',state:'Read-only source workflow; runtime pending',body:['Windows Update and firewall profile status are read-oriented workflows in the current source.','The product does not offer a remote update or firewall rule mutation in this build.']},
    {id:'operations',title:'Typed operation catalog',state:'Source implemented; runtime pending',body:['The controller accepts eight typed operations: inventory refresh, DNS cache refresh, service start, service stop, service restart, process termination, computer restart, and computer shutdown.','Service and process requests must target a current inventory identity. Service stop, service restart, and process termination require exact confirmation phrases. Computer restart and shutdown use a single-use 90-second challenge bound to the requesting account.','The controller and host agent write audit records and return operation state. No live operation, authorization check, host result, or audit readback has been exercised.']},
    {id:'power-actions',title:'Restart and shutdown',state:'Source implemented; runtime pending',body:['Restart and shutdown source flows require a fresh short-lived challenge and an exact confirmation before dispatch.','A response lost after dispatch leaves the result unknown until fresh host status resolves it. No host power action has been executed during this task.']},
    {"id": "deployment-recovery", "title": "Deployment and recovery", "state": "0.3.2 native setup verified; release and visual acceptance pending", "body": ["Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured.", "Historical renderer-only screenshots and earlier package results retain their original provenance in the hosting evidence archive."]},
    {"id": "setup-assistant", "title": "Automatic setup assistant", "state": "0.3.2 native setup verified; release and visual acceptance pending", "body": ["Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured.", "Historical renderer-only screenshots and earlier package results retain their original provenance in the hosting evidence archive."]},
    {id:'api-reference',title:'Controller HTTP API',state:'Source and collection prepared; runtime pending',body:['The controller provides owner pairing, sessions, dashboard records, host-agent enrollment and revocation, typed operations, power confirmation, and operation reads.','The Postman category and master collection includes all currently defined routes and contains no live credentials.','No controller request, enrolled agent, or LAN endpoint has been exercised.']}
  ];

  data.articles.architecture = {
    title: 'Understand the architecture', category: 'Architecture', state: 'Implemented in source; runtime pending',
    lead: 'The source separates the browser dashboard, authenticated controller, and Windows host agent. The current build is local evidence only.',
    sections: [
      ['Dashboard and controller', 'The browser client displays authenticated host records and sends typed requests. The controller owns identity, authorization, operation state, and audit records.'],
      ['Windows host agent', 'The agent collects bounded host records and polls for approved operations. The product source does not provide an arbitrary shell or caller-selected executable field.'],
      ["Current evidence", "Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured."],
      ['Next steps', 'Read [security and pairing](#article/security), then the [feature inventory](#features) and [deployment guide](#article/operations).']
    ]
  };
  data.articles.security = {
    title: 'Pair and operate safely', category: 'Security', state: 'Implemented in source; runtime pending',
    lead: 'Host management requires authenticated users, server-side authorization, certificate verification, and a deliberate confirmation for high-impact operations.',
    sections: [
      ['Authentication and pairing', 'The source implements first-owner pairing, session creation and revocation, and a separate host-agent enrollment path. No installed security behavior is verified yet.'],
      ['Operation boundaries', 'Requests use fixed operation identifiers and typed parameters. The server checks each target and its permission; the client does not supply an executable or shell string.'],
      ['Restart and shutdown', 'The API creates a short-lived challenge, requires the renewed exact confirmation, and records the request and result. A disconnected response leaves the outcome unknown until a fresh query.'],
      ['Data handling', 'Owner passwords, TLS private keys, generated configuration, host records, and runtime files stay outside tracked source.'],
      ['Next steps', 'Read [the architecture guide](#article/architecture) and [operations and recovery](#article/operations).']
    ]
  };
  data.articles.operations = {
    title: 'Operate and recover', category: 'Operations', state: '0.3.2 native setup verified; release and visual acceptance pending',
    lead: 'Release, local host health, setup-window persistence, and client access are separate states.',
    sections: [
      ["One-click hosting", "Select Native Windows for the bundled controller without Docker, or explicitly select Compose. Review the interface, port and data folder, confirm the destination, then start and verify. Candidate 0.3.2 completed packaged native setup and strict local/public checks; complete single-file visual acceptance remains pending."],
      ['Before guided setup', 'Confirm the normal release, local Windows destination, selected private LAN interface, unused HTTPS port, persistent data folder, and local Docker context. The guided setup provisions supported missing prerequisites only after the operator confirms setup.'],
      ['If setup is interrupted', 'The assistant saves progress and offers Review settings and retry. Reopen the portable file after native consent, Docker first-run setup, or a manually completed restart. It rechecks the current engine and LAN interfaces.'],
      ["Bundled Compose and LAN setup", "Compose retains the bundled configuration integrity check and published immutable image. Historical v0.1.1 Compose health evidence remains archived. Current native success does not establish local Docker execution or second-device LAN access."],
      ['Host controls', 'Double-click host.bat and choose a mode, or let its eight-second default start or update the service. Use --detached to start and verify in the background, --logs for the interactive log view, and --stop only when the operator explicitly intends to stop the service.'],
      ['Recovery state', 'A failure after service start preserves the service and data for inspection. The assistant does not remove volumes or unrelated Compose projects.'],
      ['Next steps', 'Review [security requirements](#article/security), then the [deployment and recovery article](#article/feature/deployment-recovery).']
    ]
  };
  data.articles.features = {
    title: 'Feature catalogue and delivery state', category: 'Features', state: 'Source implemented; runtime pending',
    lead: 'The feature catalogue records source implementation, local build evidence, and work that still requires a release or runtime check.',
    sections: [
      ['Host information', 'The source contains host health, services, processes, event-log, storage, networking, update, and firewall status workflows. Live host values remain unverified.'],
      ['Operations', 'The server defines eight fixed operation identifiers. Destructive service and process actions require exact confirmation phrases, while computer restart and shutdown require a single-use 90-second account-bound challenge. No live operation has been dispatched.'],
      ['Identity and audit', 'Pairing, sessions, agent enrollment, revocation, and audit records exist in source. Runtime authorization and storage behavior remain unverified.'],
      ["Setup and deployment", "Candidate 0.3.2 at 8e5eb3d passed packaged native setup with saved verified readiness, strict local/public HTTPS, tunnel recovery and independent saved-startup-launcher execution after the wizard closed. Release publication and complete single-file visual acceptance remain pending. New-sign-in startup, second-device LAN access and actual Discord delivery are unverified; Discord is deliberately unconfigured."],
      ['Documentation surface', 'The guide includes task routes and local demonstrations. Complete settings coverage, full RegexBuddy parity, translated content, built-screen inspection, and deployed interaction evidence remain unfinished.'],
      ['API collections', 'The category and master Postman collection now covers every source-defined controller route. It remains an example and no controller request has been run against the hosted service.']
    ]
  };
  data.articles['remote-agent'] = {
    title: 'Slop Machine remote control', category: 'Remote', state: 'Implemented in source; Windows host verification pending',
    lead: 'The dashboard can drive the codex command-line tool on a paired Windows computer: check its status, assist a device-code sign-in, start and stop remote control, and create a phone pairing code.',
    sections: [
      ['What runs', 'The agent runs fixed commands only: --version, login status, login with device-code sign-in, logout, and remote-control start, stop, status and pair. The controller and the browser can never choose the executable, its arguments, or a file path.'],
      ['Which account', 'By default the tool runs as the Windows user signed in at the computer console, so sign-in and sessions belong to that user. An administrator can set the service account instead, a fixed executable path, or a separate data folder in codex.json inside the protected agent data folder.'],
      ['Sign-in assist', 'Starting sign-in launches device-code sign-in on the computer and shows the sign-in page and one-time code in the dashboard with a countdown. The sign-in link is only offered for openai.com and chatgpt.com addresses. Device-code sign-in must be allowed for the account.'],
      ['Pairing a phone', 'After remote control starts, Create pairing code shows the manual pairing code. In the ChatGPT phone app, open Remote, choose Enter code manually, and confirm the account on the phone.'],
      ['Codes stay out of records', 'One-time sign-in and pairing codes are kept only in controller memory until they expire. Operation records, the audit log, exports and the controller data file contain a redacted placeholder instead.'],
      ['Signing out', 'Sign out requires the exact typed phrase shown in the dashboard and removes the saved sign-in on that computer.'],
      ['Verification state', 'The controller flow is covered by a local end-to-end check. Running the tool on a real Windows host, including the signed-in user launch path, has not been verified yet.']
    ]
  };
})();
