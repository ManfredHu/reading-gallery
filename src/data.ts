export type Item = {
  id: string;
  type: 'movie' | 'book' | 'course';
  title: string;
  subtitle: string;
  creator: string;
  year: string;
  date: string;
  rating: number;
  tags: string[];
  review: string;
  cover: string;
  url: string;
  status?: 'done' | 'doing' | 'wish' | 'paused' | 'unknown';
  recordedAt?: string;
  notes?: string;
  archiveId?: string;
  actors?: string[];
};

export type Collection = {
  version: 1;
  profile: { name: string; bio: string };
  items: Item[];
};

export const defaultProfile = { name: '我的', bio: '在别人的故事里，收集自己的生活。' };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
// Migrated records keep their historical date, even when unknown; date may be a later Douban backfill.
export const itemDate = (item: Item) => item.recordedAt ?? item.date ?? '';
export const typeLabel = (item: Item) => ({ movie: '影视', book: '书籍', course: '课程' })[item.type];
export function statusLabel(item: Item): string {
  const status = item.status || 'done';
  if (status === 'done') return item.type === 'book' ? '读过' : item.type === 'course' ? '已学' : '看过';
  if (status === 'doing') return item.type === 'book' ? '在读' : item.type === 'course' ? '在学' : '在看';
  if (status === 'wish') return item.type === 'book' ? '想读' : item.type === 'course' ? '待学' : '想看';
  return status === 'paused' ? '搁置' : '状态待确认';
}

function safeUrl(value: unknown, cover = false): string {
  const url = text(value);
  if (!url) return '';
  if (cover && /^(?:\.\/)?covers\/[\w./%-]+$/.test(url) && !url.includes('..')) return url;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch { return ''; }
}

export function normalizeCollection(input: unknown): Collection {
  if (!input || typeof input !== 'object') throw new Error('文件必须是 JSON 对象或条目数组。');
  const source = input as Record<string, unknown>;
  if (!Array.isArray(input) && source.version !== undefined && source.version !== 1) {
    throw new Error('不支持此数据版本，请使用 version: 1。');
  }
  const rows = Array.isArray(input) ? input : source.items;
  if (!Array.isArray(rows) || rows.length > 20000) throw new Error('items 必须是数组，最多支持 20,000 条。');
  const items = rows.map((row: unknown, index): Item => {
    if (!row || typeof row !== 'object') throw new Error(`第 ${index + 1} 条不是有效对象。`);
    const value = row as Record<string, unknown>;
    const title = text(value.title);
    const type = text(value.type);
    if (!title || title.length > 300 || !['movie', 'book', 'course'].includes(type)) {
      throw new Error(`第 ${index + 1} 条需要有效的 title 和 type（movie / book / course）。`);
    }
    const date = text(value.date);
    const recordedAt = text(value.recordedAt);
    for (const [key, day] of [['date', date], ['recordedAt', recordedAt]]) {
      if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) {
        throw new Error(`「${title}」的 ${key} 应为有效日期 YYYY-MM-DD。`);
      }
    }
    const status = text(value.status);
    if (value.status !== undefined && !['done', 'doing', 'wish', 'paused', 'unknown'].includes(status)) throw new Error(`「${title}」的 status 无效。`);
    const rating = value.rating === undefined || value.rating === '' ? 0
      : typeof value.rating === 'number' || typeof value.rating === 'string' ? Number(value.rating) : NaN;
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error(`「${title}」的 rating 应为 0–5 的整数，0 表示未评分。`);
    const review = text(value.review);
    if (review.length > 100000) throw new Error(`「${title}」的评论超过 100,000 字。`);
    const notes = text(value.notes);
    if (notes.length > 100000) throw new Error(`「${title}」的笔记超过 100,000 字。`);
    const url = safeUrl(value.url);
    const subject = url.match(/^https?:\/\/(movie|book)\.douban\.com\/subject\/(\d+)(?:\/|$|\?)/);
    if (subject && subject[1] !== type) throw new Error(`「${title}」的豆瓣链接与 type 不符。`);
    return {
      id: subject ? `${type}:${subject[2]}` : text(value.id) || `${type}:${title}:${text(value.year)}`,
      type: type as Item['type'], title,
      subtitle: text(value.subtitle), creator: text(value.creator), year: text(value.year),
      date, rating, review, url, cover: safeUrl(value.cover, true),
      tags: Array.isArray(value.tags) ? [...new Set(value.tags.map(text).filter(Boolean))].slice(0, 20) : [],
      ...(status ? { status: status as Item['status'] } : {}),
      ...(value.recordedAt !== undefined ? { recordedAt } : {}),
      ...(value.notes !== undefined ? { notes } : {}),
      ...(text(value.archiveId) ? { archiveId: text(value.archiveId) } : {}),
      ...(Array.isArray(value.actors) ? { actors: [...new Set(value.actors.map(text).filter(Boolean))].slice(0, 50) } : {}),
    };
  });
  const profile = source.profile && typeof source.profile === 'object' ? source.profile as Record<string, unknown> : {};
  return {
    version: 1,
    profile: { name: text(profile.name) || defaultProfile.name, bio: text(profile.bio) || defaultProfile.bio },
    items: mergeItems([], items),
  };
}

