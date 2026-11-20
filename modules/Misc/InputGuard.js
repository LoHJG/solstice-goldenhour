(() => {
  'use strict';

  /* 输入守卫：把浏览器 / 系统的快捷键挡在游戏之外，并让侧键可当绑定键。
     设置由 commands.js 直接读取（guardValue），这里负责把开关推给游戏 iframe。 */

  const CHANNEL = 'solstice-input-guard';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HEARTBEAT_MS = 1000;

  let lastKey = '';
  let lastAt = 0;
  let playing = false;
  let closeArmed = false;

  function findGameFrame() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`)) {
        return frame;
      }
    }

    return null;
  }

  /* Ctrl+W 是浏览器保留键，页面拦不住；只能在关页面前挂一道确认闸 */
  function onBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  function armCloseGuard(wanted) {
    if (wanted === closeArmed) {
      return;
    }

    closeArmed = wanted;

    if (wanted) {
      window.addEventListener('beforeunload', onBeforeUnload);
    } else {
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== GAME_ORIGIN) {
      return;
    }

    const frame = findGameFrame();

    if (!frame || frame.contentWindow !== event.source) {
      return;
    }

    const data = event.data;

    if (data && data.channel === 'solstice-input' && data.type === 'state') {
      playing = Boolean(data.playing);
    }
  });

  function value(module, name, fallback) {
    const setting = module.settings.find((entry) => entry.n === name);
    return setting ? Boolean(setting.v) : fallback;
  }

  function sync() {
    const module = getMod('InputGuard');

    if (!module) {
      return;
    }

    armCloseGuard(value(module, 'Guard Close', true) && playing);

    const message = {
      channel: CHANNEL,
      type: 'guard',
      swallow: value(module, 'Swallow Shortcuts', true),
      mouse: value(module, 'Mouse Binds', true)
    };
    const key = JSON.stringify(message);
    const now = performance.now();

    if (key === lastKey && now - lastAt < HEARTBEAT_MS) {
      return;
    }

    const frame = findGameFrame();

    if (!frame?.contentWindow) {
      return;
    }

    frame.contentWindow.postMessage(message, GAME_ORIGIN);
    lastKey = key;
    lastAt = now;
  }

  register({
    name: 'InputGuard',
    desc: 'Stops browser hotkeys from firing and allows mouse side buttons as binds.',
    cat: 'Misc',
    nm: { l: 'inputguard', ls: 'input guard', n: 'InputGuard', ns: 'Input Guard' },
    disp: '',
    settings: [
      { t: 'b', n: 'Swallow Shortcuts', d: 'Blocks Ctrl / Alt / Win combos while the game has focus.', v: 1 },
      { t: 'b', n: 'Mouse Binds', d: 'Allows Mouse3 / Mouse4 / Mouse5 as keybinds.', v: 1 },
      { t: 'b', n: 'In Game Only', d: 'Keybinds only fire while a match is running.', v: 0 },
      { t: 'b', n: 'Guard Close', d: 'Asks for confirmation before a match gets closed by a shortcut.', v: 1 }
    ],
    renderOrder: 5,
    onRender: sync,
    defaultOn: true,
    onEnable() {}
  });
})();
