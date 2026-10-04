import { defaultProfile, normalizeCollection } from './data';

// Illustrative entries, reviews and cover designs, never presented as the owner's data.
export const demoCollection = normalizeCollection({
  profile: defaultProfile,
  items: [
    { id: 'demo-perfect-days', type: 'movie', title: '完美的日子', subtitle: 'PERFECT DAYS', creator: '维姆·文德斯', year: '2023', date: '2026-09-28', rating: 5, tags: ['日常', '治愈'], review: '树影落在书页上，音乐从磁带里流出来。\n\n所谓完美，并不是生活没有缺口，而是依然愿意认真地，过好一个普通的日子。那些重复的、微小的瞬间，也值得被郑重收藏。', url: 'https://movie.douban.com/subject/35712804/' },
    { id: 'demo-living', type: 'book', title: '活着', subtitle: 'TO LIVE', creator: '余华', year: '1993', date: '2026-09-21', rating: 5, tags: ['中国文学', '人生'], review: '合上书以后，安静了很久。命运拿走了那么多，生活却还在继续。\n\n不是为了活着之外的任何事物，而是为了活着本身。', url: 'https://book.douban.com/subject/4913064/' },
    { id: 'demo-budapest', type: 'movie', title: '布达佩斯大饭店', subtitle: 'THE GRAND BUDAPEST HOTEL', creator: '韦斯·安德森', year: '2014', date: '2026-09-16', rating: 5, tags: ['美学', '喜剧'], review: '粉色糖衣之下，是一个正在消失的世界。喜欢那份对秩序、礼仪和美近乎固执的坚持。', url: 'https://movie.douban.com/subject/11525673/' },
    { id: 'demo-moon', type: 'book', title: '月亮与六便士', subtitle: 'THE MOON AND SIXPENCE', creator: '威廉·萨默塞特·毛姆', year: '1919', date: '2026-09-10', rating: 4, tags: ['外国文学', '理想'], review: '低头是生活，抬头是月亮。比起寻找一个标准答案，更想记得自己曾为什么心动。', url: 'https://book.douban.com/subject/1858513/' },
    { id: 'demo-interstellar', type: 'movie', title: '星际穿越', subtitle: 'INTERSTELLAR', creator: '克里斯托弗·诺兰', year: '2014', date: '2026-08-25', rating: 5, tags: ['科幻', '宇宙'], review: '最遥远的旅途，最后指向了回家。宇宙的尺度，让一声普通的告别都变得漫长。', url: 'https://movie.douban.com/subject/1889243/' },
    { id: 'demo-1984', type: 'book', title: '一九八四', subtitle: 'NINETEEN EIGHTY-FOUR', creator: '乔治·奥威尔', year: '1949', date: '2026-08-12', rating: 5, tags: ['反乌托邦', '经典'], review: '语言、记忆和独立思考，都不是理所当然的东西。', url: 'https://book.douban.com/subject/4820710/' },
    { id: 'demo-love', type: 'movie', title: '花样年华', subtitle: 'IN THE MOOD FOR LOVE', creator: '王家卫', year: '2000', date: '2025-12-28', rating: 5, tags: ['华语', '爱情'], review: '有些话没有说出口，却在走廊、雨声和一碗面之间，被记住了很多年。', url: 'https://movie.douban.com/subject/1291557/' },
    { id: 'demo-mountain', type: 'book', title: '山茶文具店', subtitle: 'THE TSUBAKI STATIONERY SHOP', creator: '小川糸', year: '2016', date: '2025-11-16', rating: 4, tags: ['日本文学', '治愈'], review: '把想说的话好好写下来，本身就是一种温柔。', url: 'https://book.douban.com/subject/26986954/' },
  ],
});
