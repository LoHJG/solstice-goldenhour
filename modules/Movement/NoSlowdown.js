(() => {
  'use strict';

  /* NoSlowdown：开枪 / 冲刺时不再被武器重量拖慢。
     arsenal.sprintLock / blocksSprint / sinceFire 是游戏里可见的三个闸口，
     这里全部顶住（和 Aura 用的是同一套接口，但互不抢属性描述符）。 */

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-movement';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const MIN_SEND_INTERVAL_MS = 80;
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

  function syncConfig() {
    const module = getMod('NoSlowdown');

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
      module: 'noslowdown',
      enabled: Boolean(module.on),
      sprintLock: Boolean((module.settings.find((s) => s.n === 'No Sprint Lock') || { v: 1 }).v),
      fireSlow: Boolean((module.settings.find((s) => s.n === 'No Fire Slow') || { v: 1 }).v),
      adsSlow: Boolean((module.settings.find((s) => s.n === 'No Ads Slow') || { v: 0 }).v)
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
    name: 'NoSlowdown',
    desc: 'Keeps full movement speed while shooting and scoping.',
    cat: 'Movement',
    nm: { l: 'noslowdown', ls: 'no slowdown', n: 'NoSlowdown', ns: 'No Slowdown' },
    disp: '',
    settings: [
      { t: 'b', n: 'No Sprint Lock', d: 'Clears the weapon sprint lock every tick.', v: 1 },
      { t: 'b', n: 'No Fire Slow', d: 'Firing no longer blocks sprinting.', v: 1 },
      { t: 'b', n: 'No Ads Slow', d: 'Aiming down sights keeps walking speed.', v: 0 }
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
    let noSprintLock = true;
    let noFireSlow = true;
    let noAdsSlow = false;
    let patchedBlocksSprint = null;

    function arsenal() {
      return bridge.getGH()?.debug?.arsenal;
    }

    /* 把「开火后禁止冲刺」的计时器骗过去 */
    function patchBlocksSprint() {
      const current = arsenal();

      if (!current || typeof current.blocksSprint !== 'function') {
        return;
      }

      if (current.blocksSprint.__solsticeNoSlowdown) {
        patchedBlocksSprint = current;
        return;
      }

      const original = current.blocksSprint;
      const wrapped = function wrappedNoSlowdownBlocksSprint(...args) {
        if (enabled && noFireSlow) {
          const sinceFire = this.sinceFire;
          this.sinceFire = 999;

          try {
            return original.apply(this, args);
          } finally {
            this.sinceFire = sinceFire;
          }
        }

        return original.apply(this, args);
      };

      Object.defineProperty(wrapped, '__solsticeNoSlowdown', { value: true });
      current.blocksSprint = wrapped;
      patchedBlocksSprint = current;
    }

    bridge.onConfig('solstice-movement', (data) => {
      if (data.type !== 'config' || data.module !== 'noslowdown') {
        return;
      }

      enabled = Boolean(data.enabled);
      noSprintLock = data.sprintLock !== false;
      noFireSlow = data.fireSlow !== false;
      noAdsSlow = Boolean(data.adsSlow);

      if (enabled) {
        patchBlocksSprint();
      }
    });

    bridge.onAfterArsenalUpdate(() => {
      if (!enabled) {
        return;
      }

      const current = arsenal();

      if (!current) {
        return;
      }

      if (noSprintLock) {
        if (Number(current.sprintLock)) {
          current.sprintLock = 0;
        }

        for (const name of ['moveSlow', 'moveSlowdown', 'slowK', 'walkSlow']) {
          if (typeof current[name] === 'number' && current[name] > 0) {
            current[name] = 0;
          }
        }
      }

      if (noAdsSlow) {
        const player = bridge.getGH()?.debug?.player;

        if (player) {
          if (typeof player.adsK === 'number' && player.adsK > 0) player.adsK = 0;
          if (typeof player.slowK === 'number' && player.slowK > 0) player.slowK = 0;
        }
      }
    }, 25);

    setInterval(() => {
      if (enabled && patchedBlocksSprint !== arsenal()) {
        patchBlocksSprint();
      }
    }, 500);
  }
})();
