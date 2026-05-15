const COURSE_DATA = [
    { hole: 1, par: 4, index: 3 },
    { hole: 2, par: 4, index: 9 },
    { hole: 3, par: 5, index: 11 },
    { hole: 4, par: 3, index: 13 },
    { hole: 5, par: 4, index: 7 },
    { hole: 6, par: 3, index: 15 },
    { hole: 7, par: 4, index: 5 },
    { hole: 8, par: 3, index: 17 },
    { hole: 9, par: 4, index: 1 }
];

let state = {
    players: [], // { name, shcp }
    scores: {},  // name -> [score_h1, ..., score_h9]
    shots: {},   // hole -> [ {lat, lng, timestamp} ]
    currentHole: 1,
    date: null
};

// DOM Elements
const views = document.querySelectorAll('.view');
const btnHistoryToggle = document.getElementById('btn-history-toggle');
const btnSlopeToggle = document.getElementById('btn-slope-toggle');
const headerTitle = document.getElementById('header-title');

// Start View
const setupPlayersList = document.getElementById('setup-players-list');
const inputPlayerName = document.getElementById('input-player-name');
const inputPlayerShcp = document.getElementById('input-player-shcp');
const btnAddPlayer = document.getElementById('btn-add-player');
const btnStartRound = document.getElementById('btn-start-round');

// Hole View
const currentHoleNumber = document.getElementById('current-hole-number');
const currentHolePar = document.getElementById('current-hole-par');
const currentHoleIndex = document.getElementById('current-hole-index');
const currentHoleImg = document.getElementById('current-hole-img');
const btnPrevHole = document.getElementById('btn-prev-hole');
const btnNextHole = document.getElementById('btn-next-hole');
const btnFinishRound = document.getElementById('btn-finish-round');
const scoringPlayersList = document.getElementById('scoring-players-list');

// Hole View - Media & Map
const btnShowImage = document.getElementById('btn-show-image');
const btnShowMap = document.getElementById('btn-show-map');
const holeImageWrapper = document.getElementById('hole-image-wrapper');
const holeMapWrapper = document.getElementById('hole-map-wrapper');
const btnSaveGps = document.getElementById('btn-save-gps');

// Map variables
let map = null;
let markerGroup = null;

// Scorecard View
const scorecardTable = document.getElementById('scorecard-table');
const scorecardTbody = document.getElementById('scorecard-tbody');
const scorecardTfoot = document.getElementById('scorecard-tfoot');
const btnSaveRound = document.getElementById('btn-save-round');
const btnDiscardRound = document.getElementById('btn-discard-round');

// History View
const historyList = document.getElementById('history-list');
const btnBackToStart = document.getElementById('btn-back-to-start');

// Slope View
const btnBackFromSlope = document.getElementById('btn-back-from-slope');

// Initialization
async function init() {
    setupEventListeners();
    initMap();
    try {
        const activeRound = await window.GolfDB.getActiveRound();
        if (activeRound && activeRound.players && activeRound.players.length > 0) {
            state = activeRound;
            showView('view-hole');
            renderHoleView();
        } else {
            showView('view-start');
            renderStartView();
        }
    } catch (e) {
        console.error("Failed to load active round", e);
        showView('view-start');
        renderStartView();
    }
}

