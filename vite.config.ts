import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Lists the images in public/posters as a virtual module; Scene3D picks one
// at random for the wall poster. The list is read when the dev server starts
// (or at build time) — restart/rebuild after adding posters.
function postersManifest() {
  const vid = 'virtual:posters'
  return {
    name: 'posters-manifest',
    resolveId(id) {
      if (id === vid) return '\0' + vid
    },
    load(id) {
      if (id !== '\0' + vid) return
      const dir = path.resolve(__dirname, 'public/posters')
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f))
        : []
      return `export default ${JSON.stringify(files.map((f) => '/posters/' + encodeURIComponent(f)))}`
    },
  }
}

// Same idea as postersManifest, for the extras-page photo gallery.
function galleryManifest() {
  const vid = 'virtual:gallery'
  return {
    name: 'gallery-manifest',
    resolveId(id) {
      if (id === vid) return '\0' + vid
    },
    load(id) {
      if (id !== '\0' + vid) return
      const dir = path.resolve(__dirname, 'public/gallery')
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f))
        : []
      return `export default ${JSON.stringify(files.map((f) => '/gallery/' + encodeURIComponent(f)))}`
    },
  }
}

export default defineConfig({
  server: {
    // Local dev: `npm run server` hosts the API on :3001; Vite proxies /api to it.
    proxy: { '/api': 'http://localhost:3001' },
  },
  plugins: [
    figmaAssetResolver(),
    postersManifest(),
    galleryManifest(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
