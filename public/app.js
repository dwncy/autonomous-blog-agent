const state = {
  posts: [],
  materials: { memory: '', rule: '', soul: '' },
  activeMaterial: 'memory',
  route: parseRoute(),
  controlsExpanded: false,
  isLocalhost: isLocalHost()
};

const elements = {
  workspace: document.querySelector('.workspace'),
  masthead: document.querySelector('.masthead'),
  feed: document.querySelector('#post-feed'),
  emptyTemplate: document.querySelector('#empty-feed-template'),
  controlPane: document.querySelector('#control-pane'),
  controlToggle: document.querySelector('#control-toggle'),
  verbCycle: document.querySelector('#verb-cycle'),
  tabs: [...document.querySelectorAll('.tab')],
  materialTitle: document.querySelector('#material-title'),
  materialContent: document.querySelector('#material-content')
};

boot();

async function boot() {
  bindEvents();
  startVerbCycle();
  await refreshState();
}

function startVerbCycle() {
  const target = elements.verbCycle;
  if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const words = ['write', 'think', 'reflect'];
  let wordIndex = 0;
  let charIndex = words[0].length;
  let deleting = true;

  window.setInterval(() => {
    const word = words[wordIndex];
    target.textContent = word.slice(0, charIndex);

    if (deleting) {
      charIndex -= 1;
      if (charIndex < 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        charIndex = 0;
      }
      return;
    }

    charIndex += 1;
    if (charIndex > words[wordIndex].length + 8) {
      deleting = true;
      charIndex = words[wordIndex].length;
    }
  }, 120);
}

function bindEvents() {
  document.body.classList.toggle('is-localhost', state.isLocalhost);
  elements.workspace.classList.toggle('is-public', !state.isLocalhost);
  elements.controlPane.hidden = !state.isLocalhost;
  renderControls();

  window.addEventListener('hashchange', () => {
    state.route = parseRoute();
    renderPosts();
  });

  elements.controlToggle.addEventListener('click', () => {
    state.controlsExpanded = !state.controlsExpanded;
    renderControls();
  });

  for (const tab of elements.tabs) {
    tab.addEventListener('click', () => {
      state.activeMaterial = tab.dataset.material;
      renderMaterials();
    });
  }
}

async function refreshState() {
  try {
    const response = await fetch('./state.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`State request failed with ${response.status}`);
    const payload = await response.json();
    state.posts = payload.posts || [];
    state.materials = payload.materials || state.materials;
    render();
  } catch (error) {
    elements.feed.textContent = error.message;
  }
}

function render() {
  renderPosts();
  renderMaterials();
}

function renderPosts() {
  elements.feed.replaceChildren();
  renderPageChrome();
  if (state.posts.length === 0) {
    elements.feed.append(elements.emptyTemplate.content.cloneNode(true));
    return;
  }

  if (state.route.view === 'detail') {
    renderPostDetail();
    return;
  }

  renderPostIndex();
}

function renderPostIndex() {
  const list = document.createElement('div');
  list.className = 'post-index';

  for (const post of state.posts) {
    const article = document.createElement('article');
    article.className = 'post-summary';

    const time = document.createElement('time');
    time.dateTime = post.createdAt;
    time.textContent = formatDate(post.createdAt);

    const title = document.createElement('h2');
    const link = document.createElement('a');
    link.href = postUrl(post);
    link.textContent = post.title;
    title.append(link);

    const excerpt = document.createElement('p');
    excerpt.className = 'post-excerpt';
    excerpt.textContent = post.excerpt || firstSentence(post.body) || 'Read the full post.';

    const readLink = document.createElement('a');
    readLink.className = 'read-link';
    readLink.href = postUrl(post);
    readLink.textContent = 'Read post';

    article.append(time, title, excerpt, readLink);
    list.append(article);
  }

  elements.feed.append(list);
}

function renderPostDetail() {
  const postIndex = state.posts.findIndex((candidate) => candidate.id === state.route.postId);
  const post = state.posts[postIndex];
  if (!post) {
    const missing = document.createElement('article');
    missing.className = 'empty-feed';
    missing.innerHTML = '<p class="eyebrow">Post not found</p><h2>This entry is not in the archive.</h2><p><a href="#">Return to all posts</a></p>';
    elements.feed.append(missing);
    return;
  }

  const article = document.createElement('article');
  article.className = 'post-detail';

  const backLink = document.createElement('a');
  backLink.className = 'back-link';
  backLink.href = '#';
  backLink.textContent = 'All posts';

  const time = document.createElement('time');
  time.dateTime = post.createdAt;
  time.textContent = formatDate(post.createdAt);

  const body = document.createElement('div');
  body.className = 'post-body';
  body.innerHTML = renderMarkdown(post.body || '');

  article.append(backLink, time, body, renderArticleNav({
    previous: state.posts[postIndex + 1],
    next: state.posts[postIndex - 1]
  }));
  elements.feed.append(article);
}

function renderArticleNav({ previous, next }) {
  const nav = document.createElement('nav');
  nav.className = 'article-nav';
  nav.setAttribute('aria-label', 'Adjacent articles');

  nav.append(
    renderArticleNavLink('Previous', previous),
    renderArticleNavLink('Next', next)
  );

  return nav;
}

function renderArticleNavLink(label, post) {
  const item = document.createElement(post ? 'a' : 'span');
  item.className = `article-nav-link ${post ? '' : 'is-disabled'}`.trim();

  const kicker = document.createElement('span');
  kicker.className = 'article-nav-kicker';
  kicker.textContent = label;

  const title = document.createElement('strong');
  title.textContent = post?.title || 'No article';

  item.append(kicker, title);
  if (post) {
    item.href = postUrl(post);
  }

  return item;
}

function renderMaterials() {
  const material = state.activeMaterial;
  const title = material.slice(0, 1).toUpperCase() + material.slice(1);
  elements.materialTitle.textContent = title;
  elements.materialContent.textContent = state.materials[material] || '';

  for (const tab of elements.tabs) {
    tab.classList.toggle('is-active', tab.dataset.material === material);
  }
}

function renderControls() {
  if (!state.isLocalhost) return;
  elements.workspace.classList.toggle('has-expanded-controls', state.controlsExpanded);
  elements.controlPane.classList.toggle('is-collapsed', !state.controlsExpanded);
  elements.controlToggle.setAttribute('aria-expanded', String(state.controlsExpanded));
}

function renderPageChrome() {
  const isDetail = state.route.view === 'detail';
  elements.workspace.classList.toggle('is-detail', isDetail);
  elements.masthead.hidden = isDetail;
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#/u, '');
  const detail = hash.match(/^\/post\/(.+)$/u);
  if (!detail) return { view: 'index' };
  try {
    return { view: 'detail', postId: decodeURIComponent(detail[1]) };
  } catch {
    return { view: 'index' };
  }
}

function postUrl(post) {
  return `#/post/${encodeURIComponent(post.id)}`;
}

function isLocalHost() {
  return ['', 'localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function firstSentence(value) {
  const text = String(value || '')
    .replace(/[#>*_`\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(/(?<=[.!?])\s/u)[0] || '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(escapeHtml(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(escapeHtml(item))}</li>`).join('')}</ul>`);
    list = [];
  };

  const flushCode = () => {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 2;
      html.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1].trim());
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${inlineMarkdown(escapeHtml(line.replace(/^>\s?/, '').trim()))}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return html.join('');
}

function inlineMarkdown(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
