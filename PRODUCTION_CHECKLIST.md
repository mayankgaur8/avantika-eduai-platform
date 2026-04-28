# Avantika EduAI — Production Checklist

## Azure App Settings (required before first deploy)

Set these in: **Azure Portal → avantika-interview-api → Configuration → Application settings**

| Setting | Value | Required |
|---------|-------|----------|
| `NODE_ENV` | `production` | ✅ |
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` | ✅ |
| `JWT_SECRET` | random 48-byte hex string | ✅ |
| `CLIENT_URL` | `https://avantika-edu-ai.vercel.app` | ✅ |
| `AI_PROVIDER` | `groq` | ✅ |
| `GROQ_API_KEY` | key from console.groq.com/keys | ✅ |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | ✅ |
| `AI_PLATFORM_URL` | `https://shared-ai-platform-...azurewebsites.net` | optional |
| `AI_PLATFORM_API_KEY` | platform key | optional |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | ✅ |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` | ✅ |
| `RAZORPAY_KEY_ID` | Razorpay live key | for payments |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | for payments |

Generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## GitHub Secrets (required for CI/CD)

In: **github.com/mayankgaur8/avantika-eduai-platform → Settings → Secrets → Actions**

| Secret | How to get |
|--------|------------|
| `AZUREAPPSERVICE_PUBLISHPROFILE` | Azure Portal → avantika-interview-api → Get publish profile |

If publish profile download is greyed out:
1. Azure Portal → App Service → Configuration → General settings
2. Enable **SCM Basic Auth Publishing Credentials** → On
3. Enable **FTP Basic Auth Publishing Credentials** → On
4. Save → Restart → download again

## Vercel Environment Variables

In: **Vercel → Project → Settings → Environment Variables**

| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/api` |

After adding, redeploy: **Vercel → Deployments → latest → Redeploy**

## Health Checks

```bash
# Backend health
curl https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/health
# Expected: {"status":"ok","service":"Avantika EduAI API","version":"2.0.0"}

# Auth smoke test (expect 400/401, NOT 500 or HTML)
curl -s -X POST \
  https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"x@x.com","password":"wrong"}' | jq .
```

## Azure Log Stream — Expected Startup Lines

```
Avantika EduAI API v2.0 running on port 8080
[AI] provider=groq model=llama-3.1-8b-instant key_set=true
[DB] Connected successfully.
[DB] Tables verified/created.
```

If you see `[FATAL] Missing required env vars:` — re-check App Settings and restart.
If you see `key_set=false` — GROQ_API_KEY was not saved correctly.

## Deployment Trigger

```bash
# After adding GitHub secret, re-run latest failed workflow:
# GitHub → Actions → latest run → Re-run all jobs

# OR push a new commit:
git commit --allow-empty -m "chore: trigger deploy" && git push azure-prod main
```

## QA Checklist

### Auth
- [ ] Signup with new email → lands on dashboard
- [ ] Login with correct credentials → lands on dashboard
- [ ] Login with wrong password → shows "Invalid credentials"
- [ ] Refresh page while logged in → stays logged in
- [ ] Logout → redirects to home

### AI Generation
- [ ] Quiz Generator → enter topic → click Generate → quiz appears in ~15s
- [ ] Assignment Generator → enter topic → click Generate → assignment appears
- [ ] Question Paper Generator → click Generate → paper with 3 sections appears
- [ ] Generation failure → "Generation Failed" banner with Retry button appears
- [ ] Click Retry → retries without re-filling form

### Saved Papers
- [ ] After generating → appears in Saved Papers
- [ ] Delete item → removed from list
- [ ] Empty state shows "Generate Now" link

### Subscription
- [ ] Current plan shown correctly
- [ ] Upgrade button opens Razorpay modal
- [ ] Free plan button is disabled (not clickable)

### Mobile (test at 360px width)
- [ ] Dashboard home loads without horizontal scroll
- [ ] Stats cards show 3-column layout
- [ ] Mobile bottom nav visible and tappable
- [ ] Form fields are full-width (not 2-column)
- [ ] Sidebar slides in from hamburger tap
- [ ] All buttons are tappable (min height 44px)
- [ ] Subscription cards stack vertically

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `/health` times out | App Settings missing → `process.exit(1)` | Add all required App Settings, restart |
| `/health` returns `{"status":"UP"}` | Old NestJS app still running | Deploy Express app via GitHub Actions |
| "Invalid credentials" on correct password | `JWT_SECRET` changed between deployments | Keep same JWT_SECRET in App Settings |
| "AI provider request failed" | `GROQ_API_KEY` missing or invalid | Check App Settings, verify key at console.groq.com |
| GitHub Actions "No credentials found" | Secret not added to repo | Add `AZUREAPPSERVICE_PUBLISHPROFILE` to GitHub secrets |
| Vercel shows "Network Error" | `VITE_API_BASE_URL` not set | Add env var to Vercel and redeploy |
