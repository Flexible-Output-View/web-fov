import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { API_ORIGIN, mockApi } from './mock-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, process.env.A11Y_BUILD_DIR || 'dist/a11y-build', 'browser');
const REPORT_FILE = path.join(ROOT, process.env.A11Y_REPORT || 'dist/a11y-report.json');
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const CONCURRENCY = Number(process.env.A11Y_CONCURRENCY || 4);
const APP_ORIGIN = 'http://fov.test';
const AXE_SOURCE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const THEMES = ['dark', 'light'];
const VIEWPORTS = {
  desktop: { width: 1366, height: 900 },
  mobile: { width: 390, height: 844 },
};

const SCENARIOS = [
  { route: '', url: '/' },
  { route: 'discover', url: '/discover' },
  { route: 'discover/:name', url: '/discover/Just%20Chatting' },
  { route: 'followed', url: '/followed' },
  { route: 'followed', url: '/followed', auth: true },
  { route: 'profile', url: '/profile', auth: true },
  { route: 'profile/personal_settings', url: '/profile/personal_settings', auth: true },
  {
    route: 'profile/personal_settings', url: '/profile/personal_settings', auth: true,
    name: 'toast et survol du bouton danger',
    act: async (page) => {
      await page.click('.settings-section .btn-primary');
      await page.hover('.btn-danger');
    },
  },
  {
    route: 'profile/personal_settings', url: '/profile/personal_settings', auth: true,
    name: 'erreur de changement de mot de passe',
    act: async (page) => {
      await page.fill('#currentPassword', 'wrong-password');
      await page.fill('#newPassword', 'new-password-123');
      await page.fill('#confirmNewPassword', 'new-password-123');
      await page.click('button.btn-primary >> nth=1');
    },
  },
  {
    route: 'profile/personal_settings', url: '/profile/personal_settings', auth: true,
    name: 'modale de suppression du compte',
    act: (page) => page.click('.btn-danger'),
  },
  { route: 'login', url: '/login' },
  {
    route: 'login', url: '/login', name: 'erreur de connexion',
    act: async (page) => {
      await page.fill('#login', 'lucas');
      await page.fill('#password', 'wrong-password');
      await page.click('button.btn-primary');
    },
  },
  { route: 'login', url: '/login', name: 'survol du bouton', act: (page) => page.hover('button.btn-primary') },
  { route: 'register', url: '/register' },
  {
    route: 'register', url: '/register', name: "erreur d'inscription",
    act: async (page) => {
      await page.fill('#username', 'lucas');
      await page.fill('#email', 'lucas@example.com');
      await page.fill('#password', 'password-123');
      await page.fill('#confirmPassword', 'password-123');
      await page.click('button.btn-primary');
    },
  },
  { route: 'stream/:streamId', url: '/stream/u1' },
  { route: 'stream/:streamId', url: '/stream/u1', auth: true },
  { route: 'how-does-it-work', url: '/how-does-it-work' },
  { route: 'dashboard/stream', url: '/dashboard/stream', auth: true },
  {
    route: 'dashboard/stream', url: '/dashboard/stream', auth: true,
    name: 'toast et survol du bouton danger',
    act: async (page) => {
      await page.click('form button[type="submit"]');
      await page.hover('.btn-danger');
    },
  },
  { route: ':username', url: '/bob' },
  { route: ':username', url: '/bob', auth: true },
  {
    route: '', url: '/', name: 'recherche avec résultats', viewports: ['desktop'],
    act: (page) => page.fill('#nav-search', 'lu'),
  },
  {
    route: '', url: '/', name: 'recherche sans résultat', viewports: ['desktop'],
    act: (page) => page.fill('#nav-search', 'zzzz'),
  },
  {
    route: '', url: '/', name: 'barre latérale repliée', viewports: ['desktop'],
    act: (page) => page.click('.sidebar-toggle'),
  },
];

