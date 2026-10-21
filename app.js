const CORE = new Set(['React', 'Vite', 'Zustand', 'HTML/CSS/JS']);
const COUNTED = new Set(['done', 'demo']);
const NEEDS = new Set(['demo_only', 'broken', 'needs_fix']);
const EDIT_STATUSES = [['', 'Automatic (from the scan)'], ['done', 'Done'], ['needs_fix', 'Needs fixing'], ['missing', 'Not submitted']];
const PENDING_KEY = 'fh-pending-edits';

const loginView = document.getElementById('login-view');
const dashView = document.getElementById('dash-view');
let data = null;
let sortKey = 'done';
let sortDir = 'descending';
const open = new Set();
// Edits made here but not yet in the published data: {base, downloaded, members: {telegramId: {field: value}}}
let pending = { base: null, downloaded: false, members: {} };

const pct = (n, total) => `${total ? (n / total) * 100 : 0}%`;
const visible = () => data.members.filter((m) => !m.hidden);
const byId = (id) => data.members.find((m) => m.id === id);

// ---------- pending edits (kept in this browser until downloaded) ----------

function loadPending() {
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)) || pending; } catch {}
  // Downloaded edits from before the latest update are now part of the published data
  if (pending.base && pending.base !== data.generated_at && pending.downloaded) {
    pending = { base: data.generated_at, downloaded: false, members: {} };
  }
  pending.base = pending.base || data.generated_at;
  savePending();
}

function savePending() {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {}
  const n = Object.keys(pending.members).length;
  document.getElementById('pending').hidden = n === 0;
  document.getElementById('pending-text').textContent =
    `Saved edits for ${n} ${n === 1 ? 'member' : 'members'}. With the update helper running on your Mac they go live ` +
    'in about 2 minutes; refresh and log in again to see them. Without it, run update.py.';
}

function editColumns() {
  return ['telegram_id', 'member', 'display_name', 'hidden', 'reset_password', 'feedback',
    ...data.tasks.flatMap((t) => ['status', 'repo', 'demo', 'feedback'].map((f) => `${t.key}_${f}`))];
}

// Saves an edits file for these members (all pending ones by default). The update helper
// (watch_edits.py) on the coach's Mac applies it from Downloads as soon as it appears.
function downloadEdits(ids = Object.keys(pending.members)) {
  const cols = editColumns();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = ids.map((id) => [id, pending.members[id]]).filter(([, ch]) => ch).map(([id, ch]) =>
    cols.map((c) => esc(c === 'telegram_id' ? id : c === 'member' ? byId(Number(id))?.telegram_name : ch[c])).join(','));
  if (!rows.length) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const who = ids.length === 1 ? `-${ids[0]}` : '';
  saveFile(`freelancers-hub-edits-${stamp}${who}.csv`, [cols.join(','), ...rows].join('\n'));
  pending.downloaded = true;
  savePending();
}

