# Avantika EduAI — Deployment Status

## URLs

| Service | URL |
|---------|-----|
| **Backend (Azure App Service)** | https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net |
| **Frontend (Vercel)** | https://avantika-edu-ai.vercel.app |
| **Health check** | https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/health |
| **Database** | NeonDB (PostgreSQL) — connection via `DATABASE_URL` App Setting |

## Current deployment state

- **Azure App Service resource name**: `avantika-interview-api`
- **GitHub Actions workflow**: `.github/workflows/main_avantika-eduai-api.yml`
- **Trigger**: push to `main` branch, or `workflow_dispatch` (manual)
- **Deploy strategy**: Source-only artifact + Azure Oryx (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`) runs `npm install` during deployment. This is required so Puppeteer downloads Chrome into Azure persistent storage (`/home/.cache/puppeteer`) rather than a CI runner that gets thrown away.

## Required Azure App Settings

Set these in Azure Portal → App Service `avantika-interview-api` → Configuration → Application Settings:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Enables fail-fast guard, disables debug routes |
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` | Get from NeonDB dashboard |
| `JWT_SECRET` | (strong 48-byte hex — see below) | **Never reuse the dev secret** |
| `CLIENT_URL` | `https://avantika-edu-ai.vercel.app` | CORS allowlist |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Enables Oryx — runs npm install on deploy |
| `PUPPETEER_CACHE_DIR` | `/home/.cache/puppeteer` | Chrome persists across deploys |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` | Pins Node 20 LTS |
| `AI_PROVIDER` | `anthropic` | or `openai` depending on your setup |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | If `AI_PROVIDER=anthropic` |
| `AI_PLATFORM_URL` | `https://shared-ai-platform-...azurewebsites.net` | If using shared platform |
| `AI_PLATFORM_API_KEY` | (your key) | If using shared platform |
| `RAZORPAY_KEY_ID` | `rzp_live_...` | Production key |
| `RAZORPAY_KEY_SECRET` | (your secret) | Production secret |

**Generate a strong JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Required Vercel Environment Variables

Set in Vercel → Project → Settings → Environment Variables → **Production**:

| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/api` |

After setting, trigger a redeploy in Vercel.

## Health check

```bash
curl https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/health
# Expected after Express deploy: {"status":"ok","service":"Avantika EduAI API","version":"2.0.0"}
# Current (NestJS, pre-deploy): {"status":"UP"}
```

## Production API smoke tests

Run after deploying the Express backend:

```bash
BASE="https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net"

# 1. Health
curl "$BASE/health"

# 2. Signup
curl -s -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test123","role":"teacher"}' | jq .

# 3. Duplicate email (expect 409)
curl -s -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test123"}' | jq .

# 4. Login
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' | jq .

# 5. Wrong password (expect 401)
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' | jq .
```

## Launch checklist

### Azure App Service
- [ ] All required App Settings configured (see table above)
- [ ] `SCM_DO_BUILD_DURING_DEPLOYMENT=true` set
- [ ] GitHub Actions workflow triggered (push to main or manual dispatch)
- [ ] Deployment completed — check GitHub Actions tab
- [ ] Health endpoint returns `{"status":"ok","service":"Avantika EduAI API","version":"2.0.0"}`
- [ ] Signup curl test returns 201 with token
- [ ] Login curl test returns 200 with token
- [ ] Duplicate signup returns 409

### Vercel (Frontend)
- [ ] `VITE_API_BASE_URL` env var set in Vercel project settings
- [ ] Vercel redeploy triggered
- [ ] Browser: signup at https://avantika-edu-ai.vercel.app/signup works
- [ ] Browser: login works, redirects to /dashboard
- [ ] Browser: page refresh keeps session (token in localStorage)
- [ ] Browser: wrong password shows toast error "Invalid email or password"
- [ ] Browser: duplicate email shows toast error "Email already registered"
- [ ] Browser: logout clears session and redirects to /login

### CORS
- [ ] `CLIENT_URL=https://avantika-edu-ai.vercel.app` in Azure App Settings
- [ ] If custom domain added later, append to `CLIENT_URL` as comma-separated value:
  `https://avantika-edu-ai.vercel.app,https://www.yourdomain.com`

## Known issues / notes

- **Pre-deploy state**: The Azure App Service currently runs an older NestJS app. The first push to main via GitHub Actions will overwrite it with the Express app.
- **Puppeteer cold start**: First request to any PDF-generation endpoint after a fresh deploy will be slow (~30s) while Puppeteer downloads Chrome to `/home/.cache/puppeteer`. Subsequent requests are fast.
- **Rate limiting**: Production API is rate-limited to 60 req / 15 min per IP. Adjust in `src/index.js` if needed.
- **Frontend bundle size**: The production JS bundle is ~672 KB (203 KB gzip). Consider code-splitting via React lazy() if load time is a concern.
