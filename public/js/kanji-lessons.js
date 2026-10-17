(function () {
  'use strict';

  var chapters = [];
  var pool = [];
  var currentChapter = 0;
  var quiz = null;
  var section = 'lessons';
  var practiceSettings = null;
  var chapterPicker = null;
  var chapterList = document.getElementById('chapters');
  var cards = document.getElementById('kanji-cards');
  var status = document.getElementById('status');
  var retry = document.getElementById('retry');
  var previous = document.getElementById('previous');
  var next = document.getElementById('next');
  var gradeFilter = document.getElementById('grade-filter');
  var search = document.getElementById('chapter-search');

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readings(title, values) {
    var group = element('div');
    group.appendChild(element('h4', '', title));
    if (!values.length) {
      group.appendChild(element('p', 'missing-reading', 'No reading of this type in the dictionary.'));
      return group;
    }
    var list = element('ul');
    values.forEach(function (reading) {
      var item = element('li');
      var kana = element('span', 'kana', reading.kana);
      kana.lang = 'ja';
      item.appendChild(kana);
      item.appendChild(element('span', 'romaji', reading.romaji));
      list.appendChild(item);
    });
    group.appendChild(list);
    return group;
  }

  function renderChapterList() {
    chapterList.textContent = '';
    var count = 0;
    var currentVisible = false;
    chapters.forEach(function (chapter, index) {
      if (!KanjiStudy.matches(chapter, gradeFilter.value, search.value)) return;
      count++;
      var button = element('button', 'chapter-button', chapter.id + '. ' + chapter.title);
      button.type = 'button';
      var preview = element('span', '', chapter.kanji.map(function (kanji) { return kanji.character; }).join(' '));
      preview.lang = 'ja';
      button.appendChild(preview);
      if (index === currentChapter) {
        button.setAttribute('aria-current', 'true');
        currentVisible = true;
      }
      button.addEventListener('click', function () { showChapter(index, true); });
      chapterList.appendChild(button);
    });
    document.getElementById('chapter-count').textContent = count + ' chapters found.' +
      (currentVisible ? '' : ' Current chapter is outside this filter.');
  }

  function closeQuiz() {
    if (chapterPicker) chapterPicker.select2('close');
    quiz = null;
    document.getElementById('quiz-view').hidden = true;
    document.getElementById('lesson-view').hidden = false;
    document.getElementById('lessons').hidden = section !== 'lessons';
    document.getElementById('practice').hidden = section !== 'practice';
  }

  function showSection(name) {
    section = name;
    closeQuiz();
    ['lessons', 'practice'].forEach(function (key) {
      var button = document.getElementById('nav-' + key);
      if (key === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (name === 'practice') {
      document.getElementById('practice-chapter').value = String(currentChapter);
      chapterPicker.trigger('change');
      document.getElementById('practice-title').focus();
    } else document.getElementById('chapter-title').focus();
  }

  function practiceChapterLabel(chapter) {
    return chapter.id + '. ' + chapter.title + ' / ' +
      chapter.kanji.map(function (kanji) { return kanji.character; }).join(' ');
  }

  function selectedPracticeChapter() {
    var value = document.getElementById('practice-chapter').value.trim();
    return chapters.findIndex(function (chapter) {
      return value === String(chapter.id - 1);
    });
  }

  function matchStart(params, data) {
    if ($.trim(params.term) === '') return data;
    if (typeof data.children === 'undefined') return null;
    var filteredChildren = [];
    $.each(data.children, function (index, child) {
      if (child.text.toUpperCase().indexOf(params.term.toUpperCase()) === 0) {
        filteredChildren.push(child);
      }
    });
    if (filteredChildren.length) {
      var modifiedData = $.extend({}, data, true);
      modifiedData.children = filteredChildren;
      return modifiedData;
    }
    return null;
  }

  function initializePracticeChapters() {
    var select = document.getElementById('practice-chapter');
    select.textContent = '';
    var groups = {};
    chapters.forEach(function (chapter, index) {
      if (!groups[chapter.grade]) {
        groups[chapter.grade] = element('optgroup');
        groups[chapter.grade].label = chapter.grade === 8 ? 'Secondary school' : 'Grade ' + chapter.grade;
        select.appendChild(groups[chapter.grade]);
      }
      var option = element('option');
      option.textContent = practiceChapterLabel(chapter);
      option.value = String(index);
      groups[chapter.grade].appendChild(option);
    });
    select.value = '0';
    chapterPicker = $('#practice-chapter');
    chapterPicker.select2({
      matcher: matchStart,
      width: '100%',
      dropdownParent: $('#practice-chapter-field'),
      minimumResultsForSearch: 0
    });
    chapterPicker.on('change', updatePracticeScope);
    updatePracticeScope();
    document.getElementById('practice-chapter-count').textContent = 'Open the dropdown and type a chapter number. Results match from the start of each label.';
  }

  function updatePracticeScope() {
    var random = document.getElementById('practice-scope').value !== 'chapter';
    var empty = selectedPracticeChapter() < 0;
    document.getElementById('practice-chapter-field').hidden = random;
    document.getElementById('practice-chapter').disabled = random;
    if (random && chapterPicker) chapterPicker.select2('close');
    document.getElementById('start-practice').disabled = !random && empty;
  }

  function showChapter(index, moveFocus) {
    closeQuiz();
    currentChapter = index;
    var chapter = chapters[index];
    var grade = chapter.grade === 8 ? 'Secondary school' : 'Grade ' + chapter.grade;
    document.getElementById('chapter-position').textContent = 'Chapter ' + chapter.id + ' / ' + grade;
    document.getElementById('chapter-title').textContent = chapter.title;
    document.getElementById('chapter-description').textContent = chapter.description;
    document.getElementById('page-count').textContent = chapter.id + ' of ' + chapters.length;
    previous.disabled = index === 0;
    next.disabled = index === chapters.length - 1;
    cards.textContent = '';
    chapter.kanji.forEach(function (kanji) {
      var card = element('article', 'kanji-card');
      var character = element('div', 'character', kanji.character);
      character.lang = 'ja';
      card.appendChild(character);
      var details = element('div');
      details.appendChild(element('h3', '', kanji.meaning));
      details.appendChild(element('p', 'kanji-meta', kanji.strokes + ' strokes' +
        (kanji.variants.length ? ' / Common variant: ' + kanji.variants.join(', ') : '')));
      var readingGroups = element('div', 'readings');
      readingGroups.appendChild(readings("Kun'yomi / hiragana", kanji.kunyomi));
      readingGroups.appendChild(readings("On'yomi / katakana", kanji.onyomi));
      details.appendChild(readingGroups);
      card.appendChild(details);
      cards.appendChild(card);
    });
    renderChapterList();
    if (moveFocus) document.getElementById('chapter-title').focus();
  }

  function showQuestion() {
    var question = quiz.questions[quiz.index];
    quiz.answered = false;
    document.getElementById('quiz-results').hidden = true;
    document.getElementById('quiz-question').hidden = false;
    document.getElementById('quiz-progress').textContent = 'Question ' + (quiz.index + 1) + ' of ' + quiz.questions.length;
    document.getElementById('quiz-meter').max = quiz.questions.length;
    document.getElementById('quiz-meter').value = quiz.index;
    document.getElementById('quiz-prompt').textContent = question.type === 'kanji' ?
      'Which kanji matches these English meanings?' : question.type === 'meaning' ?
      'Which English meaning matches this kanji?' :
      'Which is a dictionary ' + (question.type === 'onyomi' ? "on'yomi (katakana)" : "kun'yomi (hiragana)") +
      ' reading of this kanji?';
    var prompt = document.getElementById('quiz-character');
    prompt.textContent = question.type === 'kanji' ? question.meaning : question.character;
    prompt.className = question.type === 'kanji' ? 'quiz-meaning' : 'quiz-character';
    prompt.lang = question.type === 'kanji' ? 'en' : 'ja';
    document.getElementById('quiz-feedback').textContent = '';
    document.getElementById('next-question').hidden = true;
    var options = document.getElementById('quiz-options');
    options.textContent = '';
    question.options.forEach(function (option) {
      var button = element('button', 'quiz-option', option);
      if (question.type === 'kanji') {
        button.className += ' kanji-option';
        button.lang = 'ja';
      }
      button.type = 'button';
      button.addEventListener('click', function () { answerQuestion(option); });
      options.appendChild(button);
    });
    document.getElementById('quiz-title').focus();
  }

  function answerQuestion(answer) {
    if (!quiz || quiz.answered) return;
    quiz.answered = true;
    var question = quiz.questions[quiz.index];
    var correct = answer === question.answer;
    if (correct) quiz.score++;
    else quiz.mistakes.push({ question: question, answer: answer });
    Array.prototype.forEach.call(document.getElementById('quiz-options').children, function (button) {
      button.disabled = true;
      if (button.textContent === question.answer) button.className += ' correct';
      else if (button.textContent === answer) button.className += ' incorrect';
    });
    document.getElementById('quiz-feedback').textContent = correct ? 'Correct! ' + question.answer :
      'Not quite. Correct answer: ' + question.answer;
    document.getElementById('quiz-meter').value = quiz.index + 1;
    var nextQuestion = document.getElementById('next-question');
    nextQuestion.textContent = quiz.index === quiz.questions.length - 1 ? 'See results' : 'Next question';
    nextQuestion.hidden = false;
    nextQuestion.focus();
  }

  function showResults() {
    document.getElementById('quiz-question').hidden = true;
    document.getElementById('quiz-results').hidden = false;
    var percent = Math.round(quiz.score / quiz.questions.length * 100);
    document.getElementById('quiz-score').textContent = quiz.score + ' / ' + quiz.questions.length + ' correct (' + percent + '%)';
    document.getElementById('quiz-result-message').textContent = quiz.mistakes.length ?
      'Review these answers, then try again when you are ready.' : 'Perfect round! Try the next chapter or practice again.';
    var review = document.getElementById('quiz-review');
    review.textContent = '';
    quiz.mistakes.forEach(function (mistake) {
      var type = { meaning: 'meaning', onyomi: "on'yomi", kunyomi: "kun'yomi", kanji: 'kanji for ' + mistake.question.meaning }[mistake.question.type];
      review.appendChild(element('li', '', mistake.question.character + ' / ' + type +
        ': ' + mistake.question.answer + ' (you chose: ' + mistake.answer + ')'));
    });
    document.getElementById('quiz-score').focus();
  }

  function startQuiz(practice) {
    try {
      var questions = practice ?
        KanjiStudy.makePracticeQuiz(chapters[practiceSettings.chapter], pool, practiceSettings.mode, practiceSettings.count) :
        KanjiStudy.makeQuiz(chapters[currentChapter], pool);
      quiz = { questions: questions, index: 0, score: 0, mistakes: [], practice: practice };
      status.hidden = true;
      document.getElementById('quiz-title').textContent = practice ? 'Practice quiz' : 'Chapter quiz';
      document.getElementById('back-to-lesson').textContent = practice ? 'Back to practice' : 'Back to lesson';
      document.getElementById('lesson-view').hidden = true;
      document.getElementById('lessons').hidden = true;
      document.getElementById('practice').hidden = true;
      document.getElementById('quiz-view').hidden = false;
      showQuestion();
    } catch (error) {
      console.error('Unable to start quiz:', error);
      closeQuiz();
      status.hidden = false;
      status.textContent = 'Could not create the quiz. Reload the page and try again.';
    }
  }

  async function loadLessons() {
    status.hidden = false;
    status.textContent = 'Loading your chapters...';
    retry.hidden = true;
    document.getElementById('lessons').hidden = true;
    try {
      var response = await fetch('./data/kanji-lessons.json');
      if (!response.ok) throw new Error('Lesson request failed: HTTP ' + response.status);
      var data = await response.json();
      if (!KanjiStudy.validCatalog(data)) throw new Error('Invalid kanji lesson content.');
      chapters = data.chapters;
      pool = [].concat.apply([], chapters.map(function (chapter) { return chapter.kanji; }));
      initializePracticeChapters();
      document.getElementById('catalog-summary').textContent = data.totalKanji.toLocaleString() + ' kanji / ' +
        chapters.length + ' chapters / meaning & reading quizzes';
      showChapter(0, false);
      document.getElementById('lessons').hidden = false;
      status.hidden = true;
      document.getElementById('nav-lessons').disabled = false;
      document.getElementById('nav-practice').disabled = false;
    } catch (error) {
      console.error('Unable to load kanji lessons:', error);
      status.textContent = 'Could not load the lessons. Check your connection and try again. Open this page through a web server, not directly as a file.';
      retry.hidden = false;
    }
  }

  gradeFilter.addEventListener('change', renderChapterList);
  search.addEventListener('input', renderChapterList);
  previous.addEventListener('click', function () {
    if (currentChapter > 0) showChapter(currentChapter - 1, true);
  });
  next.addEventListener('click', function () {
    if (currentChapter < chapters.length - 1) showChapter(currentChapter + 1, true);
  });
  document.getElementById('nav-lessons').addEventListener('click', function () { showSection('lessons'); });
  document.getElementById('nav-practice').addEventListener('click', function () { showSection('practice'); });
  document.getElementById('practice-scope').addEventListener('change', updatePracticeScope);
  document.getElementById('start-practice').addEventListener('click', function () {
    var scope = document.getElementById('practice-scope').value;
    if (scope === 'chapter' && selectedPracticeChapter() < 0) {
      document.getElementById('practice-chapter').focus();
      return;
    }
    practiceSettings = {
      mode: document.getElementById('practice-type').value,
      count: scope === 'chapter' ? null : Number(scope),
      chapter: selectedPracticeChapter()
    };
    startQuiz(true);
  });
  document.getElementById('start-quiz').addEventListener('click', function () { startQuiz(false); });
  document.getElementById('retry-quiz').addEventListener('click', function () {
    if (quiz) startQuiz(quiz.practice);
  });
  document.getElementById('back-to-lesson').addEventListener('click', function () {
    closeQuiz();
    document.getElementById(section === 'practice' ? 'practice-title' : 'chapter-title').focus();
  });
  document.getElementById('next-question').addEventListener('click', function () {
    if (!quiz || !quiz.answered) return;
    quiz.index++;
    if (quiz.index === quiz.questions.length) showResults();
    else showQuestion();
  });
  retry.addEventListener('click', loadLessons);
  loadLessons();
}());
