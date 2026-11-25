"""悠三堂リーフレット（三つ折り・A4チラシ・はがきカード／日本語・英語）を HTML で書き出す。

  python3 build.py        … HTML と QR を作る
  node render.js          … PDF（塗り足し3mmつき）と確認用 PNG を ../out に書き出す

文章を直すときは、下の T（"ja" と "en"）だけを書き換える。
"""
from pathlib import Path
import segno

HERE = Path(__file__).parent
B = 3  # 塗り足し mm

T = {
"ja": dict(
    lang="ja",
    kicker="自然栽培　無農薬・無肥料",
    tag="自然と人間に、<br>やさしいお茶を。",
    tagSub="Tea that is kind to nature and to people",
    place="奈良・都祁（大和高原）",
    aboutH="悠三堂のこと", aboutE="ABOUT",
    aboutP=["2015年、奈良・都祁（大和高原）で、ゼロから茶畑を始めました。農薬も肥料も使わない自然栽培で、お茶を育てています。",
            "まわりで慣行農法をやめた茶畑を引き継ぎ、少しずつ自然栽培へ。11年あまりで、3.5ヘクタールの茶畑が自然栽培に変わりました。",
            "自然と人間に、やさしいお茶作りを心がけています。"],
    stats=[("2015", "年", "ゼロから茶畑を<br>始めました"), ("3.5", "ha", "自然栽培に<br>変わった茶畑"), ("12", "種類＋", "いま作っている<br>お茶")],
    natH="自然栽培とは", natE="NATURAL AGRICULTURE",
    natP="化学肥料はもちろん、有機肥料も含めて肥料を一切与えず、農薬も使いません。土と茶の木が本来もつ力だけで、時間をかけてゆっくり育てます。",
    cols=["慣行栽培", "有機栽培", "自然栽培"],
    rows=[("農薬", ["使用", "原則不使用<small>一部認可資材あり</small>", "不使用"]),
          ("化学肥料", ["使用", "不使用", "不使用"]),
          ("有機肥料", ["使用", "使用", "不使用"])],
    instead=[("肥料のかわりに", "茶の木が、自然の中から自分で栄養をつくります。"),
             ("農薬のかわりに", "茶の木そのものが強くなり、まわりの環境と調和して育ちます。")],
    teaH="悠三堂のお茶", teaE="OUR TEAS",
    teaLead="2015年は、抹茶・煎茶・ほうじ茶の3種類から。いまは12種類以上のお茶を作っています。",
    groups=[("定番のお茶", [("抹茶", "石臼挽き"), ("煎茶", ""), ("ほうじ茶", ""), ("玄米茶", "")]),
            ("新しいお茶", [("和紅茶", ""), ("白茶", ""), ("釜炒り茶", ""), ("烏龍茶", "")]),
            ("番茶", [("しろばんちゃ", ""), ("あかばんちゃ", ""), ("くろばんちゃ", ""), ("三年番茶", "")])],
    teaNote="和紅茶・白茶・釜炒り茶は、自然栽培だからこそおいしいと言われるお茶です。",
    teaFoot="季節限定のお茶もあります。種類と価格は、オンラインショップをご覧ください。",
    brewH="おいしい淹れ方", brewE="HOW TO BREW", brewSub="1〜2人分のめやす",
    brewCols=["お茶", "茶葉", "お湯", "時間"],
    brew=[("煎茶・釜炒り茶", "4g", "70〜80℃<small>120ml</small>", "1分"),
          ("ほうじ茶・玄米茶・番茶", "4g", "熱湯<small>200ml</small>", "30秒"),
          ("和紅茶・烏龍茶", "3g", "熱湯<small>200ml</small>", "2〜3分"),
          ("抹茶", "2g", "80℃<small>70ml</small>", "茶筅で点てる")],
    brewTip=("水出しもおすすめ", "茶葉10gに水1リットル。冷蔵庫で3〜6時間おくと、まろやかな味になります。"),
    brewNote="濃さはお好みで。茶葉の量と時間で調整してください。",
    shopH="オンラインショップ", shopU="yusando.com", shopQR="qr_shop_ja",
    ytH="YouTube", ytU="YUSANDO CHANNEL　@yusando",
    tour="茶畑を訪ねるツアーも行っています。",
    company="株式会社 悠三堂", addr="〒632-0102　奈良県奈良市上深川町227番地",
    foot="株式会社 悠三堂　｜　奈良・都祁（大和高原）", footR="yusando.com",
    thanksH="お茶をお迎えいただき、<br>ありがとうございます。",
    thanksP="奈良・都祁（大和高原）で、<br>農薬も肥料も使わずに育てたお茶です。<br>ゆっくり、お楽しみください。",
    flyLead="奈良・都祁（大和高原）で、2015年にゼロから始めた茶畑。<br>農薬も肥料も使わない自然栽培で、12種類以上のお茶を作っています。",
    callH="悠三堂のお茶を、暮らしの中に。",
    hf="'Shippori Mincho', serif",
),
"en": dict(
    lang="en",
    kicker="Natural Agriculture · Shizen Saibai",
    tag="Tea that is kind<br>to nature<br>and to people.",
    tagSub="自然と人間に、やさしいお茶を。",
    place="Yamato Plateau, Nara, Japan",
    aboutH="About Yusando", aboutE="奈良・都祁",
    aboutP=["We started our tea fields from zero in 2015, on the Yamato Plateau in Nara. Our tea is grown by Natural Agriculture: pesticide-free and fertilizer-free.",
            "As neighbouring farmers gave up conventional tea farming, we took over their fields and converted them one by one. In more than 11 years, we have converted 3.5 hectares to Natural Agriculture.",
            "We make tea that is kind to nature and to people."],
    stats=[("2015", "", "We started our tea<br>fields from zero"), ("3.5", "ha", "converted to<br>Natural Agriculture"), ("12", "+", "kinds of tea<br>made today")],
    natH="What is Natural Agriculture?", natE="自然栽培 SHIZEN SAIBAI",
    natP="No fertilizer at all, not even organic fertilizer, and no pesticides. Only the soil and the tea plant’s own vitality, given time to grow slowly.",
    cols=["Conventional", "Organic", "Natural"],
    rows=[("Pesticides", ["Used", "Mostly not<small>some approved inputs</small>", "None"]),
          ("Chemical fertilizer", ["Used", "None", "None"]),
          ("Organic fertilizer", ["Used", "Used", "None"])],
    instead=[("Instead of fertilizer", "The plant makes its own nourishment from nature."),
             ("Instead of pesticides", "The plant itself grows stronger, and lives in harmony with its environment.")],
    teaH="Our teas", teaE="悠三堂のお茶",
    teaLead="In 2015 we began with three teas: matcha, sencha and hojicha. Today we make more than twelve.",
    groups=[("The classics", [("Matcha", "stone-milled"), ("Sencha", ""), ("Hojicha", "roasted"), ("Genmaicha", "")]),
            ("New kinds of tea", [("Wakocha", "Japanese black tea"), ("White tea", ""), ("Kamairicha", "pan-fired"), ("Oolong", "")]),
            ("Bancha", [("Shiro bancha", ""), ("Aka bancha", ""), ("Kuro bancha", ""), ("Sannen bancha", "")])],
    teaNote="Wakocha, white tea and kamairicha are said to taste even better when grown by Natural Agriculture.",
    teaFoot="Seasonal teas are also available. See the full range and prices in our online store.",
    brewH="How to brew", brewE="おいしい淹れ方", brewSub="A guide for 1–2 cups",
    brewCols=["Tea", "Leaf", "Water", "Time"],
    brew=[("Sencha, Kamairicha", "4 g", "70–80°C<small>120 ml</small>", "1 min"),
          ("Hojicha, Genmaicha, Bancha", "4 g", "Boiling<small>200 ml</small>", "30 sec"),
          ("Wakocha, Oolong", "3 g", "Boiling<small>200 ml</small>", "2–3 min"),
          ("Matcha", "2 g", "80°C<small>70 ml</small>", "Whisk")],
    brewTip=("Try it cold-brewed", "10 g of leaf in 1 litre of cold water. Leave in the fridge for 3–6 hours for a soft, mellow tea."),
    brewNote="Adjust the amount of leaf and the time to your taste.",
    shopH="Online store", shopU="yusando.com/en", shopQR="qr_shop_en",
    ytH="YouTube", ytU="YUSANDO CHANNEL  @yusando",
    tour="We also welcome visitors on tea field tours.",
    company="Yusando Inc.", addr="227 Kamifukawa-cho, Nara-shi, Nara 632-0102, Japan",
    foot="Yusando Inc.  |  Yamato Plateau, Nara, Japan", footR="yusando.com",
    thanksH="Thank you for<br>choosing our tea.",
    thanksP="Grown on the Yamato Plateau in Nara,<br>pesticide-free and fertilizer-free.<br>Please take your time and enjoy.",
    flyLead="Tea fields started from zero in 2015 on the Yamato Plateau, Nara.<br>Pesticide-free and fertilizer-free, with more than twelve kinds of tea.",
    callH="Bring Yusando tea into your day.",
    hf="'Cormorant Garamond', 'Shippori Mincho', serif",
),
}

