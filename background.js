'use strict';

importScripts('/extension/protocol.js');

const Protocol = globalThis.SolsticeProtocol;

async function toggleForTab(tab) {
  if (!Protocol || !tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(
      tab.id,
      Protocol.extensionMessage(Protocol.MESSAGES.TOGGLE)
    );
  } catch {

  }
}

if (Protocol) {
  chrome.action.onClicked.addListener((tab) => {
    toggleForTab(tab);
  });
}
