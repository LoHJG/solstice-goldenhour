(() => {
  'use strict';

  const CHANNEL = 'solstice-customserver';
  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const HVH_ORIGIN = 'https://play.yokaicat.cc:8123';
  const LOCALHOST_ORIGIN = 'http://127.0.0.1:8123';
  const MODES = ['Official', 'HVH', 'LocalHost', 'Custom'];
  const STORAGE_KEY = 'solstice.customserver';
  const STORAGE_VERSION = 2;
  let stateCache = null;

  function normalizeServer(value) {
    let text = String(value || '').trim();
    if (!text) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    const url = new URL(text);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      throw new Error('服务器必须使用 https/wss，或本机 http/ws');
    }
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
      let mode = Number(saved.mode) || 0;
      if (saved.version !== STORAGE_VERSION && mode >= 2) mode += 1;
      stateCache = {
        mode: Math.min(3, Math.max(0, mode)),
        custom: typeof saved.custom === 'string' ? saved.custom : ''
      };
    } catch {
      stateCache = { mode: 0, custom: '' };
    }

    return stateCache;
  }

  function saveState(mode, custom) {
    const next = {
      mode: Math.min(3, Math.max(0, Number(mode) || 0)),
      custom: typeof custom === 'string' ? custom : ''
    };

    if (stateCache && stateCache.mode === next.mode && stateCache.custom === next.custom) {
      return;
    }

    stateCache = next;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, version: STORAGE_VERSION }));
    } catch {

    }
  }

  function modeSetting(mod) {
    return mod?.settings?.find((setting) => setting.n === 'Mode');
  }

  function selectedServer(mod) {
    const mode = Number(modeSetting(mod)?.v) || 0;
    if (mode === 1) return HVH_ORIGIN;
    if (mode === 2) return LOCALHOST_ORIGIN;
    if (mode === 3) {
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

  function allowLocalNetwork(frames) {
    for (const frame of frames) {
      const allow = (frame.getAttribute('allow') || '')
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean);
      let changed = false;

      for (const feature of ['local-network', 'loopback-network']) {
        if (!allow.includes(feature)) {
          allow.push(feature);
          changed = true;
        }
      }

      if (!changed) continue;

      frame.setAttribute('allow', allow.join('; '));

      try {
        frame.src = frame.src;
      } catch {

      }
    }
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
    const frames = findGameFrames();
    const localHostMode = Number(setting?.v) === 2 && target.startsWith('http:');
    if (localHostMode) allowLocalNetwork(frames);
    for (const frame of frames) {
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
  game: "goldenhour",
    name: 'CustomServer',
    desc: 'Selects Official, HVH, LocalHost or a custom HTTPS server.',
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
        d: 'Official, HVH, LocalHost (http/ws) or a custom HTTPS server.',
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
    setting.v = 3;
    saveState(3, target);
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
    let permissionBox = null;
    let permissionRequest = 0;

    function hideLoopbackPermission() {
      permissionRequest += 1;
      permissionBox?.remove();
      permissionBox = null;
    }

    function showLoopbackPermission(state) {
      if (permissionBox) return;

      if (!document.body) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => showLoopbackPermission(state), { once: true });
        } else {
          setTimeout(() => showLoopbackPermission(state), 50);
        }
        return;
      }

      const box = document.createElement('div');
      box.id = 'solstice-loopback-permission';
      box.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:50%',
        'transform:translate(-50%,-50%)',
        'z-index:2147483647',
        'width:min(420px,calc(100vw - 32px))',
        'padding:18px',
        'border:1px solid #ff5fa2',
        'border-radius:10px',
        'background:rgba(16,16,20,.96)',
        'color:#fff',
        'font:14px/1.5 system-ui,sans-serif',
        'text-align:center',
        'box-shadow:0 12px 40px rgba(0,0,0,.6)'
      ].join(';');

      const title = document.createElement('div');
      title.textContent = 'LocalHost 需要本地网络权限';
      title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:8px';

      const text = document.createElement('div');
      text.textContent = state === 'denied'
        ? 'Chrome 已拒绝 Loopback network。请在站点设置中允许本地网络访问，然后刷新游戏。'
        : 'Chrome 需要你允许访问 127.0.0.1，授权后才能连接本地服务器。';

      box.append(title, text);

      if (state !== 'denied') {
        const button = document.createElement('button');
        button.textContent = '授权并连接';
        button.style.cssText = [
          'margin-top:14px',
          'padding:8px 16px',
          'border:0',
          'border-radius:6px',
          'background:#ff5fa2',
          'color:#fff',
          'font:600 14px system-ui,sans-serif',
          'cursor:pointer'
        ].join(';');
        button.addEventListener('click', async () => {
          button.disabled = true;
          button.textContent = '请求中…';

          try {
            const response = await fetch(new URL('/api/health', target).href, {
              method: 'GET',
              mode: 'cors',
              cache: 'no-store',
              targetAddressSpace: 'loopback'
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            text.textContent = '已授权，正在重新加载…';
            setTimeout(() => location.reload(), 350);
          } catch (cause) {
            button.disabled = false;
            button.textContent = '重试';
            text.textContent = `授权失败：${cause.message || cause}`;
          }
        });
        box.append(button);
      }

      document.body.append(box);
      permissionBox = box;
    }

    async function requestLoopbackPermission() {
      if (!target.startsWith('http:')) {
        hideLoopbackPermission();
        return;
      }

      const request = ++permissionRequest;
      let state = 'prompt';

      try {
        const status = await navigator.permissions.query({ name: 'loopback-network' });
        state = status.state;
      } catch {

      }

      if (request !== permissionRequest || !target.startsWith('http:')) return;
      if (state === 'granted') {
        hideLoopbackPermission();
        return;
      }

      showLoopbackPermission(state);
    }

    function setTarget(value, localHostMode) {
      target = value ? normalizeServer(value) : '';
      document.documentElement.dataset.apiOrigin = target || originalApiOrigin;
      document.documentElement.dataset.preferredTransport = target
        ? (target.startsWith('https:') ? 'webrtc' : '')
        : originalTransport;

      if (localHostMode && target.startsWith('http:')) {
        requestLoopbackPermission();
      } else {
        hideLoopbackPermission();
      }
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
      next.protocol = target.startsWith('http:') ? 'ws:' : 'wss:';
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
      const options = target.startsWith('http:')
        ? { ...(init || {}), targetAddressSpace: 'loopback' }
        : init;
      const response = await originalFetch.call(this, request, options);
      if (!target || !rewritten || !rewritten.includes('/api/config')) return response;
      try {
        const config = await response.clone().json();

        if (target.startsWith('http:')) {
          delete config.rtc;
          delete config.url;
          config.preferredTransport = 'websocket';
        }

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
          setTarget(data.enabled ? data.target : '', Number(data.mode) === 2);
        } catch {

        }
      });
    }

    installBridge();
  }
})();
