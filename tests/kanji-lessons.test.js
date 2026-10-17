const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');
const study = require('../public/js/kanji-study');
const { romaji, reading } = require('../scripts/build-kanji-lessons');

const root = path.join(__dirname, '..', 'public');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'kanji-lessons.json'), 'utf8'));
const pool = catalog.chapters.flatMap(chapter => chapter.kanji);
const script = fs.readFileSync(path.join(root, 'js', 'kanji-lessons.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'kanji-lessons.html'), 'utf8');

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus(options) { this.focused = true; this.focusOptions = options; }
  click() { if (!this.disabled) return this.listeners.click(); }
}

async function load(fetch = async () => ({ ok: true, json: async () => catalog }), core = study) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes['practice-type'].value = 'meaning';
  nodes['practice-scope'].value = 'chapter';
  const errors = [];
  const picker = {
    select2: configuration => {
      if (typeof configuration === 'object') picker.configuration = configuration;
      else picker.lastCommand = configuration;
      return picker;
    },
    on: (event, callback) => { nodes['practice-chapter'].listeners[event] = callback; return picker; },
    trigger: event => { nodes['practice-chapter'].listeners[event](); return picker; }
  };
  const $ = () => picker;
  $.trim = value => (value || '').trim();
  $.each = (values, callback) => values.forEach((value, index) => callback(index, value));
  $.extend = (target, source) => Object.assign(target, source);
  vm.runInNewContext(script, {
    $,
    KanjiStudy: core,
    document: {
      getElementById: id => {
        assert.ok(nodes[id], 'Unknown HTML element ID: ' + id);
        return nodes[id];
      },
      createElement: () => new Element()
    },
    fetch,
    console: { error: (...args) => errors.push(args) }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, errors, picker };
}

function seededRandom() {
  let state = 42;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}

test('complete catalog has exactly 2,136 distinct official Joyo forms and 428 chapters', () => {
  assert.equal(study.validCatalog(catalog), true);
  assert.equal(catalog.chapters.length, 428);
  assert.equal(pool.length, 2136);
  assert.equal(new Set(pool.map(kanji => kanji.character)).size, 2136);
  // Cross-checked against kanjiapi.dev's Joyo list, collapsing its four glyph variants.
  const characterHash = crypto.createHash('sha256').update(pool.map(k => k.character).sort().join('')).digest('hex');
  assert.equal(characterHash, '3fa93c1d4f65fd4dc43b8b608110743bb29eb6759cc513a7ad24bb684b2bc2ea');
  const counts = {};
  catalog.chapters.forEach(chapter => {
    counts[chapter.grade] = (counts[chapter.grade] || 0) + chapter.kanji.length;
    assert.ok(chapter.kanji.length >= 1 && chapter.kanji.length <= 5);
  });
  assert.deepEqual(counts, { 1: 80, 2: 160, 3: 200, 4: 200, 5: 185, 6: 181, 8: 1130 });
  for (const character of ['剝', '𠮟', '塡', '頰']) {
    assert.equal(pool.find(kanji => kanji.character === character).variants.length, 1);
  }
  for (const kanji of pool) {
    assert.match(kanji.character, /^\p{Script=Han}$/u);
    assert.ok(kanji.meanings.length);
    for (const type of ['onyomi', 'kunyomi']) {
      for (const r of kanji[type]) {
        assert.match(r.kana, type === 'onyomi' ? /^[ァ-ヺー.\-]+$/u : /^[ぁ-ゖー.\-]+$/u);
        assert.equal(r.romaji, romaji(r.kana), kanji.character);
        assert.ok(!/[^\x20-\x7e]/.test(r.romaji));
      }
    }
  }
  assert.match(catalog.source.license, /CC BY-SA 4.0/);
  assert.match(catalog.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(html, /data\/NOTICE.txt/);
});

test('romaji handles digraphs, doubled consonants, long vowels, n and dictionary notation', () => {
  for (const [kana, expected] of [
    ['きゅう', 'kyuu'], ['がっこう', 'gakkou'], ['まっちゃ', 'matcha'], ['しんよう', "shin'you"],
    ['ひと.つ', 'hito.tsu'], ['-が.ち', '-ga.chi'], ['グラム', 'guramu'], ['ジュウ', 'juu'],
    ['とお', 'too'], ['ほっ', 'ho (stop)'], ['コーヒー', 'koohii']
  ]) assert.equal(romaji(kana), expected);
  assert.deepEqual(reading('しょう', true), { kana: 'ショウ', romaji: 'shou' });
  assert.deepEqual(reading('グラム', false), { kana: 'ぐらむ', romaji: 'guramu' });
  assert.equal(study.canonical('-ヒト.ツ'), 'ひとつ');
  assert.throws(() => romaji('invalid'), /Unknown kana/);
});

test('all chapters produce valid quizzes covering every meaning and available reading type', () => {
  const random = seededRandom();
  for (const chapter of catalog.chapters) {
    const questions = study.makeQuiz(chapter, pool, random);
    const expected = chapter.kanji.reduce((n, k) => n + 1 + (k.onyomi.length ? 1 : 0) + (k.kunyomi.length ? 1 : 0), 0);
    assert.equal(questions.length, expected);
    const covered = new Set();
    for (const question of questions) {
      const kanji = chapter.kanji.find(k => k.character === question.character);
      assert.ok(kanji);
      covered.add(question.character + question.type);
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.equal(question.options.filter(o => o === question.answer).length, 1);
      for (const option of question.options.filter(o => o !== question.answer)) {
        if (question.type === 'meaning') {
          const other = pool.find(k => k.meaning === option);
          assert.ok(other);
          assert.equal(other.meanings.some(s => kanji.meanings.map(m => m.toLowerCase()).includes(s.toLowerCase())), false);
        } else {
          assert.equal(kanji[question.type].some(r =>
            study.canonical(r.kana) === study.canonical(option.split(' / ')[0])), false);
        }
      }
    }
    assert.equal(covered.size, expected);
  }
});

test('quiz choices and order vary with the random source', () => {
  const first = study.makeQuiz(catalog.chapters[0], pool, seededRandom());
  const second = study.makeQuiz(catalog.chapters[0], pool, () => 0.7);
  assert.notDeepEqual(first, second);
});

test('all practice modes support chapters and exactly 10 or 20 unique random characters', () => {
  for (const mode of ['meaning', 'pronunciation', 'kanji']) {
    for (const count of [null, 10, 20]) {
      const questions = study.makePracticeQuiz(catalog.chapters[0], pool, mode, count, seededRandom());
      assert.equal(questions.length, count === null ? 5 : count);
      assert.equal(new Set(questions.map(q => q.character)).size, questions.length);
      for (const question of questions) {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options).size, 4);
        assert.equal(question.options.filter(o => o === question.answer).length, 1);
        const kanji = pool.find(k => k.character === question.character);
        if (mode === 'kanji') {
          assert.equal(question.type, 'kanji');
          assert.equal(question.answer, kanji.character);
          assert.equal(question.meaning, kanji.meaning);
          for (const option of question.options.filter(o => o !== question.answer)) {
            const other = pool.find(k => k.character === option);
            assert.ok(other);
            assert.equal(other.meanings.some(s => kanji.meanings.map(m => m.toLowerCase()).includes(s.toLowerCase())), false);
          }
        } else if (mode === 'pronunciation') {
          assert.ok(['onyomi', 'kunyomi'].includes(question.type));
          assert.ok(kanji[question.type].some(r => r.kana + ' / ' + r.romaji === question.answer));
        } else {
          assert.equal(question.type, 'meaning');
        }
      }
    }
  }
  const short = catalog.chapters.find(c => c.kanji.length === 1);
  assert.equal(study.makePracticeQuiz(short, pool, 'kanji', null, seededRandom()).length, 1);
  assert.throws(() => study.makePracticeQuiz(null, pool, 'meaning', null), /Choose a chapter/);
  assert.throws(() => study.makePracticeQuiz(null, pool, 'invalid', 10), /Unknown/);
  assert.throws(() => study.makePracticeQuiz(null, pool, 'meaning', 15), /10 or 20/);
});

