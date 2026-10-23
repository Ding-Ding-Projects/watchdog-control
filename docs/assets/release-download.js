(() => {
  const section = document.getElementById('verified-downloads');
  const link = document.getElementById('installer-download');
  const details = document.getElementById('release-download-details');
  const status = document.getElementById('release-download-status');
  const releasePage = document.getElementById('release-page-link');
  const languageControl = document.getElementById('language-mode');
  if (!section || !link || !details || !status || !releasePage) return;

  const text = {
    en: {
      heading: 'Download the verified setup assistant',
      waiting: 'Downloads appear after a normal release has been published and its files have been verified.',
      link: 'Download for Windows x64',
      release: 'View release notes and all delivery files',
      available: (tag, size) => `${tag} · Windows x64 · ${size}`,
      failed: 'A verified download is not available right now. Review the release page for current delivery status.',
    },
    yue: {
      heading: '下載已驗證的設定助理',
      waiting: '正式版本發布並完成檔案驗證後，這裏才會顯示下載。',
      link: '下載 Windows x64 版本',
      release: '查看版本說明及全部發佈檔案',
      available: (tag, size) => `${tag} · Windows x64 · ${size}`,
      failed: '目前沒有可用的已驗證下載。請到版本頁查看最新發佈狀態。',
    },
    bi: {
      heading: 'Download the verified setup assistant / 下載已驗證的設定助理',
      waiting: 'Downloads appear after a normal release has been published and its files have been verified. / 正式版本發布並完成檔案驗證後，這裏才會顯示下載。',
      link: 'Download for Windows x64 / 下載 Windows x64 版本',
      release: 'View release notes and all delivery files / 查看版本說明及全部發佈檔案',
      available: (tag, size) => `${tag} · Windows x64 · ${size}`,
      failed: 'A verified download is not available right now. Review the release page for current delivery status. / 目前沒有可用的已驗證下載，請到版本頁查看最新狀態。',
    },
  };

  let verifiedRelease = null;
  const formatSize = bytes => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  };
  const language = () => {
    try {
      const value = JSON.parse(localStorage.getItem('watchdog-docs-preferences-v1') || '{}').language;
      return Object.hasOwn(text, value) ? value : 'en';
    } catch { return 'en'; }
  };
  const render = () => {
    const copy = text[language()];
    document.getElementById('release-download-heading').textContent = copy.heading;
    link.textContent = copy.link;
    releasePage.textContent = copy.release;
    if (!verifiedRelease) {
      status.textContent = copy.waiting;
      link.hidden = true;
      details.textContent = '';
      releasePage.hidden = true;
      return;
    }
    status.textContent = copy.available(verifiedRelease.tag, formatSize(verifiedRelease.installer.size));
    link.hidden = false;
    link.href = verifiedRelease.installer.url;
    details.textContent = `SHA-256: ${verifiedRelease.installer.sha256}`;
    releasePage.hidden = false;
    releasePage.href = verifiedRelease.releasePage;
  };

  const trustedReleaseUrl = (value, tag, assetName) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'github.com' &&
        url.pathname === `/Ding-Ding-Projects/watchdog-control/releases/download/${tag}/${assetName}` &&
        !url.search && !url.hash && !url.username && !url.password;
    } catch { return false; }
  };

  const load = async () => {
    render();
    try {
      const response = await fetch(new URL('assets/release.json', document.baseURI), { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Release metadata is unavailable.');
      const envelope = await response.json();
      const release = envelope?.release;
      if (envelope?.schemaVersion !== 1 || !release ||
          !/^v\d+\.\d+\.\d+$/.test(release.tag || '') ||
          release.version !== release.tag || !/^[a-f0-9]{40}$/.test(release.sourceCommit || '') ||
          !Number.isFinite(Date.parse(release.publishedAt || '')) ||
          release.installer?.name !== 'WatchdogControlSetup.exe' ||
          release.installer?.platform !== 'Windows x64' ||
          !Number.isSafeInteger(release.installer?.size) || release.installer.size < 1 ||
          !/^[a-f0-9]{64}$/.test(release.installer?.sha256 || '') ||
          !trustedReleaseUrl(release.installer?.url, release.tag, release.installer.name) ||
          release.releasePage !== `https://github.com/Ding-Ding-Projects/watchdog-control/releases/tag/${release.tag}`) {
        throw new Error('Release metadata did not pass validation.');
      }
      verifiedRelease = release;
      render();
    } catch {
      const copy = text[language()];
      status.textContent = copy.failed;
      link.hidden = true;
      details.textContent = '';
      releasePage.hidden = true;
    }
  };

  languageControl?.addEventListener('change', render);
  window.addEventListener('storage', event => {
    if (event.key === 'watchdog-docs-preferences-v1') render();
  });
  load();
})();
