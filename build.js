#!/usr/bin/env node

/**
 * Static Site Builder
 *
 * Reads a site config (JSON), compiles Handlebars templates,
 * minifies CSS/JS/HTML, and outputs a deploy-ready static site.
 *
 * Usage:
 *   node build.js landhawk-drone-co          # Build one site
 *   node build.js --all                       # Build all sites
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Handlebars = require('handlebars');
const CleanCSS = require('clean-css');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');

// ─── Constants ───────────────────────────────────────────
const BUILD_HASH = crypto.randomBytes(4).toString('hex');
const ROOT = __dirname;
const CONFIGS_DIR = path.join(ROOT, 'configs');
const DIST_DIR = path.join(ROOT, 'dist');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const ASSETS_DIR = path.join(ROOT, 'assets');

// ─── Handlebars Helpers ──────────────────────────────────
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('year', () => new Date().getFullYear());
Handlebars.registerHelper('isodate', () => new Date().toISOString().split('T')[0]);
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper('cachebust', () => BUILD_HASH);
Handlebars.registerHelper('concat', (...args) => { args.pop(); return args.join(''); });

// ─── Deep Merge ──────────────────────────────────────────
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) &&
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

// ─── Load Config ─────────────────────────────────────────
function loadConfig(siteId) {
  const basePath = path.join(CONFIGS_DIR, '_base.json');
  const sitePath = path.join(CONFIGS_DIR, `${siteId}.json`);

  if (!fs.existsSync(sitePath)) {
    console.error(`Config not found: ${sitePath}`);
    process.exit(1);
  }

  const base = fs.existsSync(basePath)
    ? JSON.parse(fs.readFileSync(basePath, 'utf8'))
    : {};
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));

  return deepMerge(base, site);
}

// ─── Register Partials ───────────────────────────────────
function registerPartials() {
  const sectionsDir = path.join(TEMPLATES_DIR, 'sections');
  if (!fs.existsSync(sectionsDir)) return;

  for (const file of fs.readdirSync(sectionsDir)) {
    if (!file.endsWith('.html')) continue;
    const name = path.basename(file, '.html');
    const content = fs.readFileSync(path.join(sectionsDir, file), 'utf8');
    Handlebars.registerPartial(name, content);
  }
}

// ─── Generate CSS Variables ──────────────────────────────
function generateVariablesCSS(config) {
  const b = config.branding || {};
  let css = ':root {\n';
  for (const [key, value] of Object.entries(b)) {
    css += `  --${key.replace(/_/g, '-')}: ${value};\n`;
  }
  css += '}\n';
  return css;
}

// ─── Minify CSS ──────────────────────────────────────────
function minifyCSS(cssContent) {
  return new CleanCSS({ level: 2 }).minify(cssContent).styles;
}

// ─── Minify JS ───────────────────────────────────────────
async function minifyJS(jsContent) {
  const result = await terserMinify(jsContent);
  return result.code;
}

// ─── Minify HTML ─────────────────────────────────────────
async function minifyHTML(html) {
  return htmlMinify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });
}

// ─── Generate Sitemap ────────────────────────────────────
function generateSitemap(config) {
  const domain = config.domain || 'example.com';
  const today = new Date().toISOString().split('T')[0];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const page of config.pages || []) {
    xml += '  <url>\n';
    xml += `    <loc>https://${domain}${page.path}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq || 'monthly'}</changefreq>\n`;
    xml += `    <priority>${page.priority || '0.5'}</priority>\n`;
    xml += '  </url>\n';
  }

  for (const post of config.blog_posts || []) {
    xml += '  <url>\n';
    xml += `    <loc>https://${domain}/blog/${post.slug}/</loc>\n`;
    xml += `    <lastmod>${post.date}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

// ─── Generate robots.txt ─────────────────────────────────
function generateRobots(config) {
  const domain = config.domain || 'example.com';
  return `User-agent: *\nAllow: /\n\nSitemap: https://${domain}/sitemap.xml\n`;
}

// ─── Copy Directory Recursively ──────────────────────────
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Build One Site ──────────────────────────────────────
async function buildSite(siteId) {
  console.log(`\nBuilding: ${siteId}`);
  const config = loadConfig(siteId);
  const outputDir = path.join(DIST_DIR, siteId);

  // Clean output
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Register partials
  registerPartials();

  // Load base layout
  const layoutPath = path.join(TEMPLATES_DIR, 'layouts', 'base.html');
  if (!fs.existsSync(layoutPath)) {
    console.error('Missing layout: templates/layouts/base.html');
    process.exit(1);
  }
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  const layoutTemplate = Handlebars.compile(layoutSource);

  // Build each page
  for (const page of config.pages || []) {
    const templatePath = path.join(TEMPLATES_DIR, page.template);
    if (!fs.existsSync(templatePath)) {
      console.warn(`  Template not found: ${page.template} — skipping`);
      continue;
    }

    const pageSource = fs.readFileSync(templatePath, 'utf8');
    const pageTemplate = Handlebars.compile(pageSource);

    // Render page content first
    const pageContent = pageTemplate(config);

    // Then render layout with page content injected
    const context = { ...config, page: { ...page, content: pageContent } };
    let html = layoutTemplate(context);

    // Minify HTML
    try {
      html = await minifyHTML(html);
    } catch (e) {
      console.warn(`  HTML minification failed for ${page.output}, using unminified`);
    }

    // Write output
    const outPath = path.join(outputDir, page.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log(`  ✓ ${page.output}`);
  }

  // Auto-generate individual blog post pages
  const blogPostTemplatePath = path.join(TEMPLATES_DIR, 'pages/blog-post.html');
  if (fs.existsSync(blogPostTemplatePath)) {
    const blogPostSource = fs.readFileSync(blogPostTemplatePath, 'utf8');
    const blogPostTemplate = Handlebars.compile(blogPostSource);

    for (const post of config.blog_posts || []) {
      const postPageMeta = {
        template: 'pages/blog-post.html',
        output: `blog/${post.slug}/index.html`,
        title: post.title,
        meta_description: post.meta_description,
        path: `/blog/${post.slug}/`,
        priority: '0.6',
        changefreq: 'monthly',
        post: post
      };

      const pageContent = blogPostTemplate({ ...config, page: postPageMeta });
      const context = { ...config, page: { ...postPageMeta, content: pageContent } };
      let html = layoutTemplate(context);

      try {
        html = await minifyHTML(html);
      } catch (e) {
        console.warn(`  HTML minification failed for blog/${post.slug}/index.html`);
      }

      const outPath = path.join(outputDir, `blog/${post.slug}/index.html`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      console.log(`  ✓ blog/${post.slug}/index.html`);
    }
  }

  // Process CSS
  const cssDir = path.join(ASSETS_DIR, 'css');
  const outCssDir = path.join(outputDir, 'css');
  fs.mkdirSync(outCssDir, { recursive: true });

  // Generate variables.css from branding config
  const variablesCSS = generateVariablesCSS(config);
  fs.writeFileSync(path.join(outCssDir, 'variables.css'), variablesCSS);

  // Minify and copy CSS files
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir)) {
      if (!file.endsWith('.css')) continue;
      const css = fs.readFileSync(path.join(cssDir, file), 'utf8');
      const minified = minifyCSS(css);
      const outName = file.replace('.css', '.min.css');
      fs.writeFileSync(path.join(outCssDir, outName), minified);
      console.log(`  ✓ css/${outName}`);
    }
  }

  // Process JS
  const jsDir = path.join(ASSETS_DIR, 'js');
  const outJsDir = path.join(outputDir, 'js');
  fs.mkdirSync(outJsDir, { recursive: true });

  if (fs.existsSync(jsDir)) {
    for (const file of fs.readdirSync(jsDir)) {
      if (!file.endsWith('.js')) continue;
      const js = fs.readFileSync(path.join(jsDir, file), 'utf8');
      const minified = await minifyJS(js);
      const outName = file.replace('.js', '.min.js');
      fs.writeFileSync(path.join(outJsDir, outName), minified);
      console.log(`  ✓ js/${outName}`);
    }
  }

  // Copy images
  copyDir(path.join(ASSETS_DIR, 'images'), path.join(outputDir, 'images'));

  // Generate sitemap.xml
  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), generateSitemap(config));
  console.log('  ✓ sitemap.xml');

  // Generate robots.txt
  fs.writeFileSync(path.join(outputDir, 'robots.txt'), generateRobots(config));
  console.log('  ✓ robots.txt');

  console.log(`Done: ${siteId} → dist/${siteId}/`);

  // Sync to preview folder for local preview server
  const previewDir = path.join(require('os').homedir(), 'landhawk-dist');
  if (fs.existsSync(previewDir)) {
    fs.rmSync(previewDir, { recursive: true });
  }
  copyDir(outputDir, previewDir);
  console.log(`  ✓ Preview synced → ~/landhawk-dist/`);
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    const configs = fs.readdirSync(CONFIGS_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => f.replace('.json', ''));

    console.log(`Building ${configs.length} site(s)...`);
    for (const siteId of configs) {
      await buildSite(siteId);
    }
    console.log(`\nAll ${configs.length} sites built successfully.`);
  } else if (args.length > 0) {
    await buildSite(args[0]);
  } else {
    console.log('Usage: node build.js <site-id> | node build.js --all');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
