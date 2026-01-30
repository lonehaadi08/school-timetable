const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';

let timetableData = { daily: [], weekly: [] };
let currentView = 'daily'; 

const els = {
    input: document.getElementById('batchInput'),
    clearBtn: document.getElementById('clearSearch'),
    results: document.getElementById('resultsArea'),
    lastUpdated: document.getElementById('lastUpdated'),
    btnDaily: document.getElementById('btnDaily'),
    btnWeekly: document.getElementById('btnWeekly')
};

// 1. Time Ago Helper (e.g. "Updated 5m ago")
function timeAgo(dateString) {
    if (!dateString) return "Offline";
    // Fix python timestamp format if needed
    const updated = new Date(dateString.replace(" ", "T")); 
    const now = new Date();
    const diffMs = now - updated;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    return `${diffHrs}h ago`;
}

// 2. Init
async function init() {
    try {
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Network error");
        
        const json = await response.json();
        timetableData = json;
        
        // Set update time
        if (json.metadata && json.metadata.last_updated) {
            els.lastUpdated.textContent = `Updated ${timeAgo(json.metadata.last_updated)}`;
        }

        // Restore Search
        const savedBatch = localStorage.getItem('lastBatch');
        if (savedBatch) {
            els.input.value = savedBatch;
            toggleClearBtn(true);
            renderResults(savedBatch);
        }
    } catch (e) {
        console.error(e);
        els.lastUpdated.textContent = "Offline Mode";
    }
}

// 3. UI Helpers
function toggleClearBtn(show) {
    if (show) els.clearBtn.classList.remove('hidden');
    else els.clearBtn.classList.add('hidden');
}

els.input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    toggleClearBtn(val.length > 0);
    localStorage.setItem('lastBatch', val);
    renderResults(val);
});

els.clearBtn.addEventListener('click', () => {
    els.input.value = '';
    toggleClearBtn(false);
    localStorage.setItem('lastBatch', '');
    renderResults('');
});

window.switchView = (view) => {
    currentView = view;
    els.btnDaily.classList.toggle('active', view === 'daily');
    els.btnWeekly.classList.toggle('active', view === 'weekly');
    renderResults(els.input.value.trim());
};

// 4. Render Logic
function renderResults(query) {
    if (!query) {
        els.results.innerHTML = `
            <div class="empty-state-hero">
                <div class="illustration">🎓</div>
                <h2>Student Portal</h2>
                <p>Type your batch code to find your classes.</p>
            </div>`;
        return;
    }

    const dataSet = currentView === 'daily' ? timetableData.daily : timetableData.weekly;
    if (!dataSet) return;

    const matches = dataSet.filter(item => {
        const batch = item['Batch'] ? String(item['Batch']) : "";
        return batch.toLowerCase().includes(query.toLowerCase());
    });

    if (matches.length === 0) {
        els.results.innerHTML = `
            <div class="empty-state-hero">
                <div class="illustration">🔍</div>
                <p>No schedule found for "${query}"</p>
            </div>`;
    } else {
        els.results.innerHTML = matches.map(createCard).join('');
    }
}

function createCard(item) {
    const batchName = item['Batch'];
    const scheduleByDate = {};

    // Grouping Logic
    Object.keys(item).forEach(key => {
        if (key === "Batch") return;

        let dateKey = "Other";
        let info = key;

        // Try to detect Date in key
        if (key.includes('(')) { // e.g. Room (31 Jan)
            const match = key.match(/\((.*?)\)/);
            if (match) dateKey = match[1];
            info = key.split('(')[0].trim();
        } else if (key.includes('-')) { // e.g. 31 Jan - 9:00 AM
            const parts = key.split('-');
            dateKey = parts[0].trim();
            info = parts.slice(1).join('-').trim(); // Join back if time had dashes
        }

        if (!scheduleByDate[dateKey]) scheduleByDate[dateKey] = {};
        
        // Check if this is a Room or a Subject/Time
        if (info.toLowerCase().includes('room')) {
            scheduleByDate[dateKey].room = item[key];
        } else {
            if (!scheduleByDate[dateKey].classes) scheduleByDate[dateKey].classes = [];
            scheduleByDate[dateKey].classes.push({ time: info, subject: item[key] });
        }
    });

    // Generate HTML
    let datesHtml = '';
    for (const [date, data] of Object.entries(scheduleByDate)) {
        if (!data.classes) continue;

        const roomBadge = data.room ? `<span class="class-room">${data.room}</span>` : '';
        
        const rows = data.classes.map(c => `
            <div class="class-row">
                <span class="class-time">${c.time}</span>
                <span class="class-name">${c.subject}</span>
                ${roomBadge} 
            </div>
        `).join('');

        datesHtml += `
            <div class="date-group">
                <div class="date-header">📅 ${date}</div>
                ${rows}
            </div>
        `;
    }

    return `
        <div class="schedule-card">
            <div class="batch-tag">${batchName}</div>
            ${datesHtml}
        </div>
    `;
}

init();