QRS = {"qr_shop_ja": "https://yusando.com", "qr_shop_en": "https://yusando.com/en", "qr_yt": "https://www.youtube.com/@yusando"}

CSS = """
:root{--kinari:#faf7f0;--kinari2:#f2ede1;--ink:#2b2a26;--soft:#57554c;--green:#4f5f3a;--greend:#3d4a2d;--greenl:#e7ebdc;--gold:#b89a5a;--goldl:#d9c79a;--line:#e3dccb}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#bbb}
body{font-family:'Shippori Mincho',serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.sheet{position:relative;overflow:hidden;background:var(--kinari);page-break-after:always;break-after:page}
.en{font-family:'Cormorant Garamond','Shippori Mincho',serif}
.lat{font-family:'Cormorant Garamond',serif}
h2{font:600 13pt/1.3 var(--hf);letter-spacing:.1em;color:var(--green)}
.en h2{font-size:16pt;letter-spacing:.02em}
.eyebrow{font:600 6.6pt/1 'Cormorant Garamond','Shippori Mincho',serif;letter-spacing:.26em;color:var(--gold);margin-bottom:1.6mm}
.rule{width:9mm;height:.3mm;background:var(--gold);margin:2.6mm 0 3.6mm}
p{font-size:8.2pt;line-height:1.85;color:var(--soft);text-align:justify}
.en p{font-size:9.8pt;line-height:1.38;text-align:left}
p+p{margin-top:2.2mm}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:.2mm solid var(--line);padding:1.7mm .8mm;text-align:center;vertical-align:middle;font-size:7.2pt;font-weight:400;line-height:1.3}
.en th,.en td{font-size:8.4pt;line-height:1.15}
thead th{color:var(--soft);font-size:6.6pt}
.en thead th{font-size:7.8pt}
tbody th{text-align:left;color:var(--ink);font-weight:600}
td small{display:block;font-size:5.6pt;color:#85826f;margin-top:.3mm}
.en td small{font-size:6.6pt}
.cmp thead th.nat{background:var(--green);color:var(--kinari);border-radius:1mm 1mm 0 0;font-weight:600}
.cmp td.nat{background:var(--greenl);color:var(--greend);font-weight:600}
.brew tbody th{white-space:nowrap}
.en .brew tbody th{white-space:normal}
.brew td:last-child{white-space:nowrap}
.stats{display:flex;gap:2mm;margin-top:5mm}
.stat{flex:1;text-align:center;border-top:.3mm solid var(--gold);padding-top:2.4mm}
.stat b{font:500 21pt/1 'Cormorant Garamond',serif;color:var(--green)}
.stat i{font:600 6.6pt/1 var(--hf);font-style:normal;color:var(--green);margin-left:.5mm}
.stat span{display:block;font-size:6.2pt;line-height:1.45;color:var(--soft);margin-top:1.6mm}
.en .stat span{font-size:7.4pt;line-height:1.15}
.ins{margin-top:4mm}
.ins>div{display:flex;gap:2.6mm;align-items:flex-start;margin-top:2.6mm}
.ins svg{flex:0 0 7mm;height:9mm}
.ins b{display:block;font:600 8.6pt/1.3 var(--hf);color:var(--green);letter-spacing:.06em}
.en .ins b{font-size:10.6pt;letter-spacing:0}
.ins span{font-size:7.4pt;line-height:1.6;color:var(--soft)}
.en .ins span{font-size:8.8pt;line-height:1.25}
.grp{margin-top:3.6mm}
.grp h3{font:600 7.4pt/1 var(--hf);letter-spacing:.16em;color:var(--gold);margin-bottom:1.2mm}
.en .grp h3{font-size:8.6pt;letter-spacing:.14em;text-transform:uppercase}
.grp ul{list-style:none;display:grid;grid-template-columns:1fr 1fr}
.grp li{font:600 9.6pt/1.2 var(--hf);padding:1.5mm 0;border-bottom:.2mm solid var(--line);letter-spacing:.06em}
.en .grp li{font-size:11pt;letter-spacing:0}
.grp li small{font:400 6pt/1 var(--hf);color:#85826f;margin-left:1.4mm;letter-spacing:0}
.en .grp li small{font-size:7.2pt;font-style:italic;display:block;margin:.5mm 0 0}
.note{font-size:6.6pt;line-height:1.6;color:var(--soft);margin-top:3mm}
.en .note{font-size:7.8pt;line-height:1.25}
.tip{background:var(--kinari2);border-radius:1.4mm;padding:3mm 3.4mm;margin-top:4mm}
.tip b{display:block;font:600 8.4pt/1.3 var(--hf);color:var(--green);letter-spacing:.06em;margin-bottom:.8mm}
.en .tip b{font-size:10.4pt;letter-spacing:0}
.tip span{font-size:7.2pt;line-height:1.6;color:var(--soft);display:block}
.en .tip span{font-size:8.6pt;line-height:1.25}
.qr{text-align:center}
.qr .box{background:#fff;border:.25mm solid var(--line);border-radius:1.4mm;padding:2mm;margin:0 auto}
.qr img{width:100%;display:block}
.qr .t{font:600 8pt/1.3 var(--hf);color:var(--green);margin-top:1.8mm;letter-spacing:.06em}
.en .qr .t{font-size:10pt;letter-spacing:0}
.qr .s{font:500 7.4pt/1.2 'Cormorant Garamond','Shippori Mincho',serif;letter-spacing:.06em;color:var(--gold);margin-top:.6mm}
.addr{font-size:6.8pt;line-height:1.7;color:var(--soft);text-align:center}
.en .addr{font-size:8pt;line-height:1.3}
.addr b{display:block;font:600 8.6pt/1.4 var(--hf);color:var(--ink);letter-spacing:.1em}
.en .addr b{font-size:10.4pt;letter-spacing:.02em}
/* 表紙まわり */
.cover{background:var(--green);color:var(--kinari)}
.cover .logo{display:block}
.cover .k{font:600 6.8pt/1 var(--hf);letter-spacing:.3em;color:var(--goldl)}
.en .cover .k{font-size:8.4pt;letter-spacing:.14em}
.cover h1{font:500 19pt/1.6 var(--hf);letter-spacing:.14em;color:var(--kinari)}
.en .cover h1{font-size:23pt;line-height:1.14;letter-spacing:.01em}
.cover .sub{font:italic 500 9pt/1.3 'Cormorant Garamond',serif;color:var(--goldl)}
.en .cover .sub{font:400 7.4pt/1.3 'Shippori Mincho',serif;font-style:normal;letter-spacing:.14em}
.cover .place{font:400 7pt/1 var(--hf);letter-spacing:.2em;color:#dfe3d2}
.en .cover .place{font-size:8.4pt;letter-spacing:.12em}
.field{position:absolute;left:0;right:0;bottom:0;width:100%}
.sprig{position:absolute;opacity:.3}
"""

