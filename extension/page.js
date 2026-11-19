

(() => {
  'use strict';

  const host = document.getElementById('solstice-root');

  if (!host || typeof S === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const EVENTS = {
    open: 'solstice:ui:open',
    close: 'solstice:ui:close',
    toggle: 'solstice:ui:toggle'
  };

  let visible = null;

  function syncVisibility() {
    const shouldShow = Boolean(S.open || S.hudEditor);

    host.style.display = 'block';
    host.style.pointerEvents = shouldShow ? 'auto' : 'none';
    host.style.cursor = S.hudEditor ? 'move' : '';

    if (shouldShow) {
      root.setAttribute('data-solstice-open', '');
    } else {
      root.removeAttribute('data-solstice-open');
    }

    if (shouldShow && visible !== true) {
      requestAnimationFrame(() => {
        host.focus({ preventScroll: true });
      });
    }

    if (!shouldShow && visible === true) {
      host.blur();
    }

    visible = shouldShow;
  }

  function setOpen(open) {
    const next = Boolean(open);

    if (next && !S.open) {
      S.ease.p = 0;
      S.wheel = 0;
    }

    if (!next) {
      S.down = [false, false, false];
      S.dragSetting = null;
      S.picker = null;
    }

    S.open = next;
    syncVisibility();
  }

  S.open = false;
  syncVisibility();

  document.addEventListener(EVENTS.open, () => setOpen(true));
  document.addEventListener(EVENTS.close, () => setOpen(false));
  document.addEventListener(EVENTS.toggle, () => setOpen(!S.open));
  document.addEventListener('solstice:hud-editor', syncVisibility);

  window.addEventListener('solstice:key', (event) => {
    const detail = event.detail;

    if (!detail) {
      return;
    }

    if (detail.key === 'Insert') {
      if (!S.binding && !S.bindBool) {
        S.wheel = 0;
        setOpen(!S.open);
      }

      detail.handled = true;
      return;
    }

    if (detail.key === 'Escape') {
      if (S.binding) {
        const mod = S.binding;
        mod.key = 0;
        window.Solstice?.saveModuleBind?.(mod);
        S.binding = null;
        detail.handled = true;
        return;
      }

      if (S.bindBool) {
        S.bindBool.key = detail.keyCode === 27 ? 0 : detail.keyCode;
        S.bindBool = null;
        detail.handled = true;
        return;
      }

      if (S.picker) {
        S.picker = null;
        detail.handled = true;
        return;
      }

      if (S.open) {
        setOpen(false);
        detail.handled = true;
      }
    }
  });
})();
