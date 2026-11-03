// Crawlers, previews and headless browsers: their form views and starts aren't counted (docs/enrich-workflows-reports.md
// 3.4). An empty user agent counts as a bot.

const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|scan|headless|lighthouse|pingdom|uptime|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|okhttp|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack/i;

export const isBotUa = (ua: string | null | undefined): boolean => !ua || ua.length < 12 || BOT.test(ua);