def sprig(color="#d9c79a", w=1.4, cls="sprig", style=""):
    return (f'<svg class="{cls}" style="{style}" viewBox="0 0 60 84" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M30 82V42"/><path d="M30 44C24 33 25 15 30 3c5 12 6 30 0 41Z"/><path d="M30 12v30"/>'
            '<path d="M30 56C17 55 7 44 4 29c13 2 24 12 26 27Z"/><path d="M8 33c8 5 15 12 21 21"/>'
            '<path d="M30 66C43 65 53 54 56 39c-13 2-24 12-26 27Z"/><path d="M52 43c-8 5-15 12-21 21"/></svg>')

def field(c1="#3d4a2d", c2="#33402a", h="26mm"):
    a = "".join(f'<path d="M{x} 90Q{x+45} {28+(i%3)*9} {x+90} 90Z"/>' for i, x in enumerate(range(-40, 640, 78)))
    b = "".join(f'<path d="M{x} 90Q{x+55} {54+(i%2)*7} {x+110} 90Z"/>' for i, x in enumerate(range(-60, 660, 96)))
    return f'<svg class="field" style="height:{h}" viewBox="0 0 600 90" preserveAspectRatio="none"><g fill="{c1}">{a}</g><g fill="{c2}">{b}</g></svg>'