test('practice pronunciation supports kanji with only one reading type', () => {
  for (const missing of ['onyomi', 'kunyomi']) {
    const entry = pool.find(k => k[missing].length === 0);
    const questions = study.makePracticeQuiz({ kanji: [entry] }, pool, 'pronunciation', null, seededRandom());
    assert.equal(questions.length, 1);
    assert.notEqual(questions[0].type, missing);
  }
});

test('header practice configuration, random scopes, retries and section switching work', async () => {
  const { nodes, errors } = await load();
  assert.equal(nodes['practice-chapter'].children.flatMap(group => group.children).length, 428);
  nodes['nav-practice'].click();
  assert.equal(nodes.lessons.hidden, true);
  assert.equal(nodes.practice.hidden, false);
  assert.equal(nodes['nav-practice'].attributes['aria-current'], 'page');
  nodes['practice-scope'].value = '20';
  nodes['practice-scope'].listeners.change();
  assert.equal(nodes['practice-chapter-field'].hidden, true);
  assert.equal(nodes['practice-chapter'].disabled, true);
  nodes['practice-type'].value = 'kanji';
  nodes['start-practice'].click();
  assert.equal(nodes.practice.hidden, true);
  assert.equal(nodes['quiz-view'].hidden, false);
  assert.equal(nodes['quiz-title'].textContent, 'Practice quiz');
  assert.equal(nodes['back-to-lesson'].textContent, 'Back to practice');
  assert.equal(nodes['quiz-character'].className, 'quiz-meaning');
  assert.equal(nodes['quiz-character'].lang, 'en');
  assert.match(nodes['quiz-progress'].textContent, /of 20/);
  assert.equal(nodes['quiz-options'].children.every(b => b.lang === 'ja'), true);
  nodes['quiz-options'].children[0].click();
  nodes['retry-quiz'].click();
  assert.equal(nodes['quiz-feedback'].textContent, '');
  assert.match(nodes['quiz-progress'].textContent, /Question 1 of 20/);
  nodes['back-to-lesson'].click();
  assert.equal(nodes.practice.hidden, false);
  nodes['practice-scope'].value = 'chapter';
  nodes['practice-scope'].listeners.change();
  assert.equal(nodes['practice-chapter'].disabled, false);
  const shortIndex = catalog.chapters.findIndex(c => c.kanji.length === 1);
  nodes['practice-chapter'].value = String(shortIndex);
  nodes['practice-type'].value = 'pronunciation';
  nodes['start-practice'].click();
  assert.match(nodes['quiz-progress'].textContent, /of 1/);
  nodes['nav-lessons'].click();
  assert.equal(nodes['quiz-view'].hidden, true);
  assert.equal(nodes.practice.hidden, true);
  assert.equal(nodes.lessons.hidden, false);
  assert.equal(nodes['nav-lessons'].attributes['aria-current'], 'page');
  nodes.next.click();
  nodes['nav-practice'].click();
  assert.equal(nodes['practice-chapter'].value, '1');
  assert.equal(errors.length, 0);
});

