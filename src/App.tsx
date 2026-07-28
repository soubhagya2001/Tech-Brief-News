import { useState, useEffect } from "react";
import { Settings, ExternalLink, RefreshCw, Plus, Trash2, X, Rss, Clock, Tag, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AppConfig, NewsItem, NewsCategory } from "./types";

const THEME_COLORS = [
  { name: "Indigo", value: "indigo", classes: "bg-indigo-600 hover:bg-indigo-700 text-indigo-600 ring-indigo-600 border-indigo-600" },
  { name: "Blue", value: "blue", classes: "bg-blue-600 hover:bg-blue-700 text-blue-600 ring-blue-600 border-blue-600" },
  { name: "Rose", value: "rose", classes: "bg-rose-600 hover:bg-rose-700 text-rose-600 ring-rose-600 border-rose-600" },
  { name: "Emerald", value: "emerald", classes: "bg-emerald-600 hover:bg-emerald-700 text-emerald-600 ring-emerald-600 border-emerald-600" },
  { name: "Slate", value: "slate", classes: "bg-slate-800 hover:bg-slate-900 text-slate-800 ring-slate-800 border-slate-800" },
];

const FALLBACK_CONFIG: AppConfig = {
  themeColor: "indigo",
  categories: [{ id: "tech", name: "Technology", enabled: true, feeds: [] }],
};

const getConfigUrl = () => `${import.meta.env.BASE_URL}config.json`;

