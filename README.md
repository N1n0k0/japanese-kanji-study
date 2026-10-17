# Japanese Kanji Study

A standalone HTML, CSS, and JavaScript website for studying all **2,136 Joyo
kanji in 428 chapters**, with English meanings, kana, romaji, and quizzes.
No PHP, database, frontend build, or runtime API is required.

## Run locally

Install Node.js 18 or newer, then run:

```sh
npx --yes http-server public -p 8080 -c-1
```

Open http://localhost:8080/kanji-lessons.html.
Serve the page over HTTP rather than opening it with `file://`, because the
browser fetches the bundled JSON dataset. The `public` directory can also be
deployed to any static hosting service; the entry page is `kanji-lessons.html`.

## Lessons and practice

Chapters contain up to five kanji, organized by the source dictionary's school
grades. Search by kanji, common glyph variant, meaning, kana, or romaji.
Each card includes stroke count, English meanings, on'yomi in katakana,
kun'yomi in hiragana, and romaji. Missing reading types are explicitly shown.

Chapter quizzes cover meanings and available reading types. The header's
**Practise** section offers:

- Kanji to English meaning.
- Kanji to pronunciation, using kana and romaji.
- English meaning to kanji.

Choose a chapter or 10/20 unique characters selected randomly from the full
collection. Practice has one question per character. Questions have four
choices, immediate feedback, scores, mistake review, and randomized retries.
Scores are not saved; changing sections cancels the active attempt.

Pronunciation questions identify the reading type. No spoken audio or microphone
is involved. A dot in readings separates okurigana (`ひと.つ` / `hito.tsu`);
hyphens mark prefix/suffix readings. Romaji uses explicit vowels (`kyuu`,
`too`, `shou`) and `(stop)` for a final small `っ`. It is mechanically generated;
kana is authoritative, and the correct reading depends on the word.

## Dataset and attribution

Dictionary meanings and readings are from **KANJIDIC**, copyright James William
Breen and the Electronic Dictionary Research and Development Group, via
[David Gouveia's kanji-data](https://github.com/davidluzgouveia/kanji-data).
No WaniKani fields are used.

The adapted dataset is licensed **CC BY-SA 4.0**. Upstream conversion includes an
MIT notice. See [public/data/NOTICE.txt](public/data/NOTICE.txt) for attribution,
changes, license links, and update requirements. Website attribution must be
retained when distributing dictionary content.

Grade groups reflect the source snapshot (1,006 elementary and 1,130 secondary
characters), not the revised 2020 school allocation or JLPT levels. The four
official Joyo glyphs `剝`, `𠮟`, `塡`, `頰` are normalized with common variants
retained. Dictionary readings include readings outside the official Joyo reading
table. This is a character study collection, not a full language course.

Rebuild the bundled data with Node.js 18+ and network access:

```sh
node scripts/build-kanji-lessons.js
```

The generator pins an upstream revision and records its SHA-256. For a public
deployment, check KANJIDIC and the upstream conversion at least monthly, update
the revision (refreshing upstream conversion first if needed), rebuild, and
run the tests. Follow the EDRDG update conditions linked in NOTICE.

## Tests

No npm dependencies are needed:

```sh
node --test tests/kanji-lessons.test.js
```

Tests cover the exact character set, data shape, romanization, quiz generation,
chapter navigation, practice modes, scoring, retries, and error handling.
