import re
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError
from flask import Flask, jsonify, render_template

app = Flask(__name__)

FEEDS = [
    {"name": "BBC World",    "url": "http://feeds.bbci.co.uk/news/world/rss.xml",                       "category": "國際"},
    {"name": "BBC Tech",     "url": "http://feeds.bbci.co.uk/news/technology/rss.xml",                  "category": "科技"},
    {"name": "Reuters",      "url": "https://feeds.reuters.com/reuters/topNews",                         "category": "國際"},
    {"name": "AP News",      "url": "https://rsshub.app/apnews/topics/apf-topnews",                     "category": "國際"},
    {"name": "Hacker News",  "url": "https://news.ycombinator.com/rss",                                 "category": "科技"},
    {"name": "NASA",         "url": "https://www.nasa.gov/rss/dyn/breaking_news.rss",                   "category": "科學"},
    {"name": "TechCrunch",   "url": "https://techcrunch.com/feed/",                                     "category": "科技"},
    {"name": "The Guardian", "url": "https://www.theguardian.com/world/rss",                            "category": "國際"},
    {"name": "科學人",        "url": "https://www.scientificamerican.com/platform/syndication/rss/",     "category": "科學"},
    {"name": "ESPN",         "url": "https://www.espn.com/espn/rss/news",                               "category": "體育"},
]

NS = {"media": "http://search.yahoo.com/mrss/", "dc": "http://purl.org/dc/elements/1.1/"}

DEMO_NEWS = [
    {"title": "聯合國氣候峰會達成碳排放歷史性協議", "link": "#", "summary": "各國領袖同意在 2035 年前將碳排放量減少 50%，這是國際社會應對氣候變遷的里程碑。", "published": "2026-05-06 10:00", "source": "BBC World", "category": "國際", "image": ""},
    {"title": "OpenAI 發布新一代多模態模型，推理能力大幅提升", "link": "#", "summary": "新模型在數學推理、程式碼生成及視覺理解方面均創下新紀錄，並支援長達百萬 token 的上下文窗口。", "published": "2026-05-06 09:30", "source": "TechCrunch", "category": "科技", "image": ""},
    {"title": "NASA 確認火星地底存在液態水層", "link": "#", "summary": "毅力號探測器傳回的雷達數據顯示，火星地表下約 1.5 公里處存在大規模液態水層，為火星生命提供新的可能。", "published": "2026-05-06 08:45", "source": "NASA", "category": "科學", "image": ""},
    {"title": "NBA 季後賽：金州勇士隊晉級總決賽", "link": "#", "summary": "柯里拿下 42 分帶領勇士 4:2 擊敗丹佛金塊，時隔三年再度闖入 NBA 總決賽。", "published": "2026-05-05 23:15", "source": "ESPN", "category": "體育", "image": ""},
    {"title": "歐盟通過《人工智慧責任法》，科技巨頭需對 AI 決策負責", "link": "#", "summary": "新法規要求科技公司對 AI 系統造成的損害承擔法律責任，違者最高罰款達全球年營收 6%。", "published": "2026-05-05 18:00", "source": "The Guardian", "category": "國際", "image": ""},
    {"title": "Hacker News 熱門：Rust 2026 版本引入 async trait 穩定支援", "link": "#", "summary": "Rust 語言最新版本終於穩定化 async trait，開發者不再需要依賴第三方 crate 處理非同步介面。", "published": "2026-05-05 16:30", "source": "Hacker News", "category": "科技", "image": ""},
    {"title": "科學家首次合成室溫超導體，電力傳輸效率望大幅提升", "link": "#", "summary": "南韓研究團隊宣布在常壓室溫條件下實現超導現象，已通過多個獨立實驗室驗證，論文刊登於 Nature。", "published": "2026-05-05 14:00", "source": "科學人", "category": "科學", "image": ""},
    {"title": "台積電宣布 1nm 製程提前量產，蘋果為首批客戶", "link": "#", "summary": "台積電提前六個月完成 1nm 製程研發，預計 2026 年底開始為蘋果供應下一代 A 系列晶片。", "published": "2026-05-05 11:00", "source": "BBC Tech", "category": "科技", "image": ""},
    {"title": "中東停火協議生效，人道走廊開放物資運送", "link": "#", "summary": "在美、法聯合調解下，衝突雙方達成 30 天停火協議，聯合國人道走廊預計 72 小時內開放。", "published": "2026-05-04 20:00", "source": "Reuters", "category": "國際", "image": ""},
    {"title": "世界衛生組織：全球平均壽命突破 80 歲", "link": "#", "summary": "WHO 最新報告顯示，2025 年全球平均壽命達到 80.3 歲，醫療科技進步與生活水準提升為主因。", "published": "2026-05-04 15:00", "source": "AP News", "category": "科學", "image": ""},
    {"title": "巴黎奧運倒數：台灣代表團公布 36 人參賽名單", "link": "#", "summary": "中華奧委會公布 2028 洛杉磯奧運模擬備戰名單，田徑、游泳及舉重為重點奪牌項目。", "published": "2026-05-04 13:00", "source": "ESPN", "category": "體育", "image": ""},
    {"title": "量子電腦突破 10,000 qubit，商業應用進入倒計時", "link": "#", "summary": "IBM 宣布旗下量子電腦成功突破 1 萬 qubit 穩定運算，預計 2027 年推出企業級雲端量子服務。", "published": "2026-05-04 10:30", "source": "TechCrunch", "category": "科技", "image": ""},
]


def _parse_date(text: str) -> str:
    if not text:
        return ""
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ):
        try:
            return datetime.strptime(text.strip(), fmt).strftime("%Y-%m-%d %H:%M")
        except ValueError:
            continue
    return text[:16]


def _fetch_feed(feed: dict, max_items: int = 8) -> list:
    headers = {"User-Agent": "NewsAggregator/1.0"}
    try:
        req = Request(feed["url"], headers=headers)
        with urlopen(req, timeout=8) as resp:
            raw = resp.read()
        root = ET.fromstring(raw)
    except (URLError, ET.ParseError, Exception):
        return []

    channel = root.find("channel") or root
    items = []
    for item in channel.findall("item")[:max_items]:
        title = (item.findtext("title") or "").strip()
        link  = (item.findtext("link")  or "").strip()
        desc  = (item.findtext("description") or "").strip()
        desc = re.sub(r"<[^>]+>", "", desc)[:200]
        pub   = _parse_date(item.findtext("pubDate") or item.findtext("dc:date", namespaces=NS) or "")
        image = ""
        media = item.find("media:thumbnail", NS) or item.find("media:content", NS)
        if media is not None:
            image = media.get("url", "")
        if title and link:
            items.append({
                "title":    title,
                "link":     link,
                "summary":  desc,
                "published": pub,
                "source":   feed["name"],
                "category": feed["category"],
                "image":    image,
            })
    return items


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/news")
def get_news():
    all_news: list = []
    for feed in FEEDS:
        all_news.extend(_fetch_feed(feed))
    all_news.sort(key=lambda x: x["published"] or "0", reverse=True)
    # fall back to demo data when no live feeds are reachable
    if not all_news:
        all_news = DEMO_NEWS
    return jsonify(all_news)


@app.route("/api/feeds")
def get_feeds():
    return jsonify([{"name": f["name"], "category": f["category"]} for f in FEEDS])


if __name__ == "__main__":
    app.run(debug=True, port=5000)
