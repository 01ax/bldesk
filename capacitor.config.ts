import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.termau.bldesk',
  appName: 'BLDesk',
  webDir: 'out/renderer',
  // Capacitor's default 'debug' logging prints every native plugin call to
  // logcat, including request headers - which put the account's bearer token in
  // the device log in plaintext on release builds.
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    CapacitorCookies: {
      enabled: true
    }
  }
};

export default config;