def head(d, h, e):
    return f'<div class="eyebrow">{d[e]}</div><h2>{d[h]}</h2><div class="rule"></div>'

def about(d, stats=True):
    s = head(d, "aboutH", "aboutE") + "".join(f"<p>{p}</p>" for p in d["aboutP"])
    return s + (statsrow(d) if stats else "")

def statsrow(d):
    return '<div class="stats">' + "".join(f'<div class="stat"><b>{n}</b><i>{u}</i><span>{t}</span></div>' for n, u, t in d["stats"]) + '</div>'

def cmp_table(d):
    cols = "".join(f'<th class="{"nat" if i == 2 else ""}">{c}</th>' for i, c in enumerate(d["cols"]))
    rows = "".join(f'<tr><th>{h}</th>' + "".join(f'<td class="{"nat" if i == 2 else ""}">{v}</td>' for i, v in enumerate(vals)) + '</tr>' for h, vals in d["rows"])
    return f'<table class="cmp"><thead><tr><th></th>{cols}</tr></thead><tbody>{rows}</tbody></table>'

def instead(d):
    return '<div class="ins">' + "".join(f'<div>{sprig("#4f5f3a", 2.2, "")}<div><b>{t}</b><span>{p}</span></div></div>' for t, p in d["instead"]) + '</div>'

