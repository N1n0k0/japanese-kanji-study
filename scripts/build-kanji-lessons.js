// Run with Node.js 18+: node scripts/build-kanji-lessons.js
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const revision = '00fd7079c3890f430759536f91aa5e854ec0ca4f';
const source = `https://raw.githubusercontent.com/davidluzgouveia/kanji-data/${revision}/kanji-jouyou.json`;
const root = path.join(__dirname, '..', 'public', 'data');
const preferred = Array.from('一二三四五六七八九十日月火水木');
const officialForms = { '剥': '剝', '叱': '𠮟', '填': '塡', '頬': '頰' };
const syllables = {
  あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
  が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
  ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
  だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
  は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
  ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
  や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'o',ん:'n',
  ゃ:'ya',ゅ:'yu',ょ:'yo'
};
const digraphs = {
  きゃ:'kya',きゅ:'kyu',きょ:'kyo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',
  しゃ:'sha',しゅ:'shu',しょ:'sho',じゃ:'ja',じゅ:'ju',じょ:'jo',
  ちゃ:'cha',ちゅ:'chu',ちょ:'cho',ぢゃ:'ja',ぢゅ:'ju',ぢょ:'jo',
  にゃ:'nya',にゅ:'nyu',にょ:'nyo',ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',
  びゃ:'bya',びゅ:'byu',びょ:'byo',ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',
  みゃ:'mya',みゅ:'myu',みょ:'myo',りゃ:'rya',りゅ:'ryu',りょ:'ryo'
};

function hiragana(value) {
  return value.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function romaji(value) {
  const kana = hiragana(value);
  let result = '';
  for (let i = 0; i < kana.length; i++) {
    const c = kana[i];
    if (c === '.' || c === '-') { result += c; continue; }
    if (c === 'ー') {
      const vowel = result.match(/[aeiou]$/);
      if (!vowel) throw new Error('Cannot romanize long vowel: ' + value);
      result += vowel[0];
      continue;
    }
    if (c === 'っ') {
      const next = digraphs[kana.slice(i + 1, i + 3)] || syllables[kana[i + 1]];
      result += next ? (next[0] === 'c' ? 't' : next[0]) : ' (stop)';
      continue;
    }
    const pair = digraphs[kana.slice(i, i + 2)];
    const sound = pair || syllables[c];
    if (!sound) throw new Error('Unknown kana in reading: ' + value);
    result += sound;
    if (c === 'ん' && /[あいうえおやゆよ]/.test(kana[i + 1] || '')) result += "'";
    if (pair) i++;
  }
  return result;
}

function reading(value, on) {
  const kana = hiragana(value);
  return {
    kana: on ? kana.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)) : kana,
    romaji: romaji(kana)
  };
}

async function build() {
  const response = await fetch(source);
  if (!response.ok) throw new Error('Source download failed: HTTP ' + response.status);
  const text = await response.text();
  const dictionary = JSON.parse(text);
  if (Object.keys(dictionary).length !== 2136) throw new Error('Expected exactly 2,136 Joyo kanji.');
  const chapters = [];
  for (const grade of [1, 2, 3, 4, 5, 6, 8]) {
    const entries = Object.entries(dictionary).filter(([, entry]) => entry.grade === grade);
    entries.sort(([a, left], [b, right]) => {
      const pa = preferred.includes(a) ? preferred.indexOf(a) : Infinity;
      const pb = preferred.includes(b) ? preferred.indexOf(b) : Infinity;
      return (pa - pb) || left.strokes - right.strokes ||
        (left.freq || Infinity) - (right.freq || Infinity) || a.codePointAt(0) - b.codePointAt(0);
    });
    for (let offset = 0; offset < entries.length; offset += 5) {
      const label = grade === 8 ? 'Secondary school' : 'Grade ' + grade;
      const kanji = entries.slice(offset, offset + 5).map(([character, entry]) => {
        if (!entry.meanings.length) throw new Error('Missing meaning: ' + character);
        const onyomi = (entry.readings_on || []).map(value => reading(value, true));
        const kunyomi = (entry.readings_kun || []).map(value => reading(value, false));
        if (!onyomi.length && !kunyomi.length) throw new Error('Missing readings: ' + character);
        const official = officialForms[character] || character;
        const variant = Object.keys(officialForms).find(key => officialForms[key] === official);
        return {
          character: official, variants: variant ? [variant] : [],
          meaning: entry.meanings.join('; '), meanings: entry.meanings,
          strokes: entry.strokes, onyomi, kunyomi
        };
      });
      chapters.push({
        id: chapters.length + 1, grade,
        title: grade === 1 && offset < 15 ? ['Numbers 1-5', 'Numbers 6-10', 'Nature & days'][offset / 5] :
          label + ' / Part ' + (offset / 5 + 1),
        description: label + ' dictionary grouping. Study ' + kanji.length + ' kanji: ' +
          kanji.map(entry => entry.character).join(' ') + '.',
        kanji
      });
    }
  }
  const count = chapters.reduce((total, chapter) => total + chapter.kanji.length, 0);
  if (count !== 2136) throw new Error('Some source entries were not assigned to a chapter.');
  const catalog = {
    schemaVersion: 2, level: 'Joyo', totalKanji: count,
    source: {
      name: 'KANJIDIC via David Gouveia / kanji-data', url: source, revision,
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
      license: 'CC BY-SA 4.0 (dictionary content); MIT (conversion source)',
      attribution: 'James William Breen and the Electronic Dictionary Research and Development Group; David Gouveia',
      changes: 'Selected dictionary fields only; chapter grouping, official Joyo glyph normalization, katakana/hiragana normalization, generated romaji.',
      gradeNote: 'Grades follow this dictionary snapshot (1,006 elementary / 1,130 secondary), not the revised 2020 school allocation. Dictionary readings include readings outside the official Joyo reading table.'
    },
    chapters
  };
  await fs.writeFile(path.join(root, 'kanji-lessons.json'), JSON.stringify(catalog, null, 2) + '\n');
  console.log('Built ' + count + ' kanji in ' + chapters.length + ' chapters.');
}

if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { hiragana, romaji, reading };
