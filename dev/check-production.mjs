import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, sep } from 'node:path';

// Vite copies public files regardless of Git ignore rules.
for (const entry of readdirSync('dist', { recursive: true, encoding: 'utf8' })) {
  if (basename(entry) === '.DS_Store' || basename(entry).startsWith('._')) rmSync(join('dist', entry), { force: true });
}
for (const entry of readdirSync('dist', { recursive: true, encoding: 'utf8' })) {
  assert(!entry.split(sep).some(part => part.startsWith('.')), `Private file in build output: ${entry}`);
}

const scripts = readdirSync('dist/assets').filter(file => file.endsWith('.js'))
  .map(file => readFileSync(`dist/assets/${file}`, 'utf8')).join('\n');
for (const forbidden of ['localStorage', 'X-Gallery-Update', '/api/collection', 'DOMParser']) {
  assert(!scripts.includes(forbidden), `Production includes development-only capability: ${forbidden}`);
}
for (const removed of ['不需要服务器', '数据留在哪里', '更新与发布', '本地项目的收藏数据', '静态构建，自由收藏', '我的收藏', '导出记忆', '导出示例', 'createObjectURL']) {
  assert(!scripts.includes(removed), `Production includes removed visitor copy: ${removed}`);
}
for (const expected of ['keep reading !', '开卷有益，视野决定一个人的高度。', '我的记忆']) {
  assert(scripts.includes(expected), `Production is missing memory copy: ${expected}`);
}
assert(!existsSync('dist/.local'), 'Local backup directory must never be published');
assert.deepEqual(JSON.parse(readFileSync('dist/collection.json', 'utf8')), JSON.parse(readFileSync('public/collection.json', 'utf8')));
console.log('Production verified: static data only, no import client or local browser override.');
