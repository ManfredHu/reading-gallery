import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeItems, normalizeCollection } from '../src/data.ts';

// One-time migration tooling only; never read another repository implicitly.
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = fileURLToPath(new URL('..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const states = { Finished: 'done', Reading: 'doing', 'Ready to Start': 'wish', Block: 'paused' };
const grouped = ['霍比特人123', '扎职1/2', '绝命毒师 1-6季', '指环王'];

export function parseNote(raw, folder, file) {
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) throw new Error(`Missing frontmatter: ${file}`);
  const meta = yaml.load(front[1], { schema: yaml.JSON_SCHEMA });
  if (!meta.title) throw new Error(`Missing title: ${file}`);
  if (meta.status && !states[meta.status]) throw new Error(`Unknown source status: ${meta.status}`);
  const rawBody = raw.slice(front[0].length).trim();
  const embeds = [...rawBody.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(match => match[1]);
  if (embeds.length > 1) throw new Error(`Review multiple embedded assets before migrating: ${file}`);
  let notes = rawBody.split('\n').filter((line, i) => !(i === 0 && line.trim() === `# ${meta.title}`)).join('\n')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/^\s*!?\[\]\(https?:\/\/[^\n]+\)\s*$/gm, '').trim();
  const flags = [];
  if (meta.title === '霍比特人123') {
    notes = '';
    flags.push('私人账号备忘只留在本地原文归档');
  }
  if (/https?:\/\/[^\s/]*(?:feishu\.cn|larkoffice\.com)\//i.test(notes)) {
    notes = notes.split('\n').map(line => /https?:\/\/[^\s/]*(?:feishu\.cn|larkoffice\.com)\//i.test(line)
      ? '（内部参考链接仅保存在本地原文归档）' : line).join('\n');
    flags.push('内部文档链接只留在本地原文归档');
  }
  let status = states[meta.status] || 'unknown';
  if (meta.title === '娱乐至死') {
    status = 'unknown';
    flags.push('原状态 Finished，但正文说读到一半，需确认');
  }
  if (status === 'unknown') flags.push('完成状态待确认');
  if (grouped.includes(meta.title)) flags.push('合辑或多季条目，不能自动对应一个豆瓣条目');
  const type = meta.tags?.includes('课程') ? 'course' : folder === '书籍' ? 'book' : 'movie';
  if (type === 'course') flags.push('课程，仅应用收录');
  if (type === 'book' && notes) flags.push('读书笔记可能含摘录，不自动当作书评发布');
  const id = `archive:${hash(`${folder}/${file}`)}`;
  const item = normalizeCollection([{
    id, archiveId: id, title: meta.title, type, status,
    recordedAt: meta.created || '', date: '', year: '', rating: meta.score ?? 0,
    creator: meta.author || '', actors: meta.actors || [], tags: meta.tags || [],
    notes, review: '', cover: '', url: '',
  }]).items[0];
  return { item, embeds, flags, rawBody };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const archive = join(root, '.local/obsidian-migration');
  if (apply && existsSync(join(archive, 'completed.json'))) throw new Error('Already migrated. Maintain the application data now; do not re-import Obsidian.');
  const sourceIndex = process.argv.indexOf('--source');
  const sourcePath = sourceIndex < 0 ? '' : process.argv[sourceIndex + 1];
  if (!sourcePath || sourcePath.startsWith('--')) throw new Error('Historical migration only: provide --source <reading-directory>.');
  const source = resolve(sourcePath);
  const records = [];
  for (const folder of ['影视', '书籍']) {
    const directory = join(source, folder);
    for (const file of readdirSync(directory).filter(name => name.endsWith('.md') && !name.startsWith('_')).sort()) {
      const record = { ...parseNote(readFileSync(join(directory, file), 'utf8'), folder, file), folder, file };
      if (record.embeds[0]) {
        const asset = record.embeds[0];
        if (basename(asset) !== asset || !/\.(png|jpe?g|webp)$/i.test(asset)) throw new Error(`Unsafe asset: ${asset}`);
        record.asset = join(directory, 'attachments', asset);
        if (!existsSync(record.asset)) throw new Error(`Missing asset: ${record.asset}`);
        record.item.cover = `covers/archive-${hash(readFileSync(record.asset))}.jpg`;
      }
      records.push(record);
    }
  }
  const endpoint = 'http://127.0.0.1:5178/api/collection';
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(await response.text());
  const { revision, collection } = await response.json();
  // Never guess subject IDs or collapse same-title editions / adaptations.
  const duplicateTitles = records.filter(record => collection.items.some(item => item.type === record.item.type && item.title === record.item.title));
  if (duplicateTitles.length) throw new Error(`Review duplicate titles: ${duplicateTitles.map(r => r.item.title).join(', ')}`);
  const merged = normalizeCollection({ ...collection, items: mergeItems(collection.items, records.map(r => r.item)) });
  const summary = {
    imported: records.length, total: merged.items.length,
    categories: Object.fromEntries(['movie', 'book', 'course'].map(type => [type, records.filter(r => r.item.type === type).length])),
    statuses: Object.fromEntries(['done', 'doing', 'wish', 'paused', 'unknown'].map(status => [status, records.filter(r => r.item.status === status).length])),
    notes: records.filter(r => r.item.notes).length, localCovers: records.filter(r => r.asset).length,
    flags: records.filter(r => r.flags.length).map(r => ({ title: r.item.title, flags: r.flags })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) { console.log('Dry run only. Use --apply once after reviewing.'); return; }
  mkdirSync(archive, { recursive: true, mode: 0o700 });
  const backup = join(archive, 'collection.before.json');
  if (!existsSync(backup)) writeFileSync(backup, JSON.stringify(collection, null, 2), { flag: 'wx', mode: 0o600 });
  for (const folder of ['影视', '书籍']) {
    const target = join(archive, 'source', folder);
    if (!existsSync(target)) cpSync(join(source, folder), target, { recursive: true, force: false, errorOnExist: true });
  }
  for (const record of records.filter(r => r.asset)) {
    const output = join(root, 'public', record.item.cover);
    mkdirSync(dirname(output), { recursive: true });
    if (!existsSync(output)) {
      const result = spawnSync('sips', ['-Z', '640', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', record.asset, '--out', output], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || 'sips image conversion failed');
    }
  }
  writeFileSync(join(archive, 'report.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  writeFileSync(join(archive, 'pending-douban.json'), JSON.stringify(records.map(({ item, flags, folder, file }) => ({
    archiveId: item.archiveId, title: item.title, type: item.type, source: `${folder}/${file}`,
    subjectUrl: '', status: item.status, rating: item.rating, comment: '',
    notes: item.notes, flags, decision: 'needs-subject-verification-and-user-approval',
  })), null, 2), { mode: 0o600 });
  const saved = await fetch(endpoint, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Gallery-Update': '1', 'If-Match': revision },
    body: JSON.stringify(merged),
  });
  if (!saved.ok) throw new Error(await saved.text());
  const readback = await fetch(endpoint);
  if (!readback.ok) throw new Error(await readback.text());
  assert.deepEqual((await readback.json()).collection, merged, 'Persisted collection differs');
  writeFileSync(join(archive, 'completed.json'), JSON.stringify({ completedAt: new Date().toISOString(), ...summary }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Migrated and verified. Original files unchanged. No Douban writes or deployment.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
