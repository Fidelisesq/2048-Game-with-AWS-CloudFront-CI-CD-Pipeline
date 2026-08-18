'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

test('page has no inline event handlers or inline scripts', () => {
    assert.doesNotMatch(index, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(index, /<script(?![^>]*\bsrc=)[^>]*>/i);
});

test('leaderboard output is built with text content', () => {
    assert.match(script, /player\.textContent/);
    assert.match(script, /scoreValue\.textContent/);
});

test('runtime API defaults to the same origin', () => {
    assert.match(script, /return '\/api'/);
});

test('required progressive web app files exist', () => {
    for (const file of ['manifest.webmanifest', 'service-worker.js', 'privacy.html', '404.html']) {
        assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
    }
});
