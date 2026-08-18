'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createSubmissionId,
    validateScoreSubmission
} = require('../terraform/lambda/index.js');

test('accepts and normalizes a valid score submission', () => {
    assert.deepEqual(validateScoreSubmission({
        playerName: '  Ada-1  ',
        score: 2048,
        isPersonalBest: true
    }), {
        ok: true,
        value: {
            playerName: 'Ada-1',
            score: 2048,
            isPersonalBest: true
        }
    });
});

test('rejects unsafe names and invalid scores', () => {
    assert.equal(validateScoreSubmission({ playerName: '<img onerror=alert(1)>', score: 100 }).ok, false);
    assert.equal(validateScoreSubmission({ playerName: 'Ada', score: -1 }).ok, false);
    assert.equal(validateScoreSubmission({ playerName: 'Ada', score: 10.5 }).ok, false);
    assert.equal(validateScoreSubmission({ playerName: 'Ada', score: '2048' }).ok, false);
    assert.equal(validateScoreSubmission({ playerName: 'Ada', score: 100000001 }).ok, false);
});

test('creates deterministic opaque IDs for retries', () => {
    const first = createSubmissionId('retry-key-123456');
    const second = createSubmissionId('retry-key-123456');

    assert.equal(first, second);
    assert.match(first, /^submission-[a-f0-9]{64}$/);
});