test('reverse practice quiz scores, reviews the meaning prompt and finishes correctly', async () => {
  const questions = [{ character: '一', meaning: 'One', type: 'kanji', answer: '一', options: ['二', '三', '一', '四'] }];
  const { nodes } = await load(undefined, { ...study, makePracticeQuiz: () => questions });
  nodes['nav-practice'].click();
  nodes['start-practice'].click();
  assert.equal(nodes['quiz-character'].textContent, 'One');
  nodes['quiz-options'].children[0].click();
  nodes['next-question'].click();
  assert.equal(nodes['quiz-score'].textContent, '0 / 1 correct (0%)');
  assert.match(nodes['quiz-review'].children[0].textContent, /kanji for One/);
  nodes['retry-quiz'].click();
  nodes['quiz-options'].children[2].click();
  nodes['next-question'].click();
  assert.equal(nodes['quiz-score'].textContent, '1 / 1 correct (100%)');
});

test('Select2 uses grouped prefix matching without a separate search input', async () => {
  const { nodes, picker } = await load();
  nodes['nav-practice'].click();
  assert.equal(html.includes('id="practice-chapter-search"'), false);
  assert.equal(html.includes('<datalist'), false);
  const select = nodes['practice-chapter'];
  assert.equal(select.children.length, 7);
  const groups = select.children.map(group => ({
    text: group.label, children: group.children.map(option => ({ id: option.value, text: option.textContent }))
  }));
  const matcher = picker.configuration.matcher;
  assert.equal(picker.configuration.minimumResultsForSearch, 0);
  assert.equal(matcher({ term: '' }, groups[0]), groups[0]);
  assert.equal(matcher({ term: '   ' }, groups[0]), groups[0]);
  assert.equal(matcher({ term: '1' }, { text: '1. Single option' }), null);
  const results = groups.map(group => matcher({ term: '12' }, group)).filter(Boolean).flatMap(group => group.children);
  assert.equal(results.length, 11);
  assert.ok(results.every(option => option.text.startsWith('12')));
  assert.equal(groups.flatMap(group => group.children).length, 428);
  assert.equal(groups.map(group => matcher({ term: 'no-such-chapter' }, group)).filter(Boolean).length, 0);
  assert.equal(matcher({ term: 'ALPHA' }, { children: [{ text: 'alpha' }] }).children.length, 1);
  select.value = '427';
  select.listeners.change();
  nodes['start-practice'].click();
  assert.equal(nodes['quiz-view'].hidden, false);
  nodes['back-to-lesson'].click();
  assert.equal(select.value, '427');
  assert.equal(picker.lastCommand, 'close');
  assert.equal(nodes['start-practice'].disabled, false);
});

