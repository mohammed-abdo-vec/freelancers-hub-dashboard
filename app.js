const CORE = new Set(['React', 'Vite', 'Zustand', 'HTML/CSS/JS']);
const COUNTED = new Set(['done', 'demo']);

const loginView = document.getElementById('login-view');
const dashView = document.getElementById('dash-view');
let data = null;
let sortKey = 'done';
let sortDir = 'descending';
const open = new Set();

const pct = (n, total) => `${total ? (n / total) * 100 : 0}%`;

function barRow(label, segments, total, valueText) {
  return el('div', { class: 'bar-row' },
    el('span', { class: 'label', text: label }),
    el('div', { class: 'bar-track', role: 'img', 'aria-label': valueText },
      segments.map(([n, color]) => el('span', { style: `width:${pct(n, total)};background:${color}` }))),
    el('span', { class: 'value', text: valueText }));
}

function renderSummary() {
  const { members, tasks, stats } = data;
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
  document.getElementById('takeaway').textContent =
    `${stats.all_done} of ${stats.members} members have finished all ${tasks.length} tasks. ` +
    `${most.label} is the task most often missing (${most.missing + most.needs} members).`;

  document.getElementById('kpis').replaceChildren(
    ...[[stats.all_done, `Finished all ${tasks.length}`], [four, `One task left`],
      [stats.none, 'Nothing submitted'], [stats.members, 'Members tracked']]
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
  filter.replaceChildren(
    el('option', { value: 'all', text: 'Everyone' }),
    el('option', { value: 'unfinished', text: 'Not finished yet' }),
    el('option', { value: 'needs', text: 'Has a demo or link to fix' }),
    el('option', { value: 'none', text: 'Nothing submitted' }),
    ...tasks.map((t) => el('option', { value: `missing:${t.key}`, text: `Missing ${t.label}` })));
  filter.value = [...filter.options].some((o) => o.value === current) ? current : 'all';

  const head = document.getElementById('head');
  head.replaceChildren(...[['name', 'Member'], ['done', 'Done'],
    ...tasks.map((t) => [t.key, t.label]), ['tools', 'Tools']].map(([key, label]) =>
    el('th', { class: key === 'tools' ? 'hide-narrow' : null, 'data-key': key },
      el('button', { type: 'button', text: label }))));
}

function matches(m, q, f) {
  if (q && ![m.name, m.telegram, m.login, ...m.tools,
    ...Object.values(m.tasks).flatMap((t) => [...t.repos.map((r) => r.name), ...t.demos])]
    .some((v) => String(v || '').toLowerCase().includes(q))) return false;
  if (f === 'unfinished') return m.done < data.tasks.length;
  if (f === 'none') return m.done === 0;
  if (f === 'needs') return Object.values(m.tasks).some((t) => ['demo_only', 'broken'].includes(t.status));
  if (f.startsWith('missing:')) return !COUNTED.has(m.tasks[f.slice(8)].status);
  return true;
}

function sortValue(m, key) {
  if (key === 'name') return m.name.toLowerCase();
  if (key === 'done') return m.done;
  if (key === 'tools') return m.tools.filter((t) => !CORE.has(t)).length;
  const order = { done: 0, demo: 1, demo_only: 2, broken: 3, missing: 4 };
  return order[m.tasks[key].status];
}

function detailRow(m) {
  const cols = data.tasks.length + 3;
  const link = (url, text) => el('a', { href: url, target: '_blank', rel: 'noopener', text });
  return el('tr', { class: 'detail' }, el('td', { class: 'details', colspan: cols },
    el('div', { class: 'detail-grid' },
      data.tasks.map((t) => {
        const task = m.tasks[t.key];
        const s = STATUS[task.status];
        return el('div', { class: 'detail-task' },
          el('span', {}, el('span', { class: `pill tone-${s.tone}`, text: s.label }), ' ', el('span', { class: 'small', text: t.label })),
          el('div', { class: 'links' },
            task.repos.map((r) => el('div', {}, link(r.url, r.name), el('span', { class: 'small muted', text: `  ${r.stack.join(', ')}` }))),
            task.demos.map((d) => el('div', {}, link(d, d.replace(/^https?:\/\//, '')))),
            task.broken.map((b) => el('div', { class: 'url muted', text: `Not found: ${b}` })),
            !task.repos.length && !task.demos.length && !task.broken.length && el('span', { class: 'small muted', text: '—' })));
      }),
      m.extras.length > 0 && el('div', { class: 'detail-task' },
        el('span', { class: 'small', text: 'Other projects' }),
        el('div', { class: 'links' }, m.extras.map((e) => typeof e === 'object' ? link(e.url, e.name) : el('span', { class: 'url muted', text: e })))),
      el('div', { class: 'detail-meta small' },
        el('span', { text: `Login: ${m.login}` }),
        m.telegram && el('span', { text: `Telegram: @${m.telegram}` }),
        m.deploys.length > 0 && el('span', { text: `Deploys on: ${m.deploys.join(', ')}` })))));
}

function renderTable() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const f = document.getElementById('filter').value;
  const rows = data.members.filter((m) => matches(m, q, f)).sort((a, b) => {
    const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
    const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return (sortDir === 'ascending' ? c : -c) || a.name.localeCompare(b.name);
  });
  document.getElementById('count').textContent = `${rows.length} of ${data.members.length} members`;
  document.querySelectorAll('#head th').forEach((th) => {
    if (th.dataset.key === sortKey) th.setAttribute('aria-sort', sortDir); else th.removeAttribute('aria-sort');
  });
  const total = data.tasks.length;
  document.getElementById('rows').replaceChildren(...rows.flatMap((m) => {
    const tr = el('tr', { class: 'member', tabindex: '0', 'aria-expanded': String(open.has(m.id)), 'data-id': m.id },
      el('td', { class: 'name', dir: 'auto' }, m.name, m.telegram && el('small', { dir: 'ltr', text: `@${m.telegram}` })),
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

function toCsv() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Member', 'Telegram', 'Login', 'Done', ...data.tasks.map((t) => t.label), ...data.tasks.map((t) => `${t.label} link`), 'Tools'];
  const lines = data.members.map((m) => [m.name, m.telegram ? `@${m.telegram}` : '', m.login, m.done,
    ...data.tasks.map((t) => STATUS[m.tasks[t.key].status].label),
    ...data.tasks.map((t) => { const x = m.tasks[t.key]; return x.repos[0]?.url || x.demos[0] || ''; }),
    m.tools.join(', ')].map(esc).join(','));
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `freelancers-hub-${data.scanned_at.slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

function render(d) {
  data = d;
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
  if (event.target.closest('a')) return;
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
document.getElementById('logout').addEventListener('click', () => {
  Vault.forget();
  data = null;
  dashView.hidden = true;
  loginView.hidden = false;
});

Vault.bindLogin(document.getElementById('login-form'), render);
const saved = Vault.recall();
if (saved) render(saved);
