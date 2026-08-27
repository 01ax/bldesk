import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.termau.bldesk',
  appName: 'BLDesk',
  webDir: 'out/renderer',
  server: {
    androidScheme: 'https'
  }
};

export default config;
