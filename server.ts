import express from "express";
import path from "path";
import fs from "fs/promises";
import Parser from "rss-parser";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail']
  }
});

const CONFIG_FILE = path.join(process.cwd(), "config.json");

const DEFAULT_CONFIG = {
  themeColor: "indigo",
  categories: [
    {
      id: "tech",
      name: "Technology",
      enabled: true,
      feeds: [
        "https://techcrunch.com/feed/",
        "https://www.theverge.com/rss/index.xml",
        "https://feeds.arstechnica.com/arstechnica/index"
      ]
    },
    {
      id: "ai",
      name: "Artificial Intelligence",
      enabled: true,
      feeds: [
        "https://www.artificialintelligence-news.com/feed/",
        "https://venturebeat.com/category/ai/feed/"
      ]
    },
    {
      id: "programming",
      name: "Programming",
      enabled: true,
      feeds: [
        "https://dev.to/feed",
        "https://www.freecodecamp.org/news/rss/"
      ]
    },
    {
      id: "startups",
      name: "Startups",
      enabled: true,
      feeds: [
        "https://news.ycombinator.com/rss",
        "https://www.entrepreneur.com/latest.rss"
      ]
    },
    {
      id: "science",
      name: "Science",
      enabled: false,
      feeds: [
        "https://www.sciencedaily.com/rss/all.xml",
        "https://www.wired.com/feed/category/science/latest/rss"
      ]
    },
    {
      id: "space",
      name: "Space & Astronomy",
      enabled: false,
      feeds: [
        "https://www.space.com/feeds/all",
        "https://spacenews.com/feed/"
      ]
    },
    {
      id: "gaming",
      name: "Gaming",
      enabled: false,
      feeds: [
        "https://www.polygon.com/rss/index.xml",
        "https://www.ign.com/rss/articles/feed"
      ]
    },
    {
      id: "cybersecurity",
      name: "Cybersecurity",
      enabled: false,
      feeds: [
        "https://krebsonsecurity.com/feed/",
        "https://thehackernews.com/feeds/posts/default"
      ]
    },
    {
      id: "crypto",
      name: "Cryptocurrency",
      enabled: false,
      feeds: [
        "https://cointelegraph.com/rss",
        "https://www.coindesk.com/arc/outboundfeeds/rss/"
      ]
    }
  ]
};

async function getConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, write default
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
}

app.get("/api/config", async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (error) {
    console.error("Error reading config:", error);
    res.status(500).json({ error: "Failed to read config" });
  }
});

app.post("/api/config", async (req, res) => {
  try {
    const newConfig = req.body;
    await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving config:", error);
    res.status(500).json({ error: "Failed to save config" });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const config = await getConfig();
    const activeCategories = config.categories.filter((c: any) => c.enabled);
    
    let allNews: any[] = [];

    for (const category of activeCategories) {
      for (const feedUrl of category.feeds) {
        try {
          const feed = await parser.parseURL(feedUrl);
          const items = feed.items.map(item => ({
            id: item.guid || item.link,
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            contentSnippet: item.contentSnippet,
            category: category.name,
            source: feed.title
          }));
          allNews = allNews.concat(items);
        } catch (err) {
          console.error(`Error parsing feed ${feedUrl}:`, err);
        }
      }
    }

    // Sort by date descending
    allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    
    res.json(allNews.slice(0, 100)); // limit to latest 100
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
