// The free email providers most people use, small enough to ship in the form script: a work email field refuses
// them on the page they're typed on, before Next. The server still checks the full list (free-email-domains in
// address.ts) when the form is sent, so a rarer free provider is caught there.

export const FREE_TOP = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.com.br",
  "yahoo.co.jp", "yahoo.com.vn", "ymail.com", "rocketmail.com", "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.es",
  "hotmail.it", "outlook.com", "outlook.fr", "outlook.de", "outlook.es", "live.com", "live.co.uk", "live.fr", "msn.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "gmx.net", "gmx.at", "web.de", "mail.com",
  "zoho.com", "zohomail.com", "yandex.com", "yandex.ru", "mail.ru", "inbox.ru", "list.ru", "bk.ru", "rambler.ru", "qq.com", "163.com",
  "126.com", "sina.com", "foxmail.com", "naver.com", "hanmail.net", "daum.net", "orange.fr", "free.fr", "laposte.net", "sfr.fr",
  "libero.it", "virgilio.it", "tiscali.it", "t-online.de", "freenet.de", "seznam.cz", "wp.pl", "o2.pl", "interia.pl", "onet.pl",
  "bol.com.br", "uol.com.br", "terra.com.br", "rediffmail.com", "fastmail.com", "tuta.io", "comcast.net",
  "verizon.net", "att.net", "sbcglobal.net", "btinternet.com", "sky.com", "shaw.ca", "rogers.com", "bigpond.com", "optusnet.com.au",
]);

/** Whether an email is at one of the common free providers (its domain, lower case). */
export const isFreeTop = (email: string) => FREE_TOP.has(email.trim().toLowerCase().split("@").pop() ?? "");
