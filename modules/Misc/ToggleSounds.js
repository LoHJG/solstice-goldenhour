(() => {
  'use strict';

  const SOUNDS = {
    Smooth: {
      on: 'smooth_on.wav',
      off: 'smooth_off.wav'
    },
    Celestial: {
      on: 'celestial_on.wav',
      off: 'celestial_off.wav'
    },
    Nursultan: {
      on: 'nursultan_on.wav',
      off: 'nursultan_off.wav'
    }
  };

  function setting(name, fallback) {
    const module = getMod('ToggleSounds');
    const value = module?.settings.find((entry) => entry.n === name);
    return value ? value.v : fallback;
  }

  document.addEventListener('solstice:module-toggle', (event) => {
    const module = getMod('ToggleSounds');

    if (!module?.on || !event.detail?.name) {
      return;
    }

    const soundSetting = module.settings.find((entry) => entry.n === 'Sound');
    const name = soundSetting?.vals?.[soundSetting.v] || 'Celestial';
    const sound = SOUNDS[name];

    if (!sound) {
      return;
    }

    const base = document.documentElement?.getAttribute('data-solstice-audio-base');

    if (!base) {
      return;
    }

    const file = event.detail.enabled ? sound.on : sound.off;
    const audio = new Audio(`${base}${file}`);
    const volume = Number(setting('Volume', 1));

    audio.volume = clamp(Number.isFinite(volume) ? volume : 1, 0, 1);
    audio.play().catch(() => {});
  });

  register({
    name: 'ToggleSounds',
    desc: 'Plays a sound on module toggle',
    cat: 'Misc',
    nm: { l: 'togglesounds', ls: 'toggle sounds', n: 'ToggleSounds', ns: 'Toggle Sounds' },
    disp: 'Sound',
    settings: [
      {
        t: 'e',
        n: 'Sound',
        d: 'The sound to play on module toggle',
        v: 1,
        vals: ['Smooth', 'Celestial', 'Nursultan']
      },
      {
        t: 'n',
        n: 'Volume',
        d: 'The volume of the sound',
        v: 1.0,
        min: 0.0,
        max: 1.0,
        step: 0.1
      }
    ],
    defaultOn: true,
    onEnable() {}
  });
})();