test('search finds meanings, kanji, variants, kana and romaji and respects grade filters', () => {
  const first = catalog.chapters[0];
  for (const query of [' one ', '一', 'イチ', 'いち', 'ichi', 'NUMBERS']) {
    assert.equal(study.matches(first, '', query), true, query);
  }
  assert.equal(study.matches(first, '2', 'one'), false);
  const variant = catalog.chapters.find(c => c.kanji.some(k => k.character === '𠮟'));
  assert.equal(study.matches(variant, '', '叱'), true);
  assert.equal(study.matches(first, '', 'no such kanji'), false);
});

test('chapter navigation, filters, empty results, and the short chapter work', async () => {
  const { nodes, errors } = await load();
  assert.equal(errors.length, 0);
  assert.equal(nodes.status.hidden, true);
  assert.equal(nodes.lessons.hidden, false);
  assert.equal(nodes.chapters.children.length, 428);
  assert.equal(nodes['kanji-cards'].children.length, 5);
  assert.equal(nodes['chapter-title'].textContent, 'Numbers 1-5');
  const readingGroups = nodes['kanji-cards'].children[0].children[1].children[2];
  assert.equal(readingGroups.children[0].children[0].textContent, "Kun'yomi / hiragana");
  assert.equal(readingGroups.children[1].children[0].textContent, "On'yomi / katakana");
  assert.equal(nodes.previous.disabled, true);
  nodes.next.click();
  assert.equal(nodes['chapter-title'].textContent, 'Numbers 6-10');
  nodes.chapters.children[427].click();
  assert.equal(nodes['page-count'].textContent, '428 of 428');
  assert.equal(nodes.next.disabled, true);
  nodes['grade-filter'].value = '1';
  nodes['grade-filter'].listeners.change();
  assert.equal(nodes.chapters.children.length, 16);
  assert.match(nodes['chapter-count'].textContent, /outside this filter/);
  nodes['chapter-search'].value = 'no such kanji';
  nodes['chapter-search'].listeners.input();
  assert.equal(nodes.chapters.children.length, 0);
  assert.match(nodes['chapter-count'].textContent, /^0 chapters/);
  nodes['chapter-search'].value = '';
  nodes['grade-filter'].value = '';
  nodes['chapter-search'].listeners.input();
  const short = catalog.chapters.findIndex(c => c.kanji.length < 5);
  nodes.chapters.children[short].click();
  assert.equal(nodes['kanji-cards'].children.length, catalog.chapters[short].kanji.length);
});

test('quiz UI hides lessons, locks answers, scores, reviews mistakes, retries and cancels', async () => {
  const questions = [
    { character: '一', type: 'meaning', answer: 'One', options: ['One', 'Two', 'Three', 'Four'] },
    { character: '二', type: 'onyomi', answer: 'ニ / ni', options: ['イチ / ichi', 'ニ / ni', 'サン / san', 'シ / shi'] }
  ];
  const { nodes } = await load(undefined, { ...study, makeQuiz: () => questions });
  nodes['start-quiz'].click();
  assert.equal(nodes['lesson-view'].hidden, true);
  assert.equal(nodes['quiz-view'].hidden, false);
  assert.equal(nodes['quiz-title'].focusOptions.preventScroll, true);
  assert.equal(nodes['quiz-feedback'].textContent, '');
  nodes['next-question'].click();
  assert.match(nodes['quiz-progress'].textContent, /Question 1/);
  const first = nodes['quiz-options'].children[0];
  first.click();
  first.listeners.click();
  assert.equal(nodes['quiz-options'].children.every(b => b.disabled), true);
  assert.match(nodes['quiz-feedback'].textContent, /^Correct/);
  assert.equal(nodes['next-question'].focusOptions.preventScroll, true);
  nodes['next-question'].click();
  assert.equal(nodes['quiz-title'].focusOptions.preventScroll, true);
  nodes['quiz-options'].children[0].click();
  assert.match(nodes['quiz-feedback'].textContent, /Correct answer: ニ/);
  nodes['next-question'].click();
  assert.equal(nodes['quiz-results'].hidden, false);
  assert.equal(nodes['quiz-score'].focusOptions.preventScroll, true);
  assert.equal(nodes['quiz-score'].textContent, '1 / 2 correct (50%)');
  assert.equal(nodes['quiz-review'].children.length, 1);
  assert.match(nodes['quiz-review'].children[0].textContent, /you chose/);
  nodes['retry-quiz'].click();
  assert.equal(nodes['quiz-results'].hidden, true);
  assert.match(nodes['quiz-progress'].textContent, /Question 1/);
  nodes['back-to-lesson'].click();
  assert.equal(nodes['lesson-view'].hidden, false);
  assert.equal(nodes['quiz-view'].hidden, true);
  nodes['start-quiz'].click();
  nodes.next.click();
  assert.equal(nodes['quiz-view'].hidden, true);
  assert.equal(nodes['chapter-title'].textContent, 'Numbers 6-10');
});

