(() => {
  'use strict';

  /* InfiniteAmmo：这个游戏的枪是本地模拟的（开火、后坐力、命中都在客户端），
     所以直接把弹匣数字顶住就行，不需要跟服务器打交道。

     弹匣落在 arsenal.slot.ammo（Aura 的 canFireNow 就是这么读的），
     容量字段名不确定，所以按候选表探测，探测不到就用「见过的最大值」。 */

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-combat';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HEARTBEAT_MS = 400;

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

  function boolOf(module, name, fallback) {
    const setting = module.settings.find((entry) => entry.n === name);
    return setting ? Boolean(setting.v) : fallback;
  }

  function syncConfig() {
    const module = getMod('InfiniteAmmo');

    if (!module) {
      return;
    }

    const now = performance.now();
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'infiniteammo',
      enabled: Boolean(module.on),
      magazine: boolOf(module, 'Infinite Mag', true),
      reload: boolOf(module, 'No Reload', true),
      reserve: boolOf(module, 'Infinite Reserve', true),
      debug: boolOf(module, 'Debug Dump', false)
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
    name: 'InfiniteAmmo',
    desc: 'Keeps the magazine full and skips reloading (ammo is client side).',
    cat: 'Combat',
    nm: { l: 'infiniteammo', ls: 'infinite ammo', n: 'InfiniteAmmo', ns: 'Infinite Ammo' },
    disp: '',
    settings: [
      { t: 'b', n: 'Infinite Mag', d: 'Refills the magazine instantly.', v: 1 },
      { t: 'b', n: 'No Reload', d: 'Cancels any reload in progress.', v: 1 },
      { t: 'b', n: 'Infinite Reserve', d: 'Keeps the reserve ammo topped up.', v: 1 },
      { t: 'b', n: 'Debug Dump', d: 'Logs the discovered ammo fields once.', v: 0 }
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
    const CAPACITY_KEYS = ['capacity', 'max', 'maxAmmo', 'magSize', 'clipSize', 'size', 'mag', 'magazineSize'];
    const RESERVE_KEYS = ['reserve', 'reserveAmmo', 'ammoReserve', 'spare', 'spareAmmo', 'backup'];

    let enabled = false;
    let magazine = true;
    let noReload = true;
    let reserve = true;
    let debug = false;

    let capacity = 0;
    let reserveTarget = 0;
    let dumped = false;

    function arsenal() {
      return bridge.getGH()?.debug?.arsenal;
    }

    function slotOf(state) {
      return state?.slot || null;
    }

    function readCapacity(slot) {
      for (const key of CAPACITY_KEYS) {
        const value = Number(slot[key]);

        if (Number.isFinite(value) && value > 0 && value < 5000) {
          return { key, value };
        }
      }

      return null;
    }

    function dumpOnce(state, slot) {
      if (dumped || !debug) {
        return;
      }

      dumped = true;

      try {
        console.log('[Solstice] arsenal keys', Object.keys(state || {}));
        console.log('[Solstice] slot keys', Object.keys(slot || {}));
        console.log('[Solstice] arsenal sample', state);
        console.log('[Solstice] slot sample', slot);
      } catch {

      }
    }

    function applyAmmo() {
      const state = arsenal();

      if (!state) {
        return;
      }

      const slot = slotOf(state);

      if (!slot) {
        return;
      }

      const capInfo = readCapacity(slot);

      if (capInfo && capInfo.value > capacity) {
        capacity = capInfo.value;
      }

      const seen = Number(slot.ammo) || 0;

      if (seen > capacity) {
        capacity = seen;
      }

      dumpOnce(state, slot);

      if (magazine && capacity > 0) {
        const ammo = Number(slot.ammo) || 0;

        if (ammo < capacity) {
          slot.ammo = capacity;
        }
      }

      if (reserve) {
        for (const key of RESERVE_KEYS) {
          const value = Number(slot[key]);

          if (Number.isFinite(value)) {
            if (value > reserveTarget) {
              reserveTarget = value;
            }

            if (reserveTarget > 0) {
              slot[key] = reserveTarget;
            }
          }
        }
      }

      if (noReload) {
        if (state.state === 'reloading') {
          state.state = 'ready';
        }

        if (Number(state.cool) > 0 && Number(slot.ammo) >= capacity) {
          state.cool = 0;
        }

        if (Number(state.pumpWait) > 0) {
          state.pumpWait = 0;
        }
      }
    }

    bridge.onConfig('solstice-combat', (data) => {
      if (data.type !== 'config' || data.module !== 'infiniteammo') {
        return;
      }

      enabled = Boolean(data.enabled);
      magazine = data.magazine !== false;
      noReload = data.reload !== false;
      reserve = data.reserve !== false;
      debug = Boolean(data.debug);

      if (!enabled) {
        dumped = false;
      }
    });

    /* 开火前后各顶一次，避免这一帧里数字掉下去 */
    bridge.onBeforeArsenalUpdate(() => {
      if (enabled) {
        applyAmmo();
      }
    }, 45);

    bridge.onAfterArsenalUpdate(() => {
      if (enabled) {
        applyAmmo();
      }
    }, 45);

    bridge.onReset(() => {
      dumped = false;
    });
  }
})();
