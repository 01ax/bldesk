const fs = require('fs');
const path = require('path');

const iconPng = fs.readFileSync('C:/Users/adamw/bldesk/resources/icon.png');
const trayPng = fs.readFileSync('C:/Users/adamw/bldesk/resources/tray.png');
const tray16Png = fs.readFileSync('C:/Users/adamw/bldesk/resources/tray-16.png');

const content = `// Auto-generated embedded icons for guaranteed desktop rendering
export const APP_ICON_DATA_URL = 'data:image/png;base64,${iconPng.toString('base64')}'
export const TRAY_ICON_DATA_URL = 'data:image/png;base64,${trayPng.toString('base64')}'
export const TRAY_16_ICON_DATA_URL = 'data:image/png;base64,${tray16Png.toString('base64')}'
`

fs.writeFileSync('C:/Users/adamw/bldesk/src/main/embedded-icons.ts', content);
console.log('src/main/embedded-icons.ts generated successfully!');
