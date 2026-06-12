import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy /bff to Express BFF in development
      '/bff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