function setupEventListeners() {
    btnAddPlayer.addEventListener('click', addPlayer);
    btnStartRound.addEventListener('click', startRound);
    
    btnPrevHole.addEventListener('click', () => {
        if (state.currentHole > 1) {
            state.currentHole--;
            renderHoleView();
            saveState();
        }
    });
    
    btnNextHole.addEventListener('click', () => {
        if (state.currentHole < 9) {
            state.currentHole++;
            renderHoleView();
            saveState();
        }
    });
    
    btnFinishRound.addEventListener('click', () => {
        showView('view-scorecard');
        renderScorecard();
    });
    
    btnSaveRound.addEventListener('click', saveRoundToHistory);
    btnDiscardRound.addEventListener('click', discardRound);
    
    btnHistoryToggle.addEventListener('click', () => {
        showView('view-history');
        renderHistory();
    });
    
    btnSlopeToggle.addEventListener('click', () => {
        showView('view-slope');
    });
    
    btnBackToStart.addEventListener('click', () => {
        showView('view-start');
    });

    btnBackFromSlope.addEventListener('click', () => {
        showView('view-start');
    });

    // Map Toggles
    btnShowImage.addEventListener('click', () => {
        holeMapWrapper.classList.add('hidden');
        holeImageWrapper.classList.remove('hidden');
        btnShowImage.classList.replace('outline', 'secondary');
        btnShowMap.classList.replace('secondary', 'outline');
    });

    btnShowMap.addEventListener('click', () => {
        holeImageWrapper.classList.add('hidden');
        holeMapWrapper.classList.remove('hidden');
        btnShowMap.classList.replace('outline', 'secondary');
        btnShowImage.classList.replace('secondary', 'outline');
        if (map) {
            setTimeout(() => { map.invalidateSize(); }, 100);
        }
    });

    // GPS save
    btnSaveGps.addEventListener('click', saveGpsPosition);
}

function initMap() {
    // Basic init, center of Sweden roughly, will center on GPS or points later
    map = L.map('map').setView([57.7, 11.9], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);
}

