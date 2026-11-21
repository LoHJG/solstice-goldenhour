(() => {
  'use strict';

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  const CHANNEL = 'solstice-camera';
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
    const module = getMod('ThirdPerson');

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
      distance: Math.max(1, Math.min(10, Number(setting(module, 'Distance', 4)) || 4)),
      height: Math.max(-1, Math.min(2, Number(setting(module, 'Height', 0.35)) || 0))
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
    name: 'ThirdPerson',
    desc: 'Renders the local player from a third-person camera.',
    cat: 'Visual',
    nm: { l: 'thirdperson', ls: 'third person', n: 'ThirdPerson', ns: 'Third Person' },
    disp: 'Distance',
    settings: [
      { t: 'n', n: 'Distance', d: 'Camera distance behind the player.', v: 4, min: 1, max: 10, step: 0.1 },
      { t: 'n', n: 'Height', d: 'Camera height offset.', v: 0.35, min: -1, max: 2, step: 0.05 }
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
    let config = { distance: 4, height: 0.35 };
    let camera = null;
    let espCamera = null;
    let eye = null;
    let character = null;
    let owner = null;
    let deadBody = null;
    let savedLocal = null;
    let originalRender = null;
    let renderHooked = false;
    let direction = null;
    let buildKey = '';

    function gh() {
      return window.GH;
    }

    function debug() {
      return gh()?.debug;
    }

    function playing() {
      const state = gh()?.G?.state;
      return Boolean(
        enabled &&
        bridge.active &&
        (state === 'playing' || state === 'paused')
      );
    }

    function directionVector() {
      if (!direction) {
        direction = debug()?.gfx?.camera?.position?.clone?.() || null;
      }

      return direction;
    }

    function anglesToPoint(origin, point) {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const dz = point.z - origin.z;

      return {
        yaw: Math.atan2(-dx, -dz),
        pitch: Math.atan2(dy, Math.hypot(dx, dz))
      };
    }

    function modelAngles(player) {
      const origin = player.eye?.clone?.() || player.pos.clone();
      const aura = bridge.getFeature('aura');

      if (aura?.getTarget?.()) {
        const point = aura.getAimPoint?.(origin);

        if (point) {
          return anglesToPoint(origin, point);
        }
      }

      const antiAim = bridge.getFeature('antiaim');
      const angles = antiAim?.getAngles?.();

      if (angles) {
        return {
          yaw: Number(angles.yaw) || 0,
          pitch: Number(angles.pitch) || 0
        };
      }

      return {
        yaw: Number(player.yaw) || 0,
        pitch: Number(player.pitch) || 0
      };
    }

    function takeCharacter() {
      const context = debug();
      const player = context?.player;

      if (!context || !player) {
        return false;
      }

      const bots = Array.isArray(context.match?.bots) ? context.match.bots : [];
      const template = bots.find((actor) => (
        actor !== player &&
        typeof actor.constructor === 'function' &&
        actor.ctx?.createCharacter
      ));

      if (!template) {
        return createStandaloneCharacter(context, player);
      }

      try {
        const twin = new template.constructor(template.ctx, {
          team: player.team,
          name: 'Solstice',
          weapon: player.def?.id || 'ar'
        });

        twin.alive = false;
        twin.respawnT = 1e9;
        twin.target = null;
        twin.fragP = null;

        owner = twin;
        character = twin.char;
        character.reset?.();
        character.setOpacity?.(1);
        character.setWeapon?.(player.def?.id || 'ar');
        character.root.name = 'solstice-thirdperson';
        character.root.visible = true;
        return true;
      } catch {
        return createStandaloneCharacter(context, player);
      }
    }

    function createStandaloneCharacter(context, player) {
      const botCtx = context.match?.ctx?.botCtx || context.ctx?.botCtx;

      if (!botCtx?.createCharacter) {
        return false;
      }

      const slot = context.arsenal?.slot;
      const weapon = slot?.def?.id || player.def?.id || 'ar';
      const build = slot?.def?.build || player.def?.build || null;

      try {
        const char = botCtx.createCharacter({
          team: player.team,
          gunFactory: (id) => botCtx.worldGun(id, id === weapon ? build : null),
          ground: (x, z, y) => botCtx.world.groundAt(x, z, y)
        });

        char.root.name = 'solstice-thirdperson';
        char.root.visible = false;
        char.setWeapon(weapon);
        char.reset?.();
        char.setOpacity?.(1);
        botCtx.scene.add(char.root);

        import(new URL('client/scene-layers.js', location.href).href)
          .then(({ nativeSceneLayers }) => {
            try {
              nativeSceneLayers(debug())?.share(char.root);
            } catch {

            }
          })
          .catch(() => {

          });

        char.root.visible = true;
        character = char;
        owner = { rigs: [char], synthetic: true };
        return true;
      } catch {
        return false;
      }
    }

    function hideLocal() {
      const context = debug();

      if (savedLocal || !context) {
        return;
      }

      const vm = context.vm;
      const fpbody = context.fpbody;
      savedLocal = {
        vm: vm?.scene ? vm.scene.visible : null,
        vmRig: vm?.rig ? vm.rig.visible : null,
        fpEnabled: fpbody ? fpbody.enabled : null,
        fpRoot: fpbody?.op?.root ? fpbody.op.root.visible : null,
        fpRest: fpbody?.rest ? fpbody.rest.visible : null,
        fpPud: fpbody?.pud ? fpbody.pud.visible : null
      };

      if (vm?.scene) {
        vm.scene.visible = false;
      }

      if (vm?.rig) {
        vm.rig.visible = false;
      }

      if (fpbody) {
        fpbody.enabled = false;
      }

      if (fpbody?.op?.root) {
        fpbody.op.root.visible = false;
      }

      if (fpbody?.rest) {
        fpbody.rest.visible = false;
      }

      if (fpbody?.pud) {
        fpbody.pud.visible = false;
      }
    }

    function restoreLocal() {
      const context = debug();

      if (!savedLocal || !context) {
        savedLocal = null;
        return;
      }

      if (context.vm?.scene && savedLocal.vm !== null) {
        context.vm.scene.visible = savedLocal.vm;
      }

      if (context.vm?.rig && savedLocal.vmRig !== null) {
        context.vm.rig.visible = savedLocal.vmRig;
      }

      if (context.fpbody && savedLocal.fpEnabled !== null) {
        context.fpbody.enabled = savedLocal.fpEnabled;
      }

      if (context.fpbody?.op?.root && savedLocal.fpRoot !== null) {
        context.fpbody.op.root.visible = savedLocal.fpRoot;
      }

      if (context.fpbody?.rest && savedLocal.fpRest !== null) {
        context.fpbody.rest.visible = savedLocal.fpRest;
      }

      if (context.fpbody?.pud && savedLocal.fpPud !== null) {
        context.fpbody.pud.visible = savedLocal.fpPud;
      }

      savedLocal = null;
    }

    function updateCharacter(dt) {
      const context = debug();
      const player = context?.player;

      if (!context || !player?.pos) {
        return false;
      }

      if (!character && !takeCharacter()) {
        return false;
      }

      if (!player.alive) {
        character.root.visible = true;

        if (!deadBody && context.physics?.addRagdoll) {
          try {
            deadBody = context.physics.addRagdoll(
              character,
              player.vel,
              null,
              { x: 0, y: 0, z: 0 }
            );
          } catch {
            deadBody = null;
          }
        }

        return true;
      }

      if (deadBody) {
        context.physics?.removeBody?.(deadBody);
        deadBody = null;
        character.root.visible = true;
      }

      const slot = context.arsenal?.slot;
      const weapon = player.def?.id || slot?.def?.id || context.arsenal?.def?.id;
      const build = player.def?.build || slot?.def?.build || null;
      const nextBuildKey = `${weapon || ''}:${JSON.stringify(build || {})}`;
      const worldGun = owner?.ctx?.worldGun;

      if (weapon && worldGun && buildKey !== nextBuildKey) {
        character.gunFactory = (id) => worldGun(id, id === weapon ? build : null);
        character.weaponId = null;
        character.setWeapon(weapon);
        buildKey = nextBuildKey;
      } else if (weapon && character.weaponId !== weapon) {
        character.setWeapon(weapon);
      }

      const angles = modelAngles(player);
      const speed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
      const sin = Math.sin(player.yaw || 0);
      const cos = Math.cos(player.yaw || 0);
      const vx = player.vel?.x || 0;
      const vz = player.vel?.z || 0;
      const mode = player.mode;
      const stance = mode === 'slide'
        ? 'slide'
        : mode === 'dive'
          ? 'dive'
          : mode === 'prone'
            ? 'prone'
            : player.stance === 'crouch'
              ? 'crouch'
              : 'stand';

      character.root.visible = true;
      character.update(
        Math.max(0.0001, Math.min(Number(dt) || 0.016, 0.05)),
        {
          pos: player.pos,
          yaw: angles.yaw,
          pitch: angles.pitch,
          speed,
          moveX: (vx * cos - vz * sin) / (speed || 1),
          moveZ: (vx * sin + vz * cos) / (speed || 1),
          stance,
          sprint: Boolean(player.sprinting) && mode !== 'slide',
          airborne: !player.e?.onGround,
          reloading: context.arsenal?.state === 'reload',
          engage: 1,
          aimYaw: angles.yaw,
          look: null,
          reloadDur: Number(context.arsenal?.clipDur) > 0 ? Number(context.arsenal.clipDur) : 2.2,
          axis: null
        }
      );

      return true;
    }

    function updateEspCamera(activeCamera, position) {
      if (!activeCamera) {
        espCamera = null;
        return;
      }

      if (!espCamera) {
        espCamera = activeCamera.clone();
      }

      espCamera.position.copy(position);
      espCamera.quaternion.copy(activeCamera.quaternion);
      espCamera.fov = activeCamera.fov;
      espCamera.aspect = activeCamera.aspect;
      espCamera.near = activeCamera.near;
      espCamera.far = activeCamera.far;
      espCamera.updateProjectionMatrix();
      espCamera.updateMatrixWorld(true);
    }

    function renderWrapped(...args) {
      const context = debug();
      const activeCamera = context?.gfx?.camera;

      if (enabled) {
        hideLocal();
      }

      if (!playing() || !activeCamera) {
        espCamera = null;
        return originalRender.apply(this, args);
      }

      updateCharacter(args[0]);

      if (!character) {
        restoreLocal();
        espCamera = null;
        return originalRender.apply(this, args);
      }

      const saved = activeCamera.position.clone();
      const origin = context.player.eye?.clone?.() || saved.clone();
      activeCamera.updateMatrixWorld(true);
      const forward = activeCamera.getWorldDirection(directionVector());
      const position = origin.clone().addScaledVector(forward, -config.distance);
      position.y += config.height;

      eye = origin.clone();
      activeCamera.position.copy(position);
      activeCamera.updateMatrixWorld(true);
      updateEspCamera(activeCamera, position);

      try {
        return originalRender.apply(this, args);
      } finally {
        activeCamera.position.copy(saved);
        activeCamera.updateMatrixWorld(true);
      }
    }

    function installRenderHook() {
      const gfx = debug()?.gfx;

      if (renderHooked || !gfx || typeof gfx.render !== 'function') {
        return;
      }

      originalRender = gfx.render;
      renderWrapped.__solsticeThirdPersonHooked = true;
      gfx.render = renderWrapped;
      renderHooked = true;
    }

    function releaseCharacter() {
      if (deadBody) {
        debug()?.physics?.removeBody?.(deadBody);
        deadBody = null;
      }

      if (character) {
        character.root.visible = false;
      }

      if (owner) {
        const rigs = Array.isArray(owner.rigs) ? owner.rigs : [];

        for (const rig of rigs) {
          rig.root.removeFromParent();
          rig.dispose?.();
        }
      }

      character = null;
      owner = null;
      eye = null;
      espCamera = null;
    }

    function setEnabled(next) {
      if (enabled === next) {
        return;
      }

      enabled = next;

      if (enabled) {
        hideLocal();
        installRenderHook();
      } else {
        restoreLocal();
        releaseCharacter();
      }
    }

    bridge.onConfig('solstice-camera', (data) => {
      if (data.type !== 'config') {
        return;
      }

      config = {
        distance: Math.max(1, Math.min(10, Number(data.distance) || 4)),
        height: Math.max(-1, Math.min(2, Number(data.height) || 0))
      };
      setEnabled(Boolean(data.enabled));
    });

    bridge.provide('thirdperson', {
      getEye: () => (enabled ? eye : null),
      getEspCamera: () => (enabled ? espCamera : null),
      isEnabled: () => enabled
    });

    setInterval(installRenderHook, 500);
  }
})();