def natural(d, with_instead=True):
    return head(d, "natH", "natE") + f'<p>{d["natP"]}</p><div style="height:3.4mm"></div>' + cmp_table(d) + (instead(d) if with_instead else "")

def teas(d, lead=True, foot=True):
    g = "".join(f'<div class="grp"><h3>{n}</h3><ul>' + "".join(f'<li>{t}<small>{s}</small></li>' for t, s in items) + '</ul></div>' for n, items in d["groups"])
    return (head(d, "teaH", "teaE") + (f'<p>{d["teaLead"]}</p>' if lead else "") + g + f'<div class="note">{d["teaNote"]}</div>'
            + (f'<div class="note" style="margin-top:1.4mm">{d["teaFoot"]}</div>' if foot else ""))

def brew_table(d):
    cols = "".join(f"<th>{c}</th>" for c in d["brewCols"])
    rows = "".join(f"<tr><th>{a}</th><td>{b}</td><td>{c}</td><td>{e}</td></tr>" for a, b, c, e in d["brew"])
    return f'<table class="brew"><thead><tr>{cols}</tr></thead><tbody>{rows}</tbody></table>'

def brew(d, tip=True, note=True):
    s = head(d, "brewH", "brewE") + f'<div class="note" style="margin:-1.4mm 0 2mm">{d["brewSub"]}</div>' + brew_table(d)
    if tip:
        s += f'<div class="tip"><b>{d["brewTip"][0]}</b><span>{d["brewTip"][1]}</span></div>'
    return s + (f'<div class="note">{d["brewNote"]}</div>' if note else "")

