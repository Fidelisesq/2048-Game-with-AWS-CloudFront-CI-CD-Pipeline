'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game2048 } = require('../script.js');

function gameForLogic() {
    const game = Object.create(Game2048.prototype);
    game.size = 4;
    game.score = 0;
    game.soundEnabled = false;
    game.audioContext = null;
    return game;
}

test('merges each pair only once and updates the score', () => {
    const game = gameForLogic();

    assert.deepEqual(game.processLine([2, 2, 2, 2]), [4, 4, 0, 0]);
    assert.equal(game.score, 8);
});

test('compacts a line without changing its values', () => {
    const game = gameForLogic();

    assert.deepEqual(game.processLine([2, 0, 4, 0]), [2, 4, 0, 0]);
    assert.equal(game.score, 0);
});

test('detects wins, losses, and remaining moves', () => {
    const game = gameForLogic();
    game.grid = [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [512, 1024, 2048, 4],
        [8, 16, 32, 64]
    ];
    assert.equal(game.checkWin(), true);
    assert.equal(game.checkLoss(), true);

    game.grid[3][3] = 32;
    assert.equal(game.checkLoss(), false);

    game.grid[3][3] = 0;
    assert.equal(game.checkLoss(), false);
});
