const fs = require('fs');
const path = require('path');

const correctResDir = path.resolve(__dirname, '../resources'); // from src/main -> bldesk/resources
console.log('Target resDir:', correctResDir);
console.log('Project root resources:', path.resolve(__dirname, '../../resources'));
