// index.html をコマ送りで書き出し、audio.py の音と合わせて mp4 にする。
// 使い方: node video/hypermotion/render.js  （リポジトリのどこからでも）
// 必要: Playwright（chromium）, ffmpeg, python3 + numpy
const { chromium } = require("playwright");
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "hypermotion.mp4");
const WAV = path.join(HERE, "beat.wav");
const ONLY = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : null; // 確認用：指定コマだけPNGに

const TYPES = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  page.on("pageerror", e => console.error("pageerror", e));
  await page.goto(`http://127.0.0.1:${port}/video/hypermotion/index.html`);
  await page.evaluate(() => window.ready);
  const meta = await page.evaluate(() => window.META);
  const total = Math.round(meta.FPS * meta.DURATION);

  const grab = async i => {
    const url = await page.evaluate(i => { window.renderFrame(i); return document.getElementById("c").toDataURL("image/png"); }, i);
    return Buffer.from(url.split(",")[1], "base64");
  };

  if (ONLY) {
    for (const i of ONLY) fs.writeFileSync(path.join(process.env.OUTDIR || HERE, `frame-${String(i).padStart(3, "0")}.png`), await grab(i));
    await browser.close(); server.close(); return;
  }

  const py = spawnSync("python3", [path.join(HERE, "audio.py"), WAV], { stdio: "inherit" });
  if (py.status !== 0) throw new Error("audio.py failed");

  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(meta.FPS), "-c:v", "png", "-i", "-",
    "-i", WAV,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-shortest", OUT,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))));

  for (let i = 0; i < total; i++) {
    const png = await grab(i);
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 30 === 0) process.stdout.write(`frame ${i}/${total}\n`);
  }
  ff.stdin.end();
  await done;
  await browser.close(); server.close();
  fs.unlinkSync(WAV);
  console.log("wrote", OUT);
})().catch(e => { console.error(e); process.exit(1); });
