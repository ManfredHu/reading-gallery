import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNote } from './migrate-obsidian.mjs';

test('migration preserves content semantics without publishing internal references or inventing dates', () => {
  const raw = '---\ntitle: Book\ncreated: 2022-01-02\nstatus: Reading\nscore: 4\ntags: [书籍]\n---\n# Book\n\n![[cover.png]]\n\n## Notes\n\nA thought.\n\nhttps://example.feishu.cn/docx/private';
  const parsed = parseNote(raw, '书籍', 'Book.md');
  assert.equal(parsed.item.status, 'doing');
  assert.equal(parsed.item.recordedAt, '2022-01-02');
  assert.equal(parsed.item.date, '');
  assert.equal(parsed.item.year, '');
  assert.equal(parsed.item.review, '');
  assert.match(parsed.item.notes, /## Notes\n\nA thought/);
  assert(!parsed.item.notes.includes('feishu.cn'));
  assert(parsed.rawBody.includes('feishu.cn'));
  assert.deepEqual(parsed.embeds, ['cover.png']);
  assert.equal(parseNote(raw, '书籍', 'Book.md').item.id, parsed.item.id);
  assert.equal(parseNote(raw.replace('status: Reading\n', ''), '书籍', 'Book.md').item.status, 'unknown');
  assert.equal(parseNote(raw.replace('title: Book', 'title: 娱乐至死').replace('Reading', 'Finished'), '书籍', 'Book.md').item.status, 'unknown');
  assert.equal(parseNote(raw.replace('title: Book', 'title: 霍比特人123'), '影视', 'Book.md').item.notes, '');
  assert.equal(parseNote(raw.replace('[书籍]', '[课程]').replace('Reading', 'Ready to Start'), '影视', 'Book.md').item.type, 'course');
  assert.throws(() => parseNote(raw.replace('Reading', 'Something new'), '书籍', 'Book.md'), /Unknown source status/);
});
