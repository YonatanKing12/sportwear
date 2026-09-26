// Shopify validates section/block schemas on upload with rules that theme-check does not cover.
// A file that breaks one of them is silently dropped when a theme is imported from a zip (and any
// template using it goes with it), so these rules run as part of `npm run theme:check`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_TAG = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/;
const TEXT_TYPES = new Set(['text', 'textarea', 'inline_richtext', 'richtext', 'html', 'liquid']);

/** Resolves "t:" keys against the default schema locale so length limits apply to real text. */
function translator(root) {
  const localesDir = path.join(root, 'locales');
  const file = existsSync(localesDir) && readdirSync(localesDir).find((name) => name.endsWith('.default.schema.json'));
  const strings = file ? JSON.parse(readFileSync(path.join(localesDir, file), 'utf8')) : {};
  return (value) => {
    if (typeof value !== 'string' || !value.startsWith('t:')) return value;
    return value
      .slice(2)
      .split('.')
      .reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), strings);
  };
}

function checkSettings(settings, where, problems) {
  for (const setting of settings ?? []) {
    const at = `${where} setting "${setting.id ?? setting.type}"`;
    if (setting.type === 'range') {
      const { min, max, step = 1, default: fallback } = setting;
      const steps = (max - min) / step;
      if (steps < 2) problems.push(`${at}: a range needs at least 3 values (use a select for fewer)`);
      if (steps > 101) problems.push(`${at}: a range can have at most 101 steps`);
      if (fallback === undefined) problems.push(`${at}: a range needs a default`);
      else if (
        fallback < min ||
        fallback > max ||
        Math.abs((fallback - min) / step - Math.round((fallback - min) / step)) > 1e-9
      )
        problems.push(`${at}: default ${fallback} is outside the range or off-step`);
    }
    if ((setting.type === 'select' || setting.type === 'radio') && 'default' in setting) {
      if (!setting.options?.some((option) => option.value === setting.default))
        problems.push(`${at}: default "${setting.default}" is not one of the options`);
    }
    if (TEXT_TYPES.has(setting.type) && setting.default === '') {
      problems.push(`${at}: an empty-string default is rejected; omit the default instead`);
    }
  }
}

/** @returns {{ file: string, message: string }[]} */
export function schemaProblems(root) {
  const t = translator(root);
  const found = [];
  for (const dir of ['sections', 'blocks']) {
    const folder = path.join(root, dir);
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).filter((file) => file.endsWith('.liquid'))) {
      const file = `${dir}/${name}`;
      const match = readFileSync(path.join(folder, name), 'utf8').match(SCHEMA_TAG);
      if (!match) continue;
      let schema;
      try {
        schema = JSON.parse(match[1]);
      } catch {
        continue; // theme-check already reports invalid JSON
      }
      const problems = [];
      const title = t(schema.name);
      if (typeof title === 'string' && title.length > 25) problems.push(`name "${title}" is longer than 25 characters`);
      checkSettings(schema.settings, 'section', problems);
      for (const block of schema.blocks ?? []) {
        const blockName = t(block.name);
        if (typeof blockName === 'string' && blockName.length > 25)
          problems.push(`block "${block.type}" name "${blockName}" is longer than 25 characters`);
        checkSettings(block.settings, `block "${block.type}"`, problems);
      }
      for (const message of problems) found.push({ file, message });
    }
  }
  const settingsSchema = path.join(root, 'config', 'settings_schema.json');
  if (existsSync(settingsSchema)) {
    const problems = [];
    for (const group of JSON.parse(readFileSync(settingsSchema, 'utf8'))) {
      checkSettings(group.settings, `theme settings group "${t(group.name) ?? group.name}"`, problems);
    }
    for (const message of problems) found.push({ file: 'config/settings_schema.json', message });
  }
  return found;
}
