

(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-combat';
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
    const module = getMod('AntiAim');

    if (!module) {
      return;
    }

    const now = performance.now();
    const modeSetting = module.settings.find((entry) => entry.n === 'Mode');
    const config = {
      channel: CHANNEL,
      type: 'config',
      module: 'antiaim',
      enabled: Boolean(module.on),
      mode: modeSetting?.vals?.[modeSetting.v] || 'Jiggle'
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
    name: 'AntiAim',
    desc: 'Jiggles or points your server-side view away from enemies.',
    cat: "Player",
    nm: { l: 'antiaim', ls: 'anti aim', n: 'AntiAim', ns: 'Anti Aim' },
    disp: 'Mode',
    settings: [
      { t: 'e', n: 'Mode', d: 'The anti-aim style.', v: 0, vals: ['Jiggle', 'Yaw'] }
    ],
    onRender: syncConfig,
    onEnable() {
      syncConfig();
    }
  });

  setInterval(syncConfig, 250);

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
    let mode = 'Jiggle';
    let lastAngles = null;
    let jiggleSide = 1;
    let nextJiggle = 0;

    function anglesToPoint(eye, point) {
      const dx = point.x - eye.x;
      const dy = point.y - eye.y;
      const dz = point.z - eye.z;

      return {
        yaw: Math.atan2(-dx, -dz),
        pitch: Math.atan2(dy, Math.hypot(dx, dz))
      };
    }

    function antiAngles(player, actors) {
      const enemy = bridge.nearestEnemy(player, actors);

      if (!enemy) {
        return {
          yaw: bridge.wrapAngle(player.yaw + Math.PI),
          pitch: -1.0
        };
      }

      const dx = enemy.pos.x - player.pos.x;
      const dz = enemy.pos.z - player.pos.z;
      const towardYaw = Math.atan2(-dx, -dz);

      return {
        yaw: bridge.wrapAngle(towardYaw + Math.PI),
        pitch: -1.0
      };
    }

    function jiggleAngles(player) {
      const now = performance.now();

      if (now >= nextJiggle) {
        jiggleSide = -jiggleSide;
        nextJiggle = now + 35 + Math.random() * 25;
      }

      return {
        yaw: bridge.wrapAngle(player.yaw + jiggleSide * 0.6),
        pitch: bridge.clamp(player.pitch - 0.2, -1.5, 1.5)
      };
    }

    function spoofFor(player, camera, actors) {
      const aura = bridge.getFeature('aura');
      let angles;

      if (aura?.getTarget?.() && aura.canFireNow?.()) {
        const point = aura.getAimPoint?.(camera.position);

        if (point) {
          angles = anglesToPoint(camera.position, point);
        }
      }

      if (!angles) {
        angles = mode === 'Jiggle' ? jiggleAngles(player) : antiAngles(player, actors);
      }

      lastAngles = angles;
      return angles;
    }

    bridge.onConfig('solstice-combat', (data) => {
      if (data.type === 'config' && data.module === 'antiaim') {
        enabled = Boolean(data.enabled);
        mode = data.mode === 'Yaw' ? 'Yaw' : 'Jiggle';

        if (!enabled) {
          lastAngles = null;
          nextJiggle = 0;
        }
      }
    });

    bridge.provide('antiaim', {
      getAngles: () => lastAngles
    });

    bridge.onWorldMove((context) => {
      if (!enabled || !document.body.classList.contains('online-session')) {
        return;
      }

      const game = bridge.getContext();

      if (!game || !context.input) {
        return;
      }

      const spoof = spoofFor(game.player, game.camera, game.actors);

      if (!spoof) {
        return;
      }

      if (context.localInput === context.input) {
        context.localInput = { ...context.input };
      }

      const input = context.input;
      const localYaw = Number(input.yaw) || 0;
      const localPitch = Number(input.pitch) || 0;
      const forward = Number(input.forward) || 0;
      const right = Number(input.right) || 0;
      const worldX = -Math.sin(localYaw) * forward + Math.cos(localYaw) * right;
      const worldZ = -Math.cos(localYaw) * forward - Math.sin(localYaw) * right;
      const sin = Math.sin(spoof.yaw);
      const cos = Math.cos(spoof.yaw);

      input.yaw = spoof.yaw;
      input.pitch = spoof.pitch;
      input.forward = -sin * worldX - cos * worldZ;
      input.right = cos * worldX - sin * worldZ;

      queueMicrotask(() => {
        if (input.yaw !== spoof.yaw || input.pitch !== spoof.pitch) {
          return;
        }

        input.yaw = localYaw;
        input.pitch = localPitch;
        input.forward = forward;
        input.right = right;
      });
    }, 30);
  }
})();
