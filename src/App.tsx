import { useDeferredValue, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { itemDate, statusLabel, typeLabel, mergeItems, normalizeCollection, parseDoubanHtml, selectItems } from './data';
import type { Collection, Item } from './data';
import { demoCollection } from './demo';

const isDev = import.meta.env.DEV;

function Icon({ name, size = 18 }: { name: 'arrow' | 'search' | 'grid' | 'list' | 'table' | 'upload' | 'close' | 'film' | 'book'; size?: number }) {
  const paths = {
    arrow: 'M5 12h14m-6-6 6 6-6 6', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
    table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
    close: 'm6 6 12 12M6 18 18 6', film: 'M3 3h18v18H3zM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4',
    book: 'M12 5c-3-2-6-2-10-1v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1zm0 0v16',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function Stars({ rating }: { rating: number }) {
  return <span className="stars" aria-label={rating ? `我的评分 ${rating} 星，满分 5 星` : '未评分'}>
    {[1, 2, 3, 4, 5].map(value => <span key={value} className={value <= rating ? 'filled' : ''} aria-hidden="true">★</span>)}
    <span className="rating-number">{rating ? `${rating}.0` : '未评'}</span>
  </span>;
}

const artworks = ['forest', 'living', 'hotel', 'moon', 'space', 'eye', 'love', 'botanical'];
const demoTitles = ['完美的日子', '活着', '布达佩斯大饭店', '月亮与六便士', '星际穿越', '一九八四', '花样年华', '山茶文具店'];

function Cover({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.cover]);
  const index = demoTitles.indexOf(item.title);
  const art = artworks[index < 0 ? [...item.title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % artworks.length : index];
  return <div className="cover" data-art={art} aria-hidden="true">
    <div className="cover-art"><i /><i /><i /><i /><i /></div>
    <div className="cover-type">{item.type === 'movie' ? 'A FILM TO REMEMBER' : item.type === 'book' ? 'A BOOK TO KEEP' : 'SOMETHING TO LEARN'}</div>
    <div className="cover-title">{item.title}<span>{item.subtitle}</span></div>
    <div className="cover-creator">{item.creator.split('/')[0]}<span>{item.year || 'COLLECTED'}</span></div>
    {item.cover && !failed && <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </div>;
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} onCancel={close} onClose={event => { if (!event.currentTarget.open) close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-labelledby="modal-title">
    <div className="modal-body">
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label="关闭弹窗" autoFocus><Icon name="close" /></button></div>
      {children}
    </div>
  </dialog>;
}

function ImportPanel({ current, isDemo, commit }: { current: Collection; isDemo: boolean; commit: (data: Collection) => Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [draft, setDraft] = useState<Collection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('merge');

  function parse(content: string, filename = ''): Collection {
    if (/\.html?$/i.test(filename) || content.trimStart().startsWith('<')) {
      return { version: 1, profile: current.profile, items: parseDoubanHtml(content) };
    }
    const value: unknown = JSON.parse(content.replace(/^\uFEFF/, ''));
    const parsed = normalizeCollection(value);
    if (Array.isArray(value) || !(value as Record<string, unknown>).profile) parsed.profile = current.profile;
    return parsed;
  }

  async function loadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(''); setDraft(null);
    try {
      if ([...files].reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) throw new Error('单次导入总大小不能超过 20 MB。');
      let next: Collection = { version: 1, profile: current.profile, items: [] };
      for (const file of [...files]) {
        const parsed = parse(await file.text(), file.name);
        next = { ...parsed, items: mergeItems(next.items, parsed.items) };
      }
      setDraft(normalizeCollection(next));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败，请检查文件格式。'); }
    finally { setBusy(false); }
  }

  return <div className="import-panel">
    <p className="muted">让豆瓣里的回忆，住进你的画廊。</p>
    <div className="import-notice"><strong>仅开发模式 · 直接更新项目数据</strong><p>在浏览器登录豆瓣后，告诉 Codex 开始同步。Codex 读取你可访问的收藏和评论，通过本机 <code>GET / PUT /api/collection</code> 写入 <code>public/collection.json</code>，不读取或保存密码、Cookie。</p><a className="text-button" href="https://www.douban.com/" target="_blank" rel="noopener noreferrer">打开豆瓣登录 <Icon name="arrow" size={15} /></a><p>也可在下方手动导入文件。确认后会备份旧数据并写入项目；线上站点没有导入入口或更新接口。</p></div>
    <label className="file-picker"><Icon name="upload" size={25} /><strong>{busy ? '正在读取…' : '选择 JSON / HTML 文件'}</strong><span>支持多选豆瓣「看过 / 读过」页面 · 总大小 ≤ 20 MB</span><input type="file" accept=".json,.html,.htm" multiple disabled={busy} onChange={event => { void loadFiles(event.target.files); event.target.value = ''; }} /></label>
    <details><summary>也可以粘贴 JSON</summary><textarea aria-label="JSON 数据" rows={6} value={raw} placeholder={'[{"type":"movie","title":"电影名","rating":5,"date":"2026-10-03","review":"我的感想"}]'} onChange={event => { setRaw(event.target.value); setDraft(null); setError(''); }} /><button className="button secondary" disabled={!raw.trim() || busy} onClick={() => { try { if (raw.length > 20 * 1024 * 1024) throw new Error('文本过大。'); setDraft(parse(raw)); setError(''); } catch (cause) { setDraft(null); setError(cause instanceof Error ? cause.message : 'JSON 格式错误'); } }}>检查数据</button></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    {draft && <div className="import-preview"><strong>已识别 {draft.items.length} 条记录</strong><span>{draft.items.filter(item => item.type === 'movie').length} 条影视 · {draft.items.filter(item => item.type === 'book').length} 本书 · {draft.items.filter(item => item.type === 'course').length} 门课程</span>
      <label>导入方式<select value={mode} onChange={event => setMode(event.target.value)}><option value="merge">合并到记忆（保留笔记与本地封面）</option><option value="replace">替换全部记忆</option></select></label>
      <p className="muted">{isDemo ? '示例内容会自动移除，不会混入你的记忆。' : mode === 'replace' ? '将替换当前全部记忆，旧版本会自动备份。' : '保留其他记忆和笔记；非空新评论更新豆瓣评论，空评论不清空旧文。标题相同不会自动合并。'}</p>
      <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await commit(normalizeCollection({ ...draft, items: mode === 'replace' || isDemo ? draft.items : mergeItems(current.items, draft.items) })); } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); } finally { setBusy(false); } }}>{busy ? '正在保存…' : '确认导入并写入项目'} <Icon name="arrow" /></button>
    </div>}
    <details className="help"><summary>如何拿到豆瓣数据？</summary><p>在浏览器打开自己的豆瓣「看过」或「读过」列表，保存为 HTML 网页，再导入这里。每页分别保存后可多选导入；只转换文件里已有的条目，不会自动翻页。长篇影评 / 书评请放入 JSON 的 <code>review</code> 字段。封面链接失效时会显示排版封面。</p></details>
  </div>;
}

export function App() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [source, setSource] = useState<'demo' | 'published'>('published');
  const [revision, setRevision] = useState('');
  const [notice, setNotice] = useState('');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [year, setYear] = useState('');
  const [rating, setRating] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState<'grid' | 'table'>('grid');
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState<'import' | 'about' | Item | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    fetch(isDev ? '/api/collection' : './collection.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('collection.json 加载失败'); return response.json(); })
      .then(value => {
        const data = normalizeCollection(isDev ? value.collection : value);
        if (isDev) setRevision(value.revision);
        setCollection(isDev && !data.items.length ? demoCollection : data);
        setSource(isDev && !data.items.length ? 'demo' : 'published');
      })
      .catch(error => { if (error.name !== 'AbortError') { setCollection(normalizeCollection([])); setNotice('记忆暂时未能打开，请稍后刷新重试。'); } });
    return () => controller.abort();
  }, []);

  useEffect(() => setPage(1), [type, deferredQuery, year, rating, status, tag, sort, collection]);

  if (!collection) return <main className="loading"><span className="brand-mark">片</span><p>正在翻开记忆…</p></main>;

  const items = collection.items;
  const movies = items.filter(item => item.type === 'movie').length;
  const books = items.filter(item => item.type === 'book').length;
  const courses = items.filter(item => item.type === 'course').length;
  const reviews = items.filter(item => item.review || item.notes).length;
  const years = [...new Set(items.map(item => itemDate(item).slice(0, 4)).filter(Boolean))].sort().reverse();
  const tags = [...new Set(items.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const selected = selectItems(items, { type, query: deferredQuery, year, rating, status, tag, sort });
  const isDemo = source === 'demo';
  const categories = [
    { value: 'all', label: '我的记忆', count: items.length },
    { value: 'movie', label: '影视', count: movies },
    { value: 'book', label: '书籍', count: books },
    ...(courses ? [{ value: 'course', label: '课程', count: courses }] : []),
    { value: 'reviews', label: '只言片语', count: reviews },
  ];
  const categoryTitle = categories.find(category => category.value === type)?.label || '我的记忆';
  const hasFilters = Boolean(type !== 'all' || query || tag || year || rating || status);
  const clearFilters = () => { setType('all'); setQuery(''); setYear(''); setRating(''); setStatus(''); setTag(''); setSort('newest'); };

  async function commit(data: Collection) {
    if (!isDev) throw new Error('仅开发模式支持更新。');
    const response = await fetch('/api/collection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Gallery-Update': '1', 'If-Match': revision },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '更新失败，请刷新后重试。');
    setCollection(normalizeCollection(result.collection)); setRevision(result.revision);
    setNotice(`已保存 ${result.collection.items.length} 段记忆，旧版本已备份。`);
    setSource('published'); setModal(null); clearFilters();
  }

  return <>
    <a className="skip-link" href="#collection">跳到记忆</a>
    <header className="site-header"><div className="header-inner">
      <a href="#" className="brand" onClick={clearFilters}><span className="brand-mark">片</span><span>片刻 <small>A BOOK OF MEMORIES</small></span></a>
      {isDev && <button className="button header-import" onClick={() => setModal('import')}><Icon name="upload" /><span>导入记忆</span></button>}
    </div></header>

    <div className="workspace">
      <aside className={`sidebar${navOpen ? ' is-open' : ''}`}>
        <button className="sidebar-toggle" aria-expanded={navOpen} aria-controls="memory-navigation" onClick={() => setNavOpen(open => !open)}><Icon name="list" /><span>{categoryTitle}</span><span>{navOpen ? '收起' : '分类'}</span></button>
        <nav className="memory-nav" id="memory-navigation" aria-label="记忆导航">
          <span className="eyebrow">记忆索引</span>
          {categories.map(category => <button key={category.value} aria-pressed={type === category.value} className={type === category.value ? 'active' : ''} onClick={() => { setType(category.value); setNavOpen(false); }}><span>{category.label}</span><span className="nav-count">{category.count}</span></button>)}
          <button className="about-link" onClick={() => { setModal('about'); setNavOpen(false); }}>关于这里<Icon name="arrow" size={14} /></button>
        </nav>
      </aside>
      <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <h1 id="page-title">keep reading !</h1>
        <p>开卷有益，视野决定一个人的高度。</p>
      </section>

      {notice && <div className="notice" role="status">{notice}<button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" size={15} /></button></div>}

      <section id="collection" aria-labelledby="collection-title">
        <div className="collection-heading"><h2 id="collection-title">{categoryTitle}<span>{selected.length} 段记忆{isDemo ? ' · 示例' : ''}</span></h2></div>
        <div className="toolbar">
          <form className="search" role="search" onSubmit={event => { event.preventDefault(); setPage(1); }}>
            <Icon name="search" size={17} />
            <input type="search" placeholder="输入片名、书名、标签或作者" aria-label="搜索记忆" title="输入即查；多个关键词用空格分隔" value={query} onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" className="icon-button" aria-label="清空关键词" onClick={() => setQuery('')}><Icon name="close" size={14} /></button>}
            <button type="submit" className="search-submit">查找</button>
          </form>
          <div className="view-switch" role="group" aria-label="展示方式"><button aria-label="卡片视图" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Icon name="grid" size={16} /><span>卡片</span></button><button aria-label="表格视图" aria-pressed={layout === 'table'} onClick={() => setLayout('table')}><Icon name="table" size={16} /><span>表格</span></button></div>
        </div>
        <div className="filter-row"><div className="filters"><select aria-label="标签筛选" value={tag} onChange={event => setTag(event.target.value)}><option value="">全部标签</option>{tags.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="记录状态" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option><option value="done">已看 / 已读 / 已学</option><option value="doing">进行中</option><option value="wish">计划中</option><option value="paused">搁置</option><option value="unknown">待确认</option></select><select aria-label="记录年份" value={year} onChange={event => setYear(event.target.value)}><option value="">全部年份</option>{years.map(value => <option key={value} value={value}>{value} 年</option>)}</select><select aria-label="最低评分" value={rating} onChange={event => setRating(event.target.value)}><option value="">全部评分</option><option value="5">五星记忆</option><option value="4">四星及以上</option><option value="3">三星及以上</option></select></div><div className="display-options"><select aria-label="排序方式" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">{type === 'movie' ? '观看时间' : type === 'book' ? '阅读时间' : '记忆时间'}：近到远</option><option value="oldest">{type === 'movie' ? '观看时间' : type === 'book' ? '阅读时间' : '记忆时间'}：远到近</option><option value="rating">评分最高</option><option value="title">标题排序</option></select></div></div>
        <div className="search-feedback"><span role="status" aria-live="polite">{query.trim() ? `“${query.trim()}” · ` : ''}{tag ? `标签：${tag} · ` : ''}{type === 'all' ? '全部记忆' : categoryTitle}中找到 {selected.length} 条{(year || rating || status) ? '（已应用筛选）' : ''}</span>{hasFilters && <button className="text-button" onClick={clearFilters}>重置查找</button>}</div>

        {layout === 'table' && selected.length > 0 ? <div className="table-scroll" role="region" aria-label="记忆表格，可横向滚动" tabIndex={0}>
          <table className="memory-table">
            <caption className="sr-only">{categoryTitle}，共 {selected.length} 段记忆，每行一条，点击名称查看详情</caption>
            <thead><tr><th scope="col">#</th><th scope="col">名称 / 作者</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col">评分</th><th scope="col">标签</th><th scope="col">评论 / 笔记</th><th scope="col">记录日期</th></tr></thead>
            <tbody>{selected.map((item, index) => <tr key={`${item.type}:${item.id}`}>
              <td className="row-number">{index + 1}</td>
              <th scope="row" className="table-title"><button onClick={() => setModal(item)} aria-label={`查看${item.title}详情`}>{item.title}<small>{[item.creator || (item.actors?.length ? item.actors.join(' / ') : ''), item.year].filter(Boolean).join(' · ') || '作者 / 导演未记录'}</small></button></th>
              <td>{typeLabel(item)}</td>
              <td><span className="table-status">{statusLabel(item)}</span></td>
              <td><Stars rating={item.rating} /></td>
              <td className="table-tags"><span title={item.tags.join(' / ')}>{item.tags.join(' / ') || '未分类'}</span></td>
              <td className="table-note"><span title={(item.review || item.notes || '').slice(0, 160)}>{(item.review || item.notes || '').slice(0, 160) || '暂无文字'}</span></td>
              <td className="table-date"><time dateTime={itemDate(item) || undefined}>{item.recordedAt ? '笔记 ' : ''}{itemDate(item) || '日期未记录'}</time></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="gallery">{selected.slice(0, page * 24).map((item, index) => <article key={`${item.type}:${item.id}`} className="card" style={{ '--delay': `${Math.min(index, 7) * 45}ms` } as CSSProperties}><button className="card-open" onClick={() => setModal(item)} aria-label={`查看${item.title}详情`}><div className="cover-wrap"><Cover item={item} /><span className="type-label"><Icon name={item.type === 'movie' ? 'film' : 'book'} size={12} />{statusLabel(item)}</span><span className="cover-open"><Icon name="arrow" /></span></div><div className="card-content"><div className="card-meta">{typeLabel(item)}<span>{item.year || '记忆片段'}</span></div><h3>{item.title}</h3><p className="creator">{item.creator || (item.actors?.length ? `主演：${item.actors.join(' / ')}` : '作者 / 导演未记录')}</p><Stars rating={item.rating} /><p className="card-review">{(item.review || item.notes || '记忆留在这里，感想慢慢写。').slice(0, 160)}</p><div className="card-bottom"><span>{item.tags.slice(0, 2).join(' / ') || '未分类'}</span><time dateTime={itemDate(item) || undefined}>{item.recordedAt ? '笔记 ' : ''}{itemDate(item) ? itemDate(item).replaceAll('-', '.') : '日期未记录'}</time></div></div></button></article>)}</div>}
        {!selected.length && <div className="empty-state"><Icon name="book" size={36} /><h3>{items.length ? '还没有找到这个故事' : '第一段记忆，虚位以待。'}</h3><p>{items.length ? '换个关键词，或放宽一点筛选条件。' : isDev ? '导入一部电影或一本书，开始记录。' : '这里的记忆还未写下。'}</p>{(items.length > 0 || isDev) && <button className="button secondary" onClick={items.length ? clearFilters : () => setModal('import')}>{items.length ? '清除筛选' : '导入记忆'}</button>}</div>}
        {layout === 'grid' && selected.length > page * 24 && <button className="button load-more" onClick={() => setPage(value => value + 1)}>再翻一页 · 还有 {selected.length - page * 24} 段记忆<Icon name="arrow" /></button>}
        {selected.length > 0 && (layout === 'table' || selected.length <= page * 24) && <div className="end-note"><span />暂时翻到这里，故事还在继续。<span /></div>}
      </section>
      <footer><span className="footer-brand">片刻 <span>读过，看过，记得。</span></span><button className="text-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>回到顶部 ↑</button></footer>
      </main>
    </div>

    {modal && (modal !== 'import' || isDev) && <Modal title={modal === 'import' ? '导入我的记忆' : modal === 'about' ? '关于片刻' : modal.title} close={() => setModal(null)}>
      {modal === 'import' ? (isDev && <ImportPanel current={collection} isDemo={isDemo} commit={commit} />) : modal === 'about' ? <div className="about-content"><p className="about-quote">keep reading !<br />开卷有益，视野决定一个人的高度。</p><p>读过的书，看过的电影，都是记忆。</p></div> : <div className="detail-layout"><Cover item={modal} /><div className="detail-content"><div className="eyebrow">{typeLabel(modal)} / {statusLabel(modal)}{isDemo ? ' · 示例' : ''}</div><p className="detail-subtitle">{modal.subtitle}</p><p>{modal.creator}{modal.year && ` · ${modal.year}`}</p>{modal.actors?.length ? <p>主演：{modal.actors.join(' / ')}</p> : null}<Stars rating={modal.rating} /><div className="detail-tags">{modal.tags.map(tag => <span key={tag}>{tag}</span>)}</div><h3>评论</h3><div className="review-text">{modal.review || '暂未记录豆瓣评论。'}</div>{modal.notes && <><h3 className="notes-heading">笔记</h3><div className="review-text">{modal.notes}</div></>}<p className="muted">{modal.date ? `豆瓣标记于 ${modal.date}` : '标记日期未记录'}{modal.recordedAt && ` · 笔记写于 ${modal.recordedAt}`}</p>{modal.url && <a className="button secondary" href={modal.url} target="_blank" rel="noopener noreferrer">查看原始条目<Icon name="arrow" /></a>}</div></div>}
    </Modal>}
  </>;
}