function saveGpsPosition() {
    if (!navigator.geolocation) {
        alert("GPS stöds inte av din webbläsare.");
        return;
    }

    const originalText = btnSaveGps.textContent;
    btnSaveGps.textContent = "Söker...";
    btnSaveGps.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            btnSaveGps.textContent = originalText;
            btnSaveGps.disabled = false;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (!state.shots[state.currentHole]) {
                state.shots[state.currentHole] = [];
            }
            
            state.shots[state.currentHole].push({
                lat: lat,
                lng: lng,
                timestamp: new Date().toISOString()
            });

            saveState();
            updateMapForHole();
        },
        (error) => {
            btnSaveGps.textContent = originalText;
            btnSaveGps.disabled = false;
            alert("Kunde inte hämta position: " + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function updateMapForHole() {
    if (!map || !markerGroup) return;
    
    markerGroup.clearLayers();
    const shots = state.shots[state.currentHole] || [];
    
    if (shots.length > 0) {
        const latlngs = [];
        shots.forEach((shot, index) => {
            const marker = L.marker([shot.lat, shot.lng]).bindPopup(`Slag ${index + 1}`);
            markerGroup.addLayer(marker);
            latlngs.push([shot.lat, shot.lng]);
        });
        
        // Draw path connecting shots
        if (shots.length > 1) {
            const polyline = L.polyline(latlngs, {color: 'var(--primary-color)'});
            markerGroup.addLayer(polyline);
        }

        // Fit map to show all shots
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    }
}

function showView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    // Update Header
    if (viewId === 'view-hole') {
        headerTitle.textContent = `Hål ${state.currentHole}`;
        btnHistoryToggle.classList.add('hidden');
        btnSlopeToggle.classList.add('hidden');
    } else {
        headerTitle.textContent = 'Backa Säteri';
        if (viewId === 'view-start') {
            btnHistoryToggle.classList.remove('hidden');
            btnSlopeToggle.classList.remove('hidden');
        } else {
            btnHistoryToggle.classList.add('hidden');
            btnSlopeToggle.classList.add('hidden');
        }
    }
}

async function saveState() {
    await window.GolfDB.saveActiveRound(state);
}

// Start View Logic
function renderStartView() {
    setupPlayersList.innerHTML = '';
    state.players.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="player-info">
                <span class="player-name">${p.name}</span>
                <span class="player-shcp">SHCP: ${p.shcp}</span>
            </div>
            <button class="icon-btn text-danger" onclick="removePlayer(${index})">
                <span class="material-symbols-rounded">delete</span>
            </button>
        `;
        setupPlayersList.appendChild(li);
    });
    btnStartRound.disabled = state.players.length === 0;
}

function addPlayer() {
    const name = inputPlayerName.value.trim();
    const shcp = parseInt(inputPlayerShcp.value, 10);
    
    if (name && !isNaN(shcp)) {
        state.players.push({ name, shcp });
        state.scores[name] = Array(9).fill(0); // 0 means not played
        
        inputPlayerName.value = '';
        inputPlayerShcp.value = '';
        renderStartView();
    } else {
        alert("Fyll i både namn och Spelhandicap.");
    }
}

window.removePlayer = function(index) {
    const name = state.players[index].name;
    state.players.splice(index, 1);
    delete state.scores[name];
    renderStartView();
};

function startRound() {
    if (state.players.length === 0) return;
    
    state.currentHole = 1;
    state.date = new Date().toISOString();
    
    // If scores aren't set (e.g. from loaded state), initialize them
    state.players.forEach(p => {
        if (!state.scores[p.name]) {
            state.scores[p.name] = Array(9).fill(0);
        }
    });
    
    // Auto-fill par for hole 1 as starting score if 0
    state.players.forEach(p => {
        if (state.scores[p.name][0] === 0) {
            state.scores[p.name][0] = COURSE_DATA[0].par;
        }
    });
    
    saveState();
    showView('view-hole');
    renderHoleView();
}

// Hole View Logic
function renderHoleView() {
    const holeIndex = state.currentHole - 1;
    const holeData = COURSE_DATA[holeIndex];
    
    headerTitle.textContent = `Hål ${state.currentHole}`;
    currentHoleNumber.textContent = `Hål ${state.currentHole}`;
    currentHolePar.textContent = holeData.par;
    currentHoleIndex.textContent = holeData.index;
    currentHoleImg.src = `images/hal-${state.currentHole}.png`;
    
    btnPrevHole.style.visibility = state.currentHole === 1 ? 'hidden' : 'visible';
    
    if (state.currentHole === 9) {
        btnNextHole.style.visibility = 'hidden';
        btnFinishRound.classList.remove('hidden');
    } else {
        btnNextHole.style.visibility = 'visible';
        btnFinishRound.classList.add('hidden');
    }
    
    scoringPlayersList.innerHTML = '';
    
    state.players.forEach(p => {
        let score = state.scores[p.name][holeIndex];
        if (score === 0) {
            // Default to par if not played yet
            score = holeData.par;
            state.scores[p.name][holeIndex] = score;
        }
        
        const points = calculatePoints(p, holeIndex, score);
        
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="scoring-player-header">
                <span class="scoring-player-name">${p.name}</span>
                <span class="scoring-player-points">${points} poäng</span>
            </div>
            <div class="scoring-controls">
                <button class="score-btn" onclick="updateScore('${p.name}', -1)">
                    <span class="material-symbols-rounded">remove</span>
                </button>
                <div class="score-display">${score}</div>
                <button class="score-btn" onclick="updateScore('${p.name}', 1)">
                    <span class="material-symbols-rounded">add</span>
                </button>
            </div>
        `;
        scoringPlayersList.appendChild(li);
    });
    
    saveState();
    updateMapForHole();
}

window.updateScore = function(playerName, delta) {
    const holeIndex = state.currentHole - 1;
    let score = state.scores[playerName][holeIndex];
    
    score += delta;
    if (score < 1) score = 1;
    if (score > 15) score = 15; // Max limit just in case
    
    state.scores[playerName][holeIndex] = score;
    renderHoleView();
};

