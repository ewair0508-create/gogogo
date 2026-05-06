import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
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
        # strip HTML tags from description
        import re
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
    # sort by published desc (empty dates go last)
    all_news.sort(key=lambda x: x["published"] or "0", reverse=True)
    return jsonify(all_news)


@app.route("/api/feeds")
def get_feeds():
    return jsonify([{"name": f["name"], "category": f["category"]} for f in FEEDS])


if __name__ == "__main__":
    app.run(debug=True, port=5000)
