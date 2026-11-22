(() => {
  'use strict';

  const CHANNEL = 'solstice-customserver';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HVH_ORIGIN = 'https://play.yokaicat.cc:8123';
  const MODES = ['Official', 'HVH', 'Custom'];
  const STORAGE_KEY = 'solstice.customserver';
  let stateCache = null;

  function normalizeServer(value) {
    let text = String(value || '').trim();
    if (!text) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    const url = new URL(text);
    if (url.protocol !== 'https:') throw new Error('服务器必须使用 https/wss');
    if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('服务器格式必须是 host:port');
    }
    return url.origin;
  }

  if (location.hostname === 'www.bilibilitoy.com' && location.pathname.startsWith('/toy/golden-hour/')) {
    bootGame();
    return;
  }

  function loadState() {
    if (stateCache) return stateCache;

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      stateCache = {
        mode: Math.min(2, Math.max(0, Number(saved.mode) || 0)),
        custom: typeof saved.custom === 'string' ? saved.custom : ''
      };
    } catch {
      stateCache = { mode: 0, custom: '' };
    }

    return stateCache;
  }

  function saveState(mode, custom) {
    const next = {
      mode: Math.min(2, Math.max(0, Number(mode) || 0)),
      custom: typeof custom === 'string' ? custom : ''
    };

    if (stateCache && stateCache.mode === next.mode && stateCache.custom === next.custom) {
      return;
    }

    stateCache = next;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {

    }
  }

  function modeSetting(mod) {
    return mod?.settings?.find((setting) => setting.n === 'Mode');
  }

  function selectedServer(mod) {
    const mode = Number(modeSetting(mod)?.v) || 0;
    if (mode === 1) return HVH_ORIGIN;
    if (mode === 2) {
      try {
        return normalizeServer(loadState().custom);
      } catch {
        return '';
      }
    }
    return '';
  }

  let frameCache = null;
  let frameCacheAt = 0;

  function findGameFrames() {
    const now = performance.now();

    if (frameCache && now - frameCacheAt < 1000 &&
        frameCache.every((frame) => frame.isConnected)) {
      return frameCache;
    }

    const frames = [];
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`)) frames.push(frame);
    }
    frameCache = frames;
    frameCacheAt = now;
    return frames;
  }

  let lastSentKey = '';
  let lastSentAt = 0;

  function syncConfig() {
    const mod = getMod('CustomServer');
    if (!mod) return;
    const setting = modeSetting(mod);
    const state = loadState();
    const target = mod.on ? selectedServer(mod) : '';
    const config = {
      channel: CHANNEL,
      type: 'config',
      enabled: Boolean(mod.on),
      mode: Number(setting?.v) || 0,
      target
    };
    const key = JSON.stringify(config);
    const now = performance.now();
    if (key === lastSentKey && now - lastSentAt < 500) return;
    for (const frame of findGameFrames()) {
      if (!frame.contentWindow) continue;
      frame.contentWindow.postMessage(config, GAME_ORIGIN);
    }
    lastSentKey = key;
    lastSentAt = now;
    saveState(Number(setting?.v) || 0, state.custom);
  }

  function applyState() {
    const mod = getMod('CustomServer');
    const setting = modeSetting(mod);
    if (!setting) return;
    const state = loadState();
    setting.v = state.mode;
    saveState(state.mode, state.custom);
  }

  register({
    name: 'CustomServer',
    desc: 'Selects Official, HVH or a custom HTTPS server.',
    cat: 'Misc',
    nm: {
      l: 'customserver',
      ls: 'custom server',
      n: 'CustomServer',
      ns: 'Custom Server'
    },
    disp: '',
    settings: [
      {
        t: 'e',
        n: 'Mode',
        d: 'Official server, HVH server, or a custom HTTPS server.',
        v: 0,
        vals: MODES
      }
    ],
    onRender: syncConfig,
    defaultOn: true,
    onInit: applyState,
    onEnable() {
      lastSentKey = '';
      lastSentAt = 0;
      syncConfig();
    }
  });

  function setCustom(address) {
    const target = normalizeServer(address);
    if (!target) throw new Error('服务器地址不能为空');
    const mod = getMod('CustomServer');
    const setting = modeSetting(mod);
    if (!setting) throw new Error('CustomServer 尚未加载');
    if (!mod.on && typeof setModuleOn === 'function') setModuleOn(mod, true);
    setting.v = 2;
    saveState(2, target);
    lastSentKey = '';
    lastSentAt = 0;
    syncConfig();
    return target;
  }

  function current() {
    const mod = getMod('CustomServer');
    const setting = modeSetting(mod);
    const mode = Number(setting?.v) || 0;
    return {
      mode: MODES[mode] || MODES[0],
      target: mod?.on ? selectedServer(mod) : ''
    };
  }

  window.SolsticeCustomServer = { set: setCustom, current };

  function bootGame() {
    const originalApiOrigin = document.documentElement.dataset.apiOrigin || '';
    const originalTransport = document.documentElement.dataset.preferredTransport || '';
    let target = '';
    let bridge = null;

    function setTarget(value) {
      target = value ? normalizeServer(value) : '';
      document.documentElement.dataset.apiOrigin = target || originalApiOrigin;
      document.documentElement.dataset.preferredTransport = target ? 'webrtc' : originalTransport;
    }

    function rewriteHttp(value) {
      if (!target) return value;
      let url;
      try {
        url = new URL(String(value), location.href);
      } catch {
        return value;
      }
      if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/assets/maps/')) return value;
      const next = new URL(target);
      next.pathname = url.pathname;
      next.search = url.search;
      next.hash = url.hash;
      return next.href;
    }

    function rewriteSocket(value) {
      if (!target) return value;
      let url;
      try {
        url = new URL(String(value), location.href);
      } catch {
        return value;
      }
      if (!url.pathname.startsWith('/api/')) return value;
      const next = new URL(target);
      next.protocol = 'wss:';
      next.pathname = url.pathname;
      next.search = url.search;
      next.hash = url.hash;
      return next.href;
    }

    const originalFetch = window.fetch;
    window.fetch = async function customServerFetch(input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      const rewritten = rewriteHttp(url);
      const request = rewritten === url ? input : rewritten;
      const response = await originalFetch.call(this, request, init);
      if (!target || !rewritten || !rewritten.includes('/api/config')) return response;
      try {
        const config = await response.clone().json();
        if (config?.rtc?.url) {
          const rtc = new URL(config.rtc.url, location.href);
          config.rtc.url = `${rtc.pathname}${rtc.search}`;
        }
        return new Response(JSON.stringify(config), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch {
        return response;
      }
    };

    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) {
      window.EventSource = new Proxy(OriginalEventSource, {
        construct(ctor, args) {
          args[0] = rewriteHttp(args[0]);
          return new ctor(...args);
        }
      });
    }

    if (typeof window.WebSocket === 'function') {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(ctor, args) {
          args[0] = rewriteSocket(args[0]);
          return new ctor(...args);
        }
      });
    }

    function installBridge() {
      bridge = window.SolsticeGame;
      if (!bridge) {
        setTimeout(installBridge, 25);
        return;
      }
      bridge.onConfig(CHANNEL, (data) => {
        if (data?.type !== 'config') return;
        try {
          setTarget(data.enabled ? data.target : '');
        } catch {

        }
      });
    }

    installBridge();
  }
})();
