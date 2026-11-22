

(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-combat';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const MIN_SEND_INTERVAL_MS = 100;
  const HEARTBEAT_MS = 500;

  let lastSentKey = '';
  let lastSentAt = 0;
  let cachedFrame = null;

  function findGameFrame() {
    if (cachedFrame?.isConnected &&
        cachedFrame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`)) {
      return cachedFrame;
    }

    cachedFrame = null;

    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`)) {
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
    const module = getMod('Aura');

    if (!module) {
      return;
    }

    const now = performance.now();

    if (now - lastSentAt < MIN_SEND_INTERVAL_MS) {
      return;
    }

    const modeSetting = module.settings.find((entry) => entry.n === 'Mode');
    const mode = modeSetting?.vals?.[modeSetting.v] === 'Single' ? 'Single' : 'Switch';
    const range = Math.max(0, Math.min(120, Number(setting(module, 'Range', 20)) || 0));
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'aura',
      enabled: Boolean(module.on),
      mode,
      range,
      wallCheck: Boolean(setting(module, 'Wall Check', true)),
      ads: Boolean(setting(module, 'ADS', false))
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
    name: 'Aura',
    desc: 'Automatically attacks nearby enemies.',
    cat: "Combat",
    nm: { l: 'aura', ls: 'aura', n: 'Aura', ns: 'Aura' },
    disp: 'Mode',
    settings: [
      {
        t: 'e',
        n: 'Mode',
        d: 'Switch cycles between targets; Single stays on one target until it is lost.',
        v: 0,
        vals: ['Switch', 'Single']
      },
      {
        t: 'n',
        n: 'Range',
        d: 'The range at which to attack enemies.',
        v: 20,
        min: 0,
        max: 120,
        step: 0.5
      },
      {
        t: 'b',
        n: 'Wall Check',
        d: 'Only attack targets that are not behind walls.',
        v: 1
      },
      {
        t: 'b',
        n: 'ADS',
        d: 'Silently request ADS on the server while attacking.',
        v: 0
      }
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
    let config = {
      enabled: false,
      mode: 'Switch',
      range: 20,
      wallCheck: true,
      ads: false
    };
    let target = null;
    let singleTarget = null;
    let syntheticAds = false;
    const lastAttacks = new WeakMap();
    const remoteTracks = new WeakMap();
    const LEAD_SECONDS = 0.1;
    let latestSnapshot = null;
    let latestSnapshotPlayers = new Map();
    let aimScratch = null;
    let cachedAim = null;

    function currentSnapshot() {
      const snapshot = bridge.getRawSnapshot?.();

      if (!snapshot?.players) {
        return latestSnapshot;
      }

      if (!latestSnapshot ||
          (Number(snapshot.tick) || 0) >= (Number(latestSnapshot.tick) || 0) ||
          (Number(snapshot.time) || 0) > (Number(latestSnapshot.time) || 0)) {
        latestSnapshot = snapshot;
        latestSnapshotPlayers.clear();

        for (const player of snapshot.players) {
          latestSnapshotPlayers.set(player.id, player);
        }
      }

      return latestSnapshot;
    }

    function releaseAds() {
      if (!syntheticAds) {
        return;
      }

      syntheticAds = false;

      if (bridge.physicalRmb) {
        return;
      }

      bridge.getGH()?.debug?.input?.keys?.delete('Mouse2');
    }

    function setAds(wanted) {
      const input = bridge.getGH()?.debug?.input;

      if (!wanted || !input?.keys) {
        releaseAds();
        return;
      }

      if (bridge.physicalRmb) {
        syntheticAds = false;
        return;
      }

      if (!input.keys.has('Mouse2')) {
        input.keys.add('Mouse2');
        syntheticAds = true;
      }
    }

    function applySilentAds() {
      if (!syntheticAds) {
        return;
      }

      const debug = bridge.getGH()?.debug;
      const player = debug?.player;
      const arsenal = debug?.arsenal;

      if (player) {
        player.adsK = 0;
        player.zoom = 1;
      }

      if (arsenal) {
        arsenal.ads = 0;
        arsenal.adsHeld = false;
      }
    }

    function rawPlayer(actor) {
      currentSnapshot();

      if (!latestSnapshot || !actor || actor.id === undefined) {
        return null;
      }

      return latestSnapshotPlayers.get(actor.id) || null;
    }

    function rawSelf() {
      currentSnapshot();

      const debug = bridge.getGH()?.debug;
      const player = debug?.player;

      if (!player || !latestSnapshot) {
        return null;
      }

      return latestSnapshotPlayers.get(player.id) || null;
    }

    function rawSelfEye() {
      const me = rawSelf();

      if (!me) {
        return null;
      }

      const eyeHeight = me.sliding ? 0.72 : me.crouch ? 1 : 1.62;
      return { x: me.x, y: me.y + eyeHeight, z: me.z };
    }

    function rawHeight(player) {
      return player.sliding ? 0.95 : player.crouch ? 1.2 : 1.8;
    }

    function rawHeadPoint(actor, out) {
      const player = rawPlayer(actor);

      if (!player || player.alive === false || !actor?.pos || typeof bridge.headPoint !== 'function') {
        return false;
      }

      bridge.headPoint(actor, out);

      out.set(
        player.x + (out.x - actor.pos.x),
        player.y + (out.y - actor.pos.y),
        player.z + (out.z - actor.pos.z)
      );
      return true;
    }

    function isRemoteActor(actor) {
      return Boolean(
        actor &&
        document.body.classList.contains('online-session') &&
        actor.isPlayer !== true &&
        !actor.char &&
        !Array.isArray(actor.hit)
      );
    }

    function remoteLeadOffset(actor) {
      if (!isRemoteActor(actor) || !actor.pos) {
        return null;
      }

      const now = performance.now();
      const previous = remoteTracks.get(actor);

      if (!previous) {
        remoteTracks.set(actor, {
          x: actor.pos.x,
          y: actor.pos.y,
          z: actor.pos.z,
          time: now,
          vx: 0,
          vy: 0,
          vz: 0
        });
        return null;
      }

      const dt = (now - previous.time) / 1000;
      const mx = actor.pos.x - previous.x;
      const my = actor.pos.y - previous.y;
      const mz = actor.pos.z - previous.z;

      if (dt >= 0.004 && dt <= 0.25) {
        if (Math.hypot(mx, my, mz) > 3.5) {
          previous.vx = 0;
          previous.vy = 0;
          previous.vz = 0;
        } else {
          const vx = Math.max(-18, Math.min(18, mx / dt));
          const vy = Math.max(-18, Math.min(18, my / dt));
          const vz = Math.max(-18, Math.min(18, mz / dt));
          previous.vx = previous.vx * 0.6 + vx * 0.4;
          previous.vy = previous.vy * 0.6 + vy * 0.4;
          previous.vz = previous.vz * 0.6 + vz * 0.4;
        }

        previous.x = actor.pos.x;
        previous.y = actor.pos.y;
        previous.z = actor.pos.z;
        previous.time = now;
      }

      return {
        x: previous.vx * LEAD_SECONDS,
        y: previous.vy * LEAD_SECONDS,
        z: previous.vz * LEAD_SECONDS
      };
    }

    function targetValid(context) {
      const raw = rawPlayer(target);

      return Boolean(
        target &&
        context &&
        target.alive !== false &&
        (!raw || raw.alive !== false) &&
        context.actors.includes(target) &&
        bridge.isEnemy(target, context.player)
      );
    }

    function aimPoint(actor, eye, debug) {
      const range = Number(config.range) || 0;
      const rangeSq = range * range;
      const raw = rawPlayer(actor);
      const lead = raw ? null : remoteLeadOffset(actor);
      const point = aimScratch || (aimScratch = debug.player.pos.clone());

      if (!rawHeadPoint(actor, point)) {
        bridge.headPoint(actor, point);

        if (lead) {
          point.x += lead.x;
          point.y += lead.y;
          point.z += lead.z;
        }
      }

      let dx = point.x - eye.x;
      let dy = point.y - eye.y;
      let dz = point.z - eye.z;

      if (dx * dx + dy * dy + dz * dz <= rangeSq) {
        const visible = !config.wallCheck || bridge.worldLineClear(eye, point);

        if (visible) {
          return { x: point.x, y: point.y, z: point.z };
        }
      }

      if (raw) {
        point.set(raw.x, raw.y + rawHeight(raw) * 0.55, raw.z);
      } else {
        const height = Number(actor.e?.h) > 0.2 ? Number(actor.e.h) : 1.8;
        point.set(actor.pos.x, actor.pos.y + height * 0.55, actor.pos.z);

        if (lead) {
          point.x += lead.x;
          point.y += lead.y;
          point.z += lead.z;
        }
      }

      dx = point.x - eye.x;
      dy = point.y - eye.y;
      dz = point.z - eye.z;

      if (
        dx * dx + dy * dy + dz * dz <= rangeSq &&
        (!config.wallCheck || bridge.worldLineClear(eye, point))
      ) {
        return { x: point.x, y: point.y, z: point.z };
      }

      return null;
    }

    function selectTarget(context) {
      const { player, camera, debug, actors } = context;
      const eye = rawSelfEye() || camera.position;
      const range = Number(config.range) || 0;
      const rangeSq = range * range;
      const head = aimScratch || (aimScratch = player.pos.clone());
      const candidates = [];

      for (const actor of actors) {
        if (!bridge.isEnemy(actor, player)) {
          continue;
        }

        const raw = rawPlayer(actor);

        if (raw && raw.alive === false) {
          continue;
        }

        if (!rawHeadPoint(actor, head)) {
          bridge.headPoint(actor, head);
        }

        const dx = head.x - eye.x;
        const dy = head.y - eye.y;
        const dz = head.z - eye.z;
        const distance = dx * dx + dy * dy + dz * dz;

        if (distance > rangeSq) {
          continue;
        }

        candidates.push({ actor, distance });
      }

      if (candidates.length === 0) {
        return null;
      }

      if (config.mode === 'Single') {
        candidates.sort((left, right) => left.distance - right.distance);

        if (singleTarget) {
          const currentIndex = candidates.findIndex((entry) => entry.actor === singleTarget);

          if (currentIndex > 0) {
            const [current] = candidates.splice(currentIndex, 1);
            candidates.unshift(current);
          }
        }
      } else {
        candidates.sort((left, right) => {
          const leftTime = lastAttacks.get(left.actor) || 0;
          const rightTime = lastAttacks.get(right.actor) || 0;

          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          return left.distance - right.distance;
        });
      }

      for (const candidate of candidates) {
        const point = aimPoint(candidate.actor, eye, debug);

        if (!point) {
          continue;
        }

        if (config.mode === 'Single') {
          singleTarget = candidate.actor;
        }

        return { actor: candidate.actor, point };
      }

      return null;
    }

    function applyAura() {
      if (!config.enabled) {
        target = null;
        singleTarget = null;
        cachedAim = null;
        releaseAds();
        bridge.requestAutoFire('aura', false);
        return;
      }

      const context = bridge.getContext();

      if (!context) {
        target = null;
        singleTarget = null;
        cachedAim = null;
        releaseAds();
        bridge.requestAutoFire('aura', false);
        return;
      }

      const selected = selectTarget(context);

      if (!selected) {
        target = null;
        cachedAim = null;

        if (config.mode === 'Single') {
          singleTarget = null;
        }

        releaseAds();
        bridge.requestAutoFire('aura', false);
        return;
      }

      target = selected.actor;
      cachedAim = {
        actor: selected.actor,
        point: selected.point,
        tick: Number(currentSnapshot()?.tick) || 0
      };
      setAds(config.ads);
      applySilentAds();
      bridge.requestAutoFire('aura', true);
    }

    function resolveShot(eye, dir) {
      const auto = Boolean(bridge.hasAutoFireRequest?.('aura'));

      if (!config.enabled || !target || !bridge.active || bridge.uiOpen) {
        bridge.requestAutoFire('aura', false);
        return auto ? false : null;
      }

      const context = bridge.getContext();

      if (!targetValid(context)) {
        target = null;
        bridge.requestAutoFire('aura', false);
        return auto ? false : null;
      }

      const camera = bridge.getGH()?.debug?.gfx?.camera;
      const thirdPerson = bridge.getFeature('thirdperson');
      const origin = rawSelfEye() || thirdPerson?.getEye?.() || eye || camera?.position;

      if (!origin) {
        bridge.requestAutoFire('aura', false);
        return auto ? false : null;
      }

      const point = cachedAim && cachedAim.actor === target &&
        cachedAim.tick === (Number(currentSnapshot()?.tick) || 0)
        ? cachedAim.point
        : aimPoint(target, origin, bridge.getGH().debug);

      if (!point) {
        bridge.requestAutoFire('aura', false);
        return auto ? false : null;
      }

      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const dz = point.z - origin.z;
      const length = Math.hypot(dx, dy, dz);

      if (length < 1e-4) {
        bridge.requestAutoFire('aura', false);
        return auto ? false : null;
      }

      const out = dir && typeof dir.clone === 'function'
        ? dir.clone()
        : bridge.getGH().debug.player.pos.clone();

      out.x = dx / length;
      out.y = dy / length;
      out.z = dz / length;
      return out;
    }

    function canFireNow() {
      if (!config.enabled || !target) {
        return false;
      }

      const debug = bridge.getGH()?.debug;
      const arsenal = debug?.arsenal;

      if (!arsenal || arsenal.state !== 'ready' || arsenal.cool > 0) {
        return false;
      }

      if ((arsenal.pumpWait || 0) > 0 || debug.player?.mode === 'mantle') {
        return false;
      }

      return (arsenal.slot?.ammo || 0) > 0;
    }

    function installSprintLock() {
      const arsenal = bridge.getGH()?.debug?.arsenal;

      if (!arsenal) {
        return;
      }

      if (
        typeof arsenal.blocksSprint === 'function' &&
        !arsenal.blocksSprint.__solsticeAuraSprintUnlock
      ) {
        const originalBlocksSprint = arsenal.blocksSprint;
        const wrappedBlocksSprint = function wrappedAuraBlocksSprint(...args) {
          if (!config.enabled) {
            return originalBlocksSprint.apply(this, args);
          }

          const sinceFire = this.sinceFire;
          this.sinceFire = 999;

          try {
            return originalBlocksSprint.apply(this, args);
          } finally {
            this.sinceFire = sinceFire;
          }
        };

        Object.defineProperty(wrappedBlocksSprint, '__solsticeAuraSprintUnlock', { value: true });
        arsenal.blocksSprint = wrappedBlocksSprint;
      }

      if (!arsenal.__solsticeAuraSprintLockPatched) {
        try {
          let storedSprintLock = Number(arsenal.sprintLock) || 0;

          Object.defineProperty(arsenal, 'sprintLock', {
            configurable: true,
            enumerable: true,
            get() {
              return config.enabled ? 0 : storedSprintLock;
            },
            set(value) {
              storedSprintLock = Number(value) || 0;
            }
          });

          Object.defineProperty(arsenal, '__solsticeAuraSprintLockPatched', { value: true });
        } catch {

        }
      }
    }

    bridge.onConfig('solstice-combat', (data) => {
      if (data.type !== 'config' || data.module !== 'aura') {
        return;
      }

      const range = Number(data.range);
      const mode = data.mode === 'Single' ? 'Single' : 'Switch';

      if (config.mode !== mode) {
        singleTarget = null;
      }

      config = {
        enabled: Boolean(data.enabled),
        mode,
        range: Number.isFinite(range) ? bridge.clamp(range, 0, 120) : 20,
        wallCheck: data.wallCheck !== false,
        ads: Boolean(data.ads)
      };

      bridge.setRecoilSuppressed('aura', config.enabled);

      if (!config.enabled) {
        target = null;
        singleTarget = null;
        cachedAim = null;
        releaseAds();
        bridge.requestAutoFire('aura', false);
      }
    });

    bridge.onBeforePlayerUpdate(applyAura, 20);

    bridge.onAfterArsenalUpdate(applySilentAds, 20);

    bridge.onWorldMove((context) => {
      if (!syntheticAds || !context.input || !(context.input.buttons & 8)) {
        return;
      }

      if (context.localInput === context.input) {
        context.localInput = { ...context.input };
      }

      context.localInput.buttons &= ~8;
    }, 20);

    bridge.onCombatFire((actor, eye, dir) => {
      const auto = Boolean(bridge.hasAutoFireRequest?.('aura'));

      if (!config.enabled || !bridge.active || bridge.uiOpen) {
        return auto ? false : null;
      }

      if (!target) {
        return auto ? false : null;
      }

      const redirected = resolveShot(eye, dir);

      if (!redirected) {
        if (auto) {
          bridge.requestAutoFire('aura', false);
          return false;
        }

        return null;
      }

      lastAttacks.set(target, performance.now());
      return redirected;
    }, 10);

    bridge.provide('aura', {
      isSyntheticAds: () => syntheticAds,
      getTarget: () => target,
      canFireNow,
      getAimPoint: (eye) => {
        if (!target) {
          return null;
        }

        const debug = bridge.getGH()?.debug;
        return debug ? aimPoint(target, eye, debug) : null;
      }
    });

    bridge.onReset(() => {
      releaseAds();
      bridge.requestAutoFire('aura', false);
    });

    installSprintLock();
    setInterval(installSprintLock, 500);
  }
})();