function saveFile(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------- summary ----------

function barRow(label, segments, total, valueText) {
  return el('div', { class: 'bar-row' },
    el('span', { class: 'label', text: label }),
    el('div', { class: 'bar-track', role: 'img', 'aria-label': valueText },
      segments.map(([n, color]) => el('span', { style: `width:${pct(n, total)};background:${color}` }))),
    el('span', { class: 'value', text: valueText }));
}

function renderSummary() {
  const { tasks, stats } = data;
  const members = visible();
  document.getElementById('course').textContent = data.course;
  document.getElementById('updated').textContent = `Updated ${formatDate(data.scanned_at)}`;
  document.getElementById('results-link').href = data.results_url;

  const perTask = tasks.map((t) => {
    const counts = { done: 0, needs: 0, missing: 0 };
    for (const m of members) {
      const s = m.tasks[t.key].status;
      counts[COUNTED.has(s) ? 'done' : s === 'missing' ? 'missing' : 'needs']++;
    }
    return { ...t, ...counts };
  });
  const most = perTask.slice().sort((a, b) => (b.missing + b.needs) - (a.missing + a.needs))[0];
  const four = members.filter((m) => m.done === tasks.length - 1).length;
  const toFix = members.filter((m) => Object.values(m.tasks).some((t) => NEEDS.has(t.status))).length;
  document.getElementById('takeaway').textContent =
    `${stats.all_done} of ${stats.members} members have finished all ${tasks.length} tasks. ` +
    `${most.label} is the task most often missing (${most.missing + most.needs} members).`;

  document.getElementById('kpis').replaceChildren(
    ...[[stats.all_done, `Finished all ${tasks.length}`], [four, 'One task left'],
      [toFix, 'Has something to fix'], [stats.members, 'Active members']]
      .map(([n, label]) => el('div', { class: 'kpi' }, el('b', { text: n }), el('span', { text: label }))));

  document.getElementById('task-bars').replaceChildren(...perTask.map((t) =>
    barRow(t.label, [[t.done, 'var(--ok)'], [t.needs, 'var(--warn)']], members.length, `${t.done} of ${members.length}`)));

  const toolCounts = new Map();
  for (const m of members) for (const t of m.tools) if (!CORE.has(t)) toolCounts.set(t, (toolCounts.get(t) || 0) + 1);
  const tools = [...toolCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxTool = tools.length ? tools[0][1] : 1;
  document.getElementById('tool-bars').replaceChildren(...(tools.length
    ? tools.map(([tool, n]) => barRow(tool, [[n, 'var(--accent)']], maxTool, `${n} ${n === 1 ? 'member' : 'members'}`))
    : [el('p', { class: 'muted small', text: 'No extra tools found yet.' })]));

  const filter = document.getElementById('filter');
  const current = filter.value;
  const hiddenCount = data.members.length - members.length;
  filter.replaceChildren(
    el('option', { value: 'all', text: 'All active members' }),
    el('option', { value: 'unfinished', text: 'Not finished yet' }),
    el('option', { value: 'needs', text: 'Has something to fix' }),
    el('option', { value: 'coach', text: 'Edited by a coach' }),
    ...tasks.map((t) => el('option', { value: `missing:${t.key}`, text: `Missing ${t.label}` })),
    hiddenCount > 0 && el('option', { value: 'hidden', text: `Hidden (${hiddenCount})` }));
  filter.value = [...filter.options].some((o) => o.value === current) ? current : 'all';

  document.getElementById('head').replaceChildren(...[['name', 'Member'], ['done', 'Done'],
    ...tasks.map((t) => [t.key, t.label]), ['tools', 'Tools']].map(([key, label]) =>
    el('th', { class: key === 'tools' ? 'hide-narrow' : null, 'data-key': key },
      el('button', { type: 'button', text: label }))));
}

// ---------- table ----------

function matches(m, q, f) {
  if (f === 'hidden') return m.hidden;
  if (m.hidden) return false;
  if (q && ![m.name, m.telegram_name, m.telegram, m.login, m.feedback, ...m.tools,
    ...Object.values(m.tasks).flatMap((t) => [...t.repos.map((r) => r.name), ...t.demos, t.feedback])]
    .some((v) => String(v || '').toLowerCase().includes(q))) return false;
  if (f === 'unfinished') return m.done < data.tasks.length;
  if (f === 'needs') return Object.values(m.tasks).some((t) => NEEDS.has(t.status));
  if (f === 'coach') return Object.keys(m.edits || {}).length > 0 || Boolean(pending.members[m.id]);
  if (f.startsWith('missing:')) return !COUNTED.has(m.tasks[f.slice(8)].status);
  return true;
}

function sortValue(m, key) {
  if (key === 'name') return m.name.toLowerCase();
  if (key === 'done') return m.done;
  if (key === 'tools') return m.tools.filter((t) => !CORE.has(t)).length;
  const order = { done: 0, demo: 1, needs_fix: 2, demo_only: 3, broken: 4, missing: 5 };
  return order[m.tasks[key].status];
}

function badges(m) {
  return [
    pending.members[m.id] && el('span', { class: 'tag tag-pending', text: 'unsaved edit' }),
    Object.keys(m.edits || {}).length > 0 && el('span', { class: 'tag', text: 'coach edits' }),
    m.hidden && el('span', { class: 'tag', text: 'hidden' }),
  ];
}

function detailRow(m) {
  const cols = data.tasks.length + 3;
  const link = (url, text) => el('a', { href: url, target: '_blank', rel: 'noopener', text });
  const coachSet = (task) => task.coach && task.coach.length
    ? el('span', { class: 'tag', text: `set by coach: ${task.coach.join(', ')}` }) : null;
  return el('tr', { class: 'detail' }, el('td', { class: 'details', colspan: cols },
    el('div', { class: 'detail-grid' },
      el('div', { class: 'detail-actions' },
        el('div', { class: 'detail-meta small' },
          el('span', { dir: 'auto', text: m.name !== m.telegram_name ? `Shown as “${m.name}” (Telegram: ${m.telegram_name})` : `Telegram name: ${m.telegram_name}` }),
          m.telegram && el('span', { text: `@${m.telegram}` }),
          el('span', { text: `Telegram ID: ${m.id}` }),
          el('span', { text: `Login: ${m.login}` }),
          m.deploys.length > 0 && el('span', { text: `Deploys on: ${m.deploys.join(', ')}` })),
        el('button', { class: 'btn', type: 'button', 'data-edit': m.id, text: 'Edit member' })),
      m.feedback && el('div', { class: 'coach-note' }, el('span', { class: 'eyebrow', text: 'Coach feedback' }), el('p', { dir: 'auto', text: m.feedback })),
      data.tasks.map((t) => {
        const task = m.tasks[t.key];
        const s = STATUS[task.status];
        return el('div', { class: 'detail-task' },
          el('span', {}, el('span', { class: `pill tone-${s.tone}`, text: s.label }), ' ', el('span', { class: 'small', text: t.label })),
          el('div', { class: 'links' },
            task.repos.map((r) => el('div', {}, link(r.url, r.name), el('span', { class: 'small muted', text: `  ${r.stack.join(', ')}` }))),
            task.demos.map((d) => el('div', {}, link(d, d.replace(/^https?:\/\//, '')))),
            task.broken.map((b) => el('div', { class: 'url muted', text: `Not found: ${b}` })),
            !task.repos.length && !task.demos.length && !task.broken.length && el('span', { class: 'small muted', text: '—' }),
            task.feedback && el('div', { class: 'small', dir: 'auto' }, el('b', { text: 'Feedback: ' }), task.feedback),
            coachSet(task)));
      }),
      m.extras.length > 0 && el('div', { class: 'detail-task' },
        el('span', { class: 'small', text: 'Other projects' }),
        el('div', { class: 'links' }, m.extras.map((e) => typeof e === 'object' ? link(e.url, e.name) : el('span', { class: 'url muted', text: e })))))));
}

function renderTable() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const f = document.getElementById('filter').value;
  const rows = data.members.filter((m) => matches(m, q, f)).sort((a, b) => {
    const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
    const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return (sortDir === 'ascending' ? c : -c) || a.name.localeCompare(b.name);
  });
  document.getElementById('count').textContent = `${rows.length} of ${visible().length} members`;
  document.querySelectorAll('#head th').forEach((th) => {
    if (th.dataset.key === sortKey) th.setAttribute('aria-sort', sortDir); else th.removeAttribute('aria-sort');
  });
  const total = data.tasks.length;
  document.getElementById('rows').replaceChildren(...rows.flatMap((m) => {
    const tr = el('tr', { class: 'member', tabindex: '0', 'aria-expanded': String(open.has(m.id)), 'data-id': m.id },
      el('td', { class: 'name', dir: 'auto' }, m.name, m.telegram && el('small', { dir: 'ltr', text: `@${m.telegram}` }),
        el('span', { class: 'tags' }, badges(m))),
      el('td', {}, el('div', { class: 'done' }, `${m.done}`,
        el('div', { class: 'bar-track' }, el('span', { style: `width:${pct(m.done, total)};background:${m.done === total ? 'var(--ok)' : 'var(--accent)'}` })))),
      data.tasks.map((t) => {
        const s = STATUS[m.tasks[t.key].status];
        return el('td', { class: 'task', title: `${t.label}: ${s.label}` },
          el('span', { class: `dot tone-${s.tone}`, role: 'img', 'aria-label': s.label }));
      }),
      el('td', { class: 'hide-narrow small muted', text: m.tools.filter((t) => !CORE.has(t)).join(', ') }));
    return open.has(m.id) ? [tr, detailRow(m)] : [tr];
  }));
}

// ---------- edit form ----------

const dialog = document.getElementById('edit');
let editing = null;

const linesOf = (list) => list.join('\n');
const rowsFor = (n) => Math.min(Math.max(n, 1), 4);
const sameLinks = (a, b) => a.split(/[\s,]+/).filter(Boolean).join(' ') === b.split(/[\s,]+/).filter(Boolean).join(' ');

function field(label, control, hint) {
  return el('div', { class: 'field' }, el('span', { class: 'field-label', text: label }), control,
    hint instanceof Node ? hint : hint && el('span', { class: 'small muted', text: hint }));
}

function openEditor(id) {
  const m = byId(id);
  editing = m;
  const p = pending.members[id] || {};
  const e = m.edits || {};
  // A pending value wins over the published one; "auto" means back to what the scan found
  const val = (k, published) => (k in p ? (p[k] === 'auto' ? '' : p[k]) : published);
  const autoBox = (k) => el('label', { class: 'check small' },
    el('input', { type: 'checkbox', name: `${k}__auto`, checked: p[k] === 'auto' }), 'Back to what the scan found');

  const form = el('form', { method: 'dialog', class: 'edit-form' },
    el('div', { class: 'edit-head' },
      el('div', {}, el('span', { class: 'eyebrow', text: 'Edit member' }), el('h2', { dir: 'auto', text: m.name })),
      el('button', { class: 'btn-quiet', type: 'button', 'data-close': '', text: 'Cancel' })),
    el('fieldset', {},
      el('legend', { text: 'Profile' }),
      field('Display name', el('input', { type: 'text', name: 'display_name', value: val('display_name', e.display_name || ''), placeholder: m.telegram_name, dir: 'auto' }),
        'Leave empty to use their Telegram name.'),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'hidden', checked: 'hidden' in p ? p.hidden === 'yes' : Boolean(m.hidden) }),
        'Hide this member (no results page, login or counts)'),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'reset_password', checked: p.reset_password === 'yes' }),
        'Give them a new password on the next update'),
      field('Feedback for the member', el('textarea', { name: 'feedback', rows: '3', dir: 'auto' }, val('feedback', m.feedback || '')),
        'Shown at the top of their results page.')),
    data.tasks.map((t) => {
      const task = m.tasks[t.key];
      const k = t.key;
      return el('fieldset', {},
        el('legend', {}, t.label, ' ', el('span', { class: `pill tone-${STATUS[task.status].tone}`, text: STATUS[task.status].label })),
        field('Status', el('select', { name: `${k}_status` },
          EDIT_STATUSES.map(([v, label]) => el('option', { value: v, text: label, selected: val(`${k}_status`, e[`${k}_status`] || '') === v })))),
        field('Repo links', el('textarea', { name: `${k}_repo`, rows: String(rowsFor(task.repos.length + task.broken.length)), class: 'mono', spellcheck: 'false' },
          val(`${k}_repo`, linesOf([...task.repos.map((r) => r.url), ...task.broken])) .replace(/^none$/, '')),
          e[`${k}_repo`] ? autoBox(`${k}_repo`) : 'One per line. Empty the box to remove the repo.'),
        field('Demo links', el('textarea', { name: `${k}_demo`, rows: String(rowsFor(task.demos.length)), class: 'mono', spellcheck: 'false' },
          val(`${k}_demo`, linesOf(task.demos)).replace(/^none$/, '')),
          e[`${k}_demo`] ? autoBox(`${k}_demo`) : null),
        field('Feedback on this task', el('textarea', { name: `${k}_feedback`, rows: '2', dir: 'auto' }, val(`${k}_feedback`, task.feedback || ''))));
    }),
    el('div', { class: 'edit-foot' },
      el('span', { class: 'small muted', text: 'Saving downloads an edits file. The update helper on your Mac publishes it.' }),
      el('button', { class: 'btn', type: 'submit', text: 'Save changes' })));

  dialog.replaceChildren(form);
  dialog.showModal();
}

