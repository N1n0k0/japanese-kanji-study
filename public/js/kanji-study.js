(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KanjiStudy = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function nonempty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function canonical(kana) {
    return kana.replace(/[.\-]/g, '').replace(/[\u30a1-\u30f6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  function validCatalog(data) {
    var seen = new Set();
    function validReadings(values, script) {
      return Array.isArray(values) && values.every(function (reading) {
        return reading && nonempty(reading.kana) && script.test(reading.kana) && nonempty(reading.romaji);
      });
    }
    if (!data || data.schemaVersion !== 2 || data.totalKanji !== 2136 ||
        !Array.isArray(data.chapters) || data.chapters.length === 0) return false;
    var valid = data.chapters.every(function (chapter, index) {
      return chapter && chapter.id === index + 1 && [1, 2, 3, 4, 5, 6, 8].includes(chapter.grade) &&
        nonempty(chapter.title) && nonempty(chapter.description) &&
        Array.isArray(chapter.kanji) && chapter.kanji.length >= 1 && chapter.kanji.length <= 5 &&
        chapter.kanji.every(function (kanji) {
          if (!kanji || !nonempty(kanji.character) || seen.has(kanji.character)) return false;
          seen.add(kanji.character);
          return Array.from(kanji.character).length === 1 && nonempty(kanji.meaning) &&
            Array.isArray(kanji.meanings) && kanji.meanings.length > 0 && kanji.meanings.every(nonempty) &&
            kanji.meaning === kanji.meanings.join('; ') &&
            Array.isArray(kanji.variants) && kanji.variants.every(nonempty) &&
            Number.isInteger(kanji.strokes) && kanji.strokes > 0 &&
            validReadings(kanji.onyomi, /^[\u30a1-\u30fa\u30fc.\-]+$/) &&
            validReadings(kanji.kunyomi, /^[\u3041-\u3096\u30fc.\-]+$/) &&
            kanji.onyomi.length + kanji.kunyomi.length > 0;
        });
    });
    return valid && seen.size === data.totalKanji;
  }

  function shuffle(values, random) {
    var result = values.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var value = result[i];
      result[i] = result[j];
      result[j] = value;
    }
    return result;
  }

  function makeQuestion(kanji, type, pool, random) {
        var isMeaning = type === 'meaning';
        var isKanji = type === 'kanji';
        var valid = isMeaning || isKanji ? kanji.meanings.map(function (s) { return s.toLowerCase(); }) :
          kanji[type].map(function (r) { return canonical(r.kana); });
        var reading = isMeaning || isKanji ? null : kanji[type][Math.floor(random() * kanji[type].length)];
        var answer = isMeaning ? kanji.meaning : isKanji ? kanji.character : reading.kana + ' / ' + reading.romaji;
        var candidates = [];
        var seen = new Set([isMeaning ? answer.toLowerCase() : isKanji ? answer : canonical(reading.kana)]);
        shuffle(pool, random).forEach(function (other) {
          if (other.character === kanji.character) return;
          if (isMeaning || isKanji) {
            if (other.meanings.some(function (s) { return valid.includes(s.toLowerCase()); })) return;
            var key = isKanji ? other.character : other.meaning.toLowerCase();
            if (!seen.has(key)) { seen.add(key); candidates.push(isKanji ? other.character : other.meaning); }
          } else {
            other[type].forEach(function (value) {
              var key = canonical(value.kana);
              if (!valid.includes(key) && !seen.has(key)) {
                seen.add(key);
                candidates.push(value.kana + ' / ' + value.romaji);
              }
            });
          }
        });
        if (candidates.length < 3) throw new Error('Not enough distinct quiz choices for ' + kanji.character);
        return {
          character: kanji.character, meaning: kanji.meaning, type: type, answer: answer,
          options: shuffle([answer].concat(shuffle(candidates, random).slice(0, 3)), random)
        };
  }

  function makeQuiz(chapter, pool, random) {
    random = random || Math.random;
    var questions = [];
    chapter.kanji.forEach(function (kanji) {
      ['meaning', 'onyomi', 'kunyomi'].forEach(function (type) {
        if (type !== 'meaning' && kanji[type].length === 0) return;
        questions.push(makeQuestion(kanji, type, pool, random));
      });
    });
    return shuffle(questions, random);
  }

  function makePracticeQuiz(chapter, pool, mode, count, random) {
    random = random || Math.random;
    if (!['meaning', 'pronunciation', 'kanji'].includes(mode)) throw new Error('Unknown practice quiz type.');
    if (count !== null && count !== 10 && count !== 20) throw new Error('Choose 10 or 20 random characters.');
    if (count === null && (!chapter || !chapter.kanji.length)) throw new Error('Choose a chapter.');
    if (count !== null && pool.length < count) throw new Error('Not enough characters for this practice set.');
    var selected = count === null ? chapter.kanji : shuffle(pool, random).slice(0, count);
    var questions = selected.map(function (kanji) {
      var type = mode;
      if (mode === 'pronunciation') {
        var types = ['onyomi', 'kunyomi'].filter(function (key) { return kanji[key].length > 0; });
        type = types[Math.floor(random() * types.length)];
      }
      return makeQuestion(kanji, type, pool, random);
    });
    return shuffle(questions, random);
  }

  function searchText(chapter) {
    return [String(chapter.id), 'Chapter ' + chapter.id, chapter.title, chapter.description].concat(chapter.kanji.map(function (kanji) {
      return [kanji.character, kanji.meaning].concat(kanji.variants, kanji.onyomi.concat(kanji.kunyomi)
        .map(function (r) { return r.kana + ' ' + r.romaji + ' ' + canonical(r.kana); })).join(' ');
    })).join(' ').toLowerCase();
  }

  function matches(chapter, grade, query) {
    return (!grade || String(chapter.grade) === grade) &&
      searchText(chapter).includes(query.trim().toLowerCase());
  }

  return { canonical: canonical, validCatalog: validCatalog, makeQuiz: makeQuiz,
    makePracticeQuiz: makePracticeQuiz, matches: matches };
}));