def qr(d, kind, size="24mm"):
    if kind == "shop":
        img, t, s = d["shopQR"], d["shopH"], d["shopU"]
    else:
        img, t, s = "qr_yt", d["ytH"], d["ytU"]
    return f'<div class="qr"><div class="box" style="width:{size}"><img src="img/{img}.svg"></div><div class="t">{t}</div><div class="s">{s}</div></div>'

def doc(d, title, size, body, extra=""):
    w, h = size
    return f"""<!doctype html><html lang="{d['lang']}"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="fonts.css">
<style>@page{{size:{w}mm {h}mm;margin:0}}{CSS}.sheet{{width:{w}mm;height:{h}mm}}{extra}</style></head>
<body class="{d['lang']}" style="--hf:{d['hf']}">{body}</body></html>"""

# ---------- 1. A4 三つ折り（巻き三つ折り・両面） ----------
# 外面：左＝中に折り込む面(97mm)／中央＝裏表紙(100mm)／右＝表紙(100mm)
# 中面：左(100mm)／中央(100mm)／右＝折り込む面の裏(97mm)
def trifold(d):
    css = f"""
.pn{{position:absolute;top:0;height:{210+2*B}mm;padding-top:{B+13}mm;padding-bottom:{B+12}mm}}
.oa{{left:0;width:{B+97}mm;padding-left:{B+10}mm;padding-right:9mm}}
.ob{{left:{B+97}mm;width:100mm;padding-left:10mm;padding-right:10mm;background:var(--kinari2)}}
.oc{{left:{B+197}mm;width:{100+B}mm;padding-left:11mm;padding-right:{B+11}mm}}
.ia{{left:0;width:{B+100}mm;padding-left:{B+11}mm;padding-right:9mm}}
.ib{{left:{B+100}mm;width:100mm;padding-left:9mm;padding-right:9mm;background:var(--kinari2)}}
.ic{{left:{B+200}mm;width:{97+B}mm;padding-left:9mm;padding-right:{B+10}mm}}
.ib th,.ib td{{border-color:#d9d1bc}}
.z{{zoom:1.16}}
.ia .stats{{flex-direction:column;gap:0;margin-top:7mm}}
.ia .stat{{display:flex;align-items:center;text-align:left;padding:3.2mm 0}}
.ia .stat b{{font-size:24pt}} .ia .stat i{{align-self:flex-end;margin:0 0 1.2mm 1mm}} .ia .stat span{{margin:0 0 0 auto;width:50%;font-size:7pt}} .en .ia .stat span{{font-size:8.4pt}}
.ia .z,.ib .z{{zoom:1.3}} .en .ib .z{{zoom:1.2}} .en .ic .z{{zoom:1.04}}
.ic .grp ul{{grid-template-columns:1fr}} .ic .grp li{{padding:1.75mm 0}} .en .ic .grp li small{{display:inline;margin-left:1.6mm}}
.ib .ins{{margin-top:7mm}} .ib .ins>div{{margin-top:4.4mm}}
.oa .brew th,.oa .brew td{{padding:2.6mm .8mm}} .oa .tip{{margin-top:6mm}}
.deco{{position:absolute;opacity:.16}}
"""
    back = f"""<div style="text-align:center">
<img src="img/logo_ink.png" style="width:46mm;display:block;margin:0 auto 5mm">
<div style="font:500 10pt/1.9 var(--hf);letter-spacing:.14em;color:var(--green)">{d['tag'].replace('<br>', ' ' if d['lang']=='en' else '')}</div>
<div style="width:9mm;height:.3mm;background:var(--gold);margin:6mm auto 7mm"></div>
<div style="display:flex;justify-content:center;gap:7mm">{qr(d,'shop','27mm')}{qr(d,'yt','27mm')}</div>
<div class="note" style="text-align:center;margin-top:7mm">{d['tour']}</div>
</div>
<div class="addr" style="position:absolute;left:0;right:0;bottom:{B+13}mm"><b>{d['company']}</b>{d['addr']}<br><span class="lat" style="letter-spacing:.1em;font-size:8.6pt">yusando.com</span></div>"""
    cover = f"""<img class="logo" src="img/logo_white.png" style="width:50mm;margin-left:-1mm">
{sprig(style="right:%dmm;top:62mm;width:30mm" % (B+9))}
<div style="position:absolute;left:11mm;right:{B+11}mm;top:88mm">
<div class="k">{d['kicker']}</div><h1 style="margin-top:6mm">{d['tag']}</h1><div class="sub" style="margin-top:5mm">{d['tagSub']}</div>
<div style="width:9mm;height:.3mm;background:var(--goldl);margin:8mm 0 4mm"></div><div class="place">{d['place']}</div></div>
{field(h="30mm")}"""
    out = f'<section class="sheet"><div class="pn oa"><div class="z">{brew(d)}</div>{sprig("#4f5f3a", 1.2, "deco", "left:%dmm;bottom:%dmm;width:34mm" % (B+31, B+16))}</div><div class="pn ob">{back}</div><div class="pn oc cover">{cover}</div></section>'
    ins = f'<section class="sheet"><div class="pn ia"><div class="z">{about(d)}</div></div><div class="pn ib"><div class="z">{natural(d)}</div></div><div class="pn ic"><div class="z">{teas(d)}</div></div>{field("#e9e6d6", "#dfdcc9", "17mm")}</section>'
    return doc(d, f"Yusando trifold {d['lang']}", (297+2*B, 210+2*B), out + ins, css)