function collectChanges(form, m) {
  const f = form.elements;
  const e = m.edits || {};
  const ch = {};
  const text = (name) => f[name].value.trim();
  const setText = (k, now, before) => { if (now !== before) ch[k] = now || 'auto'; };

  setText('display_name', text('display_name'), e.display_name || '');
  if (f.hidden.checked !== Boolean(m.hidden)) ch.hidden = f.hidden.checked ? 'yes' : 'auto';
  if (f.reset_password.checked) ch.reset_password = 'yes';
  setText('feedback', text('feedback'), m.feedback || '');

  for (const t of data.tasks) {
    const k = t.key;
    const task = m.tasks[t.key];
    const status = f[`${k}_status`].value;
    if (status !== (e[`${k}_status`] || '')) ch[`${k}_status`] = status || 'auto';
    for (const [kind, current] of [['repo', [...task.repos.map((r) => r.url), ...task.broken]], ['demo', task.demos]]) {
      const name = `${k}_${kind}`;
      if (f[`${name}__auto`]?.checked) { ch[name] = 'auto'; continue; }
      const now = text(name);
      if (!sameLinks(now, linesOf(current))) ch[name] = now ? now.split(/[\s,]+/).filter(Boolean).join(' ') : 'none';
    }
    setText(`${k}_feedback`, text(`${k}_feedback`), task.feedback || '');
  }
  return ch;
}

