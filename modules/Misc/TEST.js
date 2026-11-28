(() => {
  'use strict';

  const CHANNEL = 'solstice-misc';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HEARTBEAT_MS = 500;
  const DEFAULT_RANGE = 32;
  const MAX_BLOCKS = 6000;
  const IRON_BARS = 1381;
  const STONE_BRICKS = 23;
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

    const rangeSetting = module.settings.find((setting) => setting.n === 'Jail range');
    const range = Math.max(1, Math.min(1000, Math.round(Number(rangeSetting?.v) || DEFAULT_RANGE)));
    const killAI = Boolean(module.settings.find((setting) => setting.n === 'Kill AI')?.v ?? 1);
    const jailCell = Boolean(module.settings.find((setting) => setting.n === 'Jail cell')?.v ?? 1);
    const funnyAI = Boolean(module.settings.find((setting) => setting.n === 'Funny AI')?.v ?? 0);
    const now = performance.now();
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'test',
      enabled: Boolean(module.on),
      range,
      killAI,
      jailCell,
      funnyAI
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
    desc: 'TEST',
    cat: 'Misc',
    nm: { l: 'test', ls: 'test', n: 'TEST', ns: 'TEST' },
    disp: 'Jail range',
    settings: [
      {
        t: 'b',
        n: 'Kill AI',
        d: 'Kills all AI while hosting.',
        v: 1
      },
      {
        t: 'b',
        n: 'Funny AI',
        d: 'Makes AI invincible and spins them around the host in 3D.',
        v: 0
      },
      {
        t: 'b',
        n: 'Jail cell',
        d: 'Cages nearby players in iron bars.',
        v: 1
      },
      {
        t: 'n',
        n: 'Jail range',
        d: 'Only cage players within this distance of the host.',
        v: DEFAULT_RANGE,
        min: 1,
        max: 1000,
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
    let killAIEnabled = true;
    let jailCellEnabled = true;
    let funnyAIEnabled = false;
    const lastCage = new Map();

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

    function isAirBlock(g, x, y, z) {
      try {
        if (!g?.world || typeof g.world.getBlock !== 'function') {
          return false;
        }

        return Number(g.world.getBlock(x, y, z)) === 0;
      } catch {
        return false;
      }
    }

    function cageFor(pos, g) {
      const x = Math.floor(Number(pos?.[0]));
      const y = Math.floor(Number(pos?.[1]));
      const z = Math.floor(Number(pos?.[2]));

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return [];
      }

      const blocks = [];
      const seen = new Set();

      const add = (bx, by, bz, id) => {
        const key = `${bx},${by},${bz}`;

        if (seen.has(key) || !isAirBlock(g, bx, by, bz)) {
          return;
        }

        seen.add(key);
        blocks.push([bx, by, bz, id, 0]);
      };

      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          add(x + dx, y - 1, z + dz, STONE_BRICKS);
          add(x + dx, y + 2, z + dz, STONE_BRICKS);
        }
      }

      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) {
              continue;
            }

            if (Math.abs(dx) === 1 || Math.abs(dz) === 1) {
              add(x + dx, y + dy, z + dz, IRON_BARS);
            }
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

    function funnyHost() {
      const R = xze()?.R;
      return Boolean(R?.st === 'play' && R.net && String(R.net.host) === String(R.net.me));
    }

    function funnyTick() {
      const z = xze();
      const g = game();
      const R = z?.R;
      const AI = z?.AI;

      if (
        !enabled ||
        !funnyAIEnabled ||
        !z ||
        !g?.player ||
        !R ||
        R.st !== 'play' ||
        !R.net ||
        String(R.net.host) !== String(R.net.me) ||
        !AI ||
        !Array.isArray(AI.bots)
      ) {
        return;
      }

      const t = performance.now() / 1000;
      const hx = Number(g.player.pos[0]);
      const hy = Number(g.player.pos[1]);
      const hz = Number(g.player.pos[2]);

      for (let index = 0; index < AI.bots.length; index += 1) {
        const bot = AI.bots[index];

        if (!bot || !bot.e) {
          continue;
        }

        const e = bot.e;

        if (!bot.__solsticeFunnyOriginal) {
          bot.__solsticeFunnyOriginal = {
            health: Number(e.health),
            maxHealth: Number(e.maxHealth),
            invisible: !!e.invisible,
            botDead: !!bot.dead,
            tok: bot.tok,
            next: bot.next,
            mag: bot.mag,
            relT: bot.relT,
            throwT: bot.throwT,
            nades: bot.nades ? { ...bot.nades } : null
          };
        }

        const phase = bot.__solsticeFunnyPhase ?? (bot.__solsticeFunnyPhase = Math.random() * Math.PI * 2);
        const speed = bot.__solsticeFunnySpeed ?? (bot.__solsticeFunnySpeed = 0.45 + Math.random() * 0.65);
        const radius = bot.__solsticeFunnyRadius ?? (bot.__solsticeFunnyRadius = 2.5 + Math.random() * 2.5);
        const theta = t * speed + phase;
        const elevation = Math.sin(t * 0.85 + phase * 1.7) * 0.95;
        const horizontal = Math.cos(elevation) * radius;
        const x = hx + Math.cos(theta) * horizontal;
        const y = hy + 1.15 + Math.sin(elevation) * radius;
        const zPos = hz + Math.sin(theta) * horizontal;
        const yaw = t * 2.4 + phase;
        const pitch = -1.5;

        bot.dead = false;
        bot.sentDead = false;
        bot.tok = false;
        bot.next = Infinity;
        bot.mag = 0;
        bot.relT = Infinity;
        bot.throwT = Infinity;
        bot.path = null;
        bot.lastSeen = null;
        bot.tg = null;
        bot.vis = false;

        if (bot.nades) {
          bot.nades.frag = 0;
          bot.nades.flashbang = 0;
        }

        bot.pos = [x, y, zPos];
        bot.yaw = yaw;
        bot.pitch = pitch;

        e.pos = [x, y, zPos];
        e.prev = [x, y, zPos];
        e.netPos = [x, y, zPos];
        e.vel = [0, 0, 0];
        e.lerpN = 0;
        e.dead = false;
        e.deathTime = 0;
        e.invisible = false;
        e.health = 1e9;
        e.maxHealth = 1e9;
        e.yaw = yaw;
        e.bodyYaw = yaw;
        e.prevBodyYaw = yaw;
        e.netYaw = yaw;
        e.netHead = yaw;
        e.headYaw = yaw;
        e.pitch = pitch;
        e.netPitch = pitch;
      }
    }

    function restoreFunnyAI() {
      const AI = xze()?.AI;

      if (!AI || !Array.isArray(AI.bots)) {
        return;
      }

      for (const bot of AI.bots) {
        const original = bot?.__solsticeFunnyOriginal;
        const e = bot?.e;

        if (!original || !e) {
          continue;
        }

        const maxHealth = Number.isFinite(original.maxHealth) && original.maxHealth > 0
          ? original.maxHealth
          : 100;
        const health = Number.isFinite(original.health) && original.health > 0
          ? Math.min(original.health, maxHealth)
          : maxHealth;

        e.maxHealth = maxHealth;
        e.health = Math.max(1, health);
        e.dead = false;
        e.deathTime = 0;
        e.invisible = original.invisible;
        bot.dead = false;
        bot.sentDead = false;
        bot.tok = original.tok;
        bot.next = Number.isFinite(original.next) ? original.next : 0;
        bot.mag = original.mag;
        bot.relT = Number.isFinite(original.relT) ? original.relT : 0;
        bot.throwT = Number.isFinite(original.throwT) ? original.throwT : 0;

        if (bot.nades && original.nades) {
          Object.assign(bot.nades, original.nades);
        }

        delete bot.__solsticeFunnyOriginal;
        delete bot.__solsticeFunnyPhase;
        delete bot.__solsticeFunnySpeed;
        delete bot.__solsticeFunnyRadius;
      }
    }

    function installFunnyAIHooks() {
      const AI = xze()?.AI;

      if (!AI || AI.__solsticeFunnyAI) {
        return;
      }

      const originalTick = AI.tick;
      const originalHurt = AI.hurtBot;

      const tick = function funnyAITick(...args) {
        if (enabled && funnyAIEnabled && funnyHost()) {
          funnyTick();
          return;
        }

        return originalTick.apply(this, args);
      };

      const hurt = function funnyAIHurt(...args) {
        if (enabled && funnyAIEnabled && funnyHost()) {
          return false;
        }

        return originalHurt.apply(this, args);
      };

      try {
        Object.defineProperty(tick, '__solsticeFunnyAI', { value: true });
        Object.defineProperty(hurt, '__solsticeFunnyAI', { value: true });
      } catch {

      }

      AI.tick = tick;
      AI.hurtBot = hurt;
      AI.__solsticeFunnyAI = true;
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

    function publishTestState() {
      const z = xze();
      const R = z?.R;
      const net = R?.net;
      let active = false;
      let isHost = false;
      let hostPid = null;
      let hostEntity = null;

      if (enabled && z && R?.st === 'play' && net) {
        active = true;
        hostPid = net.host;
        isHost = net.me != null && String(hostPid) === String(net.me);

        if (!isHost && net.remotes && typeof net.remotes.get === 'function') {
          const remote = net.remotes.get(hostPid) || net.remotes.get(Number(hostPid));
          hostEntity = remote?.e || null;
        }
      }

      window.SolsticeTestState = {
        enabled,
        active,
        isHost,
        hostPid,
        hostEntity
      };
    }

    function tick() {
      publishTestState();

      if (!enabled) {
        lastCage.clear();
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
        String(net.host) !== String(net.me) ||
        !(net.remotes instanceof Map)
      ) {
        return;
      }

      const origin = g.player.pos;

      if (!Array.isArray(origin)) {
        return;
      }

      const now = performance.now();

      if (funnyAIEnabled) {
        funnyTick();
      }

      if (!jailCellEnabled) {
        lastCage.clear();
      } else {
        const allBlocks = [];

      for (const remote of net.remotes.values()) {
        if (!remote || remote.left || remote.dead || remote.out) {
          continue;
        }

        const pos = remote.pos;

        if (!Array.isArray(pos) || pos[1] <= -50) {
          continue;
        }

        const distance = Math.hypot(
          Number(pos[0]) - Number(origin[0]),
          Number(pos[1]) - Number(origin[1]),
          Number(pos[2]) - Number(origin[2])
        );

        if (!Number.isFinite(distance) || distance > range) {
          continue;
        }

        const previous = lastCage.get(remote.pid);

        if (previous) {
          const dx = Number(pos[0]) - (previous.x + 0.5);
          const dy = Number(pos[1]) - (previous.y + 0.5);
          const dz = Number(pos[2]) - (previous.z + 0.5);

          if (Math.abs(dx) <= 1.25 && Math.abs(dy) <= 1.25 && Math.abs(dz) <= 1.25) {
            continue;
          }
        }

        const blocks = cageFor(pos, g);

        if (!blocks.length) {
          continue;
        }

        lastCage.set(remote.pid, {
          x: Math.floor(Number(pos[0])),
          y: Math.floor(Number(pos[1])),
          z: Math.floor(Number(pos[2])),
          at: now
        });
        allBlocks.push(...blocks);
      }

        if (allBlocks.length) {
          applyLocal(allBlocks);
          broadcast(allBlocks);
        }
      }

      if (killAIEnabled) {
        try {
          killAllAI();
        } catch {

        }
      }
    }

    installFunnyAIHooks();
    setInterval(installFunnyAIHooks, 500);
    setInterval(tick, LOOP_MS);

    bridge.onConfig(CHANNEL, (data) => {
      if (data.type !== 'config' || data.module !== 'test') {
        return;
      }

      enabled = Boolean(data.enabled);
      range = Math.max(1, Math.min(1000, Math.round(Number(data.range) || DEFAULT_RANGE)));
      const wasFunny = funnyAIEnabled;
      killAIEnabled = data.killAI !== false;
      jailCellEnabled = data.jailCell !== false;
      funnyAIEnabled = data.funnyAI === true;

      if (wasFunny && !funnyAIEnabled) {
        restoreFunnyAI();
      }

      if (!enabled) {
        restoreFunnyAI();
        lastCage.clear();
        publishTestState();
      } else if (!jailCellEnabled) {
        lastCage.clear();
      }

    });
  }
})();