# ---------- 2. A4 チラシ（片面） ----------
def flyer(d):
    M = B + 15
    css = f"""
.hero{{height:{B+84}mm;padding:{B+13}mm {M}mm 0;position:relative}}
.cover h1{{font-size:27pt;line-height:1.5}} .en .cover h1{{font-size:33pt;line-height:1.1}}
.cover .sub{{font-size:12pt}} .en .cover .sub{{font-size:9.6pt}}
.lead{{padding:6.5mm {M}mm 0;font-size:9.6pt;line-height:1.9;text-align:left}} .en .lead{{font-size:12pt;line-height:1.35}}
.g2{{display:grid;grid-template-columns:1fr 1fr;gap:10mm;padding:6mm {M}mm 0}} .en .g2 .grp li small{{display:inline;margin-left:1.6mm}} .g2 .ins{{margin-top:3mm}} .g2 .ins>div{{margin-top:2mm}}
.strip{{margin:6mm {M}mm 0}} .strip .stats{{margin-top:0;gap:6mm}}
.call{{position:absolute;left:{M}mm;right:{M}mm;bottom:{B+19}mm;background:var(--kinari2);border-radius:2mm;padding:5mm 8mm;display:flex;align-items:center;gap:8mm}}
.call h3{{font:600 13pt/1.5 var(--hf);color:var(--green);letter-spacing:.1em}} .en .call h3{{font-size:17pt;letter-spacing:.01em;line-height:1.15}}
.foot{{position:absolute;left:0;right:0;bottom:0;height:{B+12}mm;padding:0 {M}mm {B}mm;background:var(--green);color:#e9eadb;display:flex;align-items:center;justify-content:space-between;font-size:7.4pt;letter-spacing:.08em}}
.en .foot{{font-size:9pt}} .foot .lat{{font-size:9.6pt;letter-spacing:.12em}}
"""
    body = f"""<section class="sheet">
<div class="hero cover"><img class="logo" src="img/logo_white.png" style="width:58mm;margin-left:-1mm">
{sprig(style="right:%dmm;top:%dmm;width:36mm" % (M+2, B+20))}
<div class="k" style="margin-top:11mm">{d['kicker']}</div><h1 style="margin-top:4.5mm">{d['tag'].replace('<br>', '', 1) if d['lang']=='ja' else 'Tea that is kind<br>to nature and to people.'}</h1>
<div class="sub" style="margin-top:3.5mm">{d['tagSub']}</div>{field(h="24mm")}</div>
<p class="lead">{d['flyLead']}</p>
<div class="strip">{statsrow(d)}</div>
<div class="g2"><div>{natural(d)}</div><div>{teas(d, lead=False, foot=False)}</div></div>
<div class="call"><div style="flex:1"><h3>{d['callH']}</h3><div class="note" style="margin-top:2mm">{d['teaFoot']}<br>{d['tour']}</div></div>{qr(d,'shop','23mm')}{qr(d,'yt','23mm')}</div>
<div class="foot"><span>{d['foot']}</span><span class="lat">{d['footR']}</span></div>
</section>"""
    return doc(d, f"Yusando flyer {d['lang']}", (210+2*B, 297+2*B), body, css)

