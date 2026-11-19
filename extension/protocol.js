

(function defineSolsticeProtocol() {
  'use strict';

  const CHANNEL = 'solstice';
  const PROTOCOL_VERSION = 1;

  const TARGET = Object.freeze({
    href: 'https://www.bilibili.com/toy/golden-hour/index.html',
    hostname: 'www.bilibili.com',
    pathname: '/toy/golden-hour/index.html'
  });

  const GAME = Object.freeze({
    origin: 'https://www.bilibilitoy.com',
    pathPrefix: '/toy/golden-hour/',
    parentOrigin: 'https://www.bilibili.com',
    channel: 'solstice-game'
  });

  const MESSAGES = Object.freeze({
    GET_STATE: 'solstice/ui/get-state',
    OPEN: 'solstice/ui/open',
    CLOSE: 'solstice/ui/close',
    TOGGLE: 'solstice/ui/toggle'
  });

  const UI_EVENTS = Object.freeze({
    OPEN: 'solstice:ui:open',
    CLOSE: 'solstice:ui:close',
    TOGGLE: 'solstice:ui:toggle'
  });

  function isTargetLocation(value) {
    let url;

    try {
      if (value instanceof URL) {
        url = value;
      } else if (typeof value === 'string') {
        url = new URL(value);
      } else if (value && typeof value.href === 'string') {
        url = new URL(value.href);
      } else {
        return false;
      }
    } catch {
      return false;
    }

    return (
      url.protocol === 'https:' &&
      url.hostname === TARGET.hostname &&
      url.pathname === TARGET.pathname
    );
  }

  function isExtensionMessage(data) {
    return Boolean(
      data &&
      typeof data === 'object' &&
      data.channel === CHANNEL &&
      data.protocol === PROTOCOL_VERSION &&
      data.source === 'solstice-extension' &&
      typeof data.type === 'string'
    );
  }

  function extensionMessage(type, payload) {
    const message = {
      channel: CHANNEL,
      protocol: PROTOCOL_VERSION,
      source: 'solstice-extension',
      type
    };

    if (payload !== undefined) {
      message.payload = payload;
    }

    return message;
  }

  Object.defineProperty(globalThis, 'SolsticeProtocol', {
    value: Object.freeze({
      CHANNEL,
      PROTOCOL_VERSION,
      TARGET,
      MESSAGES,
      UI_EVENTS,
      GAME,
      isTargetLocation,
      isExtensionMessage,
      extensionMessage
    }),
    configurable: false,
    enumerable: false,
    writable: false
  });
})();
