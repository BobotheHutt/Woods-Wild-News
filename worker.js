/**
 * Wood's Wild News — Cloudflare Worker
 * 
 * Routes:
 *   GET  /rss?url=...   → proxy RSS feeds (CORS bypass)
 *   GET  /api/news      → serve cached clustered articles from KV
 *   GET  /api/refresh   → manually trigger a cache refresh
 *   *                   → static assets
 * 
 * Scheduled:
 *   Cron every hour     → fetch all feeds, cluster, store in KV
 */

const CACHE_KEY = "wwn_news_cache";
const CACHE_TTL = 60 * 60; // 1 hour in seconds

// ── Feed lists ────────────────────────────────────────────────────────────
const OUTLETS=[
  // ── LEFT ──
  {name:"New York Times",           lean:"left",         rss:"https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"},
  {name:"Washington Post",          lean:"left",         rss:"https://feeds.washingtonpost.com/rss/national"},
  {name:"The Guardian",             lean:"left",         rss:"https://www.theguardian.com/world/rss"},
  {name:"HuffPost",                 lean:"left",         rss:"https://www.huffpost.com/section/front-page/feed"},
  {name:"The Atlantic",             lean:"left",         rss:"https://www.theatlantic.com/feed/all/"},
  {name:"Mother Jones",             lean:"left",         rss:"https://www.motherjones.com/feed/"},
  {name:"Slate",                    lean:"left",         rss:"https://slate.com/feeds/all.rss"},
  {name:"Vox",                      lean:"left",         rss:"https://www.vox.com/rss/index.xml"},
  {name:"The Nation",               lean:"left",         rss:"https://www.thenation.com/feed/?post_type=article"},
  {name:"Al Jazeera",               lean:"left",         rss:"https://www.aljazeera.com/xml/rss/all.xml"},
  {name:"Daily Beast",              lean:"left",         rss:"https://feeds.feedburner.com/thedailybeast/articles"},
  {name:"New Yorker",               lean:"left",         rss:"https://www.newyorker.com/feed/everything"},
  {name:"Jacobin",                  lean:"left",         rss:"https://jacobin.com/feed/"},
  {name:"The Intercept",            lean:"left",         rss:"https://theintercept.com/feed/?rss"},
  {name:"Democracy Now",            lean:"left",         rss:"https://www.democracynow.org/democracynow.rss"},
  {name:"MSNBC",                    lean:"left",         rss:"https://feeds.nbcnews.com/msnbc/public/news"},
  // ── LEFT-CENTER ──
  {name:"CNN",                      lean:"left-center",  rss:"http://rss.cnn.com/rss/edition.rss"},
  {name:"NPR",                      lean:"left-center",  rss:"https://feeds.npr.org/1001/rss.xml"},
  {name:"BBC",                      lean:"left-center",  rss:"http://feeds.bbci.co.uk/news/rss.xml"},
  {name:"NBC News",                 lean:"left-center",  rss:"http://feeds.nbcnews.com/nbcnews/public/news"},
  {name:"ABC News",                 lean:"left-center",  rss:"https://feeds.abcnews.com/abcnews/topstories"},
  {name:"CBS News",                 lean:"left-center",  rss:"https://www.cbsnews.com/latest/rss/main"},
  {name:"Politico",                 lean:"left-center",  rss:"https://www.politico.com/rss/politicopicks.xml"},
  {name:"Newsweek",                 lean:"left-center",  rss:"https://www.newsweek.com/rss"},
  {name:"The Hill",                 lean:"left-center",  rss:"https://thehill.com/news/feed/"},
  {name:"Bloomberg",                lean:"left-center",  rss:"https://feeds.bloomberg.com/politics/news.rss"},
  {name:"Axios",                    lean:"left-center",  rss:"https://api.axios.com/feed/"},
  {name:"PBS NewsHour",             lean:"left-center",  rss:"https://www.pbs.org/newshour/feeds/rss/headlines"},
  {name:"Time",                     lean:"left-center",  rss:"https://time.com/feed/"},
  {name:"USA Today",                lean:"left-center",  rss:"https://www.usatoday.com/rss/news/"},
  {name:"CNBC",                     lean:"left-center",  rss:"https://www.cnbc.com/id/100003114/device/rss/rss.html"},
  {name:"Business Insider",         lean:"left-center",  rss:"https://feeds2.feedburner.com/businessinsider"},
  {name:"ProPublica",               lean:"left-center",  rss:"https://www.propublica.org/feeds/propublica/main"},
  {name:"Foreign Policy",           lean:"left-center",  rss:"https://foreignpolicy.com/feed/"},
  {name:"Wired",                    lean:"left-center",  rss:"https://www.wired.com/feed/rss"},
  {name:"Scientific American",      lean:"left-center",  rss:"https://www.scientificamerican.com/feed/"},
  // ── CENTER ──
  {name:"Reuters",                  lean:"center",       rss:"https://feeds.reuters.com/reuters/topNews"},
  {name:"Associated Press",         lean:"center",       rss:"https://feeds.apnews.com/APTopNews"},
  {name:"The Economist",            lean:"center",       rss:"https://www.economist.com/the-world-this-week/rss.xml"},
  {name:"Financial Times",          lean:"center",       rss:"https://www.ft.com/rss/home/uk"},
  {name:"Straight Arrow News",      lean:"center",       rss:"https://san.com/feed/"},
  {name:"The Dispatch",             lean:"center",       rss:"https://thedispatch.com/feed/"},
  {name:"Christian Science Monitor",lean:"center",       rss:"https://rss.csmonitor.com/feeds/all"},
  {name:"Deutsche Welle",           lean:"center",       rss:"https://rss.dw.com/xml/rss-en-all"},
  {name:"France 24",                lean:"center",       rss:"https://www.france24.com/en/rss"},
  {name:"NewsNation",               lean:"center",       rss:"https://www.newsnationnow.com/feed/"},
  {name:"RealClearPolitics",        lean:"center",       rss:"https://www.realclearworld.com/xml/RCW.xml"},
  {name:"The Week",                 lean:"center",       rss:"https://theweek.com/rss"},
  {name:"Semafor",                  lean:"center",       rss:"https://www.semafor.com/feed"},
  {name:"Tangle",                   lean:"center",       rss:"https://www.readtangle.com/feed"},
  // ── RIGHT-CENTER ──
  {name:"Wall Street Journal",      lean:"right-center", rss:"https://feeds.a.dj.com/rss/RSSWorldNews.xml"},
  {name:"Washington Examiner",      lean:"right-center", rss:"https://www.washingtonexaminer.com/rss"},
  {name:"New York Post",            lean:"right-center", rss:"https://nypost.com/feed/"},
  {name:"Forbes",                   lean:"right-center", rss:"https://www.forbes.com/real-time/feed2/"},
  {name:"Reason",                   lean:"right-center", rss:"https://reason.com/feed/"},
  {name:"Newsmax",                  lean:"right-center", rss:"https://www.newsmax.com/rss/news/1/"},
  {name:"Washington Times",         lean:"right-center", rss:"https://www.washingtontimes.com/rss/headlines/news/politics/"},
  {name:"Epoch Times",              lean:"right-center", rss:"https://www.theepochtimes.com/c-us-politics/feed"},
  {name:"Daily Mail",               lean:"right-center", rss:"https://www.dailymail.co.uk/articles.rss"},
  {name:"Just The News",            lean:"right-center", rss:"https://justthenews.com/feed"},
  {name:"The Free Press",           lean:"right-center", rss:"https://www.thefp.com/feed"},
  {name:"Mediaite",                 lean:"right-center", rss:"https://www.mediaite.com/feed/"},
  // ── RIGHT ──
  {name:"Fox News",                 lean:"right",        rss:"https://moxie.foxnews.com/google-publisher/latest.xml"},
  {name:"Breitbart",                lean:"right",        rss:"https://feeds.feedburner.com/breitbart"},
  {name:"National Review",          lean:"right",        rss:"https://www.nationalreview.com/feed/"},
  {name:"The Federalist",           lean:"right",        rss:"https://thefederalist.com/feed/"},
  {name:"Daily Wire",               lean:"right",        rss:"https://www.dailywire.com/feeds/rss.xml"},
  {name:"Daily Caller",             lean:"right",        rss:"https://dailycaller.com/feed/"},
  {name:"Townhall",                 lean:"right",        rss:"https://townhall.com/rss/columns"},
  {name:"TheBlaze",                 lean:"right",        rss:"https://www.theblaze.com/feeds/feed.rss"},
  {name:"American Conservative",    lean:"right",        rss:"https://www.theamericanconservative.com/feed/"},
  {name:"American Spectator",       lean:"right",        rss:"https://spectator.org/feed/"},
];

