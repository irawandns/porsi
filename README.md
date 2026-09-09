# 🍚 Porsi

**Indonesia-first visual portion → calorie estimator**

Porsi helps users estimate calories by sculpting food volume on a **3D plate** to match what they see in real life — especially **nasi (rice)** — without needing a kitchen scale. Train your eye for good-enough calorie tracking with honest error margins (±20%), not lab precision.

![Porsi Screenshot](https://img.shields.io/badge/status-MVP-green)

## 🌐 Live Demo

**⚠️ Setup Required**: The site will be available at **https://irawandns.github.io/porsi/** after completing the manual setup steps below.

### Required Steps to Enable GitHub Pages:

1. **Make Repository Public** (required for free GitHub Pages):
   - Go to https://github.com/irawandns/porsi/settings
   - Scroll to **Danger Zone** → **Change visibility**
   - Select **Make public** and confirm

2. **Enable GitHub Pages**:
   - Go to https://github.com/irawandns/porsi/settings/pages
   - Under **Build and deployment**:
     - Source: Select **GitHub Actions**
   - The workflow will automatically deploy on the next push

3. **Verify Deployment**:
   - Check https://github.com/irawandns/porsi/actions
   - Once the "Deploy to GitHub Pages" workflow completes (green ✓)
   - Visit https://irawandns.github.io/porsi/

See `DEPLOYMENT.md` for detailed deployment instructions and troubleshooting.

## 🎯 Concept

The 3D plate is your **teacher**, not just decoration. By interactively adjusting the size and shape of rice mounds (and other foods), you learn to visually estimate portions and their caloric content. This is particularly useful in Indonesia where rice is a staple and portion sizes vary widely between home, warung, and restaurant settings.

## ✨ Features

### Core Functionality
- **Interactive 3D Plate**: Orbit and zoom to view your plate from any angle
- **Sculptable Rice Mound**: Adjust width (X), length (Z), and height to match your real portion
- **Real-time Calculations**: Instant conversion from volume → grams → calories
- **Error Ranges**: Displays ±20% range (e.g., 150-230g, 195-293 kcal) for honest uncertainty
- **Indonesian Units**: Shows familiar measurements (sendok makan, centong)
- **Plate Size Presets**: 
  - 🏠 Piring Rumah (Home Plate) - standard 1.0x
  - 🍜 Piring Warung (Warung Plate) - larger 1.2x
  - 🥣 Mangkok (Bowl) - smaller 0.8x

### Additional Foods
- 🍗 Ayam Goreng (Fried Chicken) - ~180 kcal
- 🥚 Telur Rebus (Boiled Egg) - ~70 kcal

Toggle these on/off to see total meal calories.

### UI/UX
- 🌓 Dark/Light theme toggle
- 🇮🇩 Indonesian-friendly interface (Bahasa Indonesia labels)
- 📱 Responsive design (works on desktop and tablet)
- 🎨 Modern, clean aesthetic

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173` (or the next available port).

## 📐 Technical Details

### Volume & Calorie Calculations

The rice mound is modeled as an **ellipsoid** (more specifically, a hemisphere with adjustable radii):

```
Volume = (4/3) × π × radiusX × height × radiusZ
```

**Conversion Pipeline:**
1. Volume (dm³) → milliliters (ml)
2. Milliliters × density → grams
3. Grams × caloric density → kcal

### Assumptions & Constants

| Parameter | Value | Source/Rationale |
|-----------|-------|------------------|
| **Rice Density** | 1.15 g/ml | Cooked white rice (nasi putih) averages 1.0-1.3 g/ml; we use 1.15 as a middle ground |
| **Rice Calories** | 130 kcal/100g | Standard nutritional value for cooked white rice |
| **Error Margin** | ±20% | Realistic uncertainty for visual estimation without scales |
| **Sendok Makan** | ~15g rice | Indonesian tablespoon approximation |
| **Centong** | ~100g rice | Indonesian rice scoop approximation |

### Tech Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **3D Rendering**: React Three Fiber + Three.js
- **3D Helpers**: @react-three/drei (OrbitControls, Environment)
- **Styling**: Vanilla CSS with CSS custom properties (themes)

## 🎮 How to Use

1. **Adjust the Rice Mound**: Use the sliders in the control panel to change:
   - Width (X-axis): How wide the rice spreads
   - Length (Z-axis): How long the rice spreads
   - Height: How tall the rice mound is

2. **Choose Plate Size**: Select between Piring Rumah, Piring Warung, or Mangkok to match your actual plate

3. **Add Side Dishes**: Toggle Ayam Goreng or Telur Rebus if you have them on your plate

4. **View Estimates**: See real-time calorie and gram estimates with error ranges

5. **Rotate the Plate**: Click and drag on the 3D view to orbit around the plate. Scroll to zoom in/out.

## ⚠️ Known Limitations

### Out of Scope for MVP
- ❌ Camera/photo-based estimation
- ❌ User accounts or authentication
- ❌ Backend/database
- ❌ Comprehensive food database
- ❌ Nutritional tracking over time
- ❌ Photorealistic materials/rendering

### Accuracy Considerations
- **±20% error margin** is realistic for visual estimation
- Assumes **cooked white rice** (nasi putih) - fried rice, yellow rice, etc. have different densities
- Rice cooking method affects density (fluffier rice is less dense)
- Side dishes are **placeholder approximations** - actual calories vary by size and preparation
- No accounting for added butter, oil, or sauces

### Current Constraints
- Rice mound is modeled as smooth ellipsoid - real rice is irregular
- No support for mixed rice dishes (nasi goreng, nasi kuning)
- Limited to 2 side dishes as examples
- No mobile touch controls optimization yet

## 🛠️ Development

### Project Structure

```
porsi/
├── src/
│   ├── components/
│   │   ├── Plate3D.tsx       # 3D plate, rice, and food rendering
│   │   └── ControlPanel.tsx  # UI controls and estimates
│   ├── utils/
│   │   └── calculations.ts   # Volume/calorie math
│   ├── types.ts              # TypeScript interfaces
│   ├── styles.css            # Global styles
│   ├── App.tsx               # Main app component
│   └── main.tsx              # Entry point
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Key Files

- **`calculations.ts`**: All volume-to-calorie conversion logic
- **`types.ts`**: Constants (RICE_DENSITY, RICE_KCAL_PER_100G, ERROR_MARGIN) and interfaces
- **`Plate3D.tsx`**: Three.js scene with plate, rice mound, and OrbitControls
- **`ControlPanel.tsx`**: React component for all UI controls

## 🔮 Future Enhancements

Potential improvements (not in current scope):

- More food items (tempe, tahu, sayur, sambal, etc.)
- Better rice sculpting (free-form height map)
- Presets for common meals (nasi padang, nasi uduk, etc.)
- Photo overlay for visual comparison
- Save/load portion presets
- Progressive Web App (PWA) for offline use
- Multi-language support (EN/ID toggle)

## 📄 License

MIT License - feel free to use and modify.

## 🙏 Acknowledgments

Built with love for the Indonesian food tracking community. Selamat makan! 🇮🇩

---

**Promise**: Porsi helps you train your eye and track calories with honest uncertainty — not lab precision, but good enough for daily awareness.