test('actual UI can complete a full chapter with a perfect score', async () => {
  const questions = study.makeQuiz(catalog.chapters[0], pool, seededRandom());
  const { nodes } = await load(undefined, { ...study, makeQuiz: () => questions });
  nodes['start-quiz'].click();
  for (const question of questions) {
    nodes['quiz-options'].children.find(b => b.textContent === question.answer).click();
    nodes['next-question'].click();
  }
  assert.equal(nodes['quiz-score'].textContent, questions.length + ' / ' + questions.length + ' correct (100%)');
  assert.equal(nodes['quiz-review'].children.length, 0);
  assert.match(nodes['quiz-result-message'].textContent, /Perfect round/);
});

test('a completed all-wrong attempt shows zero, and a retry resets its score', async () => {
  const questions = study.makeQuiz(catalog.chapters[0], pool, seededRandom());
  const { nodes } = await load(undefined, { ...study, makeQuiz: () => questions });
  nodes['start-quiz'].click();
  for (const question of questions) {
    nodes['quiz-options'].children.find(b => b.textContent !== question.answer).click();
    nodes['next-question'].click();
  }
  assert.equal(nodes['quiz-score'].textContent, '0 / ' + questions.length + ' correct (0%)');
  assert.equal(nodes['quiz-review'].children.length, questions.length);
  nodes['retry-quiz'].click();
  for (const question of questions) {
    nodes['quiz-options'].children.find(b => b.textContent === question.answer).click();
    nodes['next-question'].click();
  }
  assert.match(nodes['quiz-score'].textContent, /100%/);
  assert.equal(nodes['quiz-review'].children.length, 0);
});

test('missing reading types are displayed honestly, not invented', async () => {
  const { nodes } = await load();
  const index = catalog.chapters.findIndex(c => c.kanji.some(k => !k.onyomi.length || !k.kunyomi.length));
  nodes.chapters.children[index].click();
  const card = nodes['kanji-cards'].children.find(card =>
    card.children[1].children[2].children.some(group => group.children[1].textContent === 'No reading of this type in the dictionary.'));
  assert.ok(card);
});

test('network failure is visible and retry recovers', async () => {
  let attempts = 0;
  const { nodes, errors } = await load(async url => {
    assert.equal(url, './data/kanji-lessons.json');
    if (++attempts === 1) throw new Error('Offline');
    return { ok: true, json: async () => catalog };
  });
  assert.equal(errors.length, 1);
  assert.equal(nodes.lessons.hidden, true);
  assert.equal(nodes.retry.hidden, false);
  await nodes.retry.click();
  assert.equal(nodes.retry.hidden, true);
  assert.equal(nodes.lessons.hidden, false);
});

test('invalid catalogs, failed HTTP and JSON fail explicitly', async () => {
  const invalid = JSON.parse(JSON.stringify(catalog));
  invalid.chapters[0].kanji[0].onyomi[0].kana = 'ひと';
  const duplicate = JSON.parse(JSON.stringify(catalog));
  duplicate.chapters[0].kanji[1].character = duplicate.chapters[0].kanji[0].character;
  const emptyReadings = JSON.parse(JSON.stringify(catalog));
  emptyReadings.chapters[0].kanji[0].onyomi = [];
  emptyReadings.chapters[0].kanji[0].kunyomi = [];
  const missing = JSON.parse(JSON.stringify(catalog));
  missing.chapters.pop();
  for (const data of [invalid, duplicate, emptyReadings, missing]) assert.equal(study.validCatalog(data), false);
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } },
    { ok: true, json: async () => ({ chapters: [] }) },
    { ok: true, json: async () => invalid }
  ]) {
    const { nodes, errors } = await load(async () => response);
    assert.equal(errors.length, 1);
    assert.equal(nodes.lessons.hidden, true);
    assert.equal(nodes.retry.hidden, false);
    assert.equal(nodes.status.hidden, false);
  }
});
