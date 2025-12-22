import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true, // Crutial for Docker to detect file changes
    },
    host: true, // Listen on all addresses, needed for Docker
    strictPort: true,
    port: 3000,
  },
})