const PUBLIC_FEED_ENDPOINTS = [
  (feedUrl: string) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
  (feedUrl: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
  (feedUrl: string) => `https://r.jina.ai/http/${encodeURIComponent(feedUrl)}`,
];

const normalizeFeedItem = (item: any, categoryName: string, sourceName: string): NewsItem => ({
  id: item.guid || item.id || item.link || `${categoryName}-${sourceName}-${item.title}`,
  title: item.title || "Untitled",
  link: item.link || "#",
  pubDate: item.pubDate || item.published || "",
  contentSnippet: item.contentSnippet || item.description || item.content || "",
  category: categoryName,
  source: sourceName,
});

const parseAllOriginsFeed = (feedText: string, categoryName: string): NewsItem[] => {
  if (typeof window === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(feedText, "application/xml");
  const sourceName = doc.querySelector("channel > title")?.textContent || "Public Feed";
  const items = Array.from(doc.querySelectorAll("item"));

  return items.map((item) => ({
    id: item.querySelector("guid")?.textContent || item.querySelector("link")?.textContent || `${categoryName}-${sourceName}`,
    title: item.querySelector("title")?.textContent || "Untitled",
    link: item.querySelector("link")?.textContent || "#",
    pubDate: item.querySelector("pubDate")?.textContent || "",
    contentSnippet: item.querySelector("description")?.textContent?.replace(/<[^>]+>/g, "").trim() || "",
    category: categoryName,
    source: sourceName,
  }));
};

const fetchFeedFromPublicApis = async (feedUrl: string, categoryName: string): Promise<NewsItem[]> => {
  for (const buildUrl of PUBLIC_FEED_ENDPOINTS) {
    try {
      const url = buildUrl(feedUrl);
      const response = await fetch(url, { headers: { Accept: "application/json, application/xml, text/xml, text/plain" } });
      if (!response.ok) continue;

      if (url.includes("rss2json")) {
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const sourceName = payload?.feed?.title || "Public Feed";
        return items.map((item: any) => normalizeFeedItem(item, categoryName, sourceName));
      }

      const text = await response.text();
      if (text && text.includes("<rss") || text.includes("<feed") || text.includes("<channel")) {
        return parseAllOriginsFeed(text, categoryName);
      }

      try {
        const payload = JSON.parse(text);
        if (payload?.contents) {
          return parseAllOriginsFeed(payload.contents, categoryName);
        }
      } catch {
        // ignore
      }
    } catch (err) {
      console.warn(`Failed to load feed ${feedUrl}`, err);
    }
  }

  return [];
};

const getStoredConfig = (): AppConfig | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem("tech-brief-config");
    return saved ? JSON.parse(saved) as AppConfig : null;
  } catch {
    return null;
  }
};

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const fetchConfig = async () => {
    setLoading(true);
    setError("");

    try {
      const storedConfig = getStoredConfig();
      if (storedConfig) {
        setConfig(storedConfig);
        return;
      }

      const res = await fetch(getConfigUrl());
      if (!res.ok) throw new Error("Config file unavailable");

      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error("Failed to load config", err);
      setConfig(FALLBACK_CONFIG);
      setError("Using built-in settings because the config file could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const fetchNews = async () => {
    if (!config) return;

    setLoading(true);
    setError("");

    try {
      const activeCategories = config.categories.filter((category) => category.enabled);
      const feedResults = await Promise.all(
        activeCategories.flatMap((category) =>
          category.feeds.map((feedUrl) => fetchFeedFromPublicApis(feedUrl, category.name))
        )
      );

      const allNews = feedResults.flat().sort((a, b) => {
        const aTime = new Date(a.pubDate).getTime();
        const bTime = new Date(b.pubDate).getTime();
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });

      setNews(allNews.slice(0, 100));
      if (allNews.length === 0) {
        setError("No public feeds were available at the moment.");
      }
    } catch (err) {
      console.error("Failed to load public news", err);
      setNews([]);
      setError("Unable to load public news feeds right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config) {
      fetchNews();
    }
  }, [config]);

  const saveConfig = async (newConfig: AppConfig) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("tech-brief-config", JSON.stringify(newConfig));
      }
      setConfig(newConfig);
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("Failed to save config", err);
    }
  };

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const activeTheme = THEME_COLORS.find((t) => t.value === config.themeColor) || THEME_COLORS[0];
  const themeBg = activeTheme.classes.split(' ')[0];
  const themeHover = activeTheme.classes.split(' ')[1];
  const themeText = activeTheme.classes.split(' ')[2];
  const themeBorder = activeTheme.classes.split(' ')[4];

  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.contentSnippet?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#121212] font-sans flex flex-col p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-black pb-4 mb-6 gap-4">
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-[0.2em] uppercase opacity-60 mb-1">Intelligence Syndicate</span>
          <h1 className="text-5xl md:text-6xl font-serif italic font-black leading-none">Tech.Brief</h1>
        </div>
        <div className="flex gap-4 md:gap-8 text-sm font-medium items-end w-full md:w-auto justify-between md:justify-end">
          <div className="hidden md:flex flex-col text-right">
            <span className="opacity-40 uppercase text-[10px] tracking-widest mb-1">Active Configuration</span>
            <span className="font-mono text-xs">
              [ {config.categories.filter(c => c.enabled).map(c => c.name.substring(0, 4).toUpperCase()).join(', ')} ]
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchNews()}
              disabled={loading}
              className="w-12 h-12 bg-black flex items-center justify-center text-white cursor-pointer hover:bg-gray-800 transition-colors disabled:opacity-50"
              title="Refresh News"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-12 h-12 bg-black flex items-center justify-center text-white cursor-pointer hover:bg-gray-800 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col w-full mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <h2 className="text-2xl font-serif leading-snug">Latest Updates</h2>
          <div className="relative border-b border-black w-full md:w-auto">
            <div className="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-black opacity-50" />
            </div>
            <input
              type="text"
              placeholder="Search intelligence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full md:w-64 pl-7 pr-3 py-1 bg-transparent placeholder-black/40 focus:outline-none font-mono text-xs uppercase tracking-wider"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 border-l-4 border-black bg-black/5 p-4">
            <p className="font-mono text-xs font-bold uppercase">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2 border-b border-black/10">
          <button 
             onClick={() => setActiveCategory("All")} 
             className={`font-mono text-xs uppercase font-bold px-4 py-2 transition-colors whitespace-nowrap ${activeCategory === "All" ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'}`}
          >
            All Intelligence
          </button>
          {config.categories.filter(c => c.enabled).map(c => (
            <button 
               key={c.name}
               onClick={() => setActiveCategory(c.name)} 
               className={`font-mono text-xs uppercase font-bold px-4 py-2 transition-colors whitespace-nowrap ${activeCategory === c.name ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {loading && news.length === 0 ? (
          <div className="grid gap-8 lg:grid-cols-12">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex flex-col gap-4 animate-pulse ${i === 0 ? 'lg:col-span-7' : 'lg:col-span-5 hidden lg:flex'}`}>
                <div className="h-64 bg-black/5 w-full"></div>
                <div className="h-8 bg-black/5 w-3/4"></div>
                <div className="h-4 bg-black/5 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-center py-20 border border-black/10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-black/5 mb-4">
              <Rss className="w-8 h-8 text-black/40" />
            </div>
            <h3 className="text-lg font-serif italic font-bold">No intel found</h3>
            <p className="text-sm font-mono opacity-60 mt-1 uppercase">Try adjusting your fetch parameters.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7 flex flex-col lg:border-r border-black/10 lg:pr-8 mb-8 lg:mb-0">
                <a
                  href={filteredNews[0].link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex-grow flex flex-col"
                >
                  <div className="w-full h-[240px] md:h-[320px] bg-black/5 mb-6 flex items-center justify-center overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-500">
                    <div className={`absolute top-4 left-4 text-white text-[10px] px-3 py-1 font-bold uppercase tracking-widest ${themeBg}`}>
                      Featured Insight / {filteredNews[0].category}
                    </div>
                    <div className={`w-full h-full opacity-10 flex items-center justify-center text-8xl font-serif ${themeBg}`}>
                      <Rss className="w-32 h-32" />
                    </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-4 group-hover:underline decoration-2 underline-offset-4">
                    {filteredNews[0].title}
                  </h2>
                  <p className="text-base md:text-lg leading-relaxed opacity-80 mb-6 max-w-lg line-clamp-3">
                    {filteredNews[0].contentSnippet || "No summary available."}
                  </p>
                  <div className="mt-auto flex items-center justify-between border-t border-black pt-4">
                    <span className="font-mono text-[10px] md:text-xs uppercase tracking-tighter truncate max-w-[60%]">
                      Source: {filteredNews[0].source}
                    </span>
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all whitespace-nowrap">
                      Read Full Analysis &rarr;
                    </span>
                  </div>
                </a>
              </div>

              {filteredNews.length > 1 && (
                <div className="lg:col-span-5 flex flex-col gap-6">
                  <div className="bg-black text-white p-6 mb-2 hidden lg:block">
                    <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4 border-b border-white/20 pb-2">Live Configuration Panel</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-70">Active Channels</span>
                        <span className="font-mono">{config.categories.filter(c => c.enabled).length}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-70">Theme Accent</span>
                        <span className="font-mono uppercase">{config.themeColor}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="opacity-70">Stream State</span>
                        <span className="font-mono text-green-400 font-bold">LOCAL_JSON_READY</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    {filteredNews.slice(1, 5).map((item, index) => (
                      <div key={item.id}>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group cursor-pointer block"
                        >
                          <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${themeText}`}>{item.category}</span>
                          <h4 className="text-xl font-serif leading-snug group-hover:underline underline-offset-4 decoration-1 line-clamp-2">{item.title}</h4>
                          <p className="text-xs opacity-60 mt-2 font-mono line-clamp-2">
                            Updated {item.pubDate ? formatDistanceToNow(new Date(item.pubDate), { addSuffix: true }) : 'Unknown date'} • Source: {item.source}
                          </p>
                        </a>
                        {index !== filteredNews.slice(1, 5).length - 1 && (
                          <div className="h-px bg-black/10 w-full mt-6"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {filteredNews.length > 5 && (
              <div className="border-t-2 border-black pt-8">
                <h3 className="text-xl font-serif italic font-bold mb-6">Extended Network Intel</h3>
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {filteredNews.slice(5).map((item) => (
                    <a
                      key={item.id}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col bg-black/5 p-6 hover:bg-black/10 transition-colors h-full"
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-widest mb-3 block ${themeText}`}>{item.category}</span>
                      <h4 className="text-lg font-serif leading-snug mb-3 group-hover:underline underline-offset-4 decoration-1 line-clamp-3">{item.title}</h4>
                      <p className="text-sm opacity-70 mb-6 line-clamp-3 flex-grow">{item.contentSnippet || "No summary available."}</p>
                      <div className="mt-auto pt-4 border-t border-black/10 flex justify-between items-center text-[10px] font-mono uppercase">
                        <span className="opacity-60 truncate mr-2 max-w-[60%]">{item.source}</span>
                        <span className="whitespace-nowrap">{item.pubDate ? formatDistanceToNow(new Date(item.pubDate)) : 'Unknown'}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-black pt-4 flex items-center overflow-hidden whitespace-nowrap text-sm">
        <div className="bg-black text-white px-2 py-1 text-[10px] font-bold mr-4 uppercase shrink-0">Breaking</div>
        <div className="text-xs font-mono tracking-tight flex gap-8 items-center w-full overflow-x-auto no-scrollbar">
           <span className="shrink-0">{news.length > 0 ? news[0].title : "Awaiting transmission..."}</span>
           <span className="opacity-30 shrink-0">|</span>
           <span className="shrink-0">Custom Scraper active on {config.categories.filter(c => c.enabled).length} channels</span>
           <span className="opacity-30 shrink-0">|</span>
           <span className="shrink-0">Last Sync: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>

      {isSettingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setIsSettingsOpen(false)}
          onSave={saveConfig}
          themes={THEME_COLORS}
        />
      )}
    </div>
  );
}

function SettingsModal({ 
  config, 
  onClose, 
  onSave,
  themes
}: { 
  config: AppConfig, 
  onClose: () => void, 
  onSave: (c: AppConfig) => void,
  themes: typeof THEME_COLORS
}) {
  const [tempConfig, setTempConfig] = useState<AppConfig>(JSON.parse(JSON.stringify(config)));
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const handleToggleCategory = (categoryId: string) => {
    setTempConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => 
        c.id === categoryId ? { ...c, enabled: !c.enabled } : c
      )
    }));
  };

  const handleRemoveFeed = (categoryId: string, feedIndex: number) => {
    setTempConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => {
        if (c.id === categoryId) {
          const newFeeds = [...c.feeds];
          newFeeds.splice(feedIndex, 1);
          return { ...c, feeds: newFeeds };
        }
        return c;
      })
    }));
  };

  const handleAddFeed = (categoryId: string) => {
    if (!newFeedUrl.trim()) return;
    setTempConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => 
        c.id === categoryId ? { ...c, feeds: [...c.feeds, newFeedUrl.trim()] } : c
      )
    }));
    setNewFeedUrl("");
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const newId = newCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    setTempConfig(prev => ({
      ...prev,
      categories: [
        ...prev.categories,
        { id: newId, name: newCategoryName.trim(), enabled: true, feeds: [] }
      ]
    }));
    setNewCategoryName("");
  };

  const handleRemoveCategory = (categoryId: string) => {
    setTempConfig(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c.id !== categoryId)
    }));
  };

  const activeTheme = themes.find(t => t.value === tempConfig.themeColor) || themes[0];
  const themeBg = activeTheme.classes.split(' ')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#FDFCFB]/80 backdrop-blur-sm">
      <div className="bg-[#FDFCFB] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-black flex items-center justify-between bg-black text-white">
          <h2 className="text-xl font-serif font-bold italic tracking-wide">System.Configuration</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow flex flex-col gap-8 font-sans">
          
          {/* Appearance Section */}
          <section>
            <h3 className="text-sm font-mono font-bold uppercase tracking-widest mb-4 border-b border-black pb-2">Appearance Accent</h3>
            <div className="flex flex-wrap gap-3">
              {themes.map(theme => (
                <button
                  key={theme.value}
                  onClick={() => setTempConfig({ ...tempConfig, themeColor: theme.value })}
                  className={`px-4 py-2 border-2 text-xs font-mono font-bold uppercase tracking-wider transition-all ${
                    tempConfig.themeColor === theme.value 
                      ? `border-black bg-black text-white` 
                      : 'border-black/20 text-black hover:border-black/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 ${theme.classes.split(' ')[0]}`}></div>
                    {theme.name}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Categories Section */}
          <section>
            <h3 className="text-sm font-mono font-bold uppercase tracking-widest mb-4 border-b border-black pb-2">Data Feeds</h3>
            
            <div className="space-y-6">
              {tempConfig.categories.map(category => (
                <div key={category.id} className="bg-black/5 p-5 border border-black">
                  <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={category.enabled}
                        onChange={() => handleToggleCategory(category.id)}
                        className={`w-4 h-4 border-2 border-black appearance-none checked:bg-black checked:after:content-['✓'] checked:after:text-white checked:after:text-xs checked:after:flex checked:after:justify-center checked:after:items-center cursor-pointer`}
                      />
                      <h4 className="text-lg font-serif font-bold">{category.name}</h4>
                    </div>
                    <button 
                      onClick={() => handleRemoveCategory(category.id)}
                      className="text-black/40 hover:text-red-600 p-1 transition-colors"
                      title="Remove Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="pl-7 space-y-2">
                    {category.feeds.map((feed, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#FDFCFB] px-3 py-2 border border-black/10 hover:border-black transition-colors">
                        <span className="text-xs font-mono text-black/80 truncate mr-2">{feed}</span>
                        <button 
                          onClick={() => handleRemoveFeed(category.id, idx)}
                          className="text-black/40 hover:text-red-600 flex-shrink-0 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    
                    <div className="flex items-center gap-2 mt-4">
                      <input
                        type="url"
                        placeholder="ADD RSS FEED URL..."
                        value={newFeedUrl}
                        onChange={(e) => setNewFeedUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFeedUrl) {
                            handleAddFeed(category.id);
                          }
                        }}
                        className="flex-grow text-xs font-mono px-3 py-2 border border-black bg-transparent focus:outline-none focus:ring-1 focus:ring-black placeholder-black/30"
                      />
                      <button
                        onClick={() => handleAddFeed(category.id)}
                        className="px-3 py-2 bg-black text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-black/80 transition-colors"
                      >
                        Add Feed
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Category */}
              <div className="flex items-center gap-3 bg-black/5 p-4 border border-black border-dashed">
                <input
                  type="text"
                  placeholder="NEW CATEGORY NAME..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCategory();
                  }}
                  className="flex-grow text-xs font-mono px-3 py-2 border border-black bg-transparent focus:outline-none focus:ring-1 focus:ring-black placeholder-black/30"
                />
                <button
                  onClick={handleAddCategory}
                  className="flex items-center gap-1 px-4 py-2 bg-black text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-black/80 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Category
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t-2 border-black bg-black/5 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-mono font-bold uppercase tracking-wider border border-black hover:bg-black/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tempConfig)}
            className={`px-6 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-black text-white hover:bg-black/80 transition-colors`}
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

