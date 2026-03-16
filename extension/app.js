const SERVER_URL = 'https://multiplayer.codemesh.org';
let roomId = null;
let userName = null;

// Restore saved state on load
chrome.storage.local.get(['mp_userName', 'mp_roomId'], (saved) => {
  if (saved.mp_userName) document.getElementById('userName').value = saved.mp_userName;
  if (saved.mp_roomId) document.getElementById('roomId').value = saved.mp_roomId;
});

// Connect to background - use 'popup' so background forwards to us
const port = chrome.runtime.connect({ name: 'popup' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'chat-message') appendChat(msg.data);
  if (msg.type === 'code-inject') renderInjectPreview(msg.data);
  if (msg.type === 'user-joined') {
    const chip = document.createElement('span');
    chip.className = 'user-chip';
    chip.dataset.id = msg.data?.id || '';
    chip.style.borderLeft = '3px solid ' + (msg.data?.color || '#6C5CE7');
    chip.textContent = msg.data?.name || 'Unknown';
    document.getElementById('usersList').appendChild(chip);
  }
  if (msg.type === 'user-left') {
    const id = msg.data?.id;
    document.querySelectorAll('.user-chip').forEach(c => {
      if (c.dataset.id === id || c.textContent === msg.data?.name) c.remove();
    });
  }
});

// On load, check if we're already in a room (background kept connection)
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
  if (res?.inRoom && res.roomId) {
    roomId = res.roomId;
    userName = res.userName || 'Guest';
    showInRoom({ users: res.users || [], messages: res.messages || [], currentUrl: res.currentUrl });
    if (res.myId) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.sendMessage(tab.id, { type: 'mp-init', roomId, myId: res.myId }).catch(() => {});
          }
        });
      });
    }
  }
});

document.getElementById('btnCreate').onclick = async () => {
  try {
    const res = await fetch(SERVER_URL + '/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error('Server error');
    const { roomId: id } = await res.json();
    document.getElementById('roomId').value = id;
    navigator.clipboard.writeText(id);
    chrome.storage.local.set({ mp_roomId: id });
    alert('Room created! ID copied: ' + id);
  } catch (err) {
    alert('Cannot reach server.\n\n' + err.message);
  }
};

document.getElementById('btnJoin').onclick = () => {
  roomId = document.getElementById('roomId').value.trim();
  userName = document.getElementById('userName').value.trim() || 'Guest';
  if (!roomId) return alert('Enter a room ID');
  chrome.storage.local.set({ mp_userName: userName, mp_roomId: roomId });
  chrome.runtime.sendMessage({ type: 'JOIN', roomId, userName }, (res) => {
    if (res?.error) return alert(res.error);
    showInRoom(res);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, { type: 'mp-init', roomId, myId: res.myId }).catch(() => {});
        }
      });
    });
  });
};

document.getElementById('btnLeave').onclick = () => {
  chrome.runtime.sendMessage({ type: 'LEAVE' });
  chrome.storage.local.remove(['mp_roomId']);
  roomId = null;
  document.getElementById('joinSection').classList.remove('hidden');
  document.getElementById('inRoomSection').classList.add('hidden');
  document.getElementById('chatSection').classList.add('hidden');
  document.getElementById('voiceSection').classList.add('hidden');
  document.getElementById('injectSection').classList.add('hidden');
};

document.getElementById('btnInject').onclick = () => {
  const type = document.getElementById('injectType').value;
  const content = document.getElementById('injectContent').value.trim();
  if (!content) return alert('Enter some code');
  chrome.runtime.sendMessage({ type: 'CODE_INJECT', data: { type, content } }, () => {
    renderInjectPreview({ type, content, userName: document.getElementById('userName').value || 'You' });
    document.getElementById('injectContent').value = '';
  });
};

function showInRoom(data) {
  document.getElementById('joinSection').classList.add('hidden');
  document.getElementById('inRoomSection').classList.remove('hidden');
  document.getElementById('chatSection').classList.remove('hidden');
  document.getElementById('voiceSection').classList.remove('hidden');
  document.getElementById('injectSection').classList.remove('hidden');
  const users = data.users || [];
  document.getElementById('usersList').innerHTML = users.map(u =>
    `<span class="user-chip" data-id="${u.id || ''}" style="border-left:3px solid ${u.color}">${escapeHtml(u.name)}</span>`
  ).join('');
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML = '';
  (data.messages || []).forEach(m => appendChat(m));
  if (data.currentUrl) {
    chrome.tabs.query({}, (tabs) => {
      const webTab = tabs.find(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && t.url !== data.currentUrl);
      if (webTab?.id) chrome.tabs.update(webTab.id, { url: data.currentUrl });
    });
  }
}

function appendChat(m) {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = m.ts ? new Date(m.ts).toLocaleTimeString() : '';
  const uName = m.userName || m.name || 'Unknown';
  const uColor = m.userColor || m.color || '#6C5CE7';
  el.innerHTML = `<span class="name" style="color:${uColor}">${escapeHtml(uName)}</span><span class="time">${time}</span><br>${escapeHtml(m.text || '')}`;
  document.getElementById('chatArea').appendChild(el);
  el.scrollIntoView();
}

document.getElementById('chatInput').onkeydown = (e) => {
  if (e.key === 'Enter') {
    const text = document.getElementById('chatInput').value.trim();
    if (text) {
      chrome.runtime.sendMessage({ type: 'CHAT', text });
      document.getElementById('chatInput').value = '';
    }
  }
};

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderInjectPreview(data) {
  const { type, content, userName } = data || {};
  if (!type || !content) return;
  const wrap = document.getElementById('injectPreview');
  const frame = document.getElementById('injectPreviewFrame');
  if (!wrap || !frame) return;
  wrap.classList.remove('hidden');
  frame.style.background = '#fff';
  function writeToFrame() {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    try {
      if (type === 'css') {
        const style = doc.querySelector('style');
        if (style) style.textContent = content;
      } else if (type === 'js') {
        const script = doc.createElement('script');
        script.textContent = content;
        doc.body.appendChild(script);
      }
    } catch (e) {
      console.warn('Inject preview error:', e);
    }
  }
  try {
    if (type === 'html') {
      frame.srcdoc = content;
      return;
    }
    frame.srcdoc = type === 'css'
      ? '<!DOCTYPE html><html><head><style></style></head><body></body></html>'
      : '<!DOCTYPE html><html><body></body></html>';
    frame.onload = writeToFrame;
  } catch (e) {
    console.warn('Inject preview error:', e);
  }
}

document.getElementById('injectPreviewClose')?.addEventListener('click', () => {
  document.getElementById('injectPreview')?.classList.add('hidden');
});

let voiceStream = null;
let voiceEnabled = false;
document.getElementById('btnVoice').onclick = () => {
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById('btnVoice');
  btn.textContent = voiceEnabled ? 'Mute' : 'Unmute';
  btn.classList.toggle('muted', !voiceEnabled);
  if (voiceEnabled) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      voiceStream = stream;
    }).catch(() => alert('Microphone access denied'));
  } else {
    voiceStream?.getTracks().forEach(t => t.stop());
    voiceStream = null;
  }
};
