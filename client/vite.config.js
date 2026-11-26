import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// In dev the API (and uploaded logos) are proxied so the browser sees ONE origin –
// that is what lets the httpOnly refresh-token cookie work (SameSite=Strict).
//
// `npm run dev:lan` additionally serves HTTPS on the Wi-Fi address: Android Chrome only allows the
// CAMERA on https:// (or localhost), so the phone scanner needs it. The certificate is self-signed –
// on the phone tap "Advanced → Proceed" once.
const lan = process.env.VITE_HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(lan ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: lan ? true : 'localhost', // true = listen on all network interfaces
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
});
