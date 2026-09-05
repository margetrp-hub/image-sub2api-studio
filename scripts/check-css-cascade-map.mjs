import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const studioEntry = path.join(root, 'src/studio.jsx');
const expectedCssImports = [
  './studio.css',
  './styles/studio.polish-reference-chat.css',
  './styles/studio.polish-concept-composer.css',
  './styles/studio.polish-modern-console.css',
  './styles/studio.polish-prompt-first.css',
  './styles/studio.polish-conversation-rail.css',
  './styles/studio.canvas-workspace.css',
  './styles/studio.composer-compact-shell.css',
  './styles/studio.composer-session-pane.css',
  './styles/studio.composer-prompt-workspace.css',
  './styles/studio.composer-creator-dock.css',
  './styles/studio.composer-parameter-dock.css',
  './styles/studio.composer-final-concept.css',
  './styles/studio.reference-overrides.css',
  './styles/studio.left-rail.css',
  './styles/studio.composer-final-guards.css',
  './styles/studio.composer-shell.css',
  './styles/studio.queue-progress.css',
  './styles/studio.composer-layout.css',
  './styles/studio.reference-panel.css',
  './styles/studio.context-side-panel.css',
  './styles/studio.composer-conversation.css',
  './styles/studio.interactions.css',
  './styles/studio.final-state.css',
  './styles/studio.composer-final-base.css',
  './styles/studio.composer-final-beta.css',
  './styles/studio.composer-final-tooling.css',
  './styles/studio.composer-final-modal.css',
  './styles/studio.composer-final-locks.css',
  './styles/studio.composer-final-live.css',
  './styles/studio.composer-live-guards.css',
  './styles/studio.imageforge-polish.css',
  './styles/studio.composer-codex.css',
  './styles/studio.composer-codex-guards.css',
  './styles/studio.workstation-shell.css',
  './styles/studio.playground-polish.css',
  './styles/studio.flow-modes.css',
  './styles/studio.composer-state-polish.css',
  './styles/studio.canvas-composer-refinement.css',
  './styles/studio.apple-refinement.css',
  './styles/studio.typography.css'
];
const lazyCssImports = [
  './styles/studio.provider-settings.css',
  './styles/studio.gallery-cards.css',
  './styles/studio.gallery-filters.css',
  './styles/studio.prompt-lightbox.css',
  './styles/studio.modal.css',
  './styles/studio.inspiration-share.css',
  './styles/studio.regenerate-dialog.css',
  './styles/studio.generation-confirm-dialog.css'
];
const cssFiles = [...expectedCssImports, ...lazyCssImports].map((importPath) => (
  importPath === './studio.css'
    ? 'src/studio.css'
    : `src/${importPath.slice(2)}`
));
const cssBudgets = {
  'src/studio.css': {
    lines: 2458,
    important: 0
  },
  'src/styles/studio.polish-reference-chat.css': {
    lines: 204,
    important: 64
  },
  'src/styles/studio.polish-concept-composer.css': {
    lines: 1853,
    important: 995
  },
  'src/styles/studio.polish-modern-console.css': {
    lines: 908,
    important: 0
  },
  'src/styles/studio.polish-prompt-first.css': {
    lines: 1227,
    important: 4
  },
  'src/styles/studio.polish-conversation-rail.css': {
    lines: 362,
    important: 0
  },
  'src/styles/studio.canvas-workspace.css': {
    lines: 2223,
    important: 29
  },
  'src/styles/studio.composer-compact-shell.css': {
    lines: 460,
    important: 22
  },
  'src/styles/studio.composer-session-pane.css': {
    lines: 743,
    important: 62
  },
  'src/styles/studio.composer-prompt-workspace.css': {
    lines: 1013,
    important: 51
  },
  'src/styles/studio.composer-creator-dock.css': {
    lines: 970,
    important: 188
  },
  'src/styles/studio.composer-parameter-dock.css': {
    lines: 385,
    important: 23
  },
  'src/styles/studio.composer-final-concept.css': {
    lines: 1438,
    important: 566
  },
  'src/styles/studio.reference-overrides.css': {
    lines: 244,
    important: 56
  },
  'src/styles/studio.left-rail.css': {
    lines: 99,
    important: 54
  },
  'src/styles/studio.composer-final-guards.css': {
    lines: 506,
    important: 272
  },
  'src/styles/studio.composer-shell.css': {
    lines: 1388,
    important: 734
  },
  'src/styles/studio.queue-progress.css': {
    lines: 549,
    important: 228
  },
  'src/styles/studio.composer-layout.css': {
    lines: 245,
    important: 117
  },
  'src/styles/studio.reference-panel.css': {
    lines: 1647,
    important: 849
  },
  'src/styles/studio.context-side-panel.css': {
    lines: 190,
    important: 122
  },
  'src/styles/studio.composer-conversation.css': {
    lines: 2648,
    important: 1349
  },
  'src/styles/studio.provider-settings.css': {
    lines: 461,
    important: 69
  },
  'src/styles/studio.interactions.css': {
    lines: 299,
    important: 58
  },
  'src/styles/studio.gallery-cards.css': {
    lines: 422,
    important: 247
  },
  'src/styles/studio.gallery-filters.css': {
    lines: 145,
    important: 12
  },
  'src/styles/studio.prompt-lightbox.css': {
    // Includes the owned toolbar/navigation added with the portaled preview.
    // The override ceiling is lower than the pre-modal budget of 36.
    lines: 62,
    important: 13
  },
  'src/styles/studio.modal.css': {
    lines: 93,
    important: 40
  },
  'src/styles/studio.inspiration-share.css': {
    lines: 26,
    important: 5
  },
  'src/styles/studio.final-state.css': {
    lines: 570,
    important: 209
  },
  'src/styles/studio.regenerate-dialog.css': {
    lines: 175,
    important: 91
  },
  'src/styles/studio.generation-confirm-dialog.css': {
    lines: 360,
    important: 0
  },
  'src/styles/studio.composer-final-base.css': {
    lines: 502,
    important: 190
  },
  'src/styles/studio.composer-final-beta.css': {
    lines: 826,
    important: 270
  },
  'src/styles/studio.composer-final-tooling.css': {
    lines: 536,
    important: 242
  },
  'src/styles/studio.composer-final-modal.css': {
    lines: 578,
    important: 266
  },
  'src/styles/studio.composer-final-locks.css': {
    lines: 1091,
    important: 586
  },
  'src/styles/studio.composer-final-live.css': {
    lines: 208,
    important: 97
  },
  'src/styles/studio.composer-live-guards.css': {
    lines: 167,
    important: 90
  },
  'src/styles/studio.imageforge-polish.css': {
    lines: 391,
    important: 142
  },
  'src/styles/studio.composer-codex.css': {
    lines: 1691,
    important: 925
  },
  'src/styles/studio.composer-codex-guards.css': {
    lines: 419,
    important: 203
  },
  'src/styles/studio.workstation-shell.css': {
    lines: 1102,
    important: 669
  },
  'src/styles/studio.playground-polish.css': {
    lines: 180,
    important: 95
  },
  'src/styles/studio.flow-modes.css': {
    lines: 13,
    important: 37
  },
  'src/styles/studio.composer-state-polish.css': {
    lines: 300,
    important: 230
  },
  'src/styles/studio.canvas-composer-refinement.css': {
    lines: 220,
    important: 90
  },
  'src/styles/studio.typography.css': {
    lines: 80,
    important: 0
  }
};
const selectorOwnership = [
  {
    file: 'src/studio.css',
    pattern: /\.canvasQueue/,
    message: 'Canvas queue styles belong in src/styles/studio.queue-progress.css.'
  },
  {
    file: 'src/studio.css',
    pattern: /\.(settingsOverlay|settingsDialog|providerSummary|manualFields|keyList|legacyProviderToggle|providerChoiceGrid|providerSettingsGroup|settingsCallConfig|settingsModelSync)/,
    message: 'Provider/settings styles belong in src/styles/studio.provider-settings.css.'
  }
];

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function countMatches(body, pattern) {
  return Array.from(body.matchAll(pattern)).length;
}

