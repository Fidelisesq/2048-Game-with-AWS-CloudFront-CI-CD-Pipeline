'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'terraform', 'main.tf'), 'utf8');
const leaderboard = fs.readFileSync(path.join(root, 'terraform', 'leaderboard.tf'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');

test('S3 content is private and reached through CloudFront OAC', () => {
    assert.match(main, /aws_cloudfront_origin_access_control/);
    assert.match(main, /block_public_acls\s*=\s*true/);
    assert.match(main, /restrict_public_buckets\s*=\s*true/);
    assert.doesNotMatch(main, /aws_s3_bucket_website_configuration/);
    assert.doesNotMatch(main, /Principal\s*=\s*"\*"/);
});

test('leaderboard data has recovery and deletion controls', () => {
    assert.match(leaderboard, /deletion_protection_enabled\s*=\s*var\.environment == "production"/);
    assert.match(leaderboard, /point_in_time_recovery/);
    assert.match(leaderboard, /allow_origins\s*=\s*\[local\.site_origin\]/);
});

test('deployment uses OIDC and immutable action commits', () => {
    assert.match(workflow, /role-to-assume:/);
    assert.doesNotMatch(workflow, /aws-access-key-id:|aws-secret-access-key:/);

    const actionReferences = [...workflow.matchAll(/uses:\s*[^\s@]+@([^\s#]+)/g)].map((match) => match[1]);
    assert.ok(actionReferences.length >= 4);
    assert.equal(actionReferences.every((reference) => /^[a-f0-9]{40}$/.test(reference)), true);
});

test('release assembly cannot upload repository or Lambda source files', () => {
    assert.match(workflow, /Assemble release artifact/);
    assert.match(workflow, /aws s3 sync release\//);
    assert.doesNotMatch(workflow, /aws s3 (?:cp|sync) \. /);
});