# ---------- 3. はがきサイズの同梱カード（両面） ----------
def card(d):
    M = B + 8
    css = f"""
.front{{padding:{B+12}mm {M+2}mm 0;text-align:center}}
.front h1{{font-size:14pt;line-height:1.7;letter-spacing:.14em}} .en .front h1{{font-size:21pt;line-height:1.12;letter-spacing:.01em}}
.front p{{color:#e9eadb;text-align:center;font-size:7.6pt;line-height:1.9}} .en .front p{{font-size:9.6pt;line-height:1.3;text-align:center}}
.backp{{padding:{B+9}mm {M}mm 0}}
.bot{{position:absolute;left:{M}mm;right:{M}mm;bottom:{B+8}mm;display:flex;align-items:flex-end;gap:5mm;border-top:.3mm solid var(--gold);padding-top:4mm}}
.bot .addr{{text-align:left;flex:1}}
"""
    front = f"""<section class="sheet cover"><div class="front">
<img class="logo" src="img/logo_white.png" style="width:44mm;margin:0 auto">
<div style="margin:11mm auto 0;width:16mm;height:22mm;position:relative">{sprig(style="left:0;top:0;width:16mm;opacity:.75")}</div>
<h1 style="margin-top:8mm">{d['thanksH']}</h1>
<div style="width:9mm;height:.3mm;background:var(--goldl);margin:6mm auto"></div>
<p>{d['thanksP']}</p>
<div class="k" style="margin-top:8mm">{d['kicker']}</div></div>{field(h="20mm")}</section>"""
    back = f"""<section class="sheet"><div class="backp">{brew(d, note=False)}</div>
<div class="bot"><div class="addr"><div style="font:500 8pt/1.7 var(--hf);color:var(--green);letter-spacing:.1em;margin-bottom:1.4mm">{d['tag'].replace('<br>', ' ' if d['lang']=='en' else '')}</div><b>{d['company']}</b>{d['addr']}</div>{qr(d,'shop','20mm')}</div></section>"""
    return doc(d, f"Yusando card {d['lang']}", (100+2*B, 148+2*B), front + back, css)

if __name__ == "__main__":
    for name, url in QRS.items():
        segno.make(url, error="m").save(str(HERE / "img" / f"{name}.svg"), scale=10, border=0, dark="#2b2a26")
    for k, d in T.items():
        (HERE / f"trifold_{k}.html").write_text(trifold(d), encoding="utf-8")
        (HERE / f"flyer_{k}.html").write_text(flyer(d), encoding="utf-8")
        (HERE / f"card_{k}.html").write_text(card(d), encoding="utf-8")
    print("ok")
