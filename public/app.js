const form = document.getElementById('add-form');
const urlInput = document.getElementById('url');
const listEl = document.getElementById('list');
const errorEl = document.getElementById('error');
const favOnly = document.getElementById('fav-only');
const countEl = document.getElementById('count');

let links = [];

favOnly.addEventListener('change', render);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setBusy(true);
  showError('');
  try {
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || 'Could not save that link.');
    }
    const link = await res.json();
    links.unshift(link);
    urlInput.value = '';
    render();
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(false);
  }
});

async function toggleFavourite(id) {
  showError('');
  try {
    const res = await fetch(`/api/links/${id}`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Could not update that link.');
    const updated = await res.json();
    const link = links.find((l) => l.id === id);
    if (link) link.favourite = updated.favourite;
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function deleteLink(id) {
  showError('');
  try {
    const res = await fetch(`/api/links/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Could not delete that link.');
    links = links.filter((l) => l.id !== id);
    render();
  } catch (err) {
    showError(err.message);
  }
}

function render() {
  listEl.innerHTML = '';

  const visible = favOnly.checked ? links.filter((l) => l.favourite) : links;
  countEl.textContent = `${links.filter((l) => l.favourite).length} ★ · ${links.length} total`;

  if (visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = favOnly.checked ? 'No favourites yet.' : 'No links saved yet.';
    listEl.append(li);
    return;
  }

  for (const link of visible) {
    const li = document.createElement('li');

    const star = document.createElement('button');
    star.className = 'star' + (link.favourite ? ' on' : '');
    star.textContent = link.favourite ? '★' : '☆';
    star.title = link.favourite ? 'Unmark favourite' : 'Mark as favourite';
    star.setAttribute('aria-pressed', String(link.favourite));
    star.addEventListener('click', () => toggleFavourite(link.id));

    const body = document.createElement('div');
    body.className = 'body';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = link.title;

    const a = document.createElement('a');
    a.href = link.url;
    a.textContent = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Saved ${formatDate(link.savedAt)}`;

    body.append(title, a, meta);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteLink(link.id));

    li.append(star, body, del);
    listEl.append(li);
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function showError(msg) {
  errorEl.textContent = msg;
}

function setBusy(busy) {
  form.querySelector('button').disabled = busy;
  urlInput.disabled = busy;
}

// Initial load
(async function init() {
  try {
    const res = await fetch('/api/links');
    links = await res.json();
    render();
  } catch {
    showError('Could not load saved links.');
  }
})();
