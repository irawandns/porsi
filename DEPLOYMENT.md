# 🚀 GitHub Pages Deployment Guide

## Current Status

The Porsi app is configured and ready to deploy to GitHub Pages. A GitHub Actions workflow has been set up that will automatically deploy on every push to `main`.

## ⚠️ Required Manual Step

**The repository must be made PUBLIC to use GitHub Pages for free.**

### How to Enable Public Access

1. Go to https://github.com/irawandns/porsi/settings
2. Scroll down to the **Danger Zone**
3. Click **Change visibility**
4. Select **Make public**
5. Confirm the change

### Alternative (Paid)
If you have GitHub Pro/Team/Enterprise, you can keep the repo private and GitHub Pages will work.

## GitHub Pages Configuration

Once the repository is public:

1. Go to https://github.com/irawandns/porsi/settings/pages
2. Under **Build and deployment**:
   - Source: **GitHub Actions** (should be automatically selected)
3. The workflow will trigger on the next push to `main`

## What's Been Configured

### Vite Configuration
- `base: '/porsi/'` added to `vite.config.ts` for correct asset paths

### GitHub Actions Workflow
- File: `.github/workflows/deploy.yml`
- Triggers on: Push to `main` branch
- Steps:
  1. Checkout code
  2. Setup Node.js 20
  3. Install dependencies (`npm ci`)
  4. Build production bundle (`npm run build`)
  5. Upload build artifact
  6. Deploy to GitHub Pages

### Expected URL

Once deployed, the site will be available at:
```
https://irawandns.github.io/porsi/
```

## Deployment Process

After making the repo public:

```bash
# Merge the PR or push to main
git checkout main
git merge cursor/porsi-mvp-3d-plate-a056
git push origin main
```

The GitHub Actions workflow will:
1. Build the app
2. Deploy to GitHub Pages
3. Provide the live URL (typically takes 1-2 minutes)

## Verifying Deployment

1. Check the Actions tab: https://github.com/irawandns/porsi/actions
2. Look for the "Deploy to GitHub Pages" workflow
3. Once complete (green checkmark), visit https://irawandns.github.io/porsi/

## Troubleshooting

### Build Fails
- Check Actions logs at https://github.com/irawandns/porsi/actions
- Ensure all dependencies are in `package.json`

### 404 Not Found
- Verify Pages is enabled in Settings → Pages
- Ensure Source is set to "GitHub Actions"
- Check that base path is `/porsi/` in `vite.config.ts`

### Assets Not Loading
- Confirm `base` in `vite.config.ts` matches repo name
- Clear browser cache and reload
