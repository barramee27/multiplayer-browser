/**
 * Multiplayer Browser - Background Service Worker
 * Connects to server, relays messages to/from content scripts
 */
importScripts('libs/socket.io.min.js');

const SERVER_URL = 'https://multiplayer.codemesh.org';
let socket = null;
let roomId = null;
let userName = null;
let popupPort = null;
let roomState = { users: [], messages: [], currentUrl: null };
let lastAppliedNav = { url: null, tabId: null, ts: 0 };

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    popupPort = port;
    port.onDisconnect.addListener(() => { popupPort = null; });
  }
});

// Capture full-page navigation (link clicks, address bar) and broadcast
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!roomId) return;
  if (changeInfo.status === 'complete' && tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
    chrome.tabs.sendMessage(tabId, { type: 'mp-init', roomId, myId: socket?.id }).catch(() => {});
  }
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
  if (tabId === lastAppliedNav.tabId && url === lastAppliedNav.url && Date.now() - lastAppliedNav.ts < 5000) return;
  const s = socket || connect();
  if (s?.connected) s.emit('navigate', url);
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ url: chrome.runtime.getURL('app.html') }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
    }
  });
});

function connect() {
  if (socket?.connected) return socket;
  const io = self.io;
  if (!io) {
    console.error('[Multiplayer] Socket.IO not loaded');
    return null;
  }
  socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });
  socket.on('connect', () => console.log('[Multiplayer] Connected'));
  socket.on('disconnect', () => console.log('[Multiplayer] Disconnected'));
  return socket;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_PROXY') {
    if (msg.enabled && msg.host && msg.port) {
      chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: { scheme: 'http', host: msg.host, port: parseInt(msg.port, 10) || 8080 },
            bypassList: ['localhost', '127.0.0.1', '<local>']
          }
        },
        scope: 'regular'
      });
    } else {
      chrome.proxy.settings.clear({ scope: 'regular' });
    }
    return false;
  }
  if (msg.type === 'GET_STATE') {
    sendResponse({
      inRoom: !!roomId,
      roomId,
      userName,
      myId: socket?.id,
      users: roomState.users,
      messages: roomState.messages,
      currentUrl: roomState.currentUrl
    });
    return false;
  }
  if (msg.type === 'JOIN') {
    const s = connect();
    if (!s) return sendResponse({ error: 'Socket not ready' });
    roomId = msg.roomId;
    userName = msg.userName || 'Guest';
    roomState = { users: [], messages: [], currentUrl: null };
    s.emit('join-room', { roomId, userName });
    s.once('room-joined', (data) => {
      roomState = {
        users: data.users || [],
        messages: data.messages || [],
        currentUrl: data.currentUrl || null
      };
      setupForwarding(s);
      sendResponse(data);
    });
    return true;
  }

  if (msg.type === 'LEAVE') {
    roomId = null;
    userName = null;
    roomState = { users: [], messages: [], currentUrl: null };
    sendResponse({ ok: true });
    return true;
  }

  const s = socket || connect();
  if (!s) return sendResponse({ error: 'Socket not ready' });

  if (msg.type === 'NAVIGATE') {
    s.emit('navigate', msg.url);
    return false;
  }
  if (msg.type === 'CHAT') {
    s.emit('chat-message', msg.text);
    return false;
  }
  if (msg.type === 'CODE_INJECT') {
    s.emit('code-inject', msg.data);
    return false;
  }
  if (msg.type === 'ANNOTATION_ADD') {
    s.emit('annotation-add', msg.data);
    return false;
  }
  if (msg.type === 'ANNOTATION_REMOVE') {
    s.emit('annotation-remove', msg.id);
    return false;
  }
  if (msg.type === 'SCROLL') {
    s.emit('scroll-sync', msg.data);
    return false;
  }
  if (msg.type === 'KEY_SYNC') {
    s.emit('key-sync', msg.data);
    return false;
  }
  if (msg.type === 'DINO_JOIN') {
    s.emit('dino-join');
    return false;
  }
  if (msg.type === 'VOICE_OFFER') {
    s.emit('voice-offer', msg.data);
    return false;
  }
  if (msg.type === 'VOICE_ANSWER') {
    s.emit('voice-answer', msg.data);
    return false;
  }
  if (msg.type === 'VOICE_ICE') {
    s.emit('voice-ice', msg.data);
    return false;
  }

  return false;
});

function setupForwarding(sock) {
  const s = sock || socket || connect();
  if (!s) return;
  ['user-joined', 'user-left', 'navigate', 'chat-message', 'code-inject', 'annotation-add', 'annotation-remove', 'scroll-sync', 'key-sync', 'dino-state', 'voice-offer', 'voice-answer', 'voice-ice'].forEach(ev => {
    s.off(ev);
    s.on(ev, (data) => {
      if (ev === 'user-joined') {
        roomState.users = roomState.users.filter(u => u.id !== data?.id);
        roomState.users.push({ id: data?.id, name: data?.name, color: data?.color });
      }
      if (ev === 'user-left') {
        roomState.users = roomState.users.filter(u => u.id !== data?.id);
      }
      if (ev === 'chat-message') {
        roomState.messages = (roomState.messages || []).slice(-49).concat([data]);
      }
      if (ev === 'navigate' && data?.url) {
        roomState.currentUrl = data.url;
        chrome.tabs.query({ active: true }, (active) => {
          var t = active.find(x => x.url && !x.url.startsWith('chrome://') && !x.url.startsWith('chrome-extension://'));
          if (!t) chrome.tabs.query({}, (all) => { t = all.find(x => x.url && !x.url.startsWith('chrome://') && !x.url.startsWith('chrome-extension://')); });
          if (t?.id && t.url !== data.url) {
            lastAppliedNav = { url: data.url, tabId: t.id, ts: Date.now() };
            chrome.tabs.update(t.id, { url: data.url });
          }
        });
      }
      try {
        if (popupPort) popupPort.postMessage({ type: ev, data });
      } catch (_) {}
      if (ev !== 'navigate') {
        chrome.tabs.query({}, (tabs) => {
          const isDino = ev === 'dino-state';
          tabs.forEach(tab => {
            if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
            if (isDino && !tab.url.includes('/dino')) return;
            chrome.tabs.sendMessage(tab.id, { type: ev, data }).catch(() => {});
          });
        });
      }
    });
  });
}
