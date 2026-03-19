# Wood's Wild News — Cloudflare Pages Deployment

Two files. No build step. Free hosting. Your API key never touches the browser.

```
wwn-cloudflare/
  index.html          ← the full app
  functions/
    api.js            ← Cloudflare Worker that proxies Anthropic calls
```

---

## Deploy in 10 minutes

### Step 1 — Get an Anthropic API key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in → **API Keys** → **Create Key**
3. Copy it — you'll need it in Step 4

### Step 2 — Push to GitHub
```bash
# Create a new repo on github.com first, then:
git clone https://github.com/YOUR_USERNAME/woods-wild-news.git
cd woods-wild-news
cp /path/to/index.html .
mkdir functions
cp /path/to/functions/api.js functions/
git add .
git commit -m "Initial deploy"
git push
```
Or just drag and drop both files into a new GitHub repo via the website.
Make sure the folder structure is exactly:
```
index.html
functions/api.js
```

### Step 3 — Connect to Cloudflare Pages
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up free if you don't have an account
3. Click **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
4. Authorize GitHub and select your repo
5. Under **Build settings**:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: *(leave blank)*
6. Click **Save and Deploy**

### Step 4 — Add your API key as a secret
1. After deploy, go to your Pages project → **Settings** → **Environment variables**
2. Click **Add variable**
3. Name: `ANTHROPIC_API_KEY`
4. Value: paste your `sk-ant-...` key
5. Check **Encrypt** so it's stored as a secret
6. Set for both **Production** and **Preview** environments
7. Click **Save**

### Step 5 — Redeploy
After adding the env variable, trigger a fresh deploy:
- Go to **Deployments** → click the three dots on the latest deploy → **Retry deployment**

Your site will be live at: `https://your-project-name.pages.dev`

---

## How it works

```
Browser → /api → Cloudflare Worker (functions/api.js)
                      ↓
              Anthropic API (key is here, server-side)
                      ↓
              Response back to browser
```

The browser never sees your API key. It just calls `/api` on your own domain. The Worker running on Cloudflare's servers holds the key and forwards requests to Anthropic.

---

## Cost

**Cloudflare Pages**: Free tier — 500 deploys/month, unlimited requests.

**Anthropic API**: Each page load makes 2 API calls (~2,000 tokens each).
At Claude Sonnet pricing that's roughly **$0.01 per session** or less.
Anthropic gives new accounts $5 free credit — enough for hundreds of sessions.

---

## Updating the app

Just push changes to GitHub — Cloudflare redeploys automatically within ~1 minute.
