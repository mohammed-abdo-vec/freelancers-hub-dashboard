// Opens the encrypted data.json with a username and password.
// Each account's copy is AES-GCM encrypted with a key derived from its password (PBKDF2-SHA256),
// so the public site holds nothing readable without a login.
const Vault = (() => {
  const enc = new TextEncoder();
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const SESSION = 'fh-session:' + location.pathname;

  async function accountId(login) {
    const hash = await crypto.subtle.digest('SHA-256', enc.encode('fh:' + login.trim().toLowerCase()));
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function open(login, password) {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('The results file could not be loaded. Check your connection and try again.');
    const file = await res.json();
    const rec = file.accounts[await accountId(login)];
    if (!rec) return null;
    const base = await crypto.subtle.importKey('raw', enc.encode(password.trim()), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(rec.salt), iterations: file.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(rec.iv) }, key, bytes(rec.data));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      return null;
    }
  }

  function remember(data) {
    try { sessionStorage.setItem(SESSION, JSON.stringify(data)); } catch {}
  }

  function recall() {
    try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { return null; }
  }

  function forget() {
    try { sessionStorage.removeItem(SESSION); } catch {}
  }

  // Wires a login form: calls onOpen(data) after a correct login.
  function bindLogin(form, onOpen) {
    const error = form.querySelector('.login-error');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const login = form.elements.login.value;
      const password = form.elements.password.value;
      if (!login.trim() || !password.trim()) {
        error.textContent = 'Enter your username and password.';
        return;
      }
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'Checking…';
      try {
        const data = await open(login, password);
        if (!data) {
          error.textContent = 'That username and password don’t match. Check them and try again.';
        } else {
          remember(data);
          form.reset();
          onOpen(data);
        }
      } catch (e) {
        error.textContent = e.message;
      } finally {
        button.disabled = false;
        button.textContent = button.dataset.label;
      }
    });
  }

  return { open, bindLogin, recall, forget };
})();

// Small DOM helper shared by both sites: el('div', {class: 'x'}, child, 'text')
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const STATUS = {
  done: { label: 'Done', tone: 'ok' },
  demo: { label: 'Done (demo)', tone: 'ok' },
  demo_only: { label: 'Repo missing', tone: 'warn' },
  broken: { label: 'Repo not found', tone: 'bad' },
  missing: { label: 'Not submitted', tone: 'none' },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