function collectSelectors(body) {
  return Array.from(body.matchAll(/([^{}]+)\{/g))
    .flatMap((match) => {
      const prelude = match[1].trim();
      if (!prelude || prelude.startsWith('@')) return [];
      return prelude
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean);
    });
}

const entryBody = readText('src/studio.jsx');
const cssImports = Array.from(entryBody.matchAll(/import\s+['"](.+?\.css)['"];?/g)).map((match) => match[1]);
const baseImportIndex = cssImports.indexOf('./studio.css');
const failures = [];

if (baseImportIndex === -1) {
  failures.push('src/studio.jsx must import ./studio.css.');
} else if (baseImportIndex !== 0) {
  failures.push('src/studio.jsx must import ./studio.css before every override layer.');
}

expectedCssImports.forEach((expectedImport, expectedIndex) => {
  const actualIndex = cssImports.indexOf(expectedImport);
  if (actualIndex === -1) {
    failures.push(`src/studio.jsx must import ${expectedImport}.`);
    return;
  }
  if (actualIndex !== expectedIndex) {
    failures.push(`${expectedImport} must be CSS import #${expectedIndex + 1}.`);
  }
});

if (cssImports.length !== expectedCssImports.length) {
  failures.push(`src/studio.jsx should have ${expectedCssImports.length} CSS imports, found ${cssImports.length}.`);
}

if (cssImports.at(-1) !== './styles/studio.typography.css') {
  failures.push('src/studio.jsx must import ./styles/studio.typography.css last so typography remains consistent across the workstation.');
}

lazyCssImports.forEach((lazyImport) => {
  if (cssImports.includes(lazyImport)) {
    failures.push(`${lazyImport} should stay lazy-loaded with its owning component instead of the studio entry.`);
  }
});

const selectorCounts = new Map();
const report = cssFiles.map((file) => {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing CSS file: ${file}`);
    return null;
  }

  const body = readText(file);
  const selectors = collectSelectors(body);
  selectors.forEach((selector) => {
    selectorCounts.set(selector, (selectorCounts.get(selector) || 0) + 1);
  });

  const item = {
    file,
    lines: body.split(/\r?\n/).length,
    rules: selectors.length,
    important: countMatches(body, /!important/g),
    mobileMedia: countMatches(body, /@media\s*\(max-width:\s*760px\)/g)
  };

  const budget = cssBudgets[file];
  if (budget?.lines && item.lines > budget.lines) {
    failures.push(`${file} has ${item.lines} lines, above the current debt ceiling of ${budget.lines}. Move styles into owned modules instead of growing the base file.`);
  }
  if (budget?.important !== undefined && item.important > budget.important) {
    failures.push(`${file} has ${item.important} !important rules, above the current debt ceiling of ${budget.important}.`);
  }

  selectorOwnership
    .filter((rule) => rule.file === file)
    .forEach((rule) => {
      if (rule.pattern.test(body)) {
        failures.push(`${rule.message} Found forbidden selector pattern ${rule.pattern} in ${file}.`);
      }
    });

  return item;
}).filter(Boolean);

const duplicateSelectors = Array.from(selectorCounts.entries())
  .filter(([, count]) => count > 4)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([selector, count]) => ({ selector, count }));

console.log(JSON.stringify({
  cssImports,
  files: report,
  duplicateSelectors
}, null, 2));

if (failures.length) {
  console.error(`CSS cascade map check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}
