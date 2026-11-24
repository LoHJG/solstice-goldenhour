(() => {
  'use strict';

  const PARENT_ORIGIN = 'https://www.bilibili.com';
  const CHANNEL = 'solstice-key';

  if (window.self === window.top) {
    return;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Insert' && event.key !== 'Escape') {
      return;
    }

    try {
      window.parent.postMessage({
        channel: CHANNEL,
        type: 'key',
        key: event.key,
        keyCode: event.keyCode
      }, PARENT_ORIGIN);
    } catch {

    }
  }, true);
})();
