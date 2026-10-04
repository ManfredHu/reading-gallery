import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemDate, statusLabel, mergeItems, normalizeCollection, selectItems } from './data.ts';

test('imports validate at the boundary, merge predictably, and filter without mutating data', () => {
  const movie = { type: 'movie', title: '电影 A', date: '2026-09-20', rating: 5, url: 'https://movie.douban.com/subject/123/', review: '一段感想', tags: ['治愈', '治愈'] };
  const book = { type: 'book', title: '书 B', date: '2025-09-20', rating: 4 };
  const data = normalizeCollection([movie, book]);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].id, 'movie:123');
  assert.deepEqual(data.items[0].tags, ['治愈']);
  assert.equal(normalizeCollection([]).items.length, 0);
  assert.equal(normalizeCollection({ version: 1, items: [], profile: { name: 'Manfred' } }).profile.name, 'Manfred');
  assert.throws(() => normalizeCollection({ items: {} }), /数组/);
  assert.throws(() => normalizeCollection({ version: 2, items: [] }), /版本/);
  assert.throws(() => normalizeCollection([{ ...movie, type: 'music' }]), /type/);
  assert.throws(() => normalizeCollection([{ ...movie, rating: 10 }]), /rating/);
  assert.throws(() => normalizeCollection([{ ...movie, rating: 3.5 }]), /rating/);
  assert.throws(() => normalizeCollection([{ ...movie, rating: true }]), /rating/);
  assert.throws(() => normalizeCollection([{ ...movie, rating: [] }]), /rating/);
  assert.equal(normalizeCollection([{ ...movie, type: ' movie ', rating: '5' }]).items[0].type, 'movie');
  assert.throws(() => normalizeCollection([{ ...movie, date: '2026-02-30' }]), /date/);
  assert.throws(() => normalizeCollection([{ ...movie, date: 'yesterday' }]), /date/);
  assert.throws(() => normalizeCollection([{ ...movie, title: '' }]), /title/);
  assert.throws(() => normalizeCollection([{ ...movie, review: 'a'.repeat(100001) }]), /评论/);
  const unsafe = normalizeCollection([{ ...movie, url: 'javascript:alert(1)', cover: 'data:text/html,bad' }]).items[0];
  assert.equal(unsafe.url, '');
  assert.equal(unsafe.cover, '');
  assert.equal(normalizeCollection([{ ...movie, cover: 'covers/poster.jpg' }]).items[0].cover, 'covers/poster.jpg');
  assert.equal(normalizeCollection([{ ...movie, cover: 'covers/../secret' }]).items[0].cover, '');
  const changed = normalizeCollection([{ ...movie, review: '更新', url: `${movie.url}?from=search` }]);
  assert.equal(mergeItems(data.items, changed.items).length, 2);
  assert.equal(mergeItems(data.items, changed.items)[0].review, '更新');
  assert.equal(normalizeCollection([movie, movie]).items.length, 1);
  const options = { type: 'all', query: '', year: '', rating: '', sort: 'newest' };
  assert.equal(selectItems(data.items, options)[0].title, '电影 A');
  assert.equal(selectItems(data.items, { ...options, type: 'reviews' }).length, 1);
  assert.equal(selectItems(data.items, { ...options, type: 'book', year: '2026' }).length, 0);
  assert.equal(selectItems(data.items, { ...options, query: ' 治愈 ' }).length, 1);
  assert.equal(selectItems(data.items, { ...options, rating: '5' }).length, 1);
  assert.equal(selectItems(data.items, { ...options, sort: 'oldest' })[0].title, '书 B');
  assert.equal(data.items[0].title, '电影 A');
});

test('application notes, local covers and unmapped records survive Douban refreshes', () => {
  const local = normalizeCollection([{ type: 'book', title: 'A', id: 'archive:1', archiveId: 'archive:1',
    status: 'doing', recordedAt: '2022-01-01', notes: 'Long original notes', cover: 'covers/local.jpg', review: 'Previous review' }]).items;
  const mapped = normalizeCollection([{ ...local[0], url: 'https://book.douban.com/subject/123/' }]).items;
  const merged = mergeItems(local, mapped);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'book:123');
  const fresh = normalizeCollection([{ type: 'book', title: 'A', status: 'done', rating: 5,
    url: 'https://book.douban.com/subject/123/', cover: 'https://example.com/remote.jpg', notes: '', recordedAt: '' }]).items;
  const result = mergeItems(merged, fresh);
  assert.equal(result[0].notes, 'Long original notes');
  assert.equal(result[0].recordedAt, '2022-01-01');
  assert.equal(result[0].archiveId, 'archive:1');
  assert.equal(result[0].cover, 'covers/local.jpg');
  assert.equal(result[0].review, 'Previous review');
  assert.equal(statusLabel(result[0]), '读过');
  assert.equal(statusLabel(local[0]), '在读');
  assert.equal(itemDate(local[0]), '2022-01-01');
  assert.equal(mergeItems(result, fresh).length, 1);
  assert.equal(mergeItems(local, fresh).length, 2, 'Never collapse unverified same-title editions');
  assert.equal(mergeItems(local, []).length, 1);
  const options = { type: 'reviews', query: 'original', year: '2022', rating: '', sort: 'newest', status: 'doing' };
  assert.equal(selectItems(local, options).length, 1);
  assert.equal(selectItems(local, { ...options, status: 'done' }).length, 0);
  assert.throws(() => normalizeCollection([{ ...local[0], status: 'invalid' }]), /status/);
  assert.throws(() => normalizeCollection([{ ...local[0], recordedAt: '2022-02-30' }]), /recordedAt/);
  assert.throws(() => normalizeCollection([{ ...local[0], notes: 'x'.repeat(100001) }]), /笔记/);
  assert.throws(() => normalizeCollection([{ ...local[0], url: 'https://movie.douban.com/subject/123/' }]), /type/);
  assert.equal(statusLabel(normalizeCollection([{ type: 'course', title: 'Class', status: 'wish' }]).items[0]), '待学');
});

