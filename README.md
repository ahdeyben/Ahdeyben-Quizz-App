# Quizzy — Trivia Challenge

A responsive trivia quiz built with **HTML, CSS, and vanilla JavaScript**, using the [Open Trivia DB API](https://opentdb.com/).

## Features

- Choose a trivia category and Easy, Medium, or Hard difficulty.
- Loads ten questions in one API request per round.
- Fifteen-second countdown for each question.
- Shuffled answer options, instant feedback, and a running score.
- Results screen with score, percentage, performance message, and answer review.
- Personal best saved in `localStorage`.
- Loading, retry, and API error states.
- Responsive layout for mobile and desktop.

## How to run

1. Download or clone this folder.
2. Open `index.html` in a modern browser while connected to the internet.
3. Choose a category and difficulty, then select **Start quiz**.

For the most consistent local development experience, serve the folder with a simple static server (for example, VS Code Live Server). No package installation or build step is required.

## Project files

- `index.html` — Start, quiz, loading/error, and results screens.
- `style.css` — Responsive styling and visual states.
- `script.js` — API fetching, `Question` and `Quiz` classes, timer, scoring, review, and local storage.
- `screenshots/` — Application screenshots for submission.

## Future improvement

With more time, I would add a top-five leaderboard with player names and scores, saved locally between sessions.

## Data source

Questions are provided by [Open Trivia DB](https://opentdb.com/). An internet connection is required to start a new round.