function calculatePoints(player, holeIndex, score) {
    if (score === 0) return 0;
    
    const holeData = COURSE_DATA[holeIndex];
    const shcp = player.shcp;
    
    // Index 1,3,5.. maps to rank 1,2,3..
    const holeRank = (holeData.index + 1) / 2; 
    
    // Extra strokes
    let extraStrokes = 0;
    if (shcp >= 0) {
        extraStrokes = Math.floor(shcp / 9) + (holeRank <= (shcp % 9) ? 1 : 0);
    } else {
        // Negative SHCP (plus handicap) - subtract strokes
        const absShcp = Math.abs(shcp);
        const penalty = Math.floor(absShcp / 9) + ((10 - holeRank) <= (absShcp % 9) ? 1 : 0);
        extraStrokes = -penalty;
    }
    
    const netScore = score - extraStrokes;
    const points = Math.max(0, 2 + (holeData.par - netScore));
    return points;
}

// Scorecard View Logic
function renderScorecard() {
    // Header
    const thead = scorecardTable.querySelector('thead tr');
    thead.innerHTML = '<th>Hål</th>';
    state.players.forEach(p => {
        thead.innerHTML += `<th>${p.name}</th>`;
    });
    
    // Body
    scorecardTbody.innerHTML = '';
    let totals = {};
    let totalPoints = {};
    state.players.forEach(p => { 
        totals[p.name] = 0; 
        totalPoints[p.name] = 0;
    });
    
    COURSE_DATA.forEach((hole, idx) => {
        let tr = `<tr><td>${hole.hole}</td>`;
        state.players.forEach(p => {
            const score = state.scores[p.name][idx] || 0;
            const points = calculatePoints(p, idx, score);
            
            totals[p.name] += score;
            totalPoints[p.name] += points;
            
            tr += `<td>${score} <br><span class="points">(${points}p)</span></td>`;
        });
        tr += '</tr>';
        scorecardTbody.innerHTML += tr;
    });
    
    // Footer (Totals)
    scorecardTfoot.innerHTML = '<tr><td>Totalt</td>';
    state.players.forEach(p => {
        scorecardTfoot.innerHTML += `<td>${totals[p.name]} <br><span class="points">${totalPoints[p.name]}p</span></td>`;
    });
    scorecardTfoot.innerHTML += '</tr>';
}

async function saveRoundToHistory() {
    await window.GolfDB.saveHistory(state);
    await window.GolfDB.clearActiveRound();
    resetState();
    showView('view-history');
    renderHistory();
}

async function discardRound() {
    if (confirm("Är du säker på att du vill kasta denna runda? Den kan inte återskapas.")) {
        await window.GolfDB.clearActiveRound();
        resetState();
        showView('view-start');
        renderStartView();
    }
}

function resetState() {
    state = {
        players: [],
        scores: {},
        shots: {},
        currentHole: 1,
        date: null
    };
}

// History View Logic
async function renderHistory() {
    historyList.innerHTML = 'Laddar...';
    try {
        const history = await window.GolfDB.getHistory();
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<li>Ingen historik hittades.</li>';
            return;
        }
        
        history.forEach(round => {
            const date = new Date(round.completedAt).toLocaleDateString('sv-SE', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            const li = document.createElement('li');
            li.className = 'history-item';
            
            let html = `<div class="history-date">${date}</div><div class="history-details">`;
            
            round.players.forEach(p => {
                let totalScore = 0;
                let totalPoints = 0;
                
                for (let i = 0; i < 9; i++) {
                    const score = round.scores[p.name][i] || 0;
                    totalScore += score;
                    // Need to calculate points for history display (or store them)
                    // For simplicity, recalculate based on saved SHCP and scores
                    const points = calculatePoints(p, i, score);
                    totalPoints += points;
                }
                
                html += `
                    <div class="history-player">
                        <strong>${p.name}</strong>
                        <span>${totalScore} slag (${totalPoints}p)</span>
                    </div>
                `;
            });
            
            html += `</div>`;
            li.innerHTML = html;
            historyList.appendChild(li);
        });
        
    } catch (e) {
        historyList.innerHTML = 'Kunde inte hämta historik.';
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
