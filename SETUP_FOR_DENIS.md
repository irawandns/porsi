# 🚀 Porsi Deployment Setup for Denis

Hi Denis! Your Porsi app is fully built and configured for GitHub Pages deployment. Follow these simple steps to get it live.

## 🎯 What's Ready

✅ **Complete MVP** - All features implemented and working  
✅ **GitHub Actions Workflow** - Automatic deployment configured  
✅ **Vite Configuration** - Base path set for GitHub Pages  
✅ **Documentation** - README and deployment guide complete  

## 📋 Manual Steps Required (2-3 minutes)

### Step 1: Make Repository Public

GitHub Pages is free for **public repositories only**. To make your repo public:

1. Go to: https://github.com/irawandns/porsi/settings
2. Scroll down to the **Danger Zone** section
3. Click **"Change repository visibility"**
4. Select **"Make public"**
5. Type the repository name to confirm: `porsi`
6. Click **"I understand, make this repository public"**

**Why?** GitHub Pages requires a paid plan (Pro/Team/Enterprise) for private repositories.

### Step 2: Enable GitHub Pages

After making the repo public:

1. Go to: https://github.com/irawandns/porsi/settings/pages
2. Under **"Build and deployment"**:
   - **Source**: Select **"GitHub Actions"** from the dropdown
3. Click **Save** (if there's a save button)

That's it! The workflow should automatically trigger.

### Step 3: Wait for Deployment (1-2 minutes)

1. Go to: https://github.com/irawandns/porsi/actions
2. Look for the latest "Deploy to GitHub Pages" workflow
3. Wait for it to complete (green checkmark ✓)
4. Once complete, your site will be live at:

   **https://irawandns.github.io/porsi/**

## 🎉 Your Live URL

Once the steps above are complete, your app will be available at:

### **https://irawandns.github.io/porsi/**

Bookmark this URL and share it! The site will automatically update whenever you push to the `main` branch.

## 🔍 Verification Steps

After completing the setup:

1. **Check Workflow**: https://github.com/irawandns/porsi/actions
   - Should show a successful "Deploy to GitHub Pages" run (green ✓)
   
2. **Visit Site**: https://irawandns.github.io/porsi/
   - Should load the Porsi app with the 3D plate
   - Try adjusting the rice sliders
   - Toggle dark/light mode
   - Check that it's responsive

3. **Test Features**:
   - 3D plate rotates and zooms
   - Rice mound adjusts with sliders
   - Calorie estimates update in real-time
   - Plate size presets work
   - Food items can be toggled

## 🛠️ Troubleshooting

### Workflow Fails

**Problem**: Workflow shows a red X  
**Solution**: Check the error logs at https://github.com/irawandns/porsi/actions
- If it says "Pages not enabled": Follow Step 2 above
- If it's a build error: Check that all dependencies are in `package.json`

### 404 Not Found

**Problem**: Visiting the URL shows "404 Not Found"  
**Solution**:
1. Verify Pages is enabled in Settings → Pages
2. Check that Source is "GitHub Actions"
3. Wait 1-2 minutes after workflow completes
4. Clear browser cache and try again

### Assets Not Loading

**Problem**: Page loads but images/styles are broken  
**Solution**: 
- Verify `base: '/porsi/'` is in `vite.config.ts` (already done ✓)
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

## 📁 What's Been Configured

### Files Created/Modified

1. **`.github/workflows/deploy.yml`**
   - GitHub Actions workflow
   - Runs on every push to `main`
   - Builds and deploys automatically

2. **`vite.config.ts`**
   - Added `base: '/porsi/'` for correct GitHub Pages paths

3. **`DEPLOYMENT.md`**
   - Detailed deployment guide
   - Technical documentation

4. **`README.md`**
   - Added live demo section
   - Deployment instructions
   - Complete feature documentation

## 🎮 Local Development

To run locally (no deployment needed):

```bash
npm install
npm run dev
```

Visit http://localhost:5173

## 📊 Current Status

- ✅ Code pushed to `main` branch
- ✅ Workflow configured and committed
- ✅ Base path configured for GitHub Pages
- ⏳ **Waiting for**: Repository to be made public
- ⏳ **Waiting for**: GitHub Pages to be enabled
- ⏳ **Then**: Automatic deployment will complete

## 🆘 Need Help?

If you encounter any issues:

1. Check the Actions logs: https://github.com/irawandns/porsi/actions
2. Review `DEPLOYMENT.md` for detailed troubleshooting
3. Verify both Step 1 and Step 2 above are complete

## 🎊 After Deployment

Once live, you can:
- Share the URL with friends, colleagues, testers
- Embed it in your portfolio
- Make changes and push - it auto-deploys!
- Track usage via GitHub Insights

---

**Ready to launch?** Complete Steps 1 and 2 above, then enjoy your live Porsi app! 🍚🎉