export function mergeItems(existing: Item[], incoming: Item[]): Item[] {
  const byId = new Map<string, Item>();
  const archiveIds = new Map<string, string>();
  for (const item of [...existing, ...incoming]) {
    const key = `${item.type}:${item.id}`;
    const archiveKey = item.archiveId ? `${item.type}:${item.archiveId}` : '';
    const previousKey = (archiveKey && archiveIds.get(archiveKey)) || key;
    if (previousKey !== key && byId.has(key)) throw new Error(`「${item.title}」的归档 ID 与豆瓣 ID 指向不同记录，请先处理冲突。`);
    const previous = byId.get(previousKey);
    const merged = previous ? {
      ...previous, ...item,
      review: item.review || previous.review,
      ...(previous.notes ? { notes: item.notes || previous.notes } : {}),
      ...(previous.recordedAt ? { recordedAt: item.recordedAt || previous.recordedAt } : {}),
      ...(previous.actors?.length ? { actors: item.actors?.length ? item.actors : previous.actors } : {}),
      creator: item.creator || previous.creator, year: item.year || previous.year,
      date: item.date || previous.date, url: item.url || previous.url,
      cover: previous.cover.startsWith('covers/') ? previous.cover : item.cover || previous.cover,
      tags: [...new Set([...previous.tags, ...item.tags])],
    } : item;
    if (previousKey !== key) byId.delete(previousKey);
    byId.set(key, merged);
    if (merged.archiveId) archiveIds.set(`${merged.type}:${merged.archiveId}`, key);
  }
  return [...byId.values()];
}

export function parseDoubanHtml(html: string): Item[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('.grid-view .item, .list-view .item')];
  const items = rows.flatMap(row => {
    const anchor = row.querySelector<HTMLAnchorElement>('.info .title a, .info h2 a');
    const url = anchor?.getAttribute('href') || '';
    const match = url.match(/^https?:\/\/(movie|book)\.douban\.com\/subject\/(\d+)/);
    if (!anchor || !match) return [];
    const title = (anchor.querySelector('em')?.textContent || anchor.textContent || '').trim();
    const rating = row.querySelector('[class*="rating"]')?.className.match(/rating([1-5])-t/)?.[1];
    const img = row.querySelector('img');
    return [{
      title, type: match[1], url, status: 'done',
      creator: row.querySelector('.intro')?.textContent?.trim() || '',
      date: row.querySelector('.date')?.textContent?.trim() || '',
      rating: Number(rating || 0),
      review: row.querySelector('.comment')?.textContent?.trim() || '',
      tags: (row.querySelector('.tags')?.textContent || '').replace(/^\s*标签[:：]\s*/, '').trim().split(/\s+/).filter(Boolean),
      cover: img?.getAttribute('data-original') || img?.getAttribute('src') || '',
    }];
  });
  if (!items.length) throw new Error('没有找到豆瓣收藏条目。请保存「看过 / 读过」列表页面的 HTML；不支持登录页、验证码页或长评详情页。');
  return normalizeCollection(items).items;
}

export function selectItems(items: Item[], options: { type: string; query: string; year: string; rating: string; sort: string; status?: string; tag?: string }): Item[] {
  const terms = options.query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item =>
    (options.type === 'all' || (options.type === 'reviews' ? Boolean(item.review || item.notes) : item.type === options.type)) &&
    (!options.tag || item.tags.includes(options.tag)) &&
    (!options.status || (item.status || 'done') === options.status) &&
    (!options.year || itemDate(item).startsWith(options.year)) &&
    (!options.rating || item.rating >= Number(options.rating)) &&
    terms.every(term => [item.title, item.subtitle, item.creator, item.year, item.review, item.notes, ...item.tags, ...(item.actors || [])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(term)),
  ).sort((a, b) => options.sort === 'rating' ? b.rating - a.rating || itemDate(b).localeCompare(itemDate(a))
    : options.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN')
    : options.sort === 'oldest' ? (itemDate(a) || '9999').localeCompare(itemDate(b) || '9999') : itemDate(b).localeCompare(itemDate(a)));
}
