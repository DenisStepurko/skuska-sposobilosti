'use strict';

const TEST_SIZE = 60;
const TEST_MINUTES = 180;
const PASS_PERCENT = 80;
const STORE_KEY = 'medtests:v1';

const I18N = {
  uk: {
    appTitle: 'Підготовка до іспиту',
    appSub: (q, c) => `${q} питань у ${c} категоріях`,
    study: 'Вивчення',
    studySub: 'По категоріях, з відповідями',
    test: 'Тестування',
    testSub: (n, m) => `${n} випадкових питань · ${m} хв`,
    categories: 'Категорії',
    questions: 'питань',
    learned: (ok, total) => `засвоєно ${ok} з ${total}`,
    history: 'Останні тести',
    noAnswers: 'Для цих категорій ще немає правильних відповідей — питання можна переглядати, але перевірка недоступна:',
    language: 'Мова',
    question: (i, n) => `Питання ${i} з ${n}`,
    showAnswer: 'Перевірити',
    next: 'Далі',
    prev: 'Назад',
    correct: 'Правильно',
    wrong: 'Неправильно',
    correctIs: (l) => `Правильна відповідь: ${l}`,
    multiHint: 'Може бути кілька правильних відповідей.',
    noKey: 'Відповідь для цього питання ще не додана.',
    modeCheck: 'Самоперевірка',
    modeRead: 'Читання',
    filterAll: 'Усі',
    filterHard: 'Складні',
    filterNew: 'Нові',
    emptyFilter: 'Тут поки порожньо 🎉',
    pickCategories: 'Категорії для тесту',
    start: 'Почати тест',
    continueTest: 'Продовжити незавершений тест',
    finish: 'Завершити',
    confirmFinish: (n) => `Без відповіді залишилось ${n} питань. Завершити тест?`,
    confirmLeave: 'Тест збережеться, його можна буде продовжити. Вийти?',
    confirmNew: 'Почати новий тест? Незавершений буде втрачено.',
    result: 'Результат',
    resultLine: (ok, n) => `${ok} з ${n} правильно`,
    mistakes: 'Помилки',
    yourAnswer: 'Ваша відповідь',
    noAnswer: '—',
    toHome: 'На головну',
    again: 'Ще раз',
    reviewAll: 'Переглянути всі',
    noMistakes: 'Помилок немає!',
    all: 'Усі категорії',
    resetStats: 'Скинути статистику',
    confirmReset: 'Скинути всю статистику вивчення та історію тестів?',
    loading: 'Завантаження…',
    unofficial: 'Правильні відповіді неофіційні й можуть містити помилки.',
    timeLeft: 'Залишилось часу',
    timeUp: 'Час вийшов — тест завершено автоматично.',
    passed: 'Тест складено',
    failed: 'Тест не складено',
    passRule: (p) => `Прохідний бал — ${p}%`,
    testRules: (n, m, p) => `${n} питань, ${m} хвилин, прохідний бал ${p}%. Коли час вийде, тест завершиться автоматично.`,
    loadError: 'Не вдалося завантажити питання. Перевірте з’єднання з інтернетом.',
  },
};

/* ---------- state ---------- */

const store = loadStore();
let lang = store.lang || 'uk';
let index = null;
const cache = {}; // "lang:catId" -> category data