test('text search combines title, tags, creators, actors and notes without changing data', () => {
  const { items } = normalizeCollection([
    { type: 'movie', title: '星际穿越', subtitle: 'Interstellar', creator: '克里斯托弗·诺兰', year: '2014', actors: ['马修·麦康纳'], tags: ['科幻', '亲情'], review: '宇宙与爱', status: 'done', rating: 5 },
    { type: 'book', title: '三体', creator: '刘慈欣', tags: ['科幻'], notes: '黑暗森林', status: 'doing', rating: 4 },
  ]);
  const before = JSON.stringify(items);
  const options = { type: 'all', query: '', year: '', rating: '', sort: 'newest' };
  const titles = (query: string) => selectItems(items, { ...options, query }).map(item => item.title);
  assert.equal(titles('科幻').length, 2);
  for (const query of [' 星际穿越 ', '科幻 诺兰', 'INTERSTELLAR 2014', 'ｉｎｔｅｒｓｔｅｌｌａｒ', '马修 亲情', '宇宙']) {
    assert.deepEqual(titles(query), ['星际穿越']);
  }
  for (const query of ['三体', '刘慈欣 科幻', '黑暗森林']) assert.deepEqual(titles(query), ['三体']);
  assert.equal(titles('科幻 不存在').length, 0);
  assert.equal(titles('  \t  ').length, 2);
  assert.equal(selectItems(items, { ...options, type: 'book', query: '科幻', status: 'doing', rating: '4' }).length, 1);
  assert.equal(selectItems(items, { ...options, type: 'book', query: '诺兰' }).length, 0);
  assert.equal(selectItems(items, { ...options, tag: '科幻' }).length, 2);
  assert.deepEqual(selectItems(items, { ...options, tag: '亲情', query: '诺兰' }).map(item => item.title), ['星际穿越']);
  assert.equal(selectItems(items, { ...options, tag: '亲情', type: 'book' }).length, 0);
  assert.equal(selectItems(items, { ...options, tag: '科' }).length, 0, 'Tag filtering is exact, unlike free-text search');
  assert.equal(selectItems(items, { ...options, tag: '科幻', query: '黑暗森林' }).length, 1);
  assert.equal(JSON.stringify(items), before);
});

test('chronological views use historical dates rather than Douban backfill dates, with unknown dates last', () => {
  const { items } = normalizeCollection([
    { type: 'movie', title: 'Old memory', recordedAt: '2022-02-07', date: '2026-10-03', rating: 5 },
    { type: 'movie', title: 'Unknown historical date', recordedAt: '', date: '2026-10-03', rating: 5 },
    { type: 'movie', title: 'Recent watch', date: '2026-07-25', rating: 5 },
    { type: 'book', title: 'Reading note', recordedAt: '2025-07-04', rating: 5 },
    { type: 'movie', title: 'No date', rating: 5 },
  ]);
  const before = JSON.stringify(items);
  const options = { type: 'all', query: '', year: '', rating: '', sort: 'newest' };
  const newest = ['Recent watch', 'Reading note', 'Old memory', 'Unknown historical date', 'No date'];
  assert.deepEqual(selectItems(items, options).map(item => item.title), newest);
  assert.deepEqual(selectItems(items, { ...options, sort: 'rating' }).map(item => item.title), newest);
  assert.deepEqual(selectItems(items, { ...options, sort: 'oldest' }).map(item => item.title),
    ['Old memory', 'Reading note', 'Recent watch', 'Unknown historical date', 'No date']);
  assert.deepEqual(selectItems(items, { ...options, year: '2022' }).map(item => item.title), ['Old memory']);
  assert.deepEqual(selectItems(items, { ...options, year: '2026' }).map(item => item.title), ['Recent watch']);
  assert.equal(itemDate(items[1]), '');
  assert.equal(JSON.stringify(items), before);
});