function checkRouteCoverage() {
  const routesFile = fs.readFileSync(path.join(ROOT, 'src/app/app.routes.ts'), 'utf8');
  const routes = [...routesFile.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]).filter((r) => r !== '**');
  const covered = new Set(SCENARIOS.map((s) => s.route));
  return routes.filter((route) => !covered.has(route));
}

async function serve(route) {
  const request = route.request();
  const url = request.url();

  if (url.startsWith(API_ORIGIN)) {
    const { status, body } = mockApi(url, request.method());
    return route.fulfill({ status, json: body });
  }
  if (url.startsWith(APP_ORIGIN)) {
    const file = path.join(BUILD_DIR, decodeURIComponent(new URL(url).pathname));
    if (file.startsWith(BUILD_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return route.fulfill({ path: file });
    }
    if (/\.(png|jpe?g|webp|svg|gif)$/i.test(url)) return route.fulfill({ body: PIXEL, contentType: 'image/png' });
    return route.fulfill({ path: path.join(BUILD_DIR, 'index.html') });
  }
  if (/\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(url)) return route.fulfill({ body: PIXEL, contentType: 'image/png' });
  return route.abort();
}

async function audit(browser, scenario, theme, viewport) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], reducedMotion: 'reduce' });
  await context.route('**/*', serve);
  await context.addInitScript(({ auth }) => {
    if (auth) {
      localStorage.setItem('fov_auth_token', 'a11y-token');
      localStorage.setItem('fov_auth_user', JSON.stringify({ id: 1, username: 'lucas', email: 'lucas@example.com' }));
    }
  }, { auth: !!scenario.auth });

  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss());
  const label = [
    scenario.url, scenario.auth ? '(connecté)' : '', scenario.name ? `[${scenario.name}]` : '', theme, viewport,
  ].filter(Boolean).join(' ');

  try {
    await page.goto(APP_ORIGIN + scenario.url, { waitUntil: 'load' });
    await page.waitForSelector('app-root *', { timeout: 10_000 });
    await page.waitForTimeout(1000);
    if (theme === 'light') {
      await page.evaluate(() => document.body.classList.add('theme-light'));
    }
    if (scenario.act) {
      await scenario.act(page);
      await page.waitForTimeout(600);
    }
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.addScriptTag({ content: AXE_SOURCE });
    const violations = await page.evaluate(async (tags) => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
      }));
    }, AXE_TAGS);
    return { label, violations };
  } catch (err) {
    return { label, error: err.message.split('\n')[0] };
  } finally {
    await context.close();
  }
}

async function main() {
  const uncovered = checkRouteCoverage();
  if (uncovered.length > 0) {
    console.error(`Routes sans scénario d'audit dans a11y/audit.mjs : ${uncovered.join(', ')}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
    console.error(`Build introuvable dans ${BUILD_DIR}. Lancez "npm run test:a11y".`);
    process.exit(1);
  }

  const jobs = [];
  for (const scenario of SCENARIOS) {
    for (const viewport of scenario.viewports || Object.keys(VIEWPORTS)) {
      for (const theme of THEMES) jobs.push([scenario, theme, viewport]);
    }
  }

  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: ['--no-sandbox'] });
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push(await audit(browser, ...job));
    }
  }));
  await browser.close();

  results.sort((a, b) => a.label.localeCompare(b.label));
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2));

  const failed = results.filter((r) => r.error || r.violations.length > 0);
  for (const result of failed) {
    console.log(`\n✗ ${result.label}`);
    if (result.error) {
      console.log(`  Scénario en échec : ${result.error}`);
      continue;
    }
    for (const violation of result.violations) {
      console.log(`  [${violation.impact}] ${violation.id} — ${violation.help} (${violation.helpUrl})`);
      for (const node of violation.nodes) {
        console.log(`    ${node.target}`);
        console.log(`      ${node.summary.split('\n').filter(Boolean).slice(-1)[0].trim()}`);
      }
    }
  }

  console.log(`\n${results.length - failed.length}/${results.length} états conformes WCAG 2.2 AA`
    + ` (${SCENARIOS.length} scénarios × thèmes clair/sombre × desktop/mobile). Rapport : ${REPORT_FILE}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
