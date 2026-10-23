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
        'Let the assistant check the current local engine and report the real result.'
      ]
    },
    {
      id: 'install',
      title: 'Install the dashboard on a Windows computer',
      summary: 'The tailored assistant resolves the supported package prerequisites, then pulls and verifies the selected service release.',
      state: 'Local build verified; host installation pending',
      article: 'operations',
      steps: [
        'Review the normal release manifest and confirm the local Windows computer as the destination.',
        'Choose an unused HTTPS port and persistent data folder.',
        'Authorize automatic prerequisite setup and service start. Complete any visible package, license, or native-consent prompt.',
        'If Windows requires a restart, perform it manually and reopen the assistant.',
        'Verify the release identity, HTTPS health, LAN URL, and certificate fingerprint.'
      ]
    }
  ];

  const implemented = 'Implemented in source; runtime not verified';
  data.siteInventory = [
    ['host-health', 'Host health and freshness', implemented, 'The controller and Windows agent define live host records. A real enrolled host and fresh observation have not been verified.'],
    ['services-processes', 'Services and processes', implemented, 'The dashboard and server define typed, target-bound operations. Runtime inspection and action results remain unverified.'],
    ['event-logs', 'Event log inspection', implemented, 'The agent and dashboard define bounded event records. No live host query has been exercised.'],
    ['storage-network', 'Storage and network state', implemented, 'The agent and dashboard define volume and adapter records. Live values and remote access remain unverified.'],
    ['updates-firewall', 'Updates and firewall state', implemented, 'The current workflow is read-only. No remote update or firewall mutation is available.'],
    ['operation-catalog', 'Typed operation catalog', implemented, 'The server accepts fixed operation identifiers with bounded request records. Live authorization has not been tested.'],
    ['power-actions', 'Restart and shutdown', implemented, 'The source implements a short-lived challenge, exact confirmation, and audit path. No host power action has been run.'],
    ['identity-audit', 'Authentication, pairing, and audit', implemented, 'Source includes first-owner pairing, sessions, agent enrollment, revocation, and audit records. Installed behavior remains unverified.'],
    ['deployment-recovery', 'Deployment and recovery', 'Source implemented; release pending', 'Compose, host controls, health checks, and saved setup recovery exist. A public image pull and live LAN endpoint are not verified.'],
    ['setup-assistant', 'Automatic setup assistant', 'Portable file built; native setup pending', 'The setup file was packaged locally. Native installation and resume behavior have not been exercised.'],
    ['http-api', 'Controller HTTP API', 'Implemented in source; runtime pending', 'The source defines the LAN API and the Postman category/master collection covers its routes. No live request has been exercised.']
  ];

  data.wiki = [
    {id:'overview',title:'Project overview',state:'Source implemented; release pending',body:['Watchdog Control has a browser dashboard, authenticated API, Windows host agent, and tailored deployment assistant in source.','The exact root build completed locally. Public release, image publication, host installation, and LAN access are still pending.','This documentation is separate from the product and cannot access a Windows host.']},
    {id:'architecture',title:'System architecture',state:'Source implemented; runtime pending',body:['The implementation separates the browser dashboard, authenticated controller API, and Windows host agent.','The server validates fixed operation identifiers and target records. The agent polls for approved work and returns bounded results.','The source builds locally; network, authorization, and installed-host behavior remain unverified.']},
    {id:'security',title:'Security and identity',state:'Source implemented; runtime pending',body:['The product source includes first-owner pairing, authenticated sessions, agent enrollment, revocation, TLS pinning, and audit records.','The browser does not receive an arbitrary shell form. Server-side operation checks and exact confirmation paths are defined in source.','No installed runtime or real host action has been verified.']},
    {id:'host-health',title:'Host health and status',state:'Source implemented; runtime pending',body:['The Windows agent collects host identity and bounded health records. The controller provides the records to an authenticated dashboard.','The local root build passed. A live host heartbeat and observation timestamp have not been confirmed.']},
    {id:'services',title:'Services and processes',state:'Source implemented; runtime pending',body:['The dashboard defines bounded service and process views with target-specific typed actions.','The server validates the target against the latest host snapshot. Live inspection and operation results are pending.']},
    {id:'events',title:'Event logs',state:'Source implemented; runtime pending',body:['The Windows agent gathers bounded event records for the dashboard.','No native host query or rendered event record has been inspected.']},
    {id:'storage-network',title:'Storage and network state',state:'Source implemented; runtime pending',body:['The agent reports volume capacity and network adapter records.','No real host or client-to-host network view has been verified.']},
    {id:'updates-firewall',title:'Updates and firewall state',state:'Read-only source workflow; runtime pending',body:['Windows Update and firewall profile status are read-oriented workflows in the current source.','The product does not offer a remote update or firewall rule mutation in this build.']},
    {id:'operations',title:'Typed operation catalog',state:'Source implemented; runtime pending',body:['The HTTP API and agent use fixed operation identifiers rather than arbitrary command text.','The source build passed. Authorization, bounded execution, audit readback, and failure recovery still need a real runtime review.']},
    {id:'power-actions',title:'Restart and shutdown',state:'Source implemented; runtime pending',body:['Restart and shutdown source flows require a fresh short-lived challenge and an exact confirmation before dispatch.','A response lost after dispatch leaves the result unknown until fresh host status resolves it. No host power action has been executed during this task.']},
    {id:'deployment-recovery',title:'Deployment and recovery',state:'Source implemented; live delivery pending',body:['Compose setup, host controls, health checks, and the portable assistant exist in source.','No public image, service pull, live health response, or client LAN access has been verified.']},
    {id:'setup-assistant',title:'Automatic setup assistant',state:'Portable file built; native setup pending',body:['After the owner confirms the destination, the assistant provisions missing prerequisites from verified stable release assets, pulls the immutable image, starts the service, and checks its health.','The service binds only to the selected private LAN address. First-run, license, native consent, and any required restart remain visible owner actions.','The exact build and packaging entrypoints succeeded. Native installation has not been run.']},
    {id:'api-reference',title:'Controller HTTP API',state:'Source and collection prepared; runtime pending',body:['The controller provides owner pairing, sessions, dashboard records, host-agent enrollment and revocation, typed operations, power confirmation, and operation reads.','The Postman category and master collection includes all currently defined routes and contains no live credentials.','No controller request, enrolled agent, or LAN endpoint has been exercised.']}
  ];

  data.articles.architecture = {
    title: 'Understand the architecture', category: 'Architecture', state: 'Implemented in source; runtime pending',
    lead: 'The source separates the browser dashboard, authenticated controller, and Windows host agent. The current build is local evidence only.',
    sections: [
      ['Dashboard and controller', 'The browser client displays authenticated host records and sends typed requests. The controller owns identity, authorization, operation state, and audit records.'],
      ['Windows host agent', 'The agent collects bounded host records and polls for approved operations. The product source does not provide an arbitrary shell or caller-selected executable field.'],
      ['Current evidence', 'The exact root build completed locally. No service installation, agent enrollment, LAN access, or host operation has been exercised.'],
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
    title: 'Operate and recover', category: 'Operations', state: 'Local build verified; live delivery pending',
    lead: 'The setup and recovery paths exist in source. This guide keeps the current build, release, and host-runtime states separate.',
    sections: [
      ['Before setup', 'Confirm the normal release, local Windows destination, selected private LAN interface, unused HTTPS port, persistent data folder, and local Docker context. The setup assistant provisions missing package prerequisites only after the user confirms setup.'],
      ['If setup is interrupted', 'The assistant saves progress and offers Review settings and retry. Reopen the portable file after native consent, Docker first-run setup, or a manually completed restart. It rechecks the current engine and LAN interfaces.'],
      ['Container and LAN setup', 'The source includes a digest-pinned Compose service, host controls, HTTPS health checks, and LAN URL verification. No live service or remote-client path has been verified.'],
      ['Recovery state', 'A failure after service start preserves the service and data for inspection. The assistant does not remove volumes or unrelated Compose projects.'],
      ['Next steps', 'Review [security requirements](#article/security), then the [deployment and recovery article](#article/feature/deployment-recovery).']
    ]
  };
  data.articles.features = {
    title: 'Feature catalogue and delivery state', category: 'Features', state: 'Source implemented; runtime pending',
    lead: 'The feature catalogue records source implementation, local build evidence, and work that still requires a release or runtime check.',
    sections: [
      ['Host information', 'The source contains host health, services, processes, event-log, storage, networking, update, and firewall status workflows. Live host values remain unverified.'],
      ['Operations', 'The server uses typed requests for selected service, process, networking, and power operations. The exact source build passed; no live operation has been dispatched.'],
      ['Identity and audit', 'Pairing, sessions, agent enrollment, revocation, and audit records exist in source. Runtime authorization and storage behavior remain unverified.'],
      ['Setup and deployment', 'The portable assistant, saved setup recovery, Compose configuration, and host controls exist. No public image, release file, or live LAN endpoint is verified.'],
      ['Documentation surface', 'The guide includes task routes and local demonstrations. Complete settings coverage, full RegexBuddy parity, translated content, built-screen inspection, and deployed interaction evidence remain unfinished.'],
      ['API collections', 'The category and master Postman collection now covers every source-defined controller route. It remains an example and has not been run against an installed server.']
    ]
  };
})();
