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

function timeAgo(dateString) {
    if (!dateString) return "Offline";
    const updated = new Date(dateString.replace(" ", "T")); 
    const now = new Date();
    const diffMins = Math.floor((now - updated) / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
}

async function init() {
    try {
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Network error");
        const json = await response.json();
        timetableData = json;
        
        if (els.lastUpdated && json.metadata) {
            els.lastUpdated.textContent = `Updated ${timeAgo(json.metadata.last_updated)}`;
        }

        const savedBatch = localStorage.getItem('lastBatch');
        if (savedBatch) {
            els.input.value = savedBatch;
            toggleClearBtn(true);
            renderResults(savedBatch);
        }
    } catch (e) {
        console.error(e);
        if(els.lastUpdated) els.lastUpdated.textContent = "Offline";
    }
}

function toggleClearBtn(show) {
    els.clearBtn.style.display = show ? 'block' : 'none';
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

function renderResults(query) {
    if (!query) {
        els.results.innerHTML = `
            <div class="welcome-msg">
                <h2>👋 Hey there!</h2>
                <p>Type your batch code to see your plan.</p>
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
                <h2>🤔 Oops</h2>
                <p>No batch found for "${query}"</p>
            </div>`;
    } else {
        els.results.innerHTML = matches.map((item, index) => createCard(item, index)).join('');
    }
}

function createCard(item, index) {
    const batchName = item['Batch'];
    const scheduleByDate = {};

    Object.keys(item).forEach(key => {
        if (key === "Batch") return;
        let dateKey = "Other";
        let info = key;

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
        const roomBadge = data.room ? `<div class="room">📍 ${data.room}</div>` : '';
        
        const rows = data.classes.map(c => `
            <div class="class-row">
                <div class="time">${c.time}</div>
                <div class="subject">${c.subject}</div>
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

    // Add staggered animation delay
    return `
        <div class="schedule-card" style="animation-delay: ${index * 0.1}s">
            <div class="batch-tag">${batchName}</div>
            ${datesHtml}
        </div>
    `;
}

init();