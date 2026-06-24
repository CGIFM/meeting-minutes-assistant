import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function removeCrossOrigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), removeCrossOrigin()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
})
