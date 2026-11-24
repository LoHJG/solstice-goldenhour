

(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && (location.pathname.startsWith('/toy/golden-hour/') || location.pathname.startsWith('/toy/potatoepic/'))) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-combat';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const gamePrefix = () => (document.documentElement?.getAttribute('data-solstice-game') === 'potatoepic' || location.pathname.includes('/potatoepic/')) ? '/toy/potatoepic/' : '/toy/golden-hour/';
  const MIN_SEND_INTERVAL_MS = 100;
  const HEARTBEAT_MS = 500;

  let lastSentKey = '';
  let lastSentAt = 0;
  let cachedFrame = null;

  function findGameFrame() {
    if (cachedFrame?.isConnected &&
        cachedFrame.src.startsWith(`${GAME_ORIGIN}${gamePrefix()}`)) {
      return cachedFrame;
    }

    cachedFrame = null;

    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}${gamePrefix()}`)) {
        cachedFrame = frame;
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
    const module = getMod('TriggerBot');

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
      module: 'triggerbot',
      enabled: Boolean(module.on),
      wallCheck: Boolean(setting(module, 'Wall Check', true))
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
    name: 'TriggerBot',
    desc: 'Automatically fires when an enemy is under the crosshair.',
    cat: "Combat",
    nm: { l: 'triggerbot', ls: 'trigger bot', n: 'TriggerBot', ns: 'Trigger Bot' },
    disp: '',
    settings: [
      { t: 'b', n: 'Wall Check', d: 'Only auto-fire when the target is not behind a wall.', v: 1 }
    ],
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
    let wallCheck = true;
    let workForward = null;

    bridge.onConfig('solstice-combat', (data) => {
      if (data.type !== 'config' || data.module !== 'triggerbot') {
        return;
      }

      enabled = Boolean(data.enabled);
      wallCheck = data.wallCheck !== false;

      if (!enabled) {
        bridge.requestAutoFire('trigger', false);
      }
    });

    bridge.onBeforeArsenalUpdate(() => {
      if (!enabled) {
        bridge.requestAutoFire('trigger', false);
        return;
      }

      const context = bridge.getContext();

      if (!context) {
        bridge.requestAutoFire('trigger', false);
        return;
      }

      const { player, camera, actors } = context;
      const forward = workForward || (workForward = player.pos.clone());
      camera.getWorldDirection(forward);

      const eye = camera.position;
      let bestT = Infinity;

      for (const actor of actors) {
        if (!bridge.isEnemy(actor, player)) {
          continue;
        }

        const height = Number(actor.e?.h) > 0.2 ? Number(actor.e.h) : 1.8;
        const actorBox = Array.isArray(actor.box) && actor.box.length >= 6 ? actor.box : null;
        const x = actor.pos.x;
        const y = actor.pos.y;
        const z = actor.pos.z;
        const minX = actorBox ? actorBox[0] : x - 0.4;
        const minY = actorBox ? actorBox[1] : y + 0.05;
        const minZ = actorBox ? actorBox[2] : z - 0.4;
        const maxX = actorBox ? actorBox[3] : x + 0.4;
        const maxY = actorBox ? actorBox[4] : y + height;
        const maxZ = actorBox ? actorBox[5] : z + 0.4;
        const t = bridge.rayAabb(
          eye.x, eye.y, eye.z,
          forward.x, forward.y, forward.z,
          minX, minY, minZ,
          maxX, maxY, maxZ,
          140
        );

        if (t !== null && t < bestT) {
          bestT = t;
        }
      }

      if (bestT === Infinity) {
        bridge.requestAutoFire('trigger', false);
        return;
      }

      if (wallCheck) {
        const hit = {
          x: eye.x + forward.x * bestT,
          y: eye.y + forward.y * bestT,
          z: eye.z + forward.z * bestT
        };

        if (!bridge.worldLineClear(eye, hit)) {
          bridge.requestAutoFire('trigger', false);
          return;
        }
      }

      bridge.requestAutoFire('trigger', true);
    }, 10);
  }
})();
