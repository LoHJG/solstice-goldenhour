

(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-movement';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const MIN_SEND_INTERVAL_MS = 100;
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

  function setting(module, name, fallback) {
    const value = module.settings.find((entry) => entry.n === name);
    return value ? value.v : fallback;
  }

  function syncConfig() {
    const module = getMod('Sprint');

    if (!module) {
      return;
    }

    const now = performance.now();

    if (now - lastSentAt < MIN_SEND_INTERVAL_MS) {
      return;
    }

    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'sprint',
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
    name: 'Sprint',
    desc: 'Automatically sprints.',
    cat: "Movement",
    nm: { l: 'sprint', ls: 'sprint', n: 'Sprint', ns: 'Sprint' },
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
    let enabled = false;
    let synthetic = false;

    function release() {
      if (!synthetic) {
        return;
      }

      synthetic = false;

      if (bridge.physicalShiftLeft) {
        return;
      }

      bridge.getGH()?.debug?.input?.keys?.delete('ShiftLeft');
    }

    function setSprint(wanted) {
      const input = bridge.getGH()?.debug?.input;

      if (!wanted || !input?.keys) {
        release();
        return;
      }

      if (bridge.physicalShiftLeft || bridge.physicalShiftRight) {
        if (synthetic && !bridge.physicalShiftLeft) {
          input.keys.delete('ShiftLeft');
        }

        synthetic = false;
        return;
      }

      if (!input.keys.has('ShiftLeft')) {
        input.keys.add('ShiftLeft');
        synthetic = true;
      }
    }

    bridge.onConfig('solstice-movement', (data) => {
      if (data.type !== 'config' || data.module !== 'sprint') {
        return;
      }

      enabled = Boolean(data.enabled);

      if (!enabled) {
        release();
      }
    });

    bridge.onBeforePlayerUpdate(() => {
      if (!enabled) {
        release();
        return;
      }

      const context = bridge.getContext();

      if (!context) {
        release();
        return;
      }

      const input = context.input;
      const code = (name) => Boolean(input.keys?.has(name) || input.touchKeys?.has(name));
      const touchForward = Number(input.touchForward) || 0;
      const touchRight = Number(input.touchRight) || 0;
      const forward = code('KeyW') || code('ArrowUp') || touchForward > 0.2;
      const back = code('KeyS') || code('ArrowDown') || touchForward < -0.2;
      const left = code('KeyA') || code('ArrowLeft') || touchRight < -0.2;
      const right = code('KeyD') || code('ArrowRight') || touchRight > 0.2;

      setSprint(forward || back || left || right);
    }, 10);

    bridge.onReset(release);
  }
})();
