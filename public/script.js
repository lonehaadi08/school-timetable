// CONFIGURATION
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';

// STATE
let timetableData = { daily: [], weekly: [] };
let currentView = 'daily'; 

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
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Failed to load data");
        
        const json = await response.json();
        timetableData = json;
        
        els.status.textContent = "Ready";
        if(json.metadata && json.metadata.last_updated) {
            // Format the update time nicely
            const date = new Date(json.metadata.last_updated.replace(" ", "T"));
            els.lastUpdated.textContent = `Last updated: ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }

        const savedBatch = localStorage.getItem('lastBatch');
        if (savedBatch) {
            els.input.value = savedBatch;
            renderResults(savedBatch);
        }
    } catch (error) {
        console.error(error);
        els.status.textContent = "⚠️ Error loading data. Refresh page.";
    }
}

// 2. EVENTS
els.input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    localStorage.setItem('lastBatch', query);
    renderResults(query);
});

// 3. LOGIC
function switchView(view) {
    currentView = view;
    els.btnDaily.classList.toggle('active', view === 'daily');
    els.btnWeekly.classList.toggle('active', view === 'weekly');
    renderResults(els.input.value.trim());
}

function renderResults(query) {
    if (!query) {
        els.results.innerHTML = `<div class="empty-state">Enter your batch code to see the schedule.</div>`;
        return;
    }

    const dataSet = currentView === 'daily' ? timetableData.daily : timetableData.weekly;
    if (!dataSet) return;

    // Filter by Batch Name
    const matches = dataSet.filter(item => 
        item['Batch'].toLowerCase().includes(query.toLowerCase())
    );

    if (matches.length === 0) {
        els.results.innerHTML = `<div class="empty-state">No batch found for "${query}"</div>`;
    } else {
        els.results.innerHTML = matches.map(item => createCard(item)).join('');
    }
}

function createCard(item) {
    const batchName = item['Batch'];
    
    // Group headers by Date
    // Keys look like: "31 Jan - 9:00 AM" or "Room (31 Jan)"
    const scheduleByDate = {};

    Object.keys(item).forEach(key => {
        if (key === "Batch") return;

        // Extract Date from key (text between parenthesis or before dash)
        let dateKey = "Other";
        let info = key;

        if (key.includes('(')) {
            // Format: "Room (31 Jan)"
            const match = key.match(/\((.*?)\)/);
            if (match) dateKey = match[1];
            info = key.split('(')[0].trim();
        } else if (key.includes('-')) {
            // Format: "31 Jan - 9:00 AM"
            const parts = key.split('-');
            dateKey = parts[0].trim();
            info = parts[1].trim();
        }

        if (!scheduleByDate[dateKey]) scheduleByDate[dateKey] = [];
        scheduleByDate[dateKey].push({ label: info, value: item[key] });
    });

    // Build HTML
    let datesHtml = '';
    for (const [date, classes] of Object.entries(scheduleByDate)) {
        const classRows = classes.map(c => `
            <div class="class-row">
                <span class="class-time">${c.label}</span>
                <span class="class-name">${c.value}</span>
            </div>
        `).join('');

        datesHtml += `
            <div class="date-group">
                <div class="date-header">📅 ${date}</div>
                ${classRows}
            </div>
        `;
    }

    return `
        <div class="schedule-card">
            <div class="card-header-main">
                <span class="batch-tag">${batchName}</span>
            </div>
            ${datesHtml || '<div class="empty-state" style="padding:10px; font-size:0.9rem">No classes scheduled for this week.</div>'}
        </div>
    `;
}

init();