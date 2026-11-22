'use strict';

const TOTAL_QUESTIONS = 10;
const QUESTION_SECONDS = 15;
const BEST_SCORE_KEY = 'quizzy-best-score-v1';
const API_BASE = 'https://opentdb.com/api.php';

const screens = Object.fromEntries(
  ['start', 'loading', 'error', 'quiz', 'results'].map(name => [name, document.getElementById(`${name}-screen`)])
);
const elements = {
  setupForm: document.getElementById('setup-form'), category: document.getElementById('category'), startButton: document.getElementById('start-button'),
  bestScore: document.getElementById('best-score'), errorMessage: document.getElementById('error-message'), retryButton: document.getElementById('retry-button'),
  backFromError: document.getElementById('back-from-error'), quitButton: document.getElementById('quit-button'), quizCategoryLabel: document.getElementById('quiz-category-label'),
  questionCounter: document.getElementById('question-counter'), progressTrack: document.getElementById('progress-track'), progressFill: document.getElementById('progress-fill'),
  questionNumberLabel: document.getElementById('question-number-label'), difficultyBadge: document.getElementById('difficulty-badge'), questionText: document.getElementById('question-text'),
  answerOptions: document.getElementById('answer-options'), answerFeedback: document.getElementById('answer-feedback'), runningScore: document.getElementById('running-score'), nextButton: document.getElementById('next-button'),
  timerRing: document.getElementById('timer-ring'), timerProgress: document.getElementById('timer-progress'), timerValue: document.getElementById('timer-value'), timerCaption: document.getElementById('timer-caption'),
  miniProgressCount: document.getElementById('mini-progress-count'), miniProgress: document.getElementById('mini-progress'), resultsTitle: document.getElementById('results-title'), resultsMessage: document.getElementById('results-message'),
  resultsMedal: document.getElementById('results-medal'), finalScore: document.getElementById('final-score'), finalPercentage: document.getElementById('final-percentage'), correctCount: document.getElementById('correct-count'),
  wrongCount: document.getElementById('wrong-count'), resultBestScore: document.getElementById('result-best-score'), playAgainButton: document.getElementById('play-again-button'), reviewButton: document.getElementById('review-button'),
  reviewPanel: document.getElementById('review-panel'), closeReviewButton: document.getElementById('close-review-button'), reviewList: document.getElementById('review-list')
};

const CATEGORY_NAMES = {
  '9': 'General Knowledge', '10': 'Books', '11': 'Film', '12': 'Music', '14': 'Television', '15': 'Video Games',
  '17': 'Science & Nature', '18': 'Computers', '19': 'Mathematics', '21': 'Sports', '22': 'Geography', '23': 'History', '25': 'Art', '27': 'Animals'
};

// Open Trivia DB's url3986 encoding is percent-encoded; decode it once before display.
function decodeApiText(value) {
  try { return decodeURIComponent(value.replace(/\+/g, '%20')); }
  catch { return value; }
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

class Question {
  constructor(apiQuestion) {
    this.text = decodeApiText(apiQuestion.question);
    this.correctAnswer = decodeApiText(apiQuestion.correct_answer);
    this.incorrectAnswers = apiQuestion.incorrect_answers.map(decodeApiText);
    this.options = shuffle([this.correctAnswer, ...this.incorrectAnswers]);
    this.category = decodeApiText(apiQuestion.category);
    this.difficulty = apiQuestion.difficulty;
    this.type = apiQuestion.type;
  }
}

class Quiz {
  constructor(questions) {
    this.questions = questions;
    this.currentIndex = 0;
    this.score = 0;
    this.answers = [];
  }
  getCurrentQuestion() { return this.questions[this.currentIndex] ?? null; }
  checkAnswer(answer) {
    if (this.answers[this.currentIndex]) return false;
    const question = this.getCurrentQuestion();
    if (!question) return false;
    const correct = answer === question.correctAnswer;
    if (correct) this.score += 1;
    this.answers[this.currentIndex] = { selectedAnswer: answer, correctAnswer: question.correctAnswer, correct, timedOut: false };
    return correct;
  }
  recordTimeout() {
    if (this.answers[this.currentIndex]) return;
    const question = this.getCurrentQuestion();
    if (!question) return;
    this.answers[this.currentIndex] = { selectedAnswer: null, correctAnswer: question.correctAnswer, correct: false, timedOut: true };
  }
  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) this.currentIndex += 1;
    return this.getCurrentQuestion();
  }
  isFinished() { return this.currentIndex >= this.questions.length - 1 && Boolean(this.answers[this.currentIndex]); }
}

