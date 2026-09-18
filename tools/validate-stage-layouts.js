/* Validates the authored Chapter 1 layout data without a browser.
 * This is intentionally shared-shape validation for future Stage Builder JSON.
 */
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'systems', 'stage-builder.js'));

const layouts = window.BETA_STAGE_LAYOUTS;
const modifiers = window.BETA_STAGE_MODIFIERS || {};
const expectedStages = Array.from({ length: 12 }, (_, index) => index + 2);
const issues = [];
const finite = value => Number.isFinite(value);
const positive = value => finite(value) && value > 0;

for (const stage of expectedStages) {
  const layout = layouts?.[stage];
  if (!layout) { issues.push(`Stage ${stage}: layout is missing`); continue; }
  for (const key of ['terrain', 'orbs', 'repairs', 'enemies', 'checkpoints', 'markers', 'goal']) if (!Array.isArray(layout[key])) issues.push(`Stage ${stage}: ${key} must be an array`);
  if (!Array.isArray(layout.terrain) || !Array.isArray(layout.goal)) continue;
  const ids = new Set();
  for (const terrain of layout.terrain) {
    const [id, x, y, width, height] = terrain;
    if (typeof id !== 'string' || !id) issues.push(`Stage ${stage}: terrain ID is invalid`);
    if (ids.has(id)) issues.push(`Stage ${stage}: duplicate terrain ID ${id}`);
    ids.add(id);
    if (![x, y, width, height].every(finite) || !positive(width) || !positive(height)) issues.push(`Stage ${stage}: terrain ${id} has invalid geometry`);
  }
  if (!layout.terrain.some(([id]) => id === 'goal')) issues.push(`Stage ${stage}: missing goal terrain`);
  if (![layout.goal[0], layout.goal[1]].every(finite)) issues.push(`Stage ${stage}: goal coordinate is invalid`);
  for (const [index, orb] of (layout.orbs || []).entries()) if (!Array.isArray(orb) || !orb.slice(0, 2).every(finite)) issues.push(`Stage ${stage}: orb ${index + 1} is invalid`);
  for (const [index, repair] of (layout.repairs || []).entries()) {
    if (!Array.isArray(repair) || !repair.slice(0, 2).every(finite) || typeof repair[2] !== 'string' || !ids.has(repair[2])) issues.push(`Stage ${stage}: repair ${index + 1} references an invalid platform`);
  }
  for (const [index, checkpoint] of (layout.checkpoints || []).entries()) {
    if (!Array.isArray(checkpoint) || !finite(checkpoint[0]) || typeof checkpoint[1] !== 'string' || !ids.has(checkpoint[1])) issues.push(`Stage ${stage}: checkpoint ${index + 1} references an invalid platform`);
  }
  for (const [index, enemy] of (layout.enemies || []).entries()) {
    if (!Array.isArray(enemy) || !enemy.slice(0, 6).every(finite) || enemy[2] > enemy[3] || !positive(enemy[4])) issues.push(`Stage ${stage}: enemy ${index + 1} is invalid`);
  }
  for (const [index, lane] of (modifiers[stage]?.windLanes || []).entries()) {
    if (!lane || ![lane.x, lane.w, lane.top, lane.bottom, lane.force].every(finite) || !positive(lane.w) || lane.top >= lane.bottom || lane.force === 0 || (lane.lift !== undefined && (!finite(lane.lift) || lane.lift < 0))) issues.push(`Stage ${stage}: wind lane ${index + 1} is invalid`);
  }
}

for (const stage of Object.keys(modifiers).map(Number)) if (!expectedStages.includes(stage)) issues.push(`Modifier data references unsupported stage ${stage}`);
if (issues.length) { console.error(issues.join('\n')); process.exit(1); }
console.log(`Validated ${expectedStages.length} Stage Builder layouts and ${Object.values(modifiers).flatMap(item => item.windLanes || []).length} wind lanes.`);
