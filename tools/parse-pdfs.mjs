// Converts source/<lang>/*.pdf into public/data/<lang>/<category>.json
// and merges answer keys from source/answers/<category>.txt.
//
// Usage: npm run build:data
//
// PDF file name must start with the category number: "1.-anything.pdf".
// Answer key format (one line per question, exactly one letter a–e):
//   1. a
//   2. d
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'source');
const OUT = path.join(ROOT, 'public', 'data');

// Cyrillic look-alikes that sometimes appear in option markers
const LETTER_FIX = { 'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'д': 'd' };
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', m: 'ᵐ', '+': '⁺', '-': '⁻' };
const toSuperscript = (s) => [...s].map((c) => SUP[c] ?? c).join('');

async function pdfLines(file) {
  const doc = await getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    verbosity: 0,
  }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = new Map();
    const place = (it, tolerance, text) => {
      const y = Math.round(it.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= tolerance) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: it.transform[4], w: it.width, t: text, size: it.transform[0] });
    };
    const isSup = (it) => it.transform[0] < 10;
    // regular text first, then superscripts (e.g. isotope numbers "99mTc")
    // are attached to the line they sit on
    for (const it of items) if (it.str && !isSup(it)) place(it, 2, it.str);
    for (const it of items) if (it.str && isSup(it)) place(it, 6, toSuperscript(it.str));
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const parts = rows.get(y).sort((a, b) => a.x - b.x);
      let text = '';
      let end = null;
      for (const part of parts) {
        if (end !== null && part.x - end > 1.5 && !text.endsWith(' ') && !part.t.startsWith(' ')) text += ' ';
        text += part.t;
        end = part.x + part.w;
      }
      lines.push({ text: text.replace(/\s+/g, ' ').trim(), size: parts[0].size });
    }
  }
  return lines.filter((l) => l.text);
}

function appendText(prev, next) {
  if (!prev) return next;
  // word hyphenated across lines: "серцево-" + "судинний" stays with hyphen, no space
  if (/[-‐]$/.test(prev)) return prev + next;
  return prev + ' ' + next;
}

function parse(lines, file) {
  let title = '';
  const questions = [];
  let q = null;
  let opt = null;
  for (const { text, size } of lines) {
    if (!questions.length && !q && size > 14) {
      title = appendText(title, text);
      continue;
    }
    const qm = text.match(/^(\d+)\s*\.\s*(.*)$/);
    const om = text.match(/^([a-eасвде])\s*\)\s*(.*)$/i);
    if (qm && (!q || q.options.length >= 2)) {
      q = { n: Number(qm[1]), text: qm[2], options: [] };
      questions.push(q);
      opt = null;
    } else if (om && q) {
      const letter = LETTER_FIX[om[1].toLowerCase()] ?? om[1].toLowerCase();
      opt = { id: letter, text: om[2] };
      q.options.push(opt);
    } else if (opt) {
      opt.text = appendText(opt.text, text);
    } else if (q) {
      q.text = appendText(q.text, text);
    } else {
      console.warn(`  [${file}] skipped line before first question: ${text}`);
    }
  }
  // Translated PDFs sometimes mix up markers (e.g. "a) с) в) d) e)"),
  // so letters are assigned by position, as in the original test.
  for (const q of questions) {
    const ids = q.options.map((o) => o.id).join('');
    if (ids !== LETTERS.slice(0, q.options.length).join('')) {
      console.warn(`  [${file}] question ${q.n}: options marked "${ids}", relabelled by position`);
    }
    q.options.forEach((o, i) => (o.id = LETTERS[i]));
  }
  questions.forEach((q, i) => {
    if (q.n !== i + 1) console.warn(`  [${file}] question numbering gap at ${q.n}`);
  });
  // "ЯДЕРНА МЕДИЦИНА" -> "Ядерна медицина"
  if (title === title.toUpperCase()) title = title[0] + title.slice(1).toLowerCase();
  return { title, questions };
}

function readAnswers(category) {
  const file = path.join(SRC, 'answers', `${category}.txt`);
  if (!fs.existsSync(file)) return null;
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s*[.):]?\s*([a-eасвде,\s]+?)\s*$/i);
    if (!m) continue;
    map[Number(m[1])] = [...m[2].toLowerCase().replace(/[,\s]/g, '')].map((c) => LETTER_FIX[c] ?? c);
  }
  return map;
}

const index = { languages: {}, generatedAt: new Date().toISOString() };

for (const lang of fs.readdirSync(SRC).filter((d) => d !== 'answers')) {
  const dir = path.join(SRC, lang);
  if (!fs.statSync(dir).isDirectory()) continue;
  const outDir = path.join(OUT, lang);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const categories = [];
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
  for (const file of files.sort((a, b) => parseInt(a) - parseInt(b))) {
    const id = String(parseInt(file));
    if (Number.isNaN(Number(id))) {
      console.warn(`skip ${lang}/${file}: name must start with category number`);
      continue;
    }
    const { title, questions } = parse(await pdfLines(path.join(dir, file)), `${lang}/${file}`);
    const answers = readAnswers(id);
    let answered = 0;
    for (const q of questions) {
      const a = answers?.[q.n];
      if (a?.length > 1) console.warn(`  [${id}.txt] question ${q.n}: only one answer allowed, got "${a.join('')}"`);
      if (a?.length === 1) {
        q.correct = a;
        answered++;
      }
    }
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ id, title, questions }));
    categories.push({ id, title, count: questions.length, answered });
    console.log(`${lang}/${file}: "${title}" — ${questions.length} questions, ${answered} with answers`);
  }
  index.languages[lang] = { categories };
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
