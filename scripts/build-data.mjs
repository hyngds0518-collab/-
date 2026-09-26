// 원본 회의록 PDF → assets/data/base-data.js 생성
// 사용법: node scripts/build-data.mjs [pdf경로]
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfjs = await import(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.mjs');
const parser = require('../assets/js/parser.js');
const src = process.argv[2] || 'data/MOMENTLAB_회의록_20건.pdf';
const meetings = await parser.parsePdf(pdfjs, new Uint8Array(fs.readFileSync(src)));
const out = { source: path.basename(src), meetings };
fs.writeFileSync('assets/data/base-data.js', '/* 자동 생성: scripts/build-data.mjs */\nwindow.BASE_DATA = ' + JSON.stringify(out, null, 1) + ';\n');
console.log('meetings', meetings.length, 'decisions', meetings.reduce((a, m) => a + m.decisions.length, 0),
  'actions', meetings.reduce((a, m) => a + m.actions.length, 0), 'issues', meetings.reduce((a, m) => a + m.issues.length, 0));
