import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, getDocs, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
// Import Day.js for Professional Time Handling
import dayjs from "https://cdn.skypack.dev/dayjs";
import relativeTime from "https://cdn.skypack.dev/dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

// --- PASTE YOUR FIREBASE CONFIG HERE ---
const firebaseConfig = {
    apiKey: "AIzaSy...", // <--- PASTE YOUR REAL KEY
    authDomain: "risetimetable.firebaseapp.com",
    projectId: "risetimetable",
    storageBucket: "risetimetable.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable Offline Persistence
try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

const selectEl = document.getElementById('class-select');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const displayDiv = document.getElementById('timetable-display');
const timelineDiv = document.getElementById('timeline-container');
const lastUpdatedEl = document.getElementById('last-updated');

let allData = [];

// 1. INIT
async function init() {
    // Check Cache
    const cached = localStorage.getItem('timetable_data');
    if (cached) {
        allData = JSON.parse(cached);
        setupUI();
    }

    // Fetch Fresh
    try {
        const snap = await getDocs(collection(db, "timetables"));
        if (!snap.empty) {
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
            
            allData = docs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
            localStorage.setItem('timetable_data', JSON.stringify(allData));
            
            setupUI();
            statusText.innerText = "System Live";
            statusDot.classList.add('live');
        }
    } catch (e) {
        console.error(e);
        statusText.innerText = "Offline Mode";
    }
}

function setupUI() {
    const saved = localStorage.getItem('selected_class');
    const current = selectEl.value || saved;

    selectEl.innerHTML = '<option value="">Select Your Class</option>';
    allData.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.innerText = `Class ${d.id}`;
        selectEl.appendChild(opt);
    });
    selectEl.disabled = false;

    if (current) {
        selectEl.value = current;
        const data = allData.find(d => d.id === current);
        if(data) renderTimeline(data);
    }
}

// 2. RENDER
selectEl.addEventListener('change', (e) => {
    const cid = e.target.value;
    localStorage.setItem('selected_class', cid);
    if (!cid) { displayDiv.classList.add('hidden'); return; }
    const data = allData.find(d => d.id === cid);
    renderTimeline(data);
});

function renderTimeline(data) {
    timelineDiv.innerHTML = '';
    const schedule = data.schedule['Today'];

    if (!schedule) {
        timelineDiv.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.7;">No classes today.</div>';
        displayDiv.classList.remove('hidden');
        return;
    }

    // Sort Times
    const timeKeys = Object.keys(schedule).sort((a, b) => parseTime(a) - parseTime(b));
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    timeKeys.forEach((timeStr, index) => {
        if (timeStr === 'lastUpdated') return;

        const card = document.createElement('div');
        card.className = 'class-card';
        if (isTimeActive(timeStr, nowMinutes)) card.classList.add('active-now');

        const [t, ampm] = timeStr.split(' ');
        card.innerHTML = `
            <div class="time-col">
                <span>${t}</span>
                <span class="time-ampm">${ampm || ''}</span>
            </div>
            <div class="subject-col">${schedule[timeStr]}</div>
        `;
        
        setTimeout(() => card.classList.add('animate'), index * 80);
        timelineDiv.appendChild(card);
    });

    // --- TIME CORRECTION FIX ---
    if (data.lastUpdated) {
        // Convert Firestore Timestamp -> JS Date
        const dateObj = new Date(data.lastUpdated.seconds * 1000);
        
        // 1. Show Relative Time (e.g. "5 mins ago") - Self correcting!
        // 2. Show Absolute Time on hover
        const relative = dayjs(dateObj).fromNow(); 
        const absolute = dayjs(dateObj).format('h:mm A');
        
        lastUpdatedEl.innerHTML = `Updated <strong style="color:white;">${relative}</strong> (${absolute})`;
    }

    displayDiv.classList.remove('hidden');
}

// Helpers
function parseTime(t) {
    const [time, mod] = t.split(' ');
    let [h, m] = time.split(':');
    h = parseInt(h); m = parseInt(m);
    if (mod === 'PM' && h < 12) h += 12;
    if (mod === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

function isTimeActive(t, nowMins) {
    const start = parseTime(t);
    return nowMins >= start && nowMins < (start + 50);
}

init();