function loadStore() {
  try {
    return { stats: {}, studyPos: {}, history: [], studyMode: 'check', ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return { stats: {}, studyPos: {}, history: [], studyMode: 'check' };
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
}
const t = (k, ...a) => {
  const v = (I18N[lang] || I18N.uk)[k];
  return typeof v === 'function' ? v(...a) : v;
};

// stats are keyed by category + question number, so they survive a language switch
const statKey = (catId, n) => `${catId}:${n}`;
function record(catId, n, ok) {
  const s = (store.stats[statKey(catId, n)] ||= { r: 0, w: 0, last: null });
  ok ? s.r++ : s.w++;
  s.last = ok;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
async function loadCategory(id) {
  const key = `${lang}:${id}`;
  return (cache[key] ||= await fetchJSON(`data/${lang}/${id}.json`));
}
const categories = () => index.languages[lang]?.categories || [];
const hasKey = (q) => Array.isArray(q.correct) && q.correct.length > 0;

/* ---------- helpers ---------- */

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const go = (hash) => { location.hash = hash; };

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function topbar(title, { back = '#/', meta = '', right = '' } = {}) {
  return `<div class="topbar">
    ${back ? `<button class="icon-btn" data-act="back" data-href="${back}" aria-label="${t('prev')}">‹</button>` : ''}
    <h1>${esc(title)}</h1>
    ${meta ? `<span class="meta">${meta}</span>` : ''}
    ${right}
  </div>`;
}

function optionsHtml(q, { selected = [], reveal = false, disabled = false }) {
  return `<div class="options">${q.options.map((o) => {
    let cls = '';
    const isSel = selected.includes(o.id);
    if (reveal && hasKey(q)) {
      if (q.correct.includes(o.id)) cls = 'correct';
      else if (isSel) cls = 'wrong';
    } else if (isSel) cls = 'selected';
    return `<button class="opt ${cls}" data-opt="${o.id}" ${disabled ? 'disabled' : ''}>
      <span class="letter">${o.id}</span><span>${esc(o.text)}</span></button>`;
  }).join('')}</div>`;
}

function bottombar(html) {
  return `<div class="bottombar"><div class="inner">${html}</div></div>`;
}

/* ---------- home ---------- */

function renderHome() {
  const cats = categories();
  const total = cats.reduce((s, c) => s + c.count, 0);
  const missing = cats.filter((c) => c.answered < c.count);
  const langs = Object.keys(index.languages);

  const catRows = cats.map((c) => {
    let ok = 0, bad = 0;
    for (let n = 1; n <= c.count; n++) {
      const s = store.stats[statKey(c.id, n)];
      if (s?.last === true) ok++;
      else if (s?.last === false) bad++;
    }
    return `<button class="card row" data-href="#/study/${c.id}">
      <div class="grow">
        <div class="title">${esc(c.title)}</div>
        <div class="sub">${c.count} ${t('questions')} · ${t('learned', ok, c.count)}</div>
        <div class="bar"><i class="ok" style="width:${(ok / c.count) * 100}%"></i><i class="bad" style="width:${(bad / c.count) * 100}%"></i></div>
      </div>
      <span class="chev">›</span>
    </button>`;
  }).join('');

  const hist = store.history.slice(-5).reverse().map((h) => {
    const pct = Math.round((h.ok / h.total) * 100);
    return `<div class="card row"><div class="grow">
      <div class="title">${pct}% · ${t('resultLine', h.ok, h.total)}${h.passed === undefined ? '' : ` · <span class="verdict ${h.passed ? 'ok' : 'bad'}">${h.passed ? t('passed') : t('failed')}</span>`}</div>
      <div class="sub">${new Date(h.date).toLocaleString(lang)}</div></div></div>`;
  }).join('');

  app.innerHTML = `
    <div class="hero">
      <h1>${t('appTitle')}</h1>
      <p>${t('appSub', total, cats.length)}</p>
    </div>
    ${langs.length > 1 ? `<div class="seg" style="margin-top:16px">${langs.map((l) =>
      `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>` : ''}
    <div class="modes">
      <button class="card mode" data-href="#/study"><b>${t('study')}</b><span>${t('studySub')}</span></button>
      <button class="card mode primary" data-href="#/test"><b>${t('test')}</b><span>${t('testSub', TEST_SIZE, TEST_MINUTES)}</span></button>
    </div>
    <div class="notice">${t('unofficial')}</div>
    ${missing.length ? `<div class="notice warn">${t('noAnswers')} ${missing.map((c) => esc(c.title)).join(', ')}</div>` : ''}
    <h2>${t('categories')}</h2>
    <div class="list">${catRows}</div>
    ${hist ? `<h2>${t('history')}</h2><div class="list">${hist}</div>` : ''}
    ${Object.keys(store.stats).length || store.history.length
      ? `<p style="text-align:center;margin-top:24px"><button class="icon-btn" data-act="reset" style="font-size:14px">${t('resetStats')}</button></p>` : ''}
  `;
}

/* ---------- study ---------- */

const study = { catId: null, list: [], i: 0, selected: [], revealed: false, filter: 'all' };

function renderStudyPick() {
  app.innerHTML = topbar(t('study')) + `<div class="list">${categories().map((c) =>
    `<button class="card row" data-href="#/study/${c.id}"><div class="grow">
      <div class="title">${esc(c.title)}</div><div class="sub">${c.count} ${t('questions')}</div></div>
      <span class="chev">›</span></button>`).join('')}</div>`;
}

async function openStudy(catId) {
  const cat = await loadCategory(catId);
  if (study.catId !== catId) {
    Object.assign(study, { catId, filter: 'all', selected: [], revealed: false });
    study.i = store.studyPos[catId] || 0;
  }
  study.cat = cat;
  applyStudyFilter(false);
  renderStudy();
}

function applyStudyFilter(resetPos = true) {
  const qs = study.cat.questions;
  const st = (q) => store.stats[statKey(study.catId, q.n)];
  study.list = study.filter === 'hard' ? qs.filter((q) => st(q)?.last === false)
    : study.filter === 'new' ? qs.filter((q) => !st(q))
    : qs;
  if (resetPos) study.i = 0;
  study.i = Math.min(study.i, Math.max(0, study.list.length - 1));
}

function renderStudy() {
  const { cat, list, i } = study;
  const readMode = store.studyMode === 'read';
  const q = list[i];
  const filters = ['all', 'hard', 'new'].map((f) =>
    `<button data-filter="${f}" class="${study.filter === f ? 'on' : ''}">${t('filter' + f[0].toUpperCase() + f.slice(1))}</button>`).join('');
  const modes = ['check', 'read'].map((m) =>
    `<button data-mode="${m}" class="${store.studyMode === m ? 'on' : ''}">${t('mode' + m[0].toUpperCase() + m.slice(1))}</button>`).join('');

  let body;
  if (!q) {
    body = `<div class="empty">${t('emptyFilter')}</div>`;
  } else {
    const reveal = readMode || study.revealed;
    let feedback = '';
    if (!hasKey(q)) {
      feedback = `<div class="hint">${t('noKey')}</div>`;
    } else if (study.revealed && !readMode) {
      const ok = sameSet(study.selected, q.correct);
      feedback = `<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? t('correct') : t('wrong')} · ${t('correctIs', q.correct.join(', '))}</div>`;
    } else if (!readMode) {
      feedback = `<div class="hint">${t('multiHint')}</div>`;
    }
    body = `
      <div class="qnum">№ ${q.n}</div>
      <p class="qtext">${esc(q.text)}</p>
      ${optionsHtml(q, { selected: study.selected, reveal, disabled: reveal })}
      ${feedback}`;
  }

  const canCheck = q && hasKey(q) && !readMode && !study.revealed;
  app.innerHTML =
    topbar(cat.title, { back: '#/', meta: list.length ? `${i + 1} / ${list.length}` : '' }) +
    `<div class="seg">${modes}</div><div class="seg">${filters}</div>` +
    body +
    bottombar(`
      <button class="btn small" data-act="sprev" ${i <= 0 ? 'disabled' : ''}>‹</button>
      ${canCheck
        ? `<button class="btn primary" data-act="scheck" ${study.selected.length ? '' : 'disabled'}>${t('showAnswer')}</button>`
        : `<button class="btn primary" data-act="snext" ${i >= list.length - 1 ? 'disabled' : ''}>${t('next')}</button>`}
      <button class="btn small" data-act="snext" ${i >= list.length - 1 ? 'disabled' : ''}>›</button>`);
}

function studyMove(d) {
  study.i = Math.max(0, Math.min(study.list.length - 1, study.i + d));
  study.selected = [];
  study.revealed = false;
  if (study.filter === 'all') { store.studyPos[study.catId] = study.i; save(); }
  renderStudy();
  window.scrollTo(0, 0);
}

/* ---------- test ---------- */

function renderTestSetup() {
  const cats = categories().filter((c) => c.answered > 0);
  const chosen = store.testCats?.filter((id) => cats.some((c) => c.id === id));
  const sel = chosen?.length ? chosen : cats.map((c) => c.id);
  const pool = cats.filter((c) => sel.includes(c.id)).reduce((s, c) => s + c.answered, 0);

  app.innerHTML = topbar(t('test')) + (cats.length ? `
    ${store.test && !store.test.done ? `<button class="btn" style="width:100%;margin-bottom:12px" data-href="#/test/run">${t('continueTest')}</button>` : ''}
    <div class="notice" style="margin-top:0">${t('testRules', TEST_SIZE, TEST_MINUTES, PASS_PERCENT)}</div>
    <h2>${t('pickCategories')}</h2>
    <div class="list">${cats.map((c) => `
      <label class="card check"><input type="checkbox" data-cat="${c.id}" ${sel.includes(c.id) ? 'checked' : ''}>
        <span class="grow">${esc(c.title)}<div class="sub">${c.answered} ${t('questions')}</div></span></label>`).join('')}
    </div>
    ${bottombar(`<button class="btn primary" data-act="tstart" ${pool ? '' : 'disabled'}>${t('start')} · ${Math.min(TEST_SIZE, pool)}</button>`)}
  ` : `<div class="notice warn">${t('noAnswers')} ${categories().map((c) => esc(c.title)).join(', ')}</div>`);
}

async function startTest() {
  if (store.test && !store.test.done && !confirm(t('confirmNew'))) return;
  const ids = [...app.querySelectorAll('[data-cat]:checked')].map((el) => el.dataset.cat);
  store.testCats = ids;
  const pool = [];
  for (const id of ids) {
    const cat = await loadCategory(id);
    for (const q of cat.questions) if (hasKey(q)) pool.push({ c: id, n: q.n });
  }
  store.test = { lang, items: shuffle(pool).slice(0, TEST_SIZE).map((x) => ({ ...x, a: [] })), i: 0, started: Date.now(), done: false };
  save();
  go('#/test/run');
}

async function testQuestion(item) {
  const cat = await loadCategory(item.c);
  return { cat, q: cat.questions.find((q) => q.n === item.n) };
}

let timer = null;
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
}
const elapsed = (from, to = Date.now()) => clock(to - from);
const deadline = (test) => test.started + TEST_MINUTES * 60 * 1000;

async function renderTestRun() {
  const test = store.test;
  if (!test || test.done) return go('#/test');
  // time may run out while the app is closed
  if (Date.now() >= deadline(test)) return finishTest(true);
  const item = test.items[test.i];
  const { cat, q } = await testQuestion(item);
  const answered = test.items.filter((x) => x.a.length).length;

  app.innerHTML =
    topbar(t('question', test.i + 1, test.items.length), {
      back: '#/', meta: `<span id="clock" title="${t('timeLeft')}">⏱ ${clock(deadline(test) - Date.now())}</span>`,
      right: `<button class="icon-btn" data-act="tfinish" style="font-size:14px">${t('finish')}</button>`,
    }) +
    `<div class="qnum">${esc(cat.title)} · № ${q.n}</div>
     <p class="qtext">${esc(q.text)}</p>
     ${optionsHtml(q, { selected: item.a })}
     <div class="hint">${t('multiHint')} ${answered} / ${test.items.length}</div>
     <div class="grid">${test.items.map((x, k) =>
       `<button data-jump="${k}" class="${x.a.length ? 'done' : ''} ${k === test.i ? 'cur' : ''}">${k + 1}</button>`).join('')}</div>` +
    bottombar(`
      <button class="btn small" data-act="tprev" ${test.i <= 0 ? 'disabled' : ''}>‹</button>
      ${test.i < test.items.length - 1
        ? `<button class="btn primary" data-act="tnext">${t('next')}</button>`
        : `<button class="btn primary" data-act="tfinish">${t('finish')}</button>`}
      <button class="btn small" data-act="tnext" ${test.i >= test.items.length - 1 ? 'disabled' : ''}>›</button>`);

  clearInterval(timer);
  timer = setInterval(() => {
    const el = document.getElementById('clock');
    if (!el) return clearInterval(timer);
    const left = deadline(test) - Date.now();
    el.textContent = `⏱ ${clock(left)}`;
    el.classList.toggle('urgent', left < 5 * 60 * 1000);
    if (left <= 0) {
      clearInterval(timer);
      finishTest(true);
    }
  }, 1000);
}

async function finishTest(timeUp = false) {
  const test = store.test;
  if (!test || test.done) return;
  const left = test.items.filter((x) => !x.a.length).length;
  if (!timeUp && left && !confirm(t('confirmFinish', left))) return;
  let ok = 0;
  for (const item of test.items) {
    const { q } = await testQuestion(item);
    item.ok = sameSet(item.a, q.correct);
    if (item.ok) ok++;
    record(item.c, item.n, item.ok);
  }
  const passed = (ok / test.items.length) * 100 >= PASS_PERCENT;
  Object.assign(test, { done: true, finished: Math.min(Date.now(), deadline(test)), ok, passed, timeUp });
  store.history.push({ date: test.finished, ok, total: test.items.length, passed });
  store.history = store.history.slice(-50);
  save();
  go('#/test/result');
}

let resultShowAll = false;
async function renderTestResult() {
  const test = store.test;
  if (!test?.done) return go('#/test');
  const pct = Math.round((test.ok / test.items.length) * 100);
  const shown = test.items.map((x, k) => ({ ...x, k })).filter((x) => resultShowAll || !x.ok);
  const reviews = [];
  for (const item of shown) {
    const { cat, q } = await testQuestion(item);
    reviews.push(`<div class="card review" id="r${item.k}">
      <div class="qnum">${item.k + 1}. ${esc(cat.title)} · № ${q.n}</div>
      <p class="qtext">${esc(q.text)}</p>
      ${optionsHtml(q, { selected: item.a, reveal: true, disabled: true })}
      <div class="verdict ${item.ok ? 'ok' : 'bad'}">${item.ok ? t('correct') : `${t('yourAnswer')}: ${item.a.join(', ') || t('noAnswer')} · ${t('correctIs', q.correct.join(', '))}`}</div>
    </div>`);
  }
  app.innerHTML =
    topbar(t('result')) +
    `<div class="card score">
      <div class="big ${test.passed ? 'ok' : 'bad'}">${pct}%</div>
      <div class="verdict ${test.passed ? 'ok' : 'bad'}" style="font-size:20px">${test.passed ? t('passed') : t('failed')}</div>
      <p>${t('resultLine', test.ok, test.items.length)} · ⏱ ${elapsed(test.started, test.finished)} · ${t('passRule', PASS_PERCENT)}</p>
      ${test.timeUp ? `<p>${t('timeUp')}</p>` : ''}
    </div>
    <div class="grid">${test.items.map((x, k) => `<button data-review="${k}" class="${x.ok ? 'ok' : 'bad'}">${k + 1}</button>`).join('')}</div>
    <div class="seg" style="margin-top:16px">
      <button data-rfilter="bad" class="${resultShowAll ? '' : 'on'}">${t('mistakes')}</button>
      <button data-rfilter="all" class="${resultShowAll ? 'on' : ''}">${t('reviewAll')}</button>
    </div>
    ${reviews.join('') || `<div class="empty">${t('noMistakes')}</div>`}` +
    bottombar(`<button class="btn" data-href="#/">${t('toHome')}</button><button class="btn primary" data-href="#/test">${t('again')}</button>`);
}

/* ---------- events ---------- */

app.addEventListener('click', async (e) => {
  const el = e.target.closest('button, [data-href]');
  if (!el || el.disabled) return;
  const { act, href, opt, filter, mode, jump, review, rfilter } = el.dataset;
  const route = location.hash;

  if (act === 'back' && route.startsWith('#/test/run')) {
    if (confirm(t('confirmLeave'))) go('#/');
    return;
  }
  if (act === 'back') return go(href);
  if (href) return go(href);

  if (el.dataset.lang) {
    lang = store.lang = el.dataset.lang;
    save();
    return render();
  }
  if (act === 'reset') {
    if (confirm(t('confirmReset'))) {
      Object.assign(store, { stats: {}, studyPos: {}, history: [] });
      save();
      render();
    }
    return;
  }

  // study
  if (route.startsWith('#/study/')) {
    if (opt && !study.revealed && store.studyMode !== 'read') {
      study.selected = study.selected.includes(opt) ? study.selected.filter((x) => x !== opt) : [...study.selected, opt];
      return renderStudy();
    }
    if (act === 'scheck') {
      study.revealed = true;
      const q = study.list[study.i];
      record(study.catId, q.n, sameSet(study.selected, q.correct));
      save();
      return renderStudy();
    }
    if (act === 'snext') return studyMove(1);
    if (act === 'sprev') return studyMove(-1);
    if (filter) { study.filter = filter; study.selected = []; study.revealed = false; applyStudyFilter(); return renderStudy(); }
    if (mode) { store.studyMode = mode; study.selected = []; study.revealed = false; save(); return renderStudy(); }
  }

  // test
  if (act === 'tstart') return startTest();
  if (route === '#/test/run') {
    const test = store.test;
    if (opt) {
      const item = test.items[test.i];
      item.a = item.a.includes(opt) ? item.a.filter((x) => x !== opt) : [...item.a, opt].sort();
      save();
      return renderTestRun();
    }
    if (act === 'tnext' || act === 'tprev' || jump !== undefined) {
      test.i = jump !== undefined ? Number(jump) : Math.max(0, Math.min(test.items.length - 1, test.i + (act === 'tnext' ? 1 : -1)));
      save();
      await renderTestRun();
      return window.scrollTo(0, 0);
    }
    if (act === 'tfinish') return finishTest();
  }
  if (route === '#/test/result') {
    if (rfilter) { resultShowAll = rfilter === 'all'; return renderTestResult(); }
    if (review !== undefined) {
      if (!resultShowAll && store.test.items[review].ok) { resultShowAll = true; await renderTestResult(); }
      document.getElementById(`r${review}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});

app.addEventListener('change', (e) => {
  if (e.target.dataset.cat !== undefined) {
    store.testCats = [...app.querySelectorAll('[data-cat]:checked')].map((el) => el.dataset.cat);
    save();
    renderTestSetup();
  }
});

/* ---------- router ---------- */

async function render() {
  clearInterval(timer);
  const [, page, arg] = location.hash.split('/');
  try {
    if (page === 'study' && arg) await openStudy(arg);
    else if (page === 'study') renderStudyPick();
    else if (page === 'test' && arg === 'run') await renderTestRun();
    else if (page === 'test' && arg === 'result') await renderTestResult();
    else if (page === 'test') renderTestSetup();
    else renderHome();
  } catch (err) {
    console.error(err);
    app.innerHTML = topbar(t('appTitle')) + `<div class="notice warn">${t('loadError')}</div>`;
  }
  if (page !== 'test' || arg !== 'result') resultShowAll = false;
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

(async function init() {
  app.innerHTML = `<div class="empty">${t('loading')}</div>`;
  try {
    index = await fetchJSON('data/index.json');
  } catch {
    app.innerHTML = `<div class="notice warn">${t('loadError')}</div>`;
    return;
  }
  if (!index.languages[lang]) lang = Object.keys(index.languages)[0];
  // an unfinished test stays in the language it was started in
  if (store.test && !store.test.done && store.test.lang && index.languages[store.test.lang]) lang = store.test.lang;
  render();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
