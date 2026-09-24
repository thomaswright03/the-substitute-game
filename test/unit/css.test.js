// The stylesheet takes every colour and every margin, padding and gap from the design tokens
// declared at its top, so a theme or a spacing change is made in one place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../css/game.css', import.meta.url), 'utf8');

// Every declaration in the file, with the selector (or at-rule) of the block it is in.
function declarations(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      stack.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (c === ';' || c === '}') {
      const chunk = text.slice(start, i).trim();
      const colon = chunk.indexOf(':');
      if (chunk && colon > 0 && stack.length) {
        const line = text.slice(0, i).split('\n').length;
        out.push({ selector: stack[stack.length - 1], prop: chunk.slice(0, colon).trim(), value: chunk.slice(colon + 1).trim(), line });
      }
      if (c === '}') stack.pop();
      start = i + 1;
    }
  }
  return out;
}

const all = declarations(css);
const withoutVars = (value) => value.replace(/var\(--[\w-]+\)/g, 'VAR');

const RAW_COLOUR = [
  /#[0-9a-f]{3,8}\b/i,
  /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i,
  /\b(white|black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|brown|silver|gold|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta)\b/i,
];

const SPACING = /^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/;

describe('design tokens', () => {
  test('the parser sees the whole stylesheet', () => {
    assert.ok(all.length > 300, `${all.length} declarations`);
    assert.ok(all.some((d) => d.selector === ':root' && d.prop === '--ink'));
  });

  test('colours are written only in the :root token block', () => {
    const raw = all.filter((d) => d.selector !== ':root' && RAW_COLOUR.some((re) => re.test(withoutVars(d.value))));
    assert.deepEqual(raw.map((d) => `line ${d.line}: ${d.selector} { ${d.prop}: ${d.value} }`), []);
  });

  test('every margin, padding and gap comes from the spacing scale', () => {
    const off = all.filter((d) => {
      if (!SPACING.test(d.prop)) return false;
      // what is left once the tokens are taken out may only be 0, auto, and calc()/max() glue
      const rest = d.value
        .replace(/var\(--(space-\d+|gutter)\)/g, ' ')
        .replace(/env\([^)]*\)/g, ' ')
        .split(/[\s(),*]+/)
        .filter(Boolean);
      return rest.some((word) => !['0', 'auto', 'calc', 'max', 'min', '-1'].includes(word));
    });
    assert.deepEqual(off.map((d) => `line ${d.line}: ${d.selector} { ${d.prop}: ${d.value} }`), []);
  });

  test('the spacing scale is a short, increasing list of steps', () => {
    const steps = all
      .filter((d) => d.selector.startsWith(':root') && /^--space-\d+$/.test(d.prop))
      .map((d) => ({ n: Number(d.prop.slice(8)), px: Number(/calc\((\d+) \* var\(--px\)\)/.exec(d.value)?.[1]) }));
    assert.ok(steps.length >= 6 && steps.length <= 12, `${steps.length} steps`);
    steps.sort((a, b) => a.n - b.n);
    steps.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      assert.ok(Number.isFinite(s.px), `--space-${s.n} is a multiple of --px`);
      if (i) assert.ok(s.px > steps[i - 1].px, `--space-${s.n} is larger than the step before`);
    });
  });

  test('the HUD redeclares the size tokens it scales', () => {
    const scaled = all.find((d) => d.prop === '--px' && /cqw/.test(d.value));
    assert.ok(scaled, 'a stage-relative --px');
    const layers = scaled.selector.split(',').map((s) => s.trim());
    const tokenBlock = all.find((d) => d.prop === '--space-1').selector.split(',').map((s) => s.trim());
    for (const layer of layers) assert.ok(tokenBlock.includes(layer), `${layer} redeclares the size tokens`);
  });
});
