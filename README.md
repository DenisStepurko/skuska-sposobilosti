# Медтести

A PWA for exam prep: study by category and a test of 60 random questions.
No frameworks: static files in `public/`, and questions are generated from PDFs.

## Structure

```
source/
  uk/            PDFs with questions (Ukrainian). The file name starts with the category number: "1.-....pdf"
  answers/       answer keys: 1.txt, 2.txt ... (shared across all languages)
public/          the app itself (this is what gets deployed)
  data/          generated JSON — do not edit by hand
tools/
  parse-pdfs.mjs PDF + keys → public/data
  make-icons.mjs icon generation
  serve.mjs      local server
```

## Commands

```
npm install
npm run build:data   # after any change to the PDFs or answers
npm start            # http://localhost:8080
```

## Answers

File `source/answers/<category number>.txt`, one line per question,
exactly one correct letter:

```
1. a
2. b
```

The current keys for all 8 categories are **unofficial**: they may contain mistakes.
If you find an error, fix the letter in the relevant file and run `npm run build:data`.

Letters are counted by option position (1st = a, 2nd = b …), even if the PDF has
a typo in the markers (for example "с)" or "в)" in Cyrillic).

## Testing

Settings are constants at the top of `public/app.js`:
`TEST_SIZE` (60 questions), `TEST_MINUTES` (180 min), `PASS_PERCENT` (80%).
Each question has exactly one correct option.
When time runs out, the test finishes automatically (even if the app was closed).

## Progress

All statistics are stored in the browser's `localStorage` on each device:
everyone has their own progress on their own phone, and no server is needed.

## New language

Put the PDFs in `source/<code>/` (for example `source/sk/`) with the same numbers,
add the interface strings to `I18N` in `public/app.js`, and run `npm run build:data`.
A language switcher appears on the home screen automatically.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml`: it rebuilds `public/data`
from `source/` and publishes `public/` to GitHub Pages. So you can replace a PDF or fix an answer
right on GitHub, and the site updates in a minute or two.

One-time setup: Settings → Pages → Source: **GitHub Actions**.

## Installing on a phone

Open the site at `https://<user>.github.io/<repo>/` in a phone browser, then:
- Android/Chrome: menu → "Install app" / "Add to Home screen";
- iPhone/Safari: "Share" → "Add to Home Screen".

The app picks up updated questions/answers on the next launch.
