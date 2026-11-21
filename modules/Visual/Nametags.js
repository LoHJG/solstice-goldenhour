(() => {
  'use strict';

  const CHANNEL = 'solstice-nametags';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

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
    const module = getMod('Nametags');
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
      enabled: Boolean(module.on),
      local: Boolean(setting(module, 'Render Local', false)),
      friends: Boolean(setting(module, 'Show Friends', true)),
      irc: Boolean(setting(module, 'Show IRC Users', true)),
      blur: Math.max(0, Math.min(10, Number(setting(module, 'Blur Strength', 0)) || 0)),
      bps: Boolean(setting(module, 'Show BPS', false)),
      average: Boolean(setting(module, 'Average BPS', true))
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
    name: 'Nametags',
    desc: 'Draws nametags above entities',
    cat: 'Visual',
    nm: { l: 'nametags', ls: 'nametags', n: 'Nametags', ns: 'Nametags' },
    disp: '',
    settings: [
      { t: 'e', n: 'Style', d: 'The style of the nametags.', v: 0, vals: ['Solstice'] },
      { t: 'b', n: 'Show Friends', d: 'Whether or not to render the nametags on friends.', v: 1 },
      { t: 'b', n: 'Render Local', d: 'Whether or not to render the nametags on the local player.', v: 0 },
      { t: 'b', n: 'Show IRC Users', d: 'Whether to show IRC users in the nametags', v: 1 },
      { t: 'n', n: 'Blur Strength', d: 'The strength of the blur.', v: 0.0, min: 0.0, max: 10.0, step: 0.1 },
      { t: 'b', n: 'Show BPS', d: 'Show the BPS of the player', v: 0 },
      { t: 'b', n: 'Average BPS', d: 'Show the average BPS of the player', v: 1 }
    ],
    onRender: syncConfig,
    defaultOn: false,
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
      try {
        installGame(bridge);
      } catch {

      }
    }
    start();
  }

  function installGame(bridge) {
    const FONT_SIZE = 20;
    const PADDING = 5;
    const FRIEND_COLOR = [0, 255, 0];
    const ENEMY_COLOR = [255, 255, 255];
    let config = {
      enabled: false,
      local: false,
      friends: true,
      irc: true,
      blur: 0,
      bps: false,
      average: true
    };
    let overlay = null;
    let overlayCtx = null;
    let overlayWidth = 0;
    let overlayHeight = 0;
    let overlayDpr = 0;
    let renderHookInstalled = false;
    let originalStyle = null;
    const hiddenSprites = new Map();
    const bpsHistory = new Map();

    function ensureOverlay() {
      if (overlay) {
        return overlay;
      }
      if (!document.documentElement) {
        return null;
      }
      const canvas = document.createElement('canvas');
      canvas.id = 'solstice-nametags-overlay';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = [
        'position: fixed',
        'inset: 0',
        'display: block',
        'width: 100%',
        'height: 100%',
        'pointer-events: none',
        'z-index: 2147483647'
      ].join(';');
      document.documentElement.append(canvas);
      overlay = canvas;
      overlayCtx = canvas.getContext('2d');
      resizeOverlay();
      return overlay;
    }

    function resizeOverlay() {
      if (!overlay || !overlayCtx) {
        return;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
        overlay.width = pixelWidth;
        overlay.height = pixelHeight;
      }
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlayWidth = width;
      overlayHeight = height;
      overlayDpr = dpr;
    }

    function clearOverlay() {
      if (!overlayCtx) {
        return;
      }
      overlayCtx.clearRect(0, 0, overlayWidth, overlayHeight);
    }

    function roundRect(context, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + width - r, y);
      context.quadraticCurveTo(x + width, y, x + width, y + r);
      context.lineTo(x + width, y + height - r);
      context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      context.lineTo(x + r, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    }

    function cleanName(value) {
      return String(value || '').replace(/搂./g, '').replace(/\n[\s\S]*$/, '').trim();
    }

    function getRawPlayer(actor) {
      const snapshot = bridge.getRawSnapshot?.();
      if (!snapshot || !Array.isArray(snapshot.players) || actor?.id === undefined) {
        return null;
      }
      return snapshot.players.find((entry) => entry.id === actor.id) || null;
    }

    function actorBps(actor, now) {
      const raw = getRawPlayer(actor);
      let speed = 0;
      if (raw && Number.isFinite(Number(raw.vx)) && Number.isFinite(Number(raw.vz))) {
        speed = Math.hypot(Number(raw.vx), Number(raw.vz));
      } else if (actor?.vel && Number.isFinite(Number(actor.vel.x)) && Number.isFinite(Number(actor.vel.z))) {
        speed = Math.hypot(Number(actor.vel.x), Number(actor.vel.z));
      }
      const key = actor;
      let history = bpsHistory.get(key);
      if (!history) {
        history = [];
        bpsHistory.set(key, history);
      }
      history.push([now, speed]);
      while (history.length && now - history[0][0] > 1000) {
        history.shift();
      }
      let total = 0;
      for (const entry of history) {
        total += entry[1];
      }
      return {
        current: speed,
        average: history.length ? total / history.length : 0
      };
    }

    function installOriginalNameHide() {
      if (!document.documentElement) {
        return;
      }
      if (!originalStyle) {
        originalStyle = document.createElement('style');
        originalStyle.id = 'solstice-nametags-original-hide';
        originalStyle.textContent = [
          '[class*="nametag" i]:not(#solstice-nametags-overlay)',
          '[id*="nametag" i]:not(#solstice-nametags-overlay)',
          '[class*="name-tag" i]:not(#solstice-nametags-overlay)',
          '[id*="name-tag" i]:not(#solstice-nametags-overlay)',
          '[class*="nameplate" i]:not(#solstice-nametags-overlay)',
          '[id*="nameplate" i]:not(#solstice-nametags-overlay)'
        ].map((selector) => `${selector}{display:none!important}`).join('');
        document.documentElement.append(originalStyle);
      }
      const scene = bridge.getGH()?.debug?.gfx?.scene;
      if (!scene || typeof scene.traverse !== 'function') {
        return;
      }
      scene.traverse((object) => {
        if (!object || object === overlay || hiddenSprites.has(object)) {
          return;
        }
        if (!object.isSprite) {
          return;
        }
        const label = String(object.name || '').toLowerCase();
        if (label.includes('nametag') || label.includes('name-tag') || label.includes('nameplate')) {
          hiddenSprites.set(object, object.visible);
          object.visible = false;
        }
      });
    }

    function restoreOriginalNames() {
      originalStyle?.remove();
      originalStyle = null;
      for (const [object, visible] of hiddenSprites) {
        object.visible = visible;
      }
      hiddenSprites.clear();
    }

    function draw() {
      const canvas = ensureOverlay();
      if (!canvas || !overlayCtx) {
        return;
      }
      if (
        window.innerWidth !== overlayWidth ||
        window.innerHeight !== overlayHeight ||
        Math.min(window.devicePixelRatio || 1, 2) !== overlayDpr
      ) {
        resizeOverlay();
      }
      clearOverlay();
      if (!bridge.active || !config.enabled) {
        return;
      }
      const gh = bridge.getGH();
      if (!gh?.ready || gh.G.state !== 'playing') {
        return;
      }
      const debug = gh.debug;
      const player = debug?.player;
      const actors = debug?.match?.actors;
      const thirdPerson = bridge.getFeature('thirdperson');
      const camera = thirdPerson?.getEspCamera?.() || debug?.gfx?.camera;
      if (!camera || !player?.pos || !Array.isArray(actors)) {
        return;
      }
      const point = player.pos.clone();
      const forward = player.pos.clone();
      camera.getWorldDirection(forward);
      const now = performance.now();
      const rows = [];
      for (const actor of actors) {
        if (!actor?.pos || actor.alive === false || actor.isK9) {
          continue;
        }
        const isLocal = actor === player;
        const isFriend = !isLocal && Number(actor.team) === Number(player.team);
        if (isLocal && (!config.local || !thirdPerson?.getEye?.())) {
          continue;
        }
        if (isFriend && !config.friends) {
          continue;
        }
        const actorHeight = Number(actor.e?.h) > 0.2 ? Number(actor.e.h) : 1.8;
        point.set(actor.pos.x, actor.pos.y + actorHeight + 0.2, actor.pos.z);
        const dx = point.x - camera.position.x;
        const dy = point.y - camera.position.y;
        const dz = point.z - camera.position.z;
        if (dx * forward.x + dy * forward.y + dz * forward.z <= 0.06) {
          continue;
        }
        point.project(camera);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
          continue;
        }
        if (point.z < -1 || point.z > 1) {
          continue;
        }
        const screenX = (point.x * 0.5 + 0.5) * overlayWidth;
        const screenY = (-point.y * 0.5 + 0.5) * overlayHeight;
        if (screenX < -100 || screenY < -100 || screenX > overlayWidth + 100 || screenY > overlayHeight + 100) {
          continue;
        }
        let name = cleanName(isLocal ? player.name : actor.name);
        if (!name) {
          continue;
        }
        if (config.bps) {
          const bps = actorBps(actor, now);
          const value = config.average ? bps.average : bps.current;
          name += ` [${value.toFixed(2)}]`;
        }
        const distance = (actor.pos.x - player.pos.x) ** 2 + (actor.pos.z - player.pos.z) ** 2;
        rows.push({
          name,
          x: screenX,
          y: screenY,
          distance,
          color: isFriend ? FRIEND_COLOR : ENEMY_COLOR
        });
      }
      rows.sort((a, b) => b.distance - a.distance);
      overlayCtx.textBaseline = 'top';
      overlayCtx.textAlign = 'left';
      overlayCtx.font = `600 ${FONT_SIZE}px "Product Sans", sans-serif`;
      for (const row of rows) {
        const textWidth = overlayCtx.measureText(row.name).width;
        const posX = row.x - textWidth / 2;
        const posY = row.y - FONT_SIZE - 5;
        const rectX = posX - PADDING;
        const rectY = posY - PADDING;
        const rectW = textWidth + PADDING * 2;
        const rectH = FONT_SIZE + PADDING * 2;
        overlayCtx.save();
        if (config.blur > 0) {
          overlayCtx.filter = `blur(${Math.min(12, config.blur * 2)}px)`;
        }
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        roundRect(overlayCtx, rectX, rectY, rectW, rectH, 10);
        overlayCtx.fill();
        overlayCtx.restore();
        overlayCtx.fillStyle = `rgb(${row.color[0]}, ${row.color[1]}, ${row.color[2]})`;
        overlayCtx.fillText(row.name, posX, posY);
      }
    }

    function installRenderHook() {
      const gfx = bridge.getGH()?.debug?.gfx;
      if (!gfx || typeof gfx.render !== 'function' || gfx.render.__solsticeNametagsWrapped) {
        return;
      }
      const originalRender = gfx.render;
      const wrappedRender = function wrappedRender(...args) {
        const result = originalRender.apply(this, args);
        try {
          draw();
        } catch {

        }
        return result;
      };
      Object.defineProperty(wrappedRender, '__solsticeNametagsWrapped', { value: true });
      gfx.render = wrappedRender;
      renderHookInstalled = true;
    }

    function fallbackDrawLoop() {
      window.requestAnimationFrame(fallbackDrawLoop);
      if (!renderHookInstalled) {
        try {
          draw();
        } catch {

        }
      }
    }

    function applyConfig(data) {
      if (data.type !== 'config') {
        return;
      }
      config = {
        enabled: Boolean(data.enabled),
        local: Boolean(data.local),
        friends: data.friends !== false,
        irc: data.irc !== false,
        blur: Math.max(0, Math.min(10, Number(data.blur) || 0)),
        bps: Boolean(data.bps),
        average: data.average !== false
      };
      if (config.enabled) {
        installOriginalNameHide();
      } else {
        restoreOriginalNames();
        clearOverlay();
      }
    }
    bridge.onConfig(CHANNEL, applyConfig);

    window.addEventListener('resize', resizeOverlay);
    installRenderHook();
    setInterval(installRenderHook, 250);
    setInterval(() => {
      if (config.enabled) {
        installOriginalNameHide();
      }
    }, 1000);
    window.requestAnimationFrame(fallbackDrawLoop);
  }
})();
