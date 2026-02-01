// CONFIGURATION
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';

// STATE
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

// 1. TIME AGO HELPER
function timeAgo(dateString) {
    if (!dateString) return "Offline";
    const updated = new Date(dateString.replace(" ", "T")); 
    const now = new Date();
    const diffMins = Math.floor((now - updated) / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    return `${diffHrs}h ago`;
}

// 2. INITIALIZATION
async function init() {
    try {
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Network error");
        
        const json = await response.json();
        timetableData = json;
        
        // Update Timestamp
        if (els.lastUpdated && json.metadata && json.metadata.last_updated) {
            els.lastUpdated.textContent = `Updated ${timeAgo(json.metadata.last_updated)}`;
        }

        // Restore Search State
        const savedBatch = localStorage.getItem('lastBatch');
        if (savedBatch) {
            els.input.value = savedBatch;
            toggleClearBtn(true);
            renderResults(savedBatch);
        }
    } catch (e) {
        console.error("Init Error:", e);
        if(els.lastUpdated) els.lastUpdated.textContent = "Offline Mode";
    }
}

// 3. UI HELPERS
function toggleClearBtn(show) {
    if(!els.clearBtn) return;
    if (show) els.clearBtn.classList.remove('hidden');
    else els.clearBtn.classList.add('hidden');
}

// 4. EVENT LISTENERS
if(els.input) {
    els.input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        toggleClearBtn(val.length > 0);
        localStorage.setItem('lastBatch', val);
        renderResults(val);
    });
}

if(els.clearBtn) {
    els.clearBtn.addEventListener('click', () => {
        els.input.value = '';
        toggleClearBtn(false);
        localStorage.setItem('lastBatch', '');
        renderResults('');
    });
}

// Global function for HTML onclick attributes
window.switchView = (view) => {
    currentView = view;
    if(els.btnDaily) els.btnDaily.classList.toggle('active', view === 'daily');
    if(els.btnWeekly) els.btnWeekly.classList.toggle('active', view === 'weekly');
    if(els.input) renderResults(els.input.value.trim());
};

// 5. RENDER LOGIC
function renderResults(query) {
    if (!els.results) return;
    
    if (!query) {
        els.results.innerHTML = `
            <div class="welcome-msg">
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
            <div class="welcome-msg">
                <div class="illustration">🔍</div>
                <p>No schedule found for "${query}"</p>
            </div>`;
    } else {
        els.results.innerHTML = matches.map((item, index) => createCard(item, index)).join('');
    }
}

// 6. CARD COMPONENT
function createCard(item, index) {
    const batchName = item['Batch'];
    const scheduleByDate = {};

    Object.keys(item).forEach(key => {
        if (key === "Batch") return;

        let dateKey = "Other";
        let info = key;

        // Detect Date Pattern: "Room (31 Jan)" or "31 Jan - 9:00 AM"
        if (key.includes('(')) { 
            const match = key.match(/\((.*?)\)/);
            if (match) dateKey = match[1];
            info = key.split('(')[0].trim();
        } else if (key.includes('-')) { 
            const parts = key.split('-');
            dateKey = parts[0].trim();
            info = parts.slice(1).join('-').trim(); 
        }

        if (!scheduleByDate[dateKey]) scheduleByDate[dateKey] = {};
        
        // Separate Rooms from Subjects
        if (info.toLowerCase().includes('room')) {
            scheduleByDate[dateKey].room = item[key];
        } else {
            if (!scheduleByDate[dateKey].classes) scheduleByDate[dateKey].classes = [];
            scheduleByDate[dateKey].classes.push({ time: info, subject: item[key] });
        }
    });

    let datesHtml = '';
    for (const [date, data] of Object.entries(scheduleByDate)) {
        if (!data.classes) continue;

        const roomBadge = data.room ? `<span class="room">${data.room}</span>` : '';
        
        const rows = data.classes.map(c => `
            <div class="class-row">
                <span class="time">${c.time}</span>
                <span class="subject">${c.subject}</span>
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

    // Returns HTML with Green Header Strip structure
    return `
        <div class="schedule-card" style="animation-delay: ${index * 0.05}s">
            <div class="card-header-strip">
                <div class="batch-tag">${batchName}</div>
            </div>
            <div class="card-body">
                ${datesHtml || '<div style="padding:10px; color:#94a3b8; font-size:0.9rem">No classes scheduled.</div>'}
            </div>
        </div>
    `;
}

// Start App
init();