let quiz = null;
let timerId = null;
let secondsLeft = QUESTION_SECONDS;
let isLoading = false;
let lastSettings = { category: '', difficulty: 'medium' };

function showScreen(screenName) {
  Object.entries(screens).forEach(([name, element]) => element.classList.toggle('hidden', name !== screenName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getBestScore() {
  try {
    const stored = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(stored) && stored >= 0 ? Math.min(TOTAL_QUESTIONS, stored) : 0;
  } catch { return 0; }
}

function saveBestScore(score) {
  const best = Math.max(getBestScore(), score);
  try { localStorage.setItem(BEST_SCORE_KEY, String(best)); } catch { /* Storage may be unavailable in private browsing. */ }
  updateBestScore(best);
  return best;
}

function updateBestScore(score = getBestScore()) {
  elements.bestScore.innerHTML = `${score} <small>/ 10</small>`;
}

function clearQuestionTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function resetTimerDisplay() {
  elements.timerRing.classList.remove('warning', 'danger');
  elements.timerProgress.style.strokeDashoffset = '0';
  elements.timerValue.textContent = String(QUESTION_SECONDS);
  elements.timerCaption.textContent = "You've got this.";
}

function buildApiUrl(settings) {
  const url = new URL(API_BASE);
  url.searchParams.set('amount', String(TOTAL_QUESTIONS));
  url.searchParams.set('encode', 'url3986');
  if (settings.category) url.searchParams.set('category', settings.category);
  if (settings.difficulty) url.searchParams.set('difficulty', settings.difficulty);
  return url.toString();
}

async function fetchQuestions(settings) {
  const response = await fetch(buildApiUrl(settings), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`The trivia service returned an error (${response.status}). Please try again.`);
  const data = await response.json();
  if (data.response_code !== 0) {
    const messages = {
      1: 'There are not enough questions for that combination. Choose another category or difficulty.',
      2: 'The quiz request was not accepted. Please adjust your choices and try again.',
      3: 'The quiz session could not be found. Please try again.',
      4: 'The question database needs to reset. Please wait a few seconds, then try again.',
      5: 'The trivia service is receiving requests too quickly. Wait at least five seconds before trying again.'
    };
    throw new Error(messages[data.response_code] || 'The trivia service could not prepare your questions. Please try again.');
  }
  if (!Array.isArray(data.results) || data.results.length !== TOTAL_QUESTIONS) {
    throw new Error('We did not receive ten questions. Please try again.');
  }
  return data.results.map(item => new Question(item));
}

async function startQuiz(settings = lastSettings) {
  if (isLoading) return;
  isLoading = true;
  lastSettings = { ...settings };
  elements.startButton.disabled = true;
  elements.startButton.querySelector('span:first-child').textContent = 'Loading...';
  showScreen('loading');
  try {
    const questions = await fetchQuestions(lastSettings);
    quiz = new Quiz(questions);
    isLoading = false;
    renderCurrentQuestion();
    showScreen('quiz');
  } catch (error) {
    isLoading = false;
    elements.errorMessage.textContent = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    showScreen('error');
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.querySelector('span:first-child').textContent = 'Start quiz';
  }
}

function renderCurrentQuestion() {
  clearQuestionTimer();
  const question = quiz.getCurrentQuestion();
  if (!question) { showResults(); return; }
  const number = quiz.currentIndex + 1;
  const progress = (number / TOTAL_QUESTIONS) * 100;
  elements.questionCounter.innerHTML = `${String(number).padStart(2, '0')} <span>/ ${TOTAL_QUESTIONS}</span>`;
  elements.questionNumberLabel.textContent = `QUESTION ${String(number).padStart(2, '0')}`;
  elements.progressFill.style.width = `${progress}%`;
  elements.progressTrack.setAttribute('aria-valuenow', String(number));
  elements.quizCategoryLabel.textContent = question.category || CATEGORY_NAMES[lastSettings.category] || 'General Knowledge';
  elements.difficultyBadge.textContent = question.difficulty.toUpperCase();
  elements.difficultyBadge.className = `difficulty-badge ${question.difficulty}`;
  elements.questionText.textContent = question.text;
  elements.runningScore.textContent = String(quiz.score);
  elements.answerFeedback.textContent = '';
  elements.answerFeedback.className = 'answer-feedback';
  elements.nextButton.disabled = true;
  elements.nextButton.innerHTML = number === TOTAL_QUESTIONS ? 'See results <span class="button-arrow">→</span>' : 'Next question <span class="button-arrow">→</span>';
  elements.answerOptions.replaceChildren();
  question.options.forEach((answer, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer-option';
    const letter = document.createElement('span');
    letter.className = 'option-letter';
    letter.textContent = String.fromCharCode(65 + index);
    const label = document.createElement('span');
    label.textContent = answer;
    button.append(letter, label);
    button.addEventListener('click', () => selectAnswer(answer, button));
    elements.answerOptions.append(button);
  });
  updateMiniProgress();
  resetTimerDisplay();
  startQuestionTimer();
}

function selectAnswer(answer, clickedButton) {
  if (!quiz || quiz.answers[quiz.currentIndex]) return;
  clearQuestionTimer();
  const correct = quiz.checkAnswer(answer);
  const question = quiz.getCurrentQuestion();
  [...elements.answerOptions.children].forEach(button => {
    button.disabled = true;
    const optionText = button.querySelector('span:last-child').textContent;
    if (optionText === question.correctAnswer) button.classList.add('correct');
  });
  if (!correct) clickedButton.classList.add('wrong');
  elements.answerFeedback.textContent = correct ? 'Lovely work! That’s the right answer.' : `Not quite — the answer is ${question.correctAnswer}.`;
  elements.answerFeedback.classList.add(correct ? 'good' : 'bad');
  elements.runningScore.textContent = String(quiz.score);
  elements.nextButton.disabled = false;
  elements.timerCaption.textContent = correct ? 'Nicely done!' : 'Keep your momentum.';
  updateMiniProgress(correct ? 'correct' : 'wrong');
}

function startQuestionTimer() {
  secondsLeft = QUESTION_SECONDS;
  timerId = setInterval(() => {
    secondsLeft -= 1;
    elements.timerValue.textContent = String(secondsLeft);
    elements.timerProgress.style.strokeDashoffset = String(320.44 * (1 - secondsLeft / QUESTION_SECONDS));
    elements.timerRing.classList.toggle('warning', secondsLeft <= 7 && secondsLeft > 4);
    elements.timerRing.classList.toggle('danger', secondsLeft <= 4);
    if (secondsLeft <= 7 && secondsLeft > 4) elements.timerCaption.textContent = 'Time is ticking!';
    if (secondsLeft <= 4) elements.timerCaption.textContent = 'Quick, you can do it!';
    if (secondsLeft <= 0) {
      clearQuestionTimer();
      handleTimeout();
    }
  }, 1000);
}

function handleTimeout() {
  const question = quiz.getCurrentQuestion();
  quiz.recordTimeout();
  [...elements.answerOptions.children].forEach(button => {
    button.disabled = true;
    if (button.querySelector('span:last-child').textContent === question.correctAnswer) button.classList.add('reveal-correct');
  });
  elements.answerFeedback.textContent = `Time's up! The answer is ${question.correctAnswer}.`;
  elements.answerFeedback.className = 'answer-feedback bad';
  elements.nextButton.disabled = false;
  elements.timerCaption.textContent = 'The clock ran out.';
  updateMiniProgress('wrong');
}

function updateMiniProgress(latestStatus = '') {
  elements.miniProgress.replaceChildren();
  quiz.questions.forEach((_, index) => {
    const segment = document.createElement('span');
    if (index < quiz.currentIndex) segment.classList.add(quiz.answers[index]?.correct ? 'done' : 'missed');
    else if (index === quiz.currentIndex && latestStatus) segment.classList.add(latestStatus === 'correct' ? 'done' : 'missed');
    else if (index === quiz.currentIndex) segment.classList.add('current');
    elements.miniProgress.append(segment);
  });
  elements.miniProgressCount.textContent = `${quiz.currentIndex + 1} of ${TOTAL_QUESTIONS}`;
}

function advanceQuestion() {
  if (!quiz || !quiz.answers[quiz.currentIndex]) return;
  clearQuestionTimer();
  if (quiz.isFinished()) { showResults(); return; }
  quiz.nextQuestion();
  renderCurrentQuestion();
}

function showResults() {
  clearQuestionTimer();
  const score = quiz.score;
  const percentage = Math.round((score / TOTAL_QUESTIONS) * 100);
  const best = saveBestScore(score);
  elements.finalScore.innerHTML = `${score}<span>/${TOTAL_QUESTIONS}</span>`;
  elements.finalPercentage.textContent = `${percentage}% accuracy`;
  elements.correctCount.textContent = String(score);
  elements.wrongCount.textContent = String(TOTAL_QUESTIONS - score);
  elements.resultBestScore.textContent = `${best}/${TOTAL_QUESTIONS}`;
  if (percentage >= 80) {
    elements.resultsTitle.textContent = 'Look at you go!';
    elements.resultsMessage.textContent = 'Fantastic work — you really know your stuff.';
    elements.resultsMedal.textContent = '🏆';
  } else if (percentage >= 50) {
    elements.resultsTitle.textContent = 'Nice effort!';
    elements.resultsMessage.textContent = 'You’re building your trivia skills. Ready for another round?';
    elements.resultsMedal.textContent = '🌟';
  } else {
    elements.resultsTitle.textContent = 'Keep that curiosity!';
    elements.resultsMessage.textContent = 'Every round is a chance to learn. Give it another go!';
    elements.resultsMedal.textContent = '🌱';
  }
  buildReview();
  elements.reviewPanel.classList.add('hidden');
  elements.reviewButton.innerHTML = 'Review answers <span class="button-arrow">↓</span>';
  showScreen('results');
}

function buildReview() {
  elements.reviewList.replaceChildren();
  quiz.questions.forEach((question, index) => {
    const result = quiz.answers[index];
    const item = document.createElement('article');
    item.className = 'review-item';
    const top = document.createElement('div');
    top.className = 'review-item-top';
    const number = document.createElement('span');
    number.textContent = `QUESTION ${String(index + 1).padStart(2, '0')}`;
    const status = document.createElement('span');
    status.className = `review-status ${result.correct ? 'good' : 'bad'}`;
    status.textContent = result.correct ? '✓ Correct' : result.timedOut ? '◷ Timed out' : '× Incorrect';
    top.append(number, status);
    const prompt = document.createElement('p');
    prompt.className = 'review-question';
    prompt.textContent = question.text;
    const playerAnswer = document.createElement('p');
    playerAnswer.className = 'review-answer';
    playerAnswer.append(document.createTextNode('Your answer: '));
    const playerStrong = document.createElement('strong');
    playerStrong.textContent = result.selectedAnswer ?? 'No answer (time ran out)';
    playerAnswer.append(playerStrong);
    const correctAnswer = document.createElement('p');
    correctAnswer.className = 'review-answer';
    correctAnswer.append(document.createTextNode('Correct answer: '));
    const correctStrong = document.createElement('strong');
    correctStrong.textContent = question.correctAnswer;
    correctAnswer.append(correctStrong);
    item.append(top, prompt, playerAnswer, correctAnswer);
    elements.reviewList.append(item);
  });
}

function returnToStart() {
  clearQuestionTimer();
  quiz = null;
  isLoading = false;
  elements.reviewPanel.classList.add('hidden');
  updateBestScore();
  showScreen('start');
}

elements.setupForm.addEventListener('submit', event => {
  event.preventDefault();
  if (isLoading) return;
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  startQuiz({ category: elements.category.value, difficulty });
});
elements.retryButton.addEventListener('click', () => startQuiz(lastSettings));
elements.backFromError.addEventListener('click', returnToStart);
elements.quitButton.addEventListener('click', () => {
  clearQuestionTimer();
  if (window.confirm('Leave this quiz? Your progress in this round will be lost.')) returnToStart();
  else if (quiz && !quiz.answers[quiz.currentIndex]) startQuestionTimer();
});
elements.nextButton.addEventListener('click', advanceQuestion);
elements.playAgainButton.addEventListener('click', returnToStart);
elements.reviewButton.addEventListener('click', () => {
  const willShow = elements.reviewPanel.classList.contains('hidden');
  elements.reviewPanel.classList.toggle('hidden', !willShow);
  elements.reviewButton.innerHTML = willShow ? 'Hide review <span class="button-arrow">↑</span>' : 'Review answers <span class="button-arrow">↓</span>';
  if (willShow) elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
elements.closeReviewButton.addEventListener('click', () => {
  elements.reviewPanel.classList.add('hidden');
  elements.reviewButton.innerHTML = 'Review answers <span class="button-arrow">↓</span>';
});

updateBestScore();
