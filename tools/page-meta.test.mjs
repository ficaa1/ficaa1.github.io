import test from 'node:test';
import assert from 'node:assert/strict';
import { completePage } from './page-meta.mjs';

const source = '<html><head><title>One &amp; Two</title></head><body><nav><a href="index.html">Welcome</a> | <b>Blog</b></nav><main><p>A short post.</p></main><script src="../site.js"></script></body></html>';

test('repeated generation leaves a page unchanged', () => {
  const html = completePage(source, 'posts/example.html');
  assert.equal(completePage(html, 'posts/example.html'), html);
});

test('metadata escapes text and gives posts their article type', () => {
  const html = completePage(source, 'posts/example.html');
  assert.match(html, /og:title" content="One &amp; Two"/);
  assert.doesNotMatch(html, /&amp;amp;/);
  assert.match(html, /description" content="A short post\."/);
  assert.match(html, /og:type" content="article"/);
});

test('existing share images and descriptions take precedence', () => {
  const html = completePage(source.replace('</head>', '<meta name="description" content="My description"><meta property="og:image" content="https://example.com/own.jpg"></head>'), 'photos/test/index.html');
  assert.match(html, /twitter:image" content="https:\/\/example.com\/own.jpg"/);
  assert.match(html, /og:description" content="My description"/);
  assert.equal([...html.matchAll(/property="og:image"/g)].length, 1);
});

test('canonical links use the published origin and directory routes', () => {
  assert.match(completePage(source, 'photos/test/index.html'), /canonical" href="https:\/\/www.filipbiljic.com\/photos\/test\/"/);
  assert.match(completePage(source, 'index.html'), /canonical" href="https:\/\/www.filipbiljic.com\/"/);
});

test('navigation stays semantic and asset versions keep relative paths', () => {
  const html = completePage(source, 'posts/example.html');
  assert.match(html, /<nav aria-label="Main">/);
  assert.match(html, /<b aria-current="page">Blog<\/b>/);
  assert.doesNotMatch(html, / \| /);
  assert.match(html, /src="\.\.\/site\.js\?v=[a-f0-9]{8}"/);
});
