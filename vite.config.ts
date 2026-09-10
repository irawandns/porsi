import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const getGitShortSha = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const getBuildTime = () => {
  return new Date().toISOString()
}

export default defineConfig({
  plugins: [react()],
  base: '/porsi/',
  define: {
    __BUILD_VERSION__: JSON.stringify(getGitShortSha()),
    __BUILD_TIME__: JSON.stringify(getBuildTime()),
  },
})
