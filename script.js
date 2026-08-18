class Game2048 {
    constructor() {
        this.grid = [];
        this.score = 0;
        this.size = 4;
        this.stateKey = '2048-game-state-v1';
        this.hasWon = false;
        this.highScore = this.loadHighScore();
        this.playerBestScore = this.loadPlayerBestScore();
        this.currentTheme = this.loadTheme();
        this.soundEnabled = this.loadSoundSetting();
        this.achievedMilestones = new Set();
        this.milestones = [128, 256, 512, 1024, 2048];
        this.activeDialogCleanup = null;
        this.gameOverHandled = false;
        this.initAudio();
        if (!this.restoreGameState()) {
            this.init();
        } else {
            this.updateScore();
            this.updateDisplay();
            this.announceBoard('Saved game restored.');
        }
        this.bindEvents();
        this.applyTheme();
        this.updateSoundButton();

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.updateDisplay());
            this.resizeObserver.observe(document.querySelector('.game-container'));
        }
    }

    init() {
        this.grid = Array(this.size).fill().map(() => Array(this.size).fill(0));
        this.score = 0;
        this.hasWon = false;
        this.gameOverHandled = false;
        this.moveCount = 0;
        this.startTime = Date.now();
        this.updateScore();
        this.addRandomTile();
        this.addRandomTile();
        this.updateDisplay();
        this.saveGameState();
        this.announceBoard('New game started.');
        this.trackEvent('game_start');
    }

    addRandomTile() {
        const emptyCells = [];
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 0) {
                    emptyCells.push({x: i, y: j});
                }
            }
        }
        if (emptyCells.length > 0) {
            const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            this.grid[randomCell.x][randomCell.y] = Math.random() < 0.9 ? 2 : 4;
            
            // Play tile placement sound
            this.playTilePlaceSound();
        }
    }

    updateDisplay() {
        const container = document.querySelector('.tile-container');
        if (!container) return;

        container.replaceChildren();
        const cells = [...document.querySelectorAll('.grid-cell')];
        const containerRect = container.getBoundingClientRect();
        const firstCellRect = cells[0]?.getBoundingClientRect();
        const secondCellRect = cells[1]?.getBoundingClientRect();
        const nextRowCellRect = cells[4]?.getBoundingClientRect();

        if (!firstCellRect || !secondCellRect || !nextRowCellRect) return;

        const stepX = secondCellRect.left - firstCellRect.left;
        const stepY = nextRowCellRect.top - firstCellRect.top;
        const originX = firstCellRect.left - containerRect.left;
        const originY = firstCellRect.top - containerRect.top;
        
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] !== 0) {
                    const tile = document.createElement('div');
                    tile.className = `tile tile-${this.grid[i][j]}`;
                    tile.textContent = this.grid[i][j];
                    tile.style.transform = `translate(${originX + (j * stepX)}px, ${originY + (i * stepY)}px)`;
                    container.appendChild(tile);
                }
            }
        }
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
        }
        
        document.getElementById('high-score').textContent = this.highScore;
    }

    move(direction) {
        let moved = false;
        const newGrid = this.grid.map(row => [...row]);

        if (direction === 'left' || direction === 'right') {
            for (let i = 0; i < this.size; i++) {
                const row = direction === 'left' ? newGrid[i] : newGrid[i].slice().reverse();
                const newRow = this.processLine(row);
                if (direction === 'left') {
                    newGrid[i] = newRow;
                } else {
                    newGrid[i] = newRow.reverse();
                }
                if (JSON.stringify(this.grid[i]) !== JSON.stringify(newGrid[i])) {
                    moved = true;
                }
            }
        } else {
            for (let j = 0; j < this.size; j++) {
                const column = [];
                for (let i = 0; i < this.size; i++) {
                    column.push(newGrid[i][j]);
                }
                const processedColumn = direction === 'up' ? this.processLine(column) : this.processLine(column.reverse()).reverse();
                for (let i = 0; i < this.size; i++) {
                    if (this.grid[i][j] !== processedColumn[i]) {
                        moved = true;
                    }
                    newGrid[i][j] = processedColumn[i];
                }
            }
        }

        if (moved) {
            this.grid = newGrid;
            this.moveCount++;
            
            this.addRandomTile();
            this.updateDisplay();
            this.updateScore();
            this.saveGameState();
            this.announceBoard();
            
            // Check milestones after updating display
            this.checkMilestones();
            
            // Check for win (only show once)
            if (!this.hasWon && this.checkWin()) {
                this.hasWon = true;
                this.saveGameState();
                this.trackEvent('game_win', { score: this.score, moves: this.moveCount });
                setTimeout(async () => {
                    const continuePlaying = await this.showDialog({
                        title: 'You reached 2048!',
                        message: 'Would you like to continue playing?',
                        confirmText: 'Continue playing',
                        cancelText: 'Start a new game'
                    });
                    if (!continuePlaying.confirmed) this.restart();
                }, 100);
            }
        }
        
        // Always check for loss after any move attempt
        if (this.checkLoss()) {
            this.trackEvent('game_over', { 
                score: this.score, 
                moves: this.moveCount,
                duration: Math.round((Date.now() - this.startTime) / 1000)
            });
            setTimeout(() => {
                this.handleGameOver();
            }, 100);
        }
    }

    processLine(line) {
        const filtered = line.filter(val => val !== 0);
        const merged = [];
        let i = 0;
        let hasMerged = false;
        
        while (i < filtered.length) {
            if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
                const mergedValue = filtered[i] * 2;
                merged.push(mergedValue);
                this.score += mergedValue;
                hasMerged = true;
                i += 2;
            } else {
                merged.push(filtered[i]);
                i++;
            }
        }
        
        // Play merge sound (metallic coin drop effect)
        if (hasMerged) {
            this.playCoinSound();
        }
        
        while (merged.length < this.size) {
            merged.push(0);
        }
        
        return merged;
    }

    bindEvents() {
        document.getElementById('restart-button')?.addEventListener('click', () => this.requestRestart());
        document.getElementById('share-button')?.addEventListener('click', () => this.shareScore());
        document.getElementById('theme-button')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('leaderboard-button')?.addEventListener('click', () => this.toggleLeaderboard());
        document.getElementById('sound-button')?.addEventListener('click', () => this.toggleSound());
        document.getElementById('milestone-continue')?.addEventListener('click', () => this.closeMilestone());
        document.getElementById('score-form')?.addEventListener('submit', (event) => this.submitScore(event));

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.target.closest('input, textarea, select, button, [role="dialog"]')) return;

            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.move('left');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.move('right');
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.move('up');
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.move('down');
                    break;
            }
        });

        // Touch events for mobile
        let startX, startY;
        const gameContainer = document.querySelector('.game-container');
        
        gameContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            this.createRipple(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        
        gameContainer.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (startX == null || startY == null) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = startX - endX;
            const diffY = startY - endY;
            
            let moveAttempted = false;
            if (Math.abs(diffX) > Math.abs(diffY)) {
                // Horizontal swipe
                if (Math.abs(diffX) > 30) {
                    this.addSwipeEffect();
                    this.move(diffX > 0 ? 'left' : 'right');
                    moveAttempted = true;
                }
            } else {
                // Vertical swipe
                if (Math.abs(diffY) > 30) {
                    this.addSwipeEffect();
                    this.move(diffY > 0 ? 'up' : 'down');
                    moveAttempted = true;
                }
            }
            
            // Check for game over on mobile even if no move was attempted
            if (!moveAttempted && this.checkLoss()) {
                setTimeout(() => {
                    this.handleGameOver();
                }, 100);
            }
            
            startX = startY = null;
        }, { passive: false });

        gameContainer.addEventListener('click', () => gameContainer.focus());
    }

    createRipple(x, y) {
        const gameContainer = document.querySelector('.game-container');
        const rect = gameContainer.getBoundingClientRect();
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.left = `${x - rect.left - 20}px`;
        ripple.style.top = `${y - rect.top - 20}px`;
        gameContainer.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    addSwipeEffect() {
        const gameContainer = document.querySelector('.game-container');
        gameContainer.style.transform = 'scale(0.98)';
        setTimeout(() => {
            gameContainer.style.transform = 'scale(1)';
        }, 100);
    }

    checkWin() {
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 2048) {
                    return true;
                }
            }
        }
        return false;
    }

    checkLoss() {
        // Check if grid is full
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === 0) {
                    return false;
                }
            }
        }
        
        // Check for possible merges
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const current = this.grid[i][j];
                if ((i < this.size - 1 && this.grid[i + 1][j] === current) ||
                    (j < this.size - 1 && this.grid[i][j + 1] === current)) {
                    return false;
                }
            }
        }
        return true;
    }

    saveGameState() {
        const state = {
            version: 1,
            grid: this.grid,
            score: this.score,
            moveCount: this.moveCount,
            hasWon: this.hasWon,
            startTime: this.startTime,
            achievedMilestones: [...this.achievedMilestones]
        };

        localStorage.setItem(this.stateKey, JSON.stringify(state));
    }

    restoreGameState() {
        try {
            const rawState = localStorage.getItem(this.stateKey);
            if (!rawState) return false;

            const state = JSON.parse(rawState);
            const isValidGrid = Array.isArray(state.grid)
                && state.grid.length === this.size
                && state.grid.every((row) => Array.isArray(row)
                    && row.length === this.size
                    && row.every((value) => Number.isInteger(value) && value >= 0));

            if (state.version !== 1 || !isValidGrid || !Number.isSafeInteger(state.score) || state.score < 0) {
                localStorage.removeItem(this.stateKey);
                return false;
            }

            this.grid = state.grid;
            this.score = state.score;
            this.moveCount = Number.isSafeInteger(state.moveCount) ? state.moveCount : 0;
            this.hasWon = state.hasWon === true;
            this.startTime = Number.isFinite(state.startTime) ? state.startTime : Date.now();
            this.achievedMilestones = new Set(
                Array.isArray(state.achievedMilestones) ? state.achievedMilestones : []
            );
            return true;
        } catch {
            localStorage.removeItem(this.stateKey);
            return false;
        }
    }

    announceBoard(prefix = '') {
        const status = document.getElementById('game-status');
        if (!status) return;

        const highestTile = Math.max(...this.grid.flat(), 0);
        status.textContent = `${prefix} Score ${this.score}. Highest tile ${highestTile}. Move ${this.moveCount}.`.trim();
    }

    loadHighScore() {
        return parseInt(localStorage.getItem('2048-highscore') || '0');
    }

    saveHighScore() {
        localStorage.setItem('2048-highscore', this.highScore.toString());
    }

    loadPlayerBestScore() {
        return parseInt(localStorage.getItem('2048-player-best') || '0');
    }

    savePlayerBestScore() {
        localStorage.setItem('2048-player-best', this.playerBestScore.toString());
    }

    async shareScore() {
        const text = `🎮 I just scored ${this.score.toLocaleString()} points in 2048! 🏆 Can you beat my score?`;
        const url = window.location.href;
        const title = '2048 Game Challenge';
        
        // Try to capture screenshot
        let imageBlob = null;
        try {
            imageBlob = await this.captureGameScreenshot();
        } catch (error) {
            console.log('Screenshot not available:', error);
        }
        
        // Use native sharing if available (mobile)
        if (navigator.share && imageBlob) {
            try {
                const file = new File([imageBlob], 'my-2048-score.png', { type: 'image/png' });
                await navigator.share({
                    title: title,
                    text: text,
                    url: url,
                    files: [file]
                });
                return;
            } catch (error) {
                console.log('Native sharing with image failed:', error);
            }
        }
        
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
                return;
            } catch (error) {
                console.log('Native sharing failed:', error);
            }
        }
        
        // Fallback: Show share options
        this.showShareOptions(text, url, imageBlob);
    }
    
    async captureGameScreenshot() {
        // Use html2canvas library if available, otherwise canvas API
        const gameContainer = document.querySelector('.container');
        
        if (typeof html2canvas !== 'undefined') {
            const canvas = await html2canvas(gameContainer, {
                backgroundColor: '#faf8ef',
                scale: 2,
                useCORS: true
            });
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }
        
        // Fallback: Create simple canvas representation
        return this.createSimpleGameImage();
    }
    
    createSimpleGameImage() {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#faf8ef';
        ctx.fillRect(0, 0, 400, 500);
        
        // Title
        ctx.fillStyle = '#776e65';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('2048', 200, 50);
        
        // Score
        ctx.font = '20px Arial';
        ctx.fillText(`Score: ${this.score.toLocaleString()}`, 200, 80);
        
        // Grid background
        ctx.fillStyle = '#bbada0';
        ctx.fillRect(50, 100, 300, 300);
        
        // Draw tiles
        const tileSize = 70;
        const gap = 5;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const value = this.grid[i][j];
                const x = 55 + j * (tileSize + gap);
                const y = 105 + i * (tileSize + gap);
                
                if (value > 0) {
                    // Tile background
                    ctx.fillStyle = this.getTileColor(value);
                    ctx.fillRect(x, y, tileSize, tileSize);
                    
                    // Tile text
                    ctx.fillStyle = value <= 4 ? '#776e65' : '#f9f6f2';
                    ctx.font = value < 100 ? '24px Arial' : value < 1000 ? '20px Arial' : '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(value.toString(), x + tileSize/2, y + tileSize/2 + 8);
                } else {
                    // Empty tile
                    ctx.fillStyle = '#cdc1b4';
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
        
        // Website URL
        ctx.fillStyle = '#776e65';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('play-2048.fozdigitalz.com', 200, 450);
        
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    
    getTileColor(value) {
        const colors = {
            2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
            32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
            512: '#edc850', 1024: '#edc53f', 2048: '#edc22e'
        };
        return colors[value] || '#3c3a32';
    }
    
    showShareOptions(text, url, imageBlob) {
        // Create share modal
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'share-dialog-title');
        modal.innerHTML = `
            <div class="share-content">
                <h2 id="share-dialog-title">🎮 Share your score</h2>
                <p class="share-message"></p>
                <div class="share-buttons">
                    <button type="button" class="share-btn twitter">🐦 X / Twitter</button>
                    <button type="button" class="share-btn linkedin">💼 LinkedIn</button>
                    <button type="button" class="share-btn facebook">📘 Facebook</button>
                    <button type="button" class="share-btn copy">📋 Copy link</button>
                    ${imageBlob ? '<button type="button" class="share-btn download">📸 Download image</button>' : ''}
                </div>
                <button type="button" class="close-btn" aria-label="Close share dialog">✕</button>
            </div>
        `;
        modal.querySelector('.share-message').textContent = text;
        
        document.body.appendChild(modal);
        const previousFocus = document.activeElement;
        
        // Store image blob for download
        if (imageBlob) {
            this.shareImageBlob = imageBlob;
        }
        
        // Add event listeners with proper binding
        const self = this;
        const openShareWindow = (shareUrl) => window.open(shareUrl, '_blank', 'noopener,noreferrer');
        modal.querySelector('.twitter').onclick = () => openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
        modal.querySelector('.linkedin').onclick = () => openShareWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
        modal.querySelector('.facebook').onclick = () => openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
        modal.querySelector('.copy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(`${text} ${url}`);
                this.showToast('Link copied to clipboard.');
            } catch {
                this.showToast('Unable to copy the link. Please copy it from the address bar.', 'error');
            }
        };
        if (imageBlob) {
            modal.querySelector('.download').onclick = () => {
                const imageUrl = URL.createObjectURL(imageBlob);
                const a = document.createElement('a');
                a.href = imageUrl;
                a.download = `2048-score-${self.score}.png`;
                a.click();
                URL.revokeObjectURL(imageUrl);
            };
        }
        const closeModal = () => {
            modal.remove();
            previousFocus?.focus();
        };
        modal.querySelector('.close-btn').onclick = closeModal;
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        });
        modal.querySelector('.close-btn').focus();
    }

    loadTheme() {
        return localStorage.getItem('2048-theme') || 'default';
    }

    saveTheme() {
        localStorage.setItem('2048-theme', this.currentTheme);
    }

    toggleTheme() {
        const themes = ['default', 'theme-dark', 'theme-neon'];
        const labels = ['Default', 'Dark', 'Neon'];
        const currentIndex = themes.indexOf(this.currentTheme);
        this.currentTheme = themes[(currentIndex + 1) % themes.length];
        this.saveTheme();
        this.applyTheme();
        this.showToast(`${labels[(currentIndex + 1) % themes.length]} theme selected.`);
    }

    applyTheme() {
        document.body.className = this.currentTheme === 'default' ? '' : this.currentTheme;
    }

    trackEvent(eventName, parameters = {}) {
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, parameters);
        }
    }

    async toggleLeaderboard() {
        const leaderboard = document.getElementById('leaderboard');
        const toggleButton = document.querySelector('.leaderboard-button');
        if (leaderboard.classList.contains('hidden')) {
            leaderboard.classList.remove('hidden');
            leaderboard.hidden = false;
            toggleButton.setAttribute('aria-expanded', 'true');
            this.initializePlayerName();
            await this.loadLeaderboard();
        } else {
            leaderboard.classList.add('hidden');
            leaderboard.hidden = true;
            toggleButton.setAttribute('aria-expanded', 'false');
        }
    }

    initializePlayerName() {
        const savedName = localStorage.getItem('2048-player-name');
        if (savedName) {
            document.getElementById('player-name').value = savedName;
        }
    }

    async loadLeaderboard() {
        const listElement = document.getElementById('leaderboard-list');
        listElement.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'loading-state';
        loading.textContent = 'Loading leaderboard…';
        listElement.appendChild(loading);
        
        try {
            const apiUrl = this.getApiUrl();
            const scores = await this.fetchJson(`${apiUrl}/leaderboard`);
            listElement.replaceChildren();
            
            if (scores.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.textContent = 'No scores yet. Be the first!';
                listElement.appendChild(emptyMessage);
                return;
            }
            
            scores.forEach((score, index) => {
                const entry = document.createElement('div');
                entry.className = 'leaderboard-entry';

                const player = document.createElement('span');
                player.textContent = `#${index + 1} ${String(score.playerName || 'Anonymous')}`;

                const scoreValue = document.createElement('span');
                scoreValue.textContent = Number(score.score || 0).toLocaleString();

                entry.append(player, scoreValue);
                listElement.appendChild(entry);
            });
        } catch (error) {
            listElement.replaceChildren();
            const errorMessage = document.createElement('p');
            errorMessage.textContent = 'The leaderboard is unavailable right now.';
            const retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.textContent = 'Try again';
            retryButton.addEventListener('click', () => this.loadLeaderboard());
            listElement.append(errorMessage, retryButton);
            console.error('Leaderboard error:', error);
        }
    }

    async submitScore(event) {
        event?.preventDefault();
        const input = document.getElementById('player-name');
        const form = input.closest('form');
        const submitButton = form.querySelector('button[type="submit"]');
        const status = document.getElementById('submit-status');
        const playerName = input.value.normalize('NFKC').trim();
        status.textContent = '';

        if (!playerName) {
            status.textContent = 'Please enter your name.';
            input.focus();
            return;
        }
        
        if (playerName.length > 20 || !/^[\p{L}\p{N} _-]+$/u.test(playerName)) {
            status.textContent = 'Use 20 characters or fewer: letters, numbers, spaces, hyphens or underscores.';
            input.focus();
            return;
        }
        
        if (this.score === 0) {
            status.textContent = 'Make at least one scoring move before submitting.';
            document.getElementById('game-board').focus();
            return;
        }
        
        // Rate limiting - prevent spam submissions
        const lastSubmit = localStorage.getItem('last-submit-time');
        const now = Date.now();
        if (lastSubmit && (now - parseInt(lastSubmit)) < 10000) {
            const seconds = Math.ceil((10000 - (now - parseInt(lastSubmit))) / 1000);
            status.textContent = `Please wait ${seconds} seconds before submitting again.`;
            return;
        }
        
        try {
            const apiUrl = this.getApiUrl();
            const payload = { playerName, score: this.score, isPersonalBest: false };
            this.pendingSubmissionKey ||= crypto.randomUUID();
            submitButton.disabled = true;
            submitButton.textContent = 'Submitting…';
            status.textContent = 'Submitting score…';

            const result = await this.fetchJson(`${apiUrl}/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': this.pendingSubmissionKey
                },
                body: JSON.stringify(payload)
            });

            localStorage.setItem('2048-player-name', playerName);
            localStorage.setItem('last-submit-time', Date.now().toString());
            this.pendingSubmissionKey = null;
            if (result.rank) {
                status.textContent = `Score saved. You are number ${result.rank} on the leaderboard.`;
            } else {
                status.textContent = 'Score saved. Keep playing to reach the top 10.';
            }
            await this.loadLeaderboard();
        } catch (error) {
            status.textContent = error.message || 'Score submission failed. Please try again.';
            console.error('Submit score error:', error);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit current score';
        }
    }

    async fetchJson(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || `Request failed with status ${response.status}`);
            }
            return result;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('The request timed out. Please try again.');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    getApiUrl() {
        // Try to get API URL from window object (set by Terraform output)
        if (window.API_GATEWAY_URL) {
            console.log('Using dynamic API URL:', window.API_GATEWAY_URL);
            return window.API_GATEWAY_URL;
        }
        return '/api';
    }

    async handleGameOver() {
        if (this.gameOverHandled) return;
        this.gameOverHandled = true;

        const savedName = localStorage.getItem('2048-player-name');
        const isPersonalBest = this.score > this.playerBestScore;
        
        if (isPersonalBest) {
            this.playerBestScore = this.score;
            this.savePlayerBestScore();
            
            if (savedName) {
                const saved = await this.autoSubmitScore(savedName);
                await this.showDialog({
                    title: 'New personal best!',
                    message: `${this.score.toLocaleString()} points.${saved ? ' Your score was saved.' : ' The leaderboard is currently unavailable.'}`,
                    confirmText: 'Start a new game',
                    showCancel: false
                });
            } else {
                const result = await this.showDialog({
                    title: 'New personal best!',
                    message: `${this.score.toLocaleString()} points. Enter a name to save it to the leaderboard.`,
                    inputLabel: 'Player name',
                    confirmText: 'Save score',
                    cancelText: 'Skip'
                });
                if (result.confirmed && result.value) {
                    const playerName = result.value.normalize('NFKC').trim();
                    if (/^[\p{L}\p{N} _-]{1,20}$/u.test(playerName)) {
                        localStorage.setItem('2048-player-name', playerName);
                        await this.autoSubmitScore(playerName);
                    } else {
                        this.showToast('The score was not saved because the name was invalid.', 'error');
                    }
                }
            }
        } else {
            await this.showDialog({
                title: 'Game over',
                message: `Final score: ${this.score.toLocaleString()} points.`,
                confirmText: 'Start a new game',
                showCancel: false
            });
        }
        
        this.restart();
    }

    async autoSubmitScore(playerName) {
        try {
            const apiUrl = this.getApiUrl();
            await this.fetchJson(`${apiUrl}/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID()
                },
                body: JSON.stringify({
                    playerName: playerName,
                    score: this.score,
                    isPersonalBest: true
                })
            });
            return true;
        } catch (error) {
            console.error('Auto-submit failed:', error);
            return false;
        }
    }

    initAudio() {
        // Create audio context for sound effects
        this.audioContext = null;
        if (typeof AudioContext !== 'undefined') {
            this.audioContext = new AudioContext();
        } else if (typeof webkitAudioContext !== 'undefined') {
            this.audioContext = new webkitAudioContext();
        }
    }

    playSound(frequency = 440, duration = 100) {
        if (!this.soundEnabled || !this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration / 1000);
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    playCoinSound() {
        if (!this.soundEnabled || !this.audioContext) return;
        
        try {
            const currentTime = this.audioContext.currentTime;
            
            // Pleasant chime sound - C major chord
            const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
            
            frequencies.forEach((freq, index) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                const filter = this.audioContext.createBiquadFilter();
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.audioContext.destination);
                
                osc.frequency.setValueAtTime(freq, currentTime);
                osc.type = 'sine';
                
                // Soft low-pass filter for warmth
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2000, currentTime);
                
                // Gentle bell-like envelope
                const startTime = currentTime + index * 0.05;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
                
                osc.start(startTime);
                osc.stop(startTime + 0.8);
            });
            
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    playTilePlaceSound() {
        if (!this.soundEnabled || !this.audioContext) return;
        
        try {
            const currentTime = this.audioContext.currentTime;
            
            // Gentle water drop sound
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.audioContext.destination);
            
            // Soft frequency sweep like a water drop
            osc.frequency.setValueAtTime(800, currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, currentTime + 0.15);
            osc.type = 'sine';
            
            // Warm low-pass filter
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, currentTime);
            filter.Q.setValueAtTime(2, currentTime);
            
            // Soft bubble-like envelope
            gain.gain.setValueAtTime(0, currentTime);
            gain.gain.linearRampToValueAtTime(0.08, currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.2);
            
            osc.start(currentTime);
            osc.stop(currentTime + 0.2);
            
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    loadSoundSetting() {
        return localStorage.getItem('2048-sound') !== 'false';
    }

    saveSoundSetting() {
        localStorage.setItem('2048-sound', this.soundEnabled.toString());
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.saveSoundSetting();
        this.updateSoundButton();
        
        if (this.soundEnabled) {
            this.playSound(523, 150); // Test sound
        }
    }

    updateSoundButton() {
        const button = document.getElementById('sound-button');
        if (this.soundEnabled) {
            button.textContent = '🔊';
            button.classList.remove('muted');
            button.setAttribute('aria-label', 'Mute sound');
            button.setAttribute('aria-pressed', 'false');
        } else {
            button.textContent = '🔇';
            button.classList.add('muted');
            button.setAttribute('aria-label', 'Turn sound on');
            button.setAttribute('aria-pressed', 'true');
        }
    }
    
    playMilestoneSound() {
        if (!this.soundEnabled || !this.audioContext) return;
        
        try {
            const currentTime = this.audioContext.currentTime;
            
            // Ascending celebration chime - C major scale
            const notes = [523.25, 587.33, 659.25, 698.46, 783.99]; // C5, D5, E5, F5, G5
            
            notes.forEach((freq, index) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                const filter = this.audioContext.createBiquadFilter();
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.audioContext.destination);
                
                osc.frequency.setValueAtTime(freq, currentTime);
                osc.type = 'sine';
                
                // Bright filter for celebration
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(3000, currentTime);
                
                // Quick ascending notes
                const startTime = currentTime + index * 0.1;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
                
                osc.start(startTime);
                osc.stop(startTime + 0.3);
            });
            
        } catch (error) {
            console.log('Audio not supported');
        }
    }

    checkMilestones() {
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const tileValue = this.grid[i][j];
                if (this.milestones.includes(tileValue) && !this.achievedMilestones.has(tileValue)) {
                    this.achievedMilestones.add(tileValue);
                    this.showMilestone(tileValue);
                    return;
                }
            }
        }
    }

    showMilestone(value) {
        const popup = document.getElementById('milestone-popup');
        const tile = document.getElementById('milestone-tile');
        const text = document.getElementById('milestone-text');
        
        tile.textContent = value;
        tile.className = `tile-${value}`;
        text.textContent = `You reached the ${value} tile!`;
        
        popup.classList.remove('hidden');
        popup.hidden = false;
        
        // Play milestone sound - ascending chime
        this.playMilestoneSound();
        popup.querySelector('button').focus();
    }

    closeMilestone() {
        const popup = document.getElementById('milestone-popup');
        popup.classList.add('hidden');
        popup.hidden = true;
        document.getElementById('game-board').focus();
    }

    showToast(message, type = 'success') {
        const region = document.getElementById('toast-region');
        if (!region) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'error' : ''}`.trim();
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        region.appendChild(toast);

        setTimeout(() => toast.remove(), 4500);
    }

    showDialog({
        title,
        message,
        inputLabel = '',
        defaultValue = '',
        confirmText = 'Continue',
        cancelText = 'Cancel',
        showCancel = true
    }) {
        const modal = document.getElementById('app-dialog');
        const titleElement = document.getElementById('dialog-title');
        const messageElement = document.getElementById('dialog-message');
        const input = document.getElementById('dialog-input');
        const inputLabelElement = document.getElementById('dialog-input-label');
        const confirmButton = document.getElementById('dialog-confirm');
        const cancelButton = document.getElementById('dialog-cancel');
        const previousFocus = document.activeElement;

        this.activeDialogCleanup?.();
        titleElement.textContent = title;
        messageElement.textContent = message;
        confirmButton.textContent = confirmText;
        cancelButton.textContent = cancelText;
        cancelButton.hidden = !showCancel;

        const hasInput = Boolean(inputLabel);
        inputLabelElement.textContent = inputLabel || 'Input';
        inputLabelElement.classList.toggle('hidden', !hasInput);
        input.classList.toggle('hidden', !hasInput);
        input.hidden = !hasInput;
        input.value = hasInput ? defaultValue : '';

        modal.hidden = false;
        modal.classList.remove('hidden');

        return new Promise((resolve) => {
            const finish = (confirmed) => {
                cleanup();
                modal.hidden = true;
                modal.classList.add('hidden');
                previousFocus?.focus();
                resolve({ confirmed, value: hasInput ? input.value.trim() : '' });
            };

            const handleKeydown = (event) => {
                if (event.key === 'Escape' && showCancel) finish(false);
                if (event.key === 'Enter' && event.target === input) finish(true);
            };

            const cleanup = () => {
                confirmButton.removeEventListener('click', confirm);
                cancelButton.removeEventListener('click', cancel);
                modal.removeEventListener('keydown', handleKeydown);
                this.activeDialogCleanup = null;
            };
            const confirm = () => finish(true);
            const cancel = () => finish(false);

            this.activeDialogCleanup = cleanup;
            confirmButton.addEventListener('click', confirm);
            cancelButton.addEventListener('click', cancel);
            modal.addEventListener('keydown', handleKeydown);
            (hasInput ? input : confirmButton).focus();
        });
    }

    async requestRestart() {
        if (this.moveCount === 0 && this.score === 0) {
            this.restart();
            return;
        }

        const result = await this.showDialog({
            title: 'Start a new game?',
            message: 'Your current board will be replaced.',
            confirmText: 'Start new game',
            cancelText: 'Keep playing'
        });
        if (result.confirmed) this.restart();
    }

    restart() {
        this.achievedMilestones.clear();
        localStorage.removeItem(this.stateKey);
        this.init();
        document.getElementById('game-board').focus();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Game2048 };
}

if (typeof document !== 'undefined') {
    globalThis.game = new Game2048();
}
