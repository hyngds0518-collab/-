// 참석자 프로필 일러스트 생성 → assets/data/avatars.js
// 사용법: npm i @dicebear/core @dicebear/collection && node scripts/build-avatars.mjs
import { createAvatar } from '@dicebear/core';
import { notionists } from '@dicebear/collection';
import fs from 'fs';
globalThis.window = {};
await import(new URL('../assets/data/base-data.js', import.meta.url));
const names = new Set();
for (const m of window.BASE_DATA.meetings) m.attendees.forEach(a => names.add(a.name));
const bgs = ['dbeafe', 'e0e7ff', 'dcfce7', 'fef3c7', 'fce7f3', 'ede9fe', 'cffafe', 'ffedd5'];
const out = {};
[...names].forEach((n, i) => {
  const svg = createAvatar(notionists, { seed: 'ml-' + n, size: 96, radius: 50, backgroundColor: [bgs[i % bgs.length]], gestureProbability: 0 }).toString();
  out[n] = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
});
fs.writeFileSync('assets/data/avatars.js', '/* 인물 프로필 일러스트 (DiceBear Notionists, CC0) · 가상 인물용 */\nwindow.AVATARS = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, Math.round(fs.statSync('assets/data/avatars.js').size / 1024) + 'KB');
