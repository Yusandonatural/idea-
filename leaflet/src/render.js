// HTML → 入稿用PDF（塗り足し3mmつき）と確認用PNG。 node render.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const JOBS = [
  ['trifold', '三つ折りA4', 303, 216],
  ['flyer', 'チラシA4', 216, 303],
  ['card', 'はがきカード', 106, 154],
];
const LANGS = [['ja', '日本語'], ['en', '英語']];

(async () => {
  const out = path.join(__dirname, '..', 'out');
  fs.mkdirSync(path.join(out, 'preview'), { recursive: true });
  const browser = await chromium.launch();
  for (const [key, label, w, h] of JOBS) {
    for (const [lang, ll] of LANGS) {
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      await page.goto('file://' + path.join(__dirname, `${key}_${lang}.html`));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.pdf({ path: path.join(out, `悠三堂_${label}_${ll}_入稿_塗り足し3mm.pdf`), width: `${w}mm`, height: `${h}mm`, printBackground: true });
      const sheets = await page.$$('.sheet');
      for (let i = 0; i < sheets.length; i++) {
        await sheets[i].screenshot({ path: path.join(out, 'preview', `${key}_${lang}_${i + 1}.png`) });
      }
      // はみ出しの検査
      const over = await page.evaluate(() => {
        const r = [];
        document.querySelectorAll('.pn,.backp,.g2>div').forEach(el => {
          const b = el.getBoundingClientRect();
          const last = el.lastElementChild && el.lastElementChild.getBoundingClientRect();
          if (el.scrollHeight > el.clientHeight + 1) r.push(el.className + ' overflow ' + (el.scrollHeight - el.clientHeight));
        });
        return r;
      });
      if (over.length) console.log(key, lang, over);
      await page.close();
    }
  }
  await browser.close();
  console.log('done');
})();
