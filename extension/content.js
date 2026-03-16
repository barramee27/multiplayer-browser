/**
 * Multiplayer Browser - Content Script
 * Navigation sync, scroll sync, code injection (no cursor overlay)
 */
(function () {
  let annotations = new Map();
  let roomId = null;
  let myId = null;

  function getOverlay() {
    var el = document.getElementById('mpb-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mpb-overlay';
      document.body.appendChild(el);
    }
    return el;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function onUserLeft(id) {}

  function onNavigate(data) {
  }

  function onChatMessage(data) {
    if (window.mpbOnChatMessage) window.mpbOnChatMessage(data);
  }

  function onAnnotationAdd(data) {
    const el = document.createElement('div');
    el.className = 'mpb-annotation';
    el.dataset.id = data.id || Date.now();
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    el.style.width = data.w + 'px';
    el.style.height = data.h + 'px';
    el.style.background = data.color || '#6C5CE7';
    getOverlay().appendChild(el);
    annotations.set(el.dataset.id, el);
  }

  function onAnnotationRemove(id) {
    const el = annotations.get(id);
    if (el) el.remove();
    annotations.delete(id);
  }

  function onScrollSync(data) {
    if (data.id === myId) return;
    window.scrollTo(data.scrollX || 0, data.scrollY || 0);
  }

  function onKeySync(data) {
    if (data.id === myId) return;
    if (!document.body.hasAttribute('data-mp-key-sync')) return;
    try {
      const ev = new KeyboardEvent('keydown', {
        key: data.key || ' ',
        code: data.code || 'Space',
        keyCode: data.keyCode || 32,
        which: data.keyCode || 32,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(ev);
    } catch (_) {}
  }

  function onCodeInject(data) {
    const { type, content, userName } = data || {};
    if (!type || !content) return;
    const container = document.getElementById('mpb-inject-container');
    if (!container) {
      const c = document.createElement('div');
      c.id = 'mpb-inject-container';
      c.style.cssText = 'position:fixed;top:60px;right:16px;width:400px;max-height:80vh;z-index:2147483645;background:#1a1b26;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
      const header = document.createElement('div');
      header.style.cssText = 'padding:8px 12px;background:rgba(0,0,0,0.3);font-size:12px;display:flex;justify-content:space-between;align-items:center;';
      header.innerHTML = '<span>Injected by <span id="mpb-inject-by"></span></span><button id="mpb-inject-close" style="background:none;border:none;color:#8b8fa3;cursor:pointer;font-size:18px;">×</button>';
      c.appendChild(header);
      const frameWrap = document.createElement('div');
      frameWrap.id = 'mpb-inject-frame-wrap';
      frameWrap.style.cssText = 'height:300px;overflow:auto;';
      c.appendChild(frameWrap);
      header.querySelector('#mpb-inject-close').onclick = () => c.remove();
      document.body.appendChild(c);
    }
    const byEl = document.getElementById('mpb-inject-by');
    if (byEl) byEl.textContent = userName || 'User';
    const frameWrap = document.getElementById('mpb-inject-frame-wrap');
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';
    iframe.style.cssText = 'width:100%;height:280px;border:none;background:#fff;';
    frameWrap.innerHTML = '';
    frameWrap.appendChild(iframe);
    var html;
    if (type === 'html') {
      html = content;
    } else if (type === 'css') {
      html = '<!DOCTYPE html><html><head><style></style></head><body></body></html>';
    } else if (type === 'js') {
      html = '<!DOCTYPE html><html><body></body></html>';
    }
    if (html) {
      iframe.srcdoc = html;
      iframe.onload = function() {
        var doc = iframe.contentDocument;
        if (!doc) return;
        try {
          if (type === 'css') {
            var style = doc.querySelector('style');
            if (style) style.textContent = content;
          } else if (type === 'js') {
            var script = doc.createElement('script');
            script.textContent = content;
            doc.body.appendChild(script);
          }
        } catch (e) {}
      };
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!roomId) return;
    if (!e.isTrusted) return;
    if (!document.body.hasAttribute('data-mp-key-sync')) return;
    const syncKeys = ['Space', 'ArrowUp', 'ArrowDown', ' '];
    if (!syncKeys.includes(e.key) && !syncKeys.includes(e.code)) return;
    const isJump = ['Space', 'ArrowUp', ' '].includes(e.key) || e.code === 'Space' || e.code === 'ArrowUp';
    if (isJump) {
      window.dispatchEvent(new CustomEvent('dino-optimistic-jump'));
    }
    chrome.runtime.sendMessage({
      type: 'KEY_SYNC',
      data: { key: e.key, code: e.code, keyCode: e.keyCode }
    }).catch(() => {});
  }, { capture: true });

  window.addEventListener('scroll', () => {
    if (!roomId) return;
    if (window.mpScrollThrottle) clearTimeout(window.mpScrollThrottle);
    window.mpScrollThrottle = setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'SCROLL',
        data: { scrollX: window.scrollX, scrollY: window.scrollY }
      }).catch(() => {});
    }, 100);
  }, { passive: true });

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    if (roomId) chrome.runtime.sendMessage({ type: 'NAVIGATE', url: window.location.href }).catch(() => {});
  };
  history.replaceState = function (...args) {
    origReplaceState(...args);
    if (roomId) chrome.runtime.sendMessage({ type: 'NAVIGATE', url: window.location.href }).catch(() => {});
  };
  window.addEventListener('popstate', () => {
    if (roomId) chrome.runtime.sendMessage({ type: 'NAVIGATE', url: window.location.href }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'mp-init') {
      roomId = msg.roomId;
      myId = msg.myId;
      if (roomId) {
        chrome.runtime.sendMessage({ type: 'NAVIGATE', url: window.location.href }).catch(() => {});
        if (document.body.hasAttribute('data-mp-key-sync')) {
          chrome.runtime.sendMessage({ type: 'DINO_JOIN' }).catch(() => {});
        }
      }
      return;
    }
    if (msg.type === 'dino-state') {
      window.dispatchEvent(new CustomEvent('dino-state', { detail: msg.data }));
      return;
    }
    switch (msg.type) {
      case 'user-left': onUserLeft(msg.data?.id); break;
      case 'navigate': onNavigate(msg.data); break;
      case 'chat-message': onChatMessage(msg.data); break;
      case 'annotation-add': onAnnotationAdd(msg.data); break;
      case 'annotation-remove': onAnnotationRemove(msg.data); break;
      case 'scroll-sync': onScrollSync(msg.data); break;
      case 'key-sync': onKeySync(msg.data); break;
      case 'code-inject': onCodeInject(msg.data); break;
    }
  });

  window.mpSetRoom = (id, uid) => {
    roomId = id;
    myId = uid;
  };

  window.mpGetRoom = () => roomId;
})();
