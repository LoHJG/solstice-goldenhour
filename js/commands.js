(() => {
  'use strict';

  const GAME_ORIGIN = 'https://www.bilibilitoy.com';
  const CONFIG_KEY = 'solstice.configs';
  const DEFAULT_KEY = 'solstice.config.default';
  const BIND_KEY = 'solstice.binds';
  const CONFIG_VERSION = 1;
  const COMMANDS = [
    {
      name: 'help',
      aliases: ['?'],
      description: 'Displays a list of available commands',
      usage: 'help [command]'
    },
    {
      name: 'bind',
      aliases: ['b'],
      description: 'Binds a module to a key',
      usage: 'bind [module] [key]'
    },
    {
      name: 'config',
      aliases: ['c'],
      description: 'Manage configurations',
      usage: 'config <load/save/list/delete/default> [name]'
    }
  ];
  const NAMED_KEYS = {
    space: 'Space',
    shift: 'ShiftLeft',
    lshift: 'ShiftLeft',
    rshift: 'ShiftRight',
    ctrl: 'ControlLeft',
    control: 'ControlLeft',
    alt: 'AltLeft',
    tab: 'Tab',
    enter: 'Enter',
    return: 'Enter',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    insert: 'Insert',
    ins: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    capslock: 'CapsLock',
    escape: 'Escape',
    esc: 'Escape',
    '`': 'Backquote',
    '-': 'Minus',
    '=': 'Equal',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '\\': 'Backslash',
    ';': 'Semicolon',
    "'": 'Quote',
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash'
  };
  const KEY_LABELS = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'RShift',
    ControlLeft: 'Ctrl',
    ControlRight: 'RCtrl',
    AltLeft: 'Alt',
    AltRight: 'RAlt',
    Tab: 'Tab',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    CapsLock: 'CapsLock',
    Escape: 'Escape',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/'
  };
  const LEGACY_KEYS = {
    27: 'Escape',
    32: 'Space',
    45: 'Insert',
    9: 'Tab',
    13: 'Enter',
    8: 'Backspace',
    46: 'Delete',
    36: 'Home',
    35: 'End',
    33: 'PageUp',
    34: 'PageDown',
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    16: 'ShiftLeft',
    17: 'ControlLeft',
    18: 'AltLeft'
  };

  let lastLoaded = '';
  let lastTrigger = '';
  let lastTriggerAt = 0;

  function log(...args) {
    console.log('%c[Solstice]', 'color:#ff5fa2;font-weight:bold', ...args);
  }

  function warn(...args) {
    console.warn('%c[Solstice]', 'color:#ffb347;font-weight:bold', ...args);
  }

  function error(...args) {
    console.error('%c[Solstice]', 'color:#ff4d4d;font-weight:bold', ...args);
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      error(`Failed to write localStorage: ${e.message}`);
      return false;
    }
  }

  function commandInfo(name) {
    const lower = String(name || '').toLowerCase();
    return COMMANDS.find((command) => command.name === lower || command.aliases.includes(lower));
  }

  function moduleByName(name) {
    const lower = String(name || '').toLowerCase();
    return MODS.find((mod) => mod.name.toLowerCase() === lower) ||
      MODS.find((mod) => mod.nm?.n?.toLowerCase() === lower) ||
      null;
  }

  function normalizeCode(value) {
    if (typeof value === 'string') {
      if (value.startsWith('Key') || value.startsWith('Digit') || value.startsWith('F') ||
          value.startsWith('Arrow') || value.startsWith('Numpad') || KEY_LABELS[value]) {
        return value;
      }
    }

    if (typeof value === 'number') {
      return LEGACY_KEYS[value] || `KeyCode${value}`;
    }

    return String(value || '');
  }

  function keyFromEvent(event) {
    return event.code || normalizeCode(event.keyCode);
  }

  function parseKey(input) {
    if (input === undefined || input === null) {
      return null;
    }

    const raw = String(input).trim();

    if (!raw) {
      return null;
    }

    const lower = raw.toLowerCase();

    if (lower === 'none' || lower === '0') {
      return 0;
    }

    if (NAMED_KEYS[lower]) {
      return NAMED_KEYS[lower];
    }

    if (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(raw)) {
      return raw.toUpperCase();
    }

    if (/^key[a-z]$/i.test(raw)) {
      return `Key${raw.slice(-1).toUpperCase()}`;
    }

    if (/^digit[0-9]$/i.test(raw)) {
      return `Digit${raw.slice(-1)}`;
    }

    if (/^numpad[0-9]$/i.test(raw)) {
      return `Numpad${raw.slice(-1)}`;
    }

    if (/^num[0-9]$/i.test(raw)) {
      return `Numpad${raw.slice(-1)}`;
    }

    if (/^[a-z]$/i.test(raw)) {
      return `Key${raw.toUpperCase()}`;
    }

    if (/^[0-9]$/.test(raw)) {
      return `Digit${raw}`;
    }

    return null;
  }

  function keyLabel(key) {
    if (!key || key === 0) {
      return 'None';
    }

    const code = normalizeCode(key);

    if (KEY_LABELS[code]) {
      return KEY_LABELS[code];
    }

    if (code.startsWith('Key') && code.length === 4) {
      return code.slice(3);
    }

    if (code.startsWith('Digit') && code.length === 6) {
      return code.slice(5);
    }

    return code;
  }

  function keyMatches(key, code) {
    if (!key || !code) {
      return false;
    }

    const stored = normalizeCode(key);

    if (stored === 'ShiftLeft' || stored === 'ShiftRight') {
      return code === 'ShiftLeft' || code === 'ShiftRight';
    }

    if (stored === 'ControlLeft' || stored === 'ControlRight') {
      return code === 'ControlLeft' || code === 'ControlRight';
    }

    if (stored === 'AltLeft' || stored === 'AltRight') {
      return code === 'AltLeft' || code === 'AltRight';
    }

    return stored === code;
  }

  function saveBinds() {
    const binds = {};

    for (const mod of MODS) {
      if (mod.key) {
        binds[mod.name] = mod.key;
      }
    }

    writeJson(BIND_KEY, binds);
  }

  function loadBinds() {
    const binds = readJson(BIND_KEY, {});

    for (const [name, key] of Object.entries(binds)) {
      const mod = moduleByName(name);

      if (mod) {
        mod.key = key;
      }
    }
  }

  function saveModuleBind(mod) {
    if (mod) {
      saveBinds();
    }
  }

  function triggerBound(code) {
    if (!code || code === 'Insert' || code === 'Escape') {
      return;
    }

    if (S.open || S.hudEditor || S.binding || S.bindBool) {
      return;
    }

    const now = performance.now();

    if (code === lastTrigger && now - lastTriggerAt < 80) {
      return;
    }

    lastTrigger = code;
    lastTriggerAt = now;

    for (const mod of MODS) {
      if (mod.name === 'ClickGui') {
        continue;
      }

      if (keyMatches(mod.key, code)) {
        setModuleOn(mod, !mod.on);
      }
    }
  }

  function commandHelp(name) {
    if (name) {
      const command = commandInfo(name);

      if (!command) {
        error(`The command '${name}' does not exist.`);
        return;
      }

      log(`Command: ${command.name}`);
      log(`- ${command.description}`);
      log(`- Usage: ${command.usage}`);
      log(`- Aliases: ${command.aliases.join(', ') || 'none'}`);
      return;
    }

    console.table(COMMANDS.map((command) => ({
      Command: command.name,
      Aliases: command.aliases.join(', '),
      Description: command.description
    })));
    log('Use help <command> for more information.');
  }

  function commandBind(moduleName, keyName) {
    if (!moduleName) {
      const list = MODS
        .filter((mod) => mod.key)
        .map((mod) => ({
          Module: mod.name,
          Key: keyLabel(mod.key)
        }));

      if (list.length === 0) {
        log('No binds.');
        return;
      }

      console.table(list);
      log('Use bind <module> <key> to bind a module.');
      return;
    }

    const mod = moduleByName(moduleName);

    if (!mod) {
      error(`The module '${moduleName}' does not exist.`);
      return;
    }

    if (keyName === undefined) {
      log(`${mod.name} is currently bound to ${keyLabel(mod.key)}.`);
      return;
    }

    const key = parseKey(keyName);

    if (key === null) {
      error(`Unknown key '${keyName}'.`);
      return;
    }

    mod.key = key;
    saveBinds();
    log(`${mod.name} is now bound to ${keyLabel(key)}.`);
  }

  function readConfigs() {
    const configs = readJson(CONFIG_KEY, {});
    return configs && typeof configs === 'object' ? configs : {};
  }

  function writeConfigs(configs) {
    return writeJson(CONFIG_KEY, configs);
  }

  function serializeModule(mod) {
    return {
      name: mod.name,
      enabled: Boolean(mod.on),
      key: mod.key || 0,
      settings: mod.settings.map((setting) => ({
        name: setting.n,
        type: setting.t,
        value: setting.t === 'c'
          ? (Array.isArray(setting.v) ? setting.v.slice() : setting.v)
          : setting.t === 'e'
            ? (setting.vals?.[setting.v] ?? setting.v)
            : setting.v
      }))
    };
  }

  function applySetting(setting, entry) {
    if (!setting || !entry) {
      return;
    }

    if (setting.t === 'e') {
      let index = Number(entry.value);

      if (typeof entry.value === 'string' && Array.isArray(setting.vals)) {
        index = setting.vals.indexOf(entry.value);
      }

      if (Number.isInteger(index) && index >= 0 && index < setting.vals.length) {
        setting.v = index;
      }
    } else if (setting.t === 'b') {
      setting.v = entry.value ? 1 : 0;
      setting.bs = setting.v;
    } else if (setting.t === 'n') {
      const value = Number(entry.value);

      if (Number.isFinite(value)) {
        setting.v = value;
      }
    } else if (setting.t === 'c') {
      if (Array.isArray(entry.value)) {
        setting.v = entry.value.slice();
      }
    }
  }

  function applyConfig(config, quiet = false) {
    if (!config || !Array.isArray(config.modules)) {
      error('Invalid configuration.');
      return false;
    }

    for (const entry of config.modules) {
      const mod = moduleByName(entry.name);

      if (!mod) {
        continue;
      }

      if (Array.isArray(entry.settings)) {
        for (const stored of entry.settings) {
          applySetting(mod.settings.find((setting) => setting.n === stored.name), stored);
        }
      }

      if (entry.key !== undefined) {
        mod.key = entry.key;
      }

      if (mod.name !== 'ClickGui') {
        setModuleOn(mod, Boolean(entry.enabled));
      }
    }

    saveBinds();

    return true;
  }

  function loadConfig(name, quiet = false) {
    const configs = readConfigs();
    const config = configs[name];

    if (!config) {
      error(`The configuration '${name}' does not exist.`);
      return false;
    }

    if (!applyConfig(config, quiet)) {
      return false;
    }

    lastLoaded = name;

    if (!quiet) {
      log(`Loaded configuration ${name}.`);
    }

    return true;
  }

  function saveConfig(name, overwrite = false, quiet = false) {
    const target = String(name || lastLoaded || '').trim();

    if (!target) {
      error('No configuration name provided and no configuration loaded.');
      return false;
    }

    const configs = readConfigs();

    if (configs[target] && lastLoaded !== target && !overwrite) {
      warn(`Configuration '${target}' already exists. Use config save ${target} overwrite.`);
      return false;
    }

    configs[target] = {
      version: CONFIG_VERSION,
      name: target,
      savedAt: Date.now(),
      modules: MODS.map(serializeModule)
    };

    if (!writeConfigs(configs)) {
      return false;
    }

    lastLoaded = target;

    if (!quiet) {
      log(`Saved configuration ${target}.`);
    }

    return true;
  }

  function listConfigs() {
    const configs = readConfigs();
    const names = Object.keys(configs).sort();
    const defaultName = localStorage.getItem(DEFAULT_KEY) || '';

    if (names.length === 0) {
      log('No configurations.');
      return;
    }

    console.table(names.map((name) => ({
      Name: name,
      Default: name === defaultName ? 'yes' : '',
      Saved: new Date(configs[name].savedAt || 0).toLocaleString()
    })));
  }

  function deleteConfig(name) {
    const configs = readConfigs();

    if (!configs[name]) {
      error(`The configuration '${name}' does not exist.`);
      return;
    }

    delete configs[name];
    writeConfigs(configs);

    if (localStorage.getItem(DEFAULT_KEY) === name) {
      localStorage.removeItem(DEFAULT_KEY);
    }

    log(`Deleted configuration ${name}.`);
  }

  function setDefaultConfig(name) {
    if (!name) {
      localStorage.removeItem(DEFAULT_KEY);
      log('Cleared the default configuration.');
      return;
    }

    if (!readConfigs()[name]) {
      error(`The configuration '${name}' does not exist.`);
      return;
    }

    localStorage.setItem(DEFAULT_KEY, name);
    log(`Set the default configuration to ${name}.`);
  }

  function commandConfig(action, name, extra) {
    if (!action) {
      error(COMMANDS.find((command) => command.name === 'config').usage);
      return;
    }

    const verb = String(action).toLowerCase();

    if (verb === 'load' || verb === 'l') {
      if (!name) {
        error('Usage: config load <name>');
        return;
      }

      loadConfig(name);
    } else if (verb === 'save' || verb === 's') {
      saveConfig(name, extra === 'overwrite');
    } else if (verb === 'list') {
      listConfigs();
    } else if (verb === 'delete' || verb === 'del') {
      if (!name) {
        error('Usage: config delete <name>');
        return;
      }

      deleteConfig(name);
    } else if (verb === 'default' || verb === 'd') {
      setDefaultConfig(name);
    } else {
      error(COMMANDS.find((command) => command.name === 'config').usage);
    }
  }

  function parseLine(line) {
    let text = String(line || '').trim();

    if (text.startsWith('.')) {
      text = text.slice(1);
    }

    const parts = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;

    while ((match = pattern.exec(text))) {
      parts.push(match[1] ?? match[2] ?? match[3]);
    }

    return parts;
  }

  function execute(line) {
    const parts = parseLine(line);

    if (parts.length === 0) {
      return;
    }

    const command = commandInfo(parts[0]);

    if (!command) {
      error(`The command '${parts[0]}' does not exist.`);
      return;
    }

    if (command.name === 'help') {
      commandHelp(parts[1]);
    } else if (command.name === 'bind') {
      commandBind(parts[1], parts[2]);
    } else if (command.name === 'config') {
      commandConfig(parts[1], parts[2], parts[3]);
    }
  }

  function isGameSource(source) {
    for (const frame of document.querySelectorAll('iframe')) {
      if (
        frame.src.startsWith(`${GAME_ORIGIN}/toy/golden-hour/`) &&
        frame.contentWindow === source
      ) {
        return true;
      }
    }

    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat || S.open || S.hudEditor || S.binding || S.bindBool) {
      return;
    }

    const target = event.target;

    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
    ) {
      return;
    }

    triggerBound(keyFromEvent(event));
  }, true);

  window.addEventListener('message', (event) => {
    if (event.origin !== GAME_ORIGIN || !isGameSource(event.source)) {
      return;
    }

    const data = event.data;

    if (data?.channel === 'solstice-key' && data.type === 'down') {
      triggerBound(normalizeCode(data.code || data.key));
    }
  });

  loadBinds();

  const defaultConfig = localStorage.getItem(DEFAULT_KEY);

  if (defaultConfig && readConfigs()[defaultConfig]) {
    loadConfig(defaultConfig, true);
  }

  window.Solstice = {
    help: commandHelp,
    bind: commandBind,
    config: commandConfig,
    execute,
    saveModuleBind,
    commands: COMMANDS.map((command) => command.name)
  };
  window.sol = execute;

  if (typeof window.help === 'undefined') {
    window.help = commandHelp;
  }

  if (typeof window.bind === 'undefined') {
    window.bind = commandBind;
  }

  if (typeof window.config === 'undefined') {
    window.config = commandConfig;
  }

  if (!window.__solsticeConsoleHint) {
    window.__solsticeConsoleHint = true;
    console.log(
      '%c[Solstice]%c Console commands: sol("help") | sol("bind Aura R") | sol("config save main")',
      'color:#ff5fa2;font-weight:bold',
      'color:inherit'
    );
  }
})();
