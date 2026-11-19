

(() => {
  'use strict';

  if (document.getElementById('solstice-root')) {
    return;
  }

  const root = document.documentElement;

  if (!root) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'solstice-root';
  host.tabIndex = -1;
  host.style.display = 'block';
  host.style.pointerEvents = 'none';

  const canvas = document.createElement('canvas');
  canvas.id = 'hud';
  host.append(canvas);
  root.append(host);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Insert' && event.key !== 'Escape') {
      return;
    }

    const request = new CustomEvent('solstice:key', {
      detail: {
        key: event.key,
        keyCode: event.keyCode,
        handled: false
      }
    });

    window.dispatchEvent(request);

    if (request.detail.handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
