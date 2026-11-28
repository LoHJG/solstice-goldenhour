(() => {
  'use strict';

  const CHANNEL = 'solstice-misc';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HEARTBEAT_MS = 500;
  const DEFAULT_RANGE = 5;
  const MAX_BLOCKS = 6000;
  const LOOP_MS = 250;

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/potatoepic/')) {
    bootGame();
    return;
  }

  let lastSentKey = '';
  let lastSentAt = 0;

  function findGameFrame() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}/toy/potatoepic/`)) {
        return frame;
      }
    }

    return null;
  }

  function syncConfig(force = false) {
    const module = getMod('TEST');

    if (!module) {
      return;
    }

    const rangeSetting = module.settings.find((setting) => setting.n === 'Range');
    const range = Math.max(1, Math.min(10, Math.round(Number(rangeSetting?.v) || DEFAULT_RANGE)));
    const now = performance.now();
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'test',
      enabled: Boolean(module.on),
      range
    };
    const key = JSON.stringify(config);

    if (!force && key === lastSentKey && now - lastSentAt < HEARTBEAT_MS) {
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
    game: 'potatoepic',
    name: 'TEST',
    desc: 'Host-only water field; kills all AI while hosting.',
    cat: 'Misc',
    nm: { l: 'test', ls: 'test', n: 'TEST', ns: 'TEST' },
    disp: 'Range',
    settings: [
      {
        t: 'n',
        n: 'Range',
        d: 'Radius of the water field placed around the host.',
        v: DEFAULT_RANGE,
        min: 1,
        max: 10,
        step: 1
      }
    ],
    onRender: () => syncConfig(),
    onEnable() {
      lastSentKey = '';
      lastSentAt = 0;
      syncConfig(true);
    }
  });

  setInterval(() => syncConfig(), 250);

  function bootGame() {
    let attempts = 0;

    function start() {
      const bridge = window.SolsticeGame;

      if (!bridge) {
        if (attempts++ < 200) {
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
    let range = DEFAULT_RANGE;

    function xze() {
      try {
        return window.XZE || null;
      } catch {
        return null;
      }
    }

    function game() {
      try {
        return window.game || null;
      } catch {
        return null;
      }
    }

    function waterArea(origin, radius) {
      const cx = Math.floor(Number(origin?.[0]));
      const cy = Math.floor(Number(origin?.[1])) - 1;
      const cz = Math.floor(Number(origin?.[2]));

      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
        return [];
      }

      const blocks = [];
      const water = 7;
      const radiusSquared = radius * radius;

      const add = (x, z) => {
        if (blocks.length < MAX_BLOCKS) {
          blocks.push([x, cy, z, water, 0]);
        }
      };

      add(cx, cz);

      for (let ring = 1; ring <= radius && blocks.length < MAX_BLOCKS; ring++) {
        for (let dx = -ring; dx <= ring && blocks.length < MAX_BLOCKS; dx++) {
          for (let dz = -ring; dz <= ring && blocks.length < MAX_BLOCKS; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) {
              continue;
            }

            if (dx * dx + dz * dz > radiusSquared) {
              continue;
            }

            add(cx + dx, cz + dz);
          }
        }
      }

      return blocks;
    }

    function applyLocal(blocks) {
      const g = game();

      if (!blocks.length) {
        return;
      }

      try {
        if (g?.world && typeof g.world.setBlock === 'function') {
          for (const [x, y, z, id, meta] of blocks) {
            g.world.setBlock(x, y, z, id, meta);
          }

          g.flushMesh?.();
        }
      } catch {

      }
    }

    function broadcast(blocks) {
      const z = xze();

      if (!blocks.length) {
        return;
      }

      if (z?.Net && typeof z.Net.send === 'function') {
        for (let index = 0; index < blocks.length; index += MAX_BLOCKS) {
          z.Net.send({
            t: 'xste',
            l: blocks.slice(index, index + MAX_BLOCKS)
          });
        }
      }
    }

    function killAllAI() {
      const z = xze();
      const g = game();
      const R = z?.R;
      const AI = z?.AI;

      if (
        !z ||
        !g ||
        !R ||
        R.st !== 'play' ||
        !R.net ||
        String(R.net.host) !== String(R.net.me) ||
        !AI ||
        !Array.isArray(AI.bots)
      ) {
        return;
      }

      const bots = [...AI.bots];

      if (!bots.length) {
        return;
      }

      for (const bot of bots) {
        if (!bot || bot.dead) {
          continue;
        }

        try {
          z.Net?.botDown?.(bot, 0, false);
        } catch {

        }
      }

      try {
        AI.clear?.(g, R);
      } catch {
        for (const bot of bots) {
          bot.dead = true;

          if (bot.e) {
            bot.e.dead = true;
            bot.e.health = 0;
            bot.e.invisible = true;
          }
        }
      }
    }

    function tick() {
      if (!enabled) {
        return;
      }

      const z = xze();
      const g = game();
      const R = z?.R;
      const net = R?.net;

      if (
        !z ||
        !g?.player ||
        !R ||
        R.st !== 'play' ||
        !net ||
        net.me == null ||
        String(net.host) !== String(net.me)
      ) {
        return;
      }

      const origin = g.player.pos;

      if (!Array.isArray(origin)) {
        return;
      }

      const blocks = waterArea(origin, range);

      if (!blocks.length) {
        return;
      }

      applyLocal(blocks);
      broadcast(blocks);

      try {
        killAllAI();
      } catch {

      }
    }

    setInterval(tick, LOOP_MS);

    bridge.onConfig(CHANNEL, (data) => {
      if (data.type !== 'config' || data.module !== 'test') {
        return;
      }

      enabled = Boolean(data.enabled);
      range = Math.max(1, Math.min(10, Math.round(Number(data.range) || DEFAULT_RANGE)));

    });
  }
})();