dialog.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]') || event.target === dialog) dialog.close();
});
dialog.addEventListener('submit', (event) => {
  const ch = collectChanges(event.target, editing);
  const id = String(editing.id);
  if (Object.keys(ch).length) {
    pending.members[id] = ch;
    downloadEdits([id]);         // the edits file goes to Downloads right away
  } else {
    delete pending.members[id];
    savePending();
  }
  renderTable();
});

// ---------- full export ----------

function toCsv() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Member', 'Telegram name', 'Telegram', 'Telegram ID', 'Login', 'Hidden', 'Done', 'Feedback',
    ...data.tasks.flatMap((t) => [`${t.label}`, `${t.label} repos`, `${t.label} demos`, `${t.label} feedback`]), 'Tools'];
  const lines = data.members.map((m) => [m.name, m.telegram_name, m.telegram ? `@${m.telegram}` : '', m.id, m.login,
    m.hidden ? 'yes' : '', m.done, m.feedback,
    ...data.tasks.flatMap((t) => {
      const x = m.tasks[t.key];
      return [STATUS[x.status].label, [...x.repos.map((r) => r.url), ...x.broken].join(' '), x.demos.join(' '), x.feedback];
    }),
    m.tools.join(', ')].map(esc).join(','));
  saveFile(`freelancers-hub-members-${data.scanned_at.slice(0, 10)}.csv`, [head.map(esc).join(','), ...lines].join('\n'));
}