const GOOGLE_NEWS_FEEDS=[
  // ── TOP ──
  {name:"GN — Top Stories",        lean:"center", rss:"https://news.google.com/rss?ceid=US:en&hl=en-US&gl=US"},

  // ── NATION & WORLD ──
  {name:"GN — U.S.",               lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/NATION?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — World",              lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/WORLD?ceid=US:en&hl=en-US&gl=US"},

  // ── POLITICS ──
  {name:"GN — Politics",           lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/POLITICS?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Elections",          lean:"center", rss:"https://news.google.com/rss/search?q=election+US&ceid=US:en&hl=en-US&gl=US"},

  // ── BUSINESS & ECONOMY ──
  {name:"GN — Business",           lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/BUSINESS?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Economy",            lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/ECONOMY?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Personal Finance",   lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/PERSONAL_FINANCE?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Jobs",               lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/JOBS?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Real Estate",        lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/REAL_ESTATE?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Energy",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/ENERGY?ceid=US:en&hl=en-US&gl=US"},

  // ── TECHNOLOGY ──
  {name:"GN — Technology",         lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — AI",                 lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?ceid=US:en&hl=en-US&gl=US&q=artificial+intelligence"},
  {name:"GN — Cybersecurity",      lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/CYBERSECURITY?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Internet",           lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/INTERNET?ceid=US:en&hl=en-US&gl=US"},

  // ── SCIENCE & ENVIRONMENT ──
  {name:"GN — Science",            lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/SCIENCE?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Environment",        lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/ENVIRONMENT?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Climate",            lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/CLIMATE?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Space",              lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/SPACE?ceid=US:en&hl=en-US&gl=US"},

  // ── HEALTH ──
  {name:"GN — Health",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/HEALTH?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Mental Health",      lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/MENTAL_HEALTH?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Nutrition",          lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/NUTRITION?ceid=US:en&hl=en-US&gl=US"},

  // ── ENTERTAINMENT ──
  {name:"GN — Entertainment",      lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Movies",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/MOVIES?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Music",              lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/MUSIC?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — TV",                 lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/TELEVISION?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Celebrity",          lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/CELEBRITY?ceid=US:en&hl=en-US&gl=US"},

  // ── SPORTS ──
  {name:"GN — Sports",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/SPORTS?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — NFL",                lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/NFL?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — NBA",                lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/NBA?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — MLB",                lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/MLB?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — NHL",                lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/NHL?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — College Sports",     lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/COLLEGE_SPORTS?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Soccer",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/SOCCER?ceid=US:en&hl=en-US&gl=US"},

  // ── LIFESTYLE ──
  {name:"GN — Food",               lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/FOOD?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Travel",             lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/TRAVEL?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Autos",              lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/AUTO?ceid=US:en&hl=en-US&gl=US"},
  {name:"GN — Education",          lean:"center", rss:"https://news.google.com/rss/headlines/section/topic/EDUCATION?ceid=US:en&hl=en-US&gl=US"},
];


// ── NLP helpers ──────────────────────────────────────────────────────────
const TOPIC_KW={
  Politics:["trump","biden","congress","senate","election","democrat","republican","president","white house","vote","campaign","supreme court","gop","legislation","governor","mayor","political","harris","maga"],
  Economy:["economy","market","stock","inflation","fed","interest rate","gdp","recession","jobs","unemployment","trade","tariff","budget","deficit","debt","bank","financial","wall street","dollar","oil","prices","earnings","revenue","billion"],
  Conflict:["war","attack","military","troops","missile","bomb","explosion","killed","dead","casualties","fighting","ceasefire","invasion","battle","terrorist","nato","defense","drone","shooting","hostage","siege"],
  Climate:["climate","environment","weather","hurricane","flood","wildfire","earthquake","storm","emissions","carbon","green","renewable","temperature","drought","tornado","blizzard","heat wave"],
  Tech:["ai","artificial intelligence","technology","cyber","hack","data","silicon valley","apple","google","microsoft","meta","twitter","x.com","social media","software","robot","privacy","chip","openai","tesla","startup","app","iphone","android"],
  Health:["health","covid","virus","vaccine","cancer","drug","fda","cdc","hospital","medicine","disease","outbreak","mental health","opioid","obesity","surgery","treatment","pandemic","alzheimer"],
  Science:["science","nasa","space","research","study","discovery","biology","physics","gene","dna","planet","species","asteroid","climate study","experiment"],
  Sports:["nfl","nba","mlb","nhl","soccer","football","basketball","baseball","hockey","tennis","golf","olympics","championship","playoff","super bowl","world cup","league","coach","player","trade","draft","score","win","loss","stadium"],
  Entertainment:["movie","film","show","series","album","song","music","celebrity","actor","actress","director","netflix","disney","hbo","award","oscar","grammy","emmy","concert","tour","release","box office","streaming","spotify"],
  Business:["company","ceo","merger","acquisition","ipo","startup","earnings","revenue","profit","loss","layoff","hire","corporate","deal","investment","fund","venture","brand","retail","amazon","walmart","target"]
};

const REGION_KW={
  "US & Americas":["washington","new york","california","texas","florida","chicago","los angeles","boston","atlanta","seattle","miami","houston","philadelphia","phoenix","u.s.","united states","american","america","canada","mexico","brazil","latin america","pentagon","capitol"],
  Europe:["europe","uk","britain","england","france","germany","russia","ukraine","eu","nato","poland","spain","italy","greece","brussels","london","paris","berlin","sweden","norway","finland","denmark","netherlands","switzerland"],
  Asia:["china","japan","korea","india","pakistan","taiwan","hong kong","southeast asia","vietnam","thailand","indonesia","philippines","beijing","tokyo","shanghai","delhi","mumbai","singapore","myanmar","bangladesh","sri lanka"],
  "Middle East":["israel","gaza","iran","iraq","syria","saudi","yemen","lebanon","jordan","palestine","hamas","hezbollah","middle east","tehran","riyadh","tel aviv","west bank","netanyahu"],
  Africa:["africa","nigeria","kenya","ethiopia","south africa","libya","somalia","congo","sudan","ghana","tanzania","morocco","egypt","algeria","zimbabwe","mozambique"],
  "Latin America":["mexico","brazil","argentina","colombia","venezuela","chile","peru","cuba","haiti","guatemala","honduras","nicaragua","panama","ecuador","bolivia"]
};

const TOPIC_EMOJI={Politics:"🏛️",Economy:"📈",Conflict:"⚔️",Climate:"🌍",Tech:"💻",Health:"🏥",Science:"🔬",General:"📰"};

function stripHTML(h){return(h||"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").trim();}

function extractImage(item, outletName){
  // Get description text — DOMParser auto-strips CDATA wrappers
  const desc = item.querySelector("description,content,summary")?.textContent || "";

  // DEBUG: log first item per outlet to see what we're working with
  if(outletName && !extractImage._logged) extractImage._logged={};
  if(outletName && !extractImage._logged[outletName]){
    extractImage._logged[outletName]=true;
    console.log("[IMG DEBUG]",outletName,"desc snippet:",desc.slice(0,300));
  }

  // 1. media:content or media:thumbnail (native RSS feeds)
  const media = item.querySelector("content,thumbnail");
  if(media){ const u=media.getAttribute("url"); if(u&&u.startsWith("http"))return u; }

  // 2. enclosure tag
  const enc = item.querySelector("enclosure");
  if(enc){ const u=enc.getAttribute("url"); if(u&&u.startsWith("http"))return u; }

  // 3. media:group > media:content
  const mgc = item.querySelector("group content");
  if(mgc){ const u=mgc.getAttribute("url"); if(u&&u.startsWith("http"))return u; }

  // 4. <img src> directly in description (Google News CDATA contains raw HTML)
  const m1 = desc.match(/<img[^>]+src="(https?:[^"]+)"/i);
  if(m1) return m1[1];

  const m2 = desc.match(/<img[^>]+src='(https?:[^']+)'/i);
  if(m2) return m2[1];

  // 5. After entity decode (some feeds double-encode the HTML)
  const decoded = desc.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const m3 = decoded.match(/<img[^>]+src="(https?:[^"]+)"/i);
  if(m3) return m3[1];

  // 6. Any googleusercontent proxy URL (no extension, but valid image)
  const m4 = desc.match(/(https?:\/\/(?:lh\d+\.googleusercontent\.com|encrypted-tbn\d+\.gstatic\.com)[^\s"'<>]*)/i);
  if(m4) return m4[1];

  // 7. Any URL with an image extension as last resort
  const m5 = desc.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
  if(m5) return m5[1];

  return null;
}

async function fetchRSS(outlet){
  try{
    const res=await fetch(`/rss?url=${encodeURIComponent(outlet.rss)}`,{signal:AbortSignal.timeout(10000)});
    if(!res.ok){
      console.warn(`${outlet.name}: HTTP ${res.status}`);
      return[];
    }
    const text=await res.text();
    if(!text||text.length<100){
      console.warn(`${outlet.name}: empty response`);
      return[];
    }
    const doc=new DOMParser().parseFromString(text,"text/xml");
    const parseErr=doc.querySelector("parsererror");
    if(parseErr){
      console.warn(`${outlet.name}: XML parse error`,parseErr.textContent.slice(0,80));
      return[];
    }
    const items=[...doc.querySelectorAll("item, entry")];
    const cutoff=Date.now()-(24*60*60*1000);
    return items.filter(item=>{
      const pd=item.querySelector("pubDate,published,updated")?.textContent||"";
      if(!pd)return true; // keep if no date
      const age=Date.now()-new Date(pd).getTime();
      return age<24*60*60*1000;
    }).map(item=>{
      const title=stripHTML(item.querySelector("title")?.textContent||"");
      const link=(item.querySelector("link")?.textContent||item.querySelector("link")?.getAttribute("href")||"").trim();
      const desc=stripHTML(item.querySelector("description")?.textContent||item.querySelector("summary")?.textContent||"").slice(0,250);
      const pubDate=item.querySelector("pubDate")?.textContent||item.querySelector("published")?.textContent||item.querySelector("updated")?.textContent||"";
      const image=extractImage(item, outlet.name);
      return title&&link?{title,link,desc,pubDate,image,outlet}:null;
    }).filter(Boolean);
  }catch(e){
    console.warn(`${outlet.name} failed:`,e.message);
    return[];
  }
}

function getKeywords(h){
  const stop=new Set(["the","a","an","in","on","at","to","for","of","and","or","but","is","are","was","were","has","have","had","that","this","with","from","by","as","it","its","says","said","new","over","after","before","into","about","its","their","who","what","how","than","more","will","been"]);
  return h.toLowerCase().replace(/[^\w\s]/g,"").split(/\s+/).filter(w=>w.length>3&&!stop.has(w));
}
function classifyTopic(t){const tl=t.toLowerCase();for(const[k,kw]of Object.entries(TOPIC_KW))if(kw.some(w=>tl.includes(w)))return k;return"General";}
function classifyRegion(t){
  if(!t||typeof t!=="string")return"US & Americas";
  const tl=t.toLowerCase();
  for(const[k,kw]of Object.entries(REGION_KW))if(kw.some(w=>tl.includes(w)))return k==="Middle_East"?"Middle East":k;
  // Default to US & Americas for unmatched stories (most are US-focused)
  return"US & Americas";
}

function extractTags(text){
  if(!text||typeof text!=="string")return[];
  const stop=new Set(["The","A","An","In","On","At","To","For","Of","And","Or","But","Is","Are","Was","Were","Has","Have","Had","That","This","With","From","By","As","It","Its","Says","Said","After","Before","Over","After","New","How","What","Who","Why","When","Where","After","More","Than","Will","Been","Just","Also","Now","Here","There","About","After","Still","First","Last","After","Next","He","She","They","We","You","I"]);
  const junk=new Set(["Null","Undefined","True","False","None","Html","Css","Rss","Xml","Http","Https"]);
  const tags=new Set();
  const re=/([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,2})/g;
  let m;
  while((m=re.exec(text))!==null){
    const p=m[1].trim();
    if(!stop.has(p)&&!junk.has(p)&&p.length>=4&&p.length<=30&&!/^\d/.test(p)){
      tags.add(p);
    }
    if(tags.size>=5)break;
  }
  return[...tags].slice(0,5);
}

function similarity(h1,h2){
  const k1=new Set(getKeywords(h1)),k2=new Set(getKeywords(h2));
  if(!k1.size||!k2.size)return 0;
  let n=0;k1.forEach(k=>{if(k2.has(k))n++;});
  return n/Math.min(k1.size,k2.size);
}


// ── RSS fetch + parse ────────────────────────────────────────────────────
async function fetchFeed(outlet) {
  try {
    const res = await fetch(outlet.rss, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WoodsWildNews RSS Reader)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      cf: { cacheTtl: 300 },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Parse XML using regex (no DOM in Workers)
    const items = [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const raw = match[1] || match[2];
      const get = (tag) => {
        const m = raw.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`, "i"));
        return m ? m[1].trim() : "";
      };
      const getAttr = (tag, attr) => {
        const m = raw.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i"));
        return m ? m[1].trim() : "";
      };
      const title = stripHTML(get("title"));
      const link  = (get("link") || getAttr("link","href")).trim();
      const desc  = stripHTML(get("description") || get("summary") || get("content")).slice(0, 300);
      const pub   = get("pubDate") || get("published") || get("updated");

      if (!title || !link) continue;
      if (pub && Date.now() - new Date(pub).getTime() > 24 * 60 * 60 * 1000) continue;

      // Extract image from media tags or description
      const mediaUrl = getAttr("content","url") || getAttr("thumbnail","url") || getAttr("enclosure","url");
      let image = null;
      if (mediaUrl && mediaUrl.startsWith("http")) {
        image = mediaUrl;
      } else {
        const descRaw = get("description") || get("summary") || "";
        const imgM = descRaw.match(/<img[^>]+src=["'](https?:[^"\']+)["']/i);
        if (imgM) image = imgM[1];
        if (!image) {
          const gcM = descRaw.match(/(https?:\/\/(?:lh\d+\.googleusercontent\.com|encrypted-tbn\d+\.gstatic\.com)[^\s"'<>]*)/i);
          if (gcM) image = gcM[1];
        }
        if (!image) {
          const extM = descRaw.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
          if (extM) image = extM[1];
        }
      }

      items.push({ title, link, desc, pubDate: pub, image, outlet });
    }
    return items;
  } catch(e) {
    return [];
  }
}

// ── Build cache ───────────────────────────────────────────────────────────
async function buildCache(env) {
  const allOutlets = [...OUTLETS, ...GOOGLE_NEWS_FEEDS];
  console.log(`[WWN] Fetching ${allOutlets.length} feeds...`);

  // Fetch all feeds in parallel batches of 10
  const all = [];
  const batchSize = 10;
  for (let i = 0; i < allOutlets.length; i += batchSize) {
    const batch = allOutlets.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(o => fetchFeed(o)));
    results.forEach(r => all.push(...r));
  }
  console.log(`[WWN] Fetched ${all.length} articles`);

  // Sort newest first
  all.sort((a,b) => (b.pubDate ? new Date(b.pubDate) : 0) - (a.pubDate ? new Date(a.pubDate) : 0));

  // Cluster
  // Sort by date newest first
  all.sort((a,b)=>(b.pubDate?new Date(b.pubDate):0)-(a.pubDate?new Date(a.pubDate):0));

  // Cluster similar headlines
  const clusters=[],used=new Set();
  all.forEach((item,i)=>{
    if(used.has(i))return;
    const text=item.title+" "+item.desc;
    const region=classifyRegion(text)||item.outlet.region||"US & Americas";
    const cluster={
      headline:item.title,
      excerpt:item.desc,
      topic:classifyTopic(text),
      region,
      tags:extractTags(item.title),
      pubDate:item.pubDate,
      image:item.image||null,
      sources:[{name:item.outlet.name,lean:item.outlet.lean,url:item.link,image:item.image||null,desc:item.desc||''}]
    };
    used.add(i);
    all.forEach((other,j)=>{
      if(used.has(j)||j===i||other.outlet.name===item.outlet.name)return;
      if(similarity(item.title,other.title)>=0.55){
        cluster.sources.push({name:other.outlet.name,lean:other.outlet.lean,url:other.link,image:other.image||null,desc:other.desc||''});
        used.add(j);
        if(!cluster.image&&other.image)cluster.image=other.image;
      }
    });
    // If no image found yet, scan all sources for any image
    if(!cluster.image){
      for(const s of cluster.sources){if(s.image){cluster.image=s.image;break;}}
    }
    clusters.push(cluster);
  });

  clusters.sort((a,b)=>b.sources.length-a.sources.length||((b.pubDate?new Date(b.pubDate):0)-(a.pubDate?new Date(a.pubDate):0)));
  const allClusters=clusters.slice(0,2000);

  console.log(`[WWN] Clustered into ${allClusters.length} stories`);

  const payload = JSON.stringify({
    clusters: allClusters,
    built: new Date().toISOString(),
    articleCount: all.length,
    feedCount: allOutlets.length,
  });

  await env.WWN_CACHE.put(CACHE_KEY, payload, { expirationTtl: CACHE_TTL * 2 });
  console.log(`[WWN] Cache written to KV`);
  return allClusters.length;
}

// ── CORS headers ──────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  // HTTP requests
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // /rss proxy (kept for fallback)
    if (path === "/rss") {
      const feedUrl = url.searchParams.get("url");
      if (!feedUrl) return new Response("Missing ?url=", { status: 400 });
      try {
        const res  = await fetch(feedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WoodsWildNews RSS Reader)" },
        });
        const text = await res.text();
        return new Response(text, {
          headers: { ...CORS, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=120" },
        });
      } catch(e) {
        return new Response(`RSS fetch failed: ${e.message}`, { status: 502, headers: CORS });
      }
    }

    // /api/news — serve cached clusters
    if (path === "/api/news") {
      let cached = await env.WWN_CACHE.get(CACHE_KEY);
      if (!cached) {
        // No cache yet — build it now
        await buildCache(env);
        cached = await env.WWN_CACHE.get(CACHE_KEY);
      }
      if (!cached) {
        return new Response(JSON.stringify({ error: "Cache unavailable" }), {
          status: 503, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      return new Response(cached, {
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }
      });
    }

    // /api/refresh — manual trigger
    if (path === "/api/refresh") {
      const count = await buildCache(env);
      return new Response(JSON.stringify({ ok: true, stories: count, built: new Date().toISOString() }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Static assets
    return env.ASSETS.fetch(request);
  },

  // Cron trigger — runs every hour
  async scheduled(event, env, ctx) {
    ctx.waitUntil(buildCache(env));
  },
};
