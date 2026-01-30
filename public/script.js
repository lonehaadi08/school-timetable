// CONFIGURATION
// Use the 'Raw' link from your GitHub repo once you push the data.json file.
// For now, during development, we fetch relative to the website root.
const DATA_URL = './data.json'; 

// STATE
let timetableData = { daily: [], weekly: [] };
let currentView = 'daily'; // 'daily' or 'weekly'

const els = {
    input: document.getElementById('batchInput'),
    results: document.getElementById('resultsArea'),
    status: document.getElementById('statusMsg'),
    btnDaily: document.getElementById('btnDaily'),
    btnWeekly: document.getElementById('btnWeekly'),
    lastUpdated: document.getElementById('lastUpdated')
};

// 1. INIT
async function init() {
    els.status.textContent = "Fetching schedule...";
    
    try {
        // Fetch with cache-busting timestamp to ensure fresh data on reload
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Failed to load data");
        
        const json = await response.json();
        timetableData = json;
        
        els.status.textContent = "Ready";
        if(json.metadata && json.metadata.last_updated) {
            els.lastUpdated.textContent = `Last updated: ${json.metadata.last_updated}`;
        }

        // Restore previous search if exists
        const savedBatch = localStorage.getItem('lastBatch');
        if (savedBatch) {
            els.input.value = savedBatch;
            renderResults(savedBatch);
        }

    } catch (error) {
        console.error(error);
        els.status.textContent = "⚠️ Error loading timetable. Please refresh.";
        els.status.style.color = "red";
    }
}

// 2. EVENT LISTENERS
els.input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    localStorage.setItem('lastBatch', query); // Save user preference
    renderResults(query);
});

// 3. CORE LOGIC
function switchView(view) {
    currentView = view;
    
    // Toggle Buttons
    els.btnDaily.classList.toggle('active', view === 'daily');
    els.btnWeekly.classList.toggle('active', view === 'weekly');
    
    // Re-render with current input
    renderResults(els.input.value.trim());
}

function renderResults(query) {
    if (!query) {
        els.results.innerHTML = `<div class="empty-state">Type your batch code to see results.</div>`;
        return;
    }

    const dataSet = currentView === 'daily' ? timetableData.daily : timetableData.weekly;
    
    // Filter Data: Case-insensitive search on ALL fields (safer if column names change)
    const matches = dataSet.filter(row => {
        // Combine all values in the row into a single string for searching
        const rowString = Object.values(row).join(' ').toLowerCase();
        return rowString.includes(query.toLowerCase());
    });

    // Update UI
    if (matches.length === 0) {
        els.results.innerHTML = `<div class="empty-state">No classes found for "${query}" in ${currentView} view.</div>`;
    } else {
        els.results.innerHTML = matches.map(item => createCard(item)).join('');
    }
}

function createCard(item) {
    // We try to intelligently find the columns based on likely names in your CSV
    // Adjust keys ('Subject', 'Time', 'Room') based on your actual CSV headers
    const subject = item['Subject'] || item['Class'] || 'Unknown Class';
    const time = item['Time'] || item['Period'] || '';
    const teacher = item['Teacher'] || item['Faculty'] || '';
    const room = item['Room'] || item['Link'] || '';
    const day = item['Day'] || '';

    return `
        <div class="schedule-card">
            <div class="card-header">
                <span>${day} ${time}</span>
                <span>${room}</span>
            </div>
            <div class="card-subject">${subject}</div>
            <div class="card-details">
                ${teacher ? `👤 ${teacher}` : ''}
            </div>
        </div>
    `;
}

// Start
init();