// ---------- wiring ----------

function render(d) {
  data = d;
  loadPending();
  renderSummary();
  renderTable();
  loginView.hidden = true;
  dashView.hidden = false;
}

document.getElementById('search').addEventListener('input', renderTable);
document.getElementById('filter').addEventListener('change', renderTable);
document.getElementById('head').addEventListener('click', (event) => {
  const th = event.target.closest('th');
  if (!th) return;
  const key = th.dataset.key;
  if (key === sortKey) sortDir = sortDir === 'ascending' ? 'descending' : 'ascending';
  else { sortKey = key; sortDir = key === 'done' || key === 'tools' ? 'descending' : 'ascending'; }
  renderTable();
});
document.getElementById('rows').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  if (edit) { openEditor(Number(edit.dataset.edit)); return; }
  if (event.target.closest('a, .detail')) return;
  const tr = event.target.closest('tr.member');
  if (!tr) return;
  const id = Number(tr.dataset.id);
  if (open.has(id)) open.delete(id); else open.add(id);
  renderTable();
});
document.getElementById('rows').addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr.member')) {
    event.preventDefault();
    event.target.click();
  }
});
document.getElementById('csv').addEventListener('click', toCsv);
document.getElementById('download-edits').addEventListener('click', downloadEdits);
document.getElementById('clear-edits').addEventListener('click', () => {
  pending = { base: data.generated_at, downloaded: false, members: {} };
  savePending();
  renderTable();
});
document.getElementById('logout').addEventListener('click', () => {
  Vault.forget();
  data = null;
  dashView.hidden = true;
  loginView.hidden = false;
});

Vault.bindLogin(document.getElementById('login-form'), render);
Vault.recall().then((saved) => {
  if (saved && saved.data) render(saved.data);
  else if (saved && saved.stale) {
    document.querySelector('.login-error').textContent = 'The results were updated. Log in again to see the latest.';
  }
});
