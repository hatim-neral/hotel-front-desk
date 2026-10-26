import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works on GitHub Pages (served from /<repo>/) and inside a mobile app wrapper
  base: './',
})
