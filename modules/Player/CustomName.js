(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-player';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HEARTBEAT_MS = 500;

  let lastSentKey = '';
  let lastSentAt = 0;

  function findGameFrame() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`)) {
        return frame;
      }
    }

    return null;
  }

  function syncConfig() {
    const module = getMod('CustomName');

    if (!module) {
      return;
    }

    const now = performance.now();
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'customname',
      enabled: Boolean(module.on)
    };
    const key = JSON.stringify(config);

    if (key === lastSentKey && now - lastSentAt < HEARTBEAT_MS) {
      return;
    }

    const frame = findGameFrame();

    if (!frame?.contentWindow) {
      return;
    }

    frame.contentWindow.postMessage(config, GAME_ORIGIN);
    lastSentKey = key;
    lastSentAt = now;
  }

  register({
    name: 'CustomName',
    desc: 'Allows you to customize your operator callsign.',
    cat: 'Player',
    nm: { l: 'customname', ls: 'custom name', n: 'CustomName', ns: 'Custom Name' },
    disp: '',
    settings: [],
    onRender: syncConfig,
    onEnable() {}
  });

  function bootGame() {
    let attempts = 0;

    function start() {
      const bridge = window.SolsticeGame;

      if (!bridge) {
        if (attempts++ < 100) {
          setTimeout(start, 25);
        }

        return;
      }

      installGame(bridge);
    }

    start();
  }

  function installGame(bridge) {
    const storageKey = 'solstice.customname';
    let enabled = false;
    let customName = '';
    let fallbackName = '匿名干员';
    let observer = null;
    let timer = 0;
    let originalConnect = null;

    try {
      customName = localStorage.getItem(storageKey) || '';
    } catch {

    }

    function normalizedName() {
      const value = String(customName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
      return value || '匿名干员';
    }

    function saveName(value) {
      customName = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 32);

      try {
        localStorage.setItem(storageKey, customName);
      } catch {

      }
    }

    function installInput() {
      if (!enabled) {
        return;
      }

      const existing = document.getElementById('online-name');

      if (!existing) {
        return;
      }

      if (existing.tagName === 'INPUT') {
        if (document.activeElement !== existing && existing.value !== customName) {
          existing.value = customName || fallbackName || '匿名干员';
        }

        return;
      }

      fallbackName = existing.textContent?.trim() || fallbackName || '匿名干员';

      const input = document.createElement('input');
      input.id = 'online-name';
      input.type = 'text';
      input.maxLength = 32;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.className = `${existing.className || ''} solstice-custom-name`.trim();
      input.value = customName || fallbackName || '匿名干员';
      input.style.cssText = [
        'width: 100%',
        'min-width: 90px',
        'max-width: 180px',
        'padding: 0',
        'border: 0',
        'border-bottom: 1px solid currentColor',
        'background: transparent',
        'color: inherit',
        'font: inherit',
        'text-align: right',
        'outline: none'
      ].join(';');

      input.addEventListener('input', () => {
        saveName(input.value);
      });

      existing.replaceWith(input);
    }

    function restoreInput() {
      const input = document.getElementById('online-name');

      if (!input || input.tagName !== 'INPUT') {
        return;
      }

      const strong = document.createElement('strong');
      strong.id = 'online-name';
      strong.setAttribute('data-toy-name', '');
      strong.textContent = fallbackName || '匿名干员';
      input.replaceWith(strong);
    }

    function startObserver() {
      if (observer || !document.body) {
        return;
      }

      observer = new MutationObserver(installInput);
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setInterval(installInput, 300);
    }

    function stopObserver() {
      observer?.disconnect();
      observer = null;

      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
    }

    function patchConnection() {
      const url = new URL('client/net.js', location.href).href;

      import(url).then(({ Connection }) => {
        if (!enabled || !Connection?.prototype) {
          return;
        }

        if (!originalConnect) {
          originalConnect = Connection.prototype.connect;

          Connection.prototype.connect = function connectWithCustomName(hello, config) {
            if (enabled && hello) {
              return originalConnect.call(this, { ...hello, name: normalizedName() }, config);
            }

            return originalConnect.call(this, hello, config);
          };
        }
      }).catch(() => {

      });
    }

    function unpatchConnection() {
      if (!originalConnect) {
        return;
      }

      const url = new URL('client/net.js', location.href).href;

      import(url).then(({ Connection }) => {
        if (enabled || !Connection?.prototype) {
          return;
        }

        Connection.prototype.connect = originalConnect;
        originalConnect = null;
      }).catch(() => {

      });
    }

    function setEnabled(next) {
      if (enabled === next) {
        return;
      }

      enabled = next;

      if (enabled) {
        startObserver();
        installInput();
        patchConnection();
      } else {
        stopObserver();
        restoreInput();
        unpatchConnection();
      }
    }

    bridge.onConfig('solstice-player', (data) => {
      if (data.type === 'config' && data.module === 'customname') {
        setEnabled(Boolean(data.enabled));
      }
    });
  }
})();
