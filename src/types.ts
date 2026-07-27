export interface NewsCategory {
  id: string;
  name: string;
  enabled: boolean;
  feeds: string[];
}

export interface AppConfig {
  themeColor: string;
  categories: NewsCategory[];
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  category: string;
  source: string;
}
