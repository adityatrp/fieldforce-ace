import type { CapacitorConfig } from '@capacitor/cli';

// FieldForce Pro — Capacitor wrapper config.
// Hot-reload from the Lovable sandbox so devs can iterate on the web build
// while running inside the native shell. Remove the `server.url` block before
// shipping a real Play Store / App Store build.
const config: CapacitorConfig = {
  appId: 'app.lovable.cb294b0728c2474086ef0a38c5114c04',
  appName: 'fieldforce-ace',
  webDir: 'dist',
  server: {
    url: 'https://cb294b07-28c2-4740-86ef-0a38c5114c04.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    BackgroundGeolocation: {
      // Plugin reads runtime options from JS — kept here for documentation.
    },
  },
};

export default config;
