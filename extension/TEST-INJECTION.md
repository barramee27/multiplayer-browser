# Code Injection Test Snippets

Use these in the Multiplayer Browser extension's "Inject code" section to test. Everyone in the room will see the result.

---

## HTML – Simple card

```html
<div style="padding:20px;background:linear-gradient(135deg,#6C5CE7,#00CEFF);border-radius:12px;color:#fff;font-family:system-ui;max-width:300px;">
  <h3 style="margin:0 0 8px 0;">Hello from injection!</h3>
  <p style="margin:0;opacity:0.9;">This HTML was injected to everyone in the room.</p>
</div>
```

---

## HTML – Animated banner

```html
<div id="mpb-test-banner" style="position:fixed;top:0;left:0;right:0;padding:12px;background:#1a1b26;color:#00CEFF;text-align:center;font-family:monospace;z-index:2147483646;animation:mpb-fade 2s ease;">
  🚀 Code injection works! Synced to everyone.
</div>
<style>@keyframes mpb-fade{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}</style>
<script>setTimeout(()=>document.getElementById('mpb-test-banner')?.remove(),5000)</script>
```

---

## CSS – Change page colors

```css
body { filter: hue-rotate(180deg) !important; }
* { border: 1px solid rgba(108,92,231,0.3) !important; }
```

---

## CSS – Dark mode overlay

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  pointer-events: none;
  z-index: 2147483645;
}
```

---

## JavaScript – Alert (simple test)

```javascript
alert('Injection works! Everyone in the room saw this.');
```

---

## JavaScript – Console log + toast

```javascript
console.log('Multiplayer injection received');
const t = document.createElement('div');
t.textContent = '✅ JS injected to everyone!';
t.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;background:#6C5CE7;color:#fff;border-radius:8px;z-index:2147483646;font-family:system-ui;';
document.body.appendChild(t);
setTimeout(() => t.remove(), 3000);
```

---

## JavaScript – Countdown

```javascript
let n = 5;
const el = document.createElement('div');
el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:48px;font-weight:bold;color:#6C5CE7;z-index:2147483646;';
document.body.appendChild(el);
const iv = setInterval(() => {
  el.textContent = n--;
  if (n < 0) { clearInterval(iv); el.remove(); }
}, 1000);
```

---

**Note:** Injected code runs in a sandboxed iframe. It cannot access cookies, localStorage, or the parent page.
