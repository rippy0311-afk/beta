/* Verifies that every core gameplay option has a game-side reference.
 * Run: node tools/audit-feature-flags.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'systems', 'gameplay-options.js'), 'utf8');
const game = [
  fs.readFileSync(path.join(root, 'game.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'systems', 'abilities.js'), 'utf8'),
].join('\n');
const exempt = new Set([
  // These are intentional placeholders for planned external systems.
  'sound', 'inventory', 'quests',
]);

const featureBlock = config.match(/const FEATURES = Object\.freeze\(\{([\s\S]*?)\}\);/);
if (!featureBlock) throw new Error('FEATURES block was not found in systems/gameplay-options.js');

const features = [...featureBlock[1].matchAll(/\b([A-Za-z][A-Za-z0-9_]*):\s*(?:true|false)\b/g)].map(match => match[1]);
const missing = features.filter(feature => !exempt.has(feature) && !game.includes(`FEATURES.${feature}`));
const duplicate = features.filter((feature, index) => features.indexOf(feature) !== index);

console.log(`Feature switches: ${features.length}`);
console.log(`Game-side references: ${features.length - missing.length}`);
if (duplicate.length) console.error(`Duplicate keys: ${[...new Set(duplicate)].join(', ')}`);
if (missing.length) console.error(`Missing game-side checks: ${missing.join(', ')}`);

if (duplicate.length || missing.length) process.exitCode = 1;
