import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Use relative paths so the built app works in Android WebView (file:// protocol)
  server: {
    host: '0.0.0.0', // Listen on all network interfaces to allow mobile network access
    port: 5173,
    cors: true,
    strictPort: true,
    allowedHosts: true // Allow public tunnel domains (like localhost.run) to bypass Vite's Host check
  },
  preview: {
    host: '0.0.0.0', // Expose preview server on local network
    port: 4173,
    cors: true,
    strictPort: true,
    allowedHosts: true // Allow public tunnel domains (like localhost.run) to bypass Vite's Host check
  }
});
