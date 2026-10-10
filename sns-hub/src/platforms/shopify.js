import { call } from './http.js';

const VERSION = '2026-10';

const shopHost = (c) => c.shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const blogGid = (c) => (/^\d+$/.test(c.blog_id) ? `gid://shopify/Blog/${c.blog_id}` : c.blog_id);

async function gql(c, query, variables) {
  const r = await call(`https://${shopHost(c)}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': c.access_token },
    body: JSON.stringify({ query, variables }),
  });
  if (r.errors?.length) throw new Error(r.errors.map((e) => e.message).join(' / '));
  return r.data;
}

const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// 本文をHTMLにする：空行で段落、「## 」で見出し、URLはリンク
export function textToHtml(text) {
  const para = (block) => `<p>${esc(block).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>')}</p>`;
  return text.trim().split(/\n{2,}/).map((block) => {
    const [first, ...rest] = block.split('\n');
    const h = first.match(/^#{2,3}\s+(.+)$/);
    if (!h) return para(block);
    return `<h2>${esc(h[1])}</h2>` + (rest.length ? '\n' + para(rest.join('\n')) : '');
  }).join('\n');
}

const CREATE = `mutation ArticleCreate($article: ArticleCreateInput!) {
  articleCreate(article: $article) { article { id handle isPublished blog { handle } } userErrors { field message } }
}`;
const CHECK = `query Check($id: ID!) { shop { name primaryDomain { url } } blog(id: $id) { title handle } }`;

export default {
  id: 'shopify_blog',
  label: 'Shopifyブログ',
  color: '#5e8e3e',
  limits: { text: 100000, title: 255, images: 10, imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], publicMedia: true },
  note: '1枚目の画像がアイキャッチになります。本文の「## 」は見出しになります',
  aiGuide: 'Shopifyのブログ記事（SEO重視の読み物）。titleは検索されやすい30字前後。textは導入→「## 見出し」で2〜4章→まとめ→商品やお店への案内。1500〜2500字。空行で段落を分ける。',
  fields: [
    { key: 'shop', label: 'ストアのドメイン', placeholder: 'yusando.myshopify.com' },
    { key: 'access_token', label: 'Admin API アクセストークン', secret: true, help: 'Shopify管理画面 → 設定 → アプリと販売チャネル → アプリを開発 で、write_content 権限のアプリを作って発行' },
    { key: 'blog_id', label: 'ブログID', placeholder: '123456789', help: '管理画面でブログを開いたときのURL末尾の数字' },
    { key: 'author', label: '著者名', optional: true, placeholder: '悠三堂' },
    { key: 'publish', label: '投稿したとき', options: [['yes', 'すぐ公開する'], ['no', '非公開で保存（あとで管理画面から公開）']], default: 'yes' },
  ],
  async verify(c) {
    const d = await gql(c, CHECK, { id: blogGid(c) });
    if (!d.blog) throw new Error('ブログが見つかりません。ブログIDを確かめてください');
    return { name: `${d.shop.name}／${d.blog.title}` };
  },
  async publish({ text, title, media }, c, ctx) {
    const [cover, ...rest] = media.filter((m) => m.type.startsWith('image/'));
    const extra = rest.map((m) => `<p><img src="${ctx.mediaUrl(m)}" alt="${esc(m.alt || '')}"></p>`).join('\n');
    const article = {
      blogId: blogGid(c),
      title: title || text.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 255) || '無題',
      body: textToHtml(text) + (extra ? '\n' + extra : ''),
      author: { name: c.author || '悠三堂' },
      isPublished: c.publish !== 'no',
    };
    if (cover) article.image = { url: ctx.mediaUrl(cover), altText: cover.alt || '' };
    const d = await gql(c, CREATE, { article });
    const errs = d.articleCreate.userErrors;
    if (errs.length) throw new Error(errs.map((e) => e.message).join(' / '));
    const a = d.articleCreate.article;
    let url = `https://${shopHost(c)}/admin/articles/${a.id.split('/').pop()}`;
    if (a.isPublished) {
      const info = await gql(c, CHECK, { id: blogGid(c) }).catch(() => null);
      if (info) url = `${info.shop.primaryDomain.url}/blogs/${a.blog.handle}/${a.handle}`;
    }
    return { id: a.id, url };
  },
};
