import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function removeCrossOrigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), removeCrossOrigin()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
})
