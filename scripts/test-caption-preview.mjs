import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const cache = new Map();

function load(relative) {
  let f = path.resolve(root, relative);
  if (!path.extname(f)) f += '.ts';
  if (cache.has(f)) return cache.get(f).exports;
  const m = { exports: {} };
  cache.set(f, m);
  const raw = fs.readFileSync(f, 'utf8');
  const js = ts.transpileModule(raw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(f).href));
  new vm.Script(`(function(require,module,exports){${js}\n})`, { filename: f }).runInThisContext()(
    (s) => (s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.resolve(path.dirname(f), s)) : require(s)),
    m,
    m.exports
  );
  return m.exports;
}

const { ALL_CAPTION_TEMPLATES } = load('app/lib/captions/referenceTemplates');
const { captionFontFamily } = load('app/lib/captions/languages');
const { wordHighlight, distinctHighlight } = load('app/lib/captions/highlighting');

// Helper to simulate CaptionRenderer word layout and CSS extraction
function computeWordLayoutAndStyles(template, sampleText, currentTime = 1.0, scaleMultiplier = 1.0) {
  const style = template.style;
  const d = style.studio || {};
  const tokens = (sampleText || template.sampleText || "THIS IS HOW YOU GROW").split(/\s+/).filter(Boolean);
  const duration = Math.max(2.4, tokens.length * 0.45);
  const count = tokens.length;
  const rawWords = tokens.map((word, i) => ({
    word,
    start: Number(((i / count) * duration).toFixed(2)),
    end: Number((((i + 1) / count) * duration).toFixed(2)),
  }));

  const computedFontSize = Math.max(10, Math.round(style.fontSize * scaleMultiplier));

  function isEmphasis(index, wordText) {
    const selection = d.emphasisSelection || (d.layout === "hero" ? "middle" : undefined);
    if (selection === "first") return index === 0;
    if (selection === "second-row") return index >= Math.max(1, Math.round(count * (d.rowSplit ?? 0.4)));
    if (selection === "middle-pair") return index === Math.floor(count / 2) || index === Math.max(0, Math.floor(count / 2) - 1);
    if (selection === "last") return index === count - 1;
    if (selection === "middle") return index === Math.floor(count / 2);
    if (selection === "alternating") return index % 2 === 0;
    if (style.highlightWords) {
      const list = style.highlightWords.split(",").map((w) => w.trim().toLocaleLowerCase()).filter(Boolean);
      const clean = wordText.toLocaleLowerCase().replace(/[\p{P}]/gu, "");
      if (list.includes(clean)) return true;
    }
    return false;
  }

  const words = rawWords.map((w, index) => {
    const isEmp = isEmphasis(index, w.word);
    const isEdge = !!d.edgeFont && (index === 0 || index === count - 1);

    const rawFontFamily = isEmp
      ? (d.emphasisFont || style.fontAccent?.font || style.fontFamily)
      : isEdge
      ? d.edgeFont
      : (style.fontAccent && index === count - 1 ? style.fontAccent.font : style.fontFamily);

    const resolvedFont = captionFontFamily(rawFontFamily, w.word);
    const weight = isEmp
      ? (d.emphasisWeight || style.fontAccent?.weight || style.fontWeight)
      : (style.fontAccent && index === count - 1 ? style.fontAccent.weight : style.fontWeight);

    const scale = isEmp ? (d.emphasisScale || 1) : isEdge ? (d.edgeScale || 1) : 1;
    const wordFontSize = Math.max(9, Math.round(computedFontSize * scale));

    const casing = isEmp && d.emphasisCase ? d.emphasisCase : d.lowercase ? "lowercase" : style.textTransform;
    const displayText = casing === "uppercase"
      ? w.word.toLocaleUpperCase()
      : casing === "lowercase"
      ? w.word.toLocaleLowerCase()
      : casing === "capitalize"
      ? w.word.charAt(0).toUpperCase() + w.word.slice(1)
      : w.word;

    const isCurrent = currentTime >= w.start && currentTime <= w.end;
    const isFuture = currentTime < w.start;
    const isHighlighted = isEmp || wordHighlight(style.highlightingMode, w.word, index, isCurrent, style.highlightWords, !isFuture);

    const wordColor = isHighlighted
      ? (style.highlightingMode === "full-line" ? style.highlightColor : distinctHighlight(style.textColor, style.highlightColor))
      : style.textColor;

    const grad = isEmp ? (d.emphasisGradient || d.gradient) : d.gradient;
    let isGradient = false;
    let gradientCss = "";
    if (grad) {
      isGradient = true;
      const cssAngle = ((grad.angle ?? 90) + 90) % 360;
      const stops = grad.stops && grad.stops.length > 0
        ? grad.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`).join(", ")
        : `${grad.from} 0%, ${grad.to} 100%`;
      gradientCss = `linear-gradient(${cssAngle}deg, ${stops})`;
    }

    const depthShadows = [];
    if (d.depth && d.depth > 0 && (d.depthTarget !== "emphasis" || isEmp)) {
      const steps = Math.min(16, Math.max(1, Math.ceil(d.depth)));
      const angleRad = ((d.depthAngle ?? 45) * Math.PI) / 180;
      const depthCol = d.depthColor || "#000000";
      for (let j = 1; j <= steps; j++) {
        const dx = Math.round(Math.cos(angleRad) * j * scaleMultiplier * 10) / 10;
        const dy = Math.round(Math.sin(angleRad) * j * scaleMultiplier * 10) / 10;
        depthShadows.push(`${dx}px ${dy}px 0px ${depthCol}`);
      }
    }

    const glowShadows = [];
    const glowAmount = d.glowTarget === "emphasis" && !isEmp ? 0 : (d.glow || 0);
    if (glowAmount > 0) {
      const glowCol = d.glowColor || (isHighlighted ? style.highlightColor : style.textColor);
      const blur = Math.max(2, Math.round(glowAmount * scaleMultiplier));
      glowShadows.push(`0px 0px ${blur}px ${glowCol}`);
    }

    const allShadows = [...depthShadows, ...glowShadows];
    const textShadow = allShadows.length > 0 ? allShadows.join(", ") : undefined;

    let strokeStyle = null;
    if (style.strokeWidth && style.strokeWidth > 0 && style.strokeColor) {
      const scaledStroke = Math.max(0.5, style.strokeWidth * scaleMultiplier);
      strokeStyle = {
        WebkitTextStroke: `${scaledStroke}px ${style.strokeColor}`,
        paintOrder: "stroke fill",
      };
    }

    const hasUnderline = !!(d.underline || (isEmp && d.emphasisUnderline));
    const underlineColor = d.underlineColor || (isHighlighted ? style.highlightColor : style.textColor);
    const spotlightAlpha = d.spotlight ? (isCurrent ? 1 : 0.35) : 1;

    return {
      word: w.word,
      displayText,
      index,
      isEmp,
      isEdge,
      resolvedFont,
      weight,
      wordFontSize,
      scale,
      isGradient,
      gradientCss,
      textShadow,
      strokeStyle,
      hasUnderline,
      underlineColor,
      spotlightAlpha,
      wordColor,
    };
  });

  // Partition lines
  let lines = [];
  if (d.layout === "hero") {
    const ordinary = words.filter((w) => !w.isEmp);
    const hero = words.filter((w) => w.isEmp);
    const pivot = hero[0]?.index ?? count;
    if (d.heroPlacement === "banner") {
      if (ordinary.length) lines.push(ordinary);
      if (hero.length) lines.push(hero);
    } else {
      const before = ordinary.filter((w) => w.index < pivot);
      const after = ordinary.filter((w) => w.index >= pivot);
      if (before.length) lines.push(before);
      if (hero.length) lines.push(hero);
      if (after.length) lines.push(after);
    }
  } else if (d.layout === "stacked") {
    const split = Math.max(1, Math.round(count * (d.rowSplit ?? 0.6)));
    lines.push(words.slice(0, split));
    if (words.length > split) lines.push(words.slice(split));
  } else if (d.layout === "dynamic") {
    const split = Math.max(2, Math.ceil(count / 2));
    lines.push(words.slice(0, 1));
    if (words.length > 1) lines.push(words.slice(1, split));
    if (words.length > split) lines.push(words.slice(split));
  } else if (d.layout === "split") {
    const mid = Math.ceil(count / 2);
    lines = [words.slice(0, mid), words.slice(mid)].filter((l) => l.length > 0);
  } else {
    const maxWords = Math.max(1, style.maxWordsPerLine || 4);
    for (let i = 0; i < words.length; i += maxWords) {
      lines.push(words.slice(i, i + maxWords));
    }
  }
  lines = lines.filter((l) => l.length > 0);

  return { words, lines, computedFontSize };
}

test('ALL_CAPTION_TEMPLATES includes all creator, trending, and default presets', () => {
  assert.ok(Array.isArray(ALL_CAPTION_TEMPLATES));
  assert.ok(ALL_CAPTION_TEMPLATES.length >= 75, `Expected >= 75 templates, got ${ALL_CAPTION_TEMPLATES.length}`);

  const names = ALL_CAPTION_TEMPLATES.map((t) => t.name);
  const required = [
    'Hormozi Style',
    'Scribble',
    'Lahore',
    'Dynamic',
    'Devin Jatho 2.0',
    'Ali Abdaal',
    'Kalakar Motion',
    'Kathmandu',
    'Mr Beast Style 1',
    'Mr Beast Style 2',
    'Viral Hinglish Pop',
    'Lala',
    'Double Trouble',
    'Zero Gravity',
  ];
  for (const name of required) {
    assert.ok(names.includes(name), `Missing required template: ${name}`);
  }
});

test('every template renders valid CSS/DOM properties without errors or NaN', () => {
  for (const template of ALL_CAPTION_TEMPLATES) {
    for (const scale of [0.5, 0.78, 1.0]) {
      for (const time of [0.2, 1.0, 2.0]) {
        const result = computeWordLayoutAndStyles(template, template.sampleText, time, scale);
        assert.ok(result.words.length > 0, `${template.name}: has words`);
        assert.ok(result.lines.length > 0, `${template.name}: has lines`);
        assert.ok(Number.isFinite(result.computedFontSize) && result.computedFontSize > 0);

        for (const w of result.words) {
          assert.ok(Number.isFinite(w.wordFontSize) && w.wordFontSize > 0, `${template.name}: wordFontSize finite`);
          assert.ok(w.resolvedFont && typeof w.resolvedFont === 'string', `${template.name}: resolvedFont`);
          assert.ok(Number.isFinite(w.weight) && w.weight >= 100, `${template.name}: font weight`);
          if (w.isGradient) {
            assert.ok(w.gradientCss.includes('linear-gradient'), `${template.name}: gradientCss`);
          }
          if (w.textShadow) {
            assert.ok(!w.textShadow.includes('NaN'), `${template.name}: textShadow has no NaN`);
          }
          if (w.strokeStyle) {
            assert.ok(!w.strokeStyle.WebkitTextStroke?.includes('NaN'), `${template.name}: stroke has no NaN`);
          }
        }
      }
    }
  }
});

test('hero layout separates emphasis word with designated emphasis font and scale', () => {
  const lahore = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Lahore');
  assert.ok(lahore);
  assert.equal(lahore.style.studio?.layout, 'hero');

  const { words, lines } = computeWordLayoutAndStyles(lahore, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  assert.equal(lines.length, 3, 'Hero layout splits into 3 rows for before/hero/after');

  const heroLine = lines[1];
  assert.equal(heroLine.length, 1);
  const heroWord = heroLine[0];
  assert.equal(heroWord.displayText, 'WELCOME');
  assert.ok(heroWord.resolvedFont.includes('Noto Sans Devanagari'));
  assert.equal(heroWord.weight, 900);
  assert.ok(heroWord.scale >= 2.0);
  assert.ok(heroWord.isGradient, 'Hero word has gradient');
  assert.ok(heroWord.gradientCss.includes('linear-gradient'));
});

test('Kalakar Motion banner hero renders Anton font with depth shadows', () => {
  const km = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Kalakar Motion');
  assert.ok(km);
  const { words, lines } = computeWordLayoutAndStyles(km, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  assert.equal(lines.length, 2, 'Banner hero places ordinary on row 1, hero on row 2');
  const heroWord = lines[1][0];
  assert.equal(heroWord.displayText, 'WELCOME');
  assert.ok(heroWord.resolvedFont.includes('Anton'));
  assert.ok(heroWord.scale >= 3.0);
  assert.ok(heroWord.textShadow, 'Has 3D depth shadows');
  assert.ok(heroWord.textShadow.includes('px 0px'));
});

test('Scribble renders Yellowtail script font on first word', () => {
  const scribble = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Scribble');
  assert.ok(scribble);
  const { words } = computeWordLayoutAndStyles(scribble, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  const firstWord = words[0];
  assert.equal(firstWord.word, 'Hello');
  assert.ok(firstWord.isEmp);
  assert.ok(firstWord.resolvedFont.includes('Yellowtail'));
  assert.equal(firstWord.wordColor, '#e0251c');

  const otherWord = words[1];
  assert.ok(otherWord.resolvedFont.includes('Outfit'));
});

test('Dynamic layout applies edge serif fonts and bold sans emphasis with rotation', () => {
  const dynamic = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Dynamic');
  assert.ok(dynamic);
  const { words, lines } = computeWordLayoutAndStyles(dynamic, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  assert.ok(lines.length >= 2);

  const edgeWord = words[0];
  assert.ok(edgeWord.isEdge);
  assert.ok(edgeWord.resolvedFont.includes('Instrument Serif'));

  const empWord = words.find((w) => w.isEmp);
  assert.ok(empWord);
  assert.ok(empWord.resolvedFont.includes('Inter'));
  assert.equal(empWord.weight, 700);
  assert.equal(empWord.displayText, 'WELCOME');
});

test('Hormozi Style renders Anton uppercase with linear gradient and dark stroke', () => {
  const hormozi = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Hormozi Style');
  assert.ok(hormozi);
  const { words } = computeWordLayoutAndStyles(hormozi, 'Welcome to Kreovar.', 1.0, 1.0);
  for (const w of words) {
    assert.ok(w.resolvedFont.includes('Anton'));
    assert.equal(w.displayText, w.displayText.toUpperCase());
    assert.ok(w.isGradient);
    assert.ok(w.gradientCss.includes('#77a748') && w.gradientCss.includes('#a5fd4b'));
    assert.ok(w.strokeStyle?.WebkitTextStroke?.includes('#000000'));
  }
});

test('Ali Abdaal enables spotlight spoken-word opacity contrast', () => {
  const ali = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Ali Abdaal');
  assert.ok(ali);
  assert.equal(ali.style.studio?.spotlight, true);
  const { words } = computeWordLayoutAndStyles(ali, 'Hello and Welcome to Kreovar.', 0.2, 1.0);
  const active = words[0];
  const inactive = words[2];
  assert.equal(active.spotlightAlpha, 1.0);
  assert.equal(inactive.spotlightAlpha, 0.35);
});

test('Lala stacked handwriting renders vibrant orange underline on second row', () => {
  const lala = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Lala');
  assert.ok(lala);
  const { words, lines } = computeWordLayoutAndStyles(lala, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  assert.equal(lines.length, 2, 'Stacked layout splits into 2 rows');
  const secondRowWord = lines[1][0];
  assert.ok(secondRowWord.isEmp);
  assert.equal(secondRowWord.hasUnderline, true);
  assert.equal(secondRowWord.underlineColor, '#ef6842');
});

test('Kathmandu applies lowercase casing with intense glow text-shadow', () => {
  const kathmandu = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Kathmandu');
  assert.ok(kathmandu);
  const { words } = computeWordLayoutAndStyles(kathmandu, 'Hello and Welcome to Kreovar.', 1.0, 1.0);
  for (const w of words) {
    assert.equal(w.displayText, w.displayText.toLowerCase());
  }
  const midWord = words.find((w) => w.isEmp);
  assert.ok(midWord);
  assert.ok(midWord.textShadow?.includes('#898b26'), 'Includes Kathmandu neon glow color');
});

test('scaleMultiplier scales font size, stroke, and depth proportionally without distortion', () => {
  const devin = ALL_CAPTION_TEMPLATES.find((t) => t.name === 'Devin Jatho 2.0');
  assert.ok(devin);
  const full = computeWordLayoutAndStyles(devin, 'THIS IS HOW YOU GROW', 1.0, 1.0);
  const card = computeWordLayoutAndStyles(devin, 'THIS IS HOW YOU GROW', 1.0, 0.78);
  const thumb = computeWordLayoutAndStyles(devin, 'THIS IS HOW YOU GROW', 1.0, 0.5);

  assert.ok(full.computedFontSize > card.computedFontSize);
  assert.ok(card.computedFontSize > thumb.computedFontSize);

  assert.ok(full.words[0].wordFontSize > card.words[0].wordFontSize);
  assert.ok(card.words[0].wordFontSize > thumb.words[0].wordFontSize);
});
