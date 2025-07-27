class Game2048 {
    constructor() {
        this.grid = [];
        this.score = 0;
        this.size = 4;
        this.hasWon = false;
        this.highScore = this.loadHighScore();
        this.playerBestScore = this.loadPlayerBestScore();
        this.currentTheme = this.loadTheme();
        this.soundEnabled = this.loadSoundSetting();
        this.achievedMilestones = new Set();
        this.milestones = [128, 256, 512, 1024, 2048];
        this.init();
        this.bindEvents();
        this.applyTheme();
        this.updateSoundButton();
        this.initAudio();
    }

    init() {
        this.grid = Array(this.size).fill().map(() => Array(this.size).fill(0));
        this.score = 0;
        this.hasWon = false;
        this.moveCount = 0;
        this.startTime = Date.now();
        this.updateScore();
        this.addRandomTile();
        this.addRandomTile();
        this.updateDisplay();
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
        container.innerHTML = '';
        
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] !== 0) {
                    const tile = document.createElement('div');
                    tile.className = `tile tile-${this.grid[i][j]}`;
                    tile.textContent = this.grid[i][j];
                    tile.style.left = `${j * 117 + 10}px`;
                    tile.style.top = `${i * 117 + 10}px`;
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
            
            // Check milestones after updating display
            this.checkMilestones();
            
            // Check for win (only show once)
            if (!this.hasWon && this.checkWin()) {
                this.hasWon = true;
                this.trackEvent('game_win', { score: this.score, moves: this.moveCount });
                setTimeout(() => {
                    if (confirm('You won! Reached 2048! Continue playing?')) {
                        // Continue playing
                    } else {
                        this.restart();
                    }
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
        // Keyboard events
        document.addEventListener('keydown', (e) => {
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
        });
        
        gameContainer.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!startX || !startY) return;
            
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
                    alert('Game Over! No more moves available.');
                    this.restart();
                }, 100);
            }
            
            startX = startY = null;
        });
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
        modal.innerHTML = `
            <div class="share-content">
                <h3>🎮 Share Your Score!</h3>
                <p>${text}</p>
                <div class="share-buttons">
                    <button class="share-btn twitter">🐦 Twitter</button>
                    <button class="share-btn linkedin">💼 LinkedIn</button>
                    <button class="share-btn facebook">📘 Facebook</button>
                    <button class="share-btn copy">📋 Copy Link</button>
                    ${imageBlob ? '<button class="share-btn download">📸 Download Image</button>' : ''}
                </div>
                <button class="close-btn">✕</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Store image blob for download
        if (imageBlob) {
            this.shareImageBlob = imageBlob;
        }
        
        // Add event listeners with proper binding
        const self = this;
        modal.querySelector('.twitter').onclick = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`, '_blank');
        modal.querySelector('.linkedin').onclick = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&summary=${encodeURIComponent(text)}`, '_blank');
        modal.querySelector('.facebook').onclick = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
        modal.querySelector('.copy').onclick = () => {
            navigator.clipboard.writeText(`${text} ${url}`);
            alert('Copied to clipboard!');
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
        modal.querySelector('.close-btn').onclick = () => {
            modal.remove();
        };
    }

    loadTheme() {
        return localStorage.getItem('2048-theme') || 'default';
    }

    saveTheme() {
        localStorage.setItem('2048-theme', this.currentTheme);
    }

    toggleTheme() {
        const themes = ['default', 'theme-dark', 'theme-neon'];
        const currentIndex = themes.indexOf(this.currentTheme);
        this.currentTheme = themes[(currentIndex + 1) % themes.length];
        this.saveTheme();
        this.applyTheme();
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
        if (leaderboard.classList.contains('hidden')) {
            leaderboard.classList.remove('hidden');
            this.initializePlayerName();
            await this.loadLeaderboard();
        } else {
            leaderboard.classList.add('hidden');
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
        listElement.innerHTML = 'Loading...';
        
        try {
            const apiUrl = this.getApiUrl();
            console.log('Loading leaderboard from:', apiUrl + '/leaderboard');
            const response = await fetch(apiUrl + '/leaderboard');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const scores = await response.json();
            console.log('Leaderboard response:', scores);
            
            if (scores.length === 0) {
                listElement.innerHTML = '<p>No scores yet. Be the first!</p>';
                return;
            }
            
            listElement.innerHTML = scores.map((score, index) => 
                `<div class="leaderboard-entry">
                    <span>#${index + 1} ${score.playerName}</span>
                    <span>${score.score.toLocaleString()}</span>
                </div>`
            ).join('');
        } catch (error) {
            listElement.innerHTML = '<p>Failed to load leaderboard</p>';
            console.error('Leaderboard error:', error);
        }
    }

    async submitScore() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('Please enter your name');
            return;
        }
        
        if (this.score === 0) {
            alert('Play a game first!');
            return;
        }
        
        // Save player name for future auto-submissions
        localStorage.setItem('2048-player-name', playerName);
        
        try {
            const apiUrl = this.getApiUrl();
            const payload = { playerName, score: this.score, isPersonalBest: false };
            
            const response = await fetch(apiUrl + '/score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                if (result.added) {
                    alert(`Score submitted successfully! Ranked #${result.rank} on leaderboard.`);
                } else {
                    alert('Score submitted but not high enough for current leaderboard ranking.');
                }
                document.getElementById('player-name').value = '';
                await this.loadLeaderboard();
            } else {
                alert(result.error || 'Failed to submit score');
            }
        } catch (error) {
            alert('Failed to submit score: ' + error.message);
            console.error('Submit score error:', error);
        }
    }

    getApiUrl() {
        // Try to get API URL from window object (set by Terraform output)
        if (window.API_GATEWAY_URL) {
            console.log('Using dynamic API URL:', window.API_GATEWAY_URL);
            return window.API_GATEWAY_URL;
        }
        // Fallback to hardcoded URL - replace with your actual API Gateway URL
        const fallbackUrl = 'https://i4tar1ds8e.execute-api.us-east-1.amazonaws.com/prod';
        console.log('Using fallback API URL:', fallbackUrl);
        return fallbackUrl;
    }

    async handleGameOver() {
        const savedName = localStorage.getItem('2048-player-name');
        const isPersonalBest = this.score > this.playerBestScore;
        
        if (isPersonalBest) {
            this.playerBestScore = this.score;
            this.savePlayerBestScore();
            
            if (savedName) {
                // Auto-save personal best with existing name
                await this.autoSubmitScore(savedName);
                alert(`Game Over! New personal best: ${this.score.toLocaleString()} points!\nScore automatically saved to leaderboard.`);
            } else {
                // Prompt for name for personal best
                const playerName = prompt(`Game Over! New personal best: ${this.score.toLocaleString()} points!\nEnter your name to save to leaderboard:`);
                if (playerName && playerName.trim()) {
                    localStorage.setItem('2048-player-name', playerName.trim());
                    await this.autoSubmitScore(playerName.trim());
                } else {
                    alert('Game Over! Score not saved.');
                }
            }
        } else {
            alert('Game Over! No more moves available.');
        }
        
        this.restart();
    }

    async autoSubmitScore(playerName) {
        try {
            const apiUrl = this.getApiUrl();
            await fetch(apiUrl + '/score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerName: playerName,
                    score: this.score,
                    isPersonalBest: true
                })
            });
        } catch (error) {
            console.error('Auto-submit failed:', error);
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
        } else {
            button.textContent = '🔇';
            button.classList.add('muted');
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
        
        // Play milestone sound - ascending chime
        this.playMilestoneSound();
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 3000);
    }

    closeMilestone() {
        document.getElementById('milestone-popup').classList.add('hidden');
    }

    restart() {
        this.achievedMilestones.clear();
        this.init();
    }
}

const game = new Game2048();