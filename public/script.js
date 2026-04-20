// ==========================================
// 1. FIREBASE SETUP & IMPORTS
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXfLXB1GdOG8uZYSPwzOctkgJAlWX0GZA",
  authDomain: "digikashmiri.firebaseapp.com",
  projectId: "digikashmiri",
  storageBucket: "digikashmiri.firebasestorage.app",
  messagingSenderId: "788359622246",
  appId: "1:788359622246:web:0f89ad2600e95df13bc7a7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Data URLs & State
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';
let timetableData = { daily: [], weekly: [] };
let currentUserProfile = null;
let myScheduleTimeView = 'daily'; // 'daily' or 'weekly'

// ==========================================
// 2. AUTHENTICATION & UI TOGGLES
// ==========================================

// Attach functions to window so HTML inline onclick handlers can find them
window.toggleAuth = (view) => {
    document.getElementById('loginForm').classList.toggle('hidden', view !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', view !== 'register');
    hideErrors();
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.app-header .pill').forEach(p => p.classList.remove('active'));
    
    document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.remove('hidden');
    
    if(tabId === 'mySchedule') document.getElementById('navMySchedule').classList.add('active');
    if(tabId === 'allBatches') document.getElementById('navAllBatches').classList.add('active');
    if(tabId === 'teachers') document.getElementById('navTeachers').classList.add('active');
};

window.switchTimeView = (view) => {
    myScheduleTimeView = view;
    document.getElementById('btnDailyMy').classList.toggle('active', view === 'daily');
    document.getElementById('btnWeeklyMy').classList.toggle('active', view === 'weekly');
    renderMySchedule();
};

function hideErrors() {
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
}
function showError(formId, msg) {
    const el = document.getElementById(formId);
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ---------------- Login ----------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        showError('loginError', "Invalid email or password.");
    }
});

// ---------------- Register ----------------
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const stdClass = document.getElementById('regClass').value;
    const batch = document.getElementById('regBatch').value.toUpperCase();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Save extra data to Firestore
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            studentClass: stdClass,
            batch: batch,
            email: email
        });
        // onAuthStateChanged will handle the rest
    } catch (error) {
        showError('registerError', error.message.replace("Firebase: ", ""));
    }
});

// ---------------- Logout ----------------
document.getElementById('logoutBtn').addEventListener('click', () => { signOut(auth); });

// ==========================================
// 3. APP INITIALIZATION (Once Logged In)
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        document.getElementById('authView').classList.add('hidden');
        document.getElementById('appView').classList.remove('hidden');
        
        // Fetch Profile
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            document.getElementById('userNameDisplay').textContent = currentUserProfile.name.split(" ")[0]; // First name
            document.getElementById('userBatchDisplay').textContent = currentUserProfile.batch;
        }

        // Fetch Timetable Data
        await fetchTimetableData();
        renderMySchedule();
    } else {
        // User is signed out
        document.getElementById('appView').classList.add('hidden');
        document.getElementById('authView').classList.remove('hidden');
        currentUserProfile = null;
    }
});

async function fetchTimetableData() {
    try {
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Network error");
        timetableData = await response.json();
    } catch (e) {
        console.error("Failed to load schedule data.");
        document.getElementById('myScheduleResults').innerHTML = '<div class="error-msg">Failed to load schedule. Try again later.</div>';
    }
}

// ==========================================
// 4. RENDERING LOGIC
// ==========================================

// Render User's Specific Schedule
function renderMySchedule() {
    if (!currentUserProfile) return;
    const dataSet = myScheduleTimeView === 'daily' ? timetableData.daily : timetableData.weekly;
    const userBatch = currentUserProfile.batch;
    
    const mySchedule = dataSet.find(b => String(b.Batch).toUpperCase() === userBatch);
    const container = document.getElementById('myScheduleResults');

    if (!mySchedule) {
        container.innerHTML = `<div class="welcome-msg">No classes found for batch <b>${userBatch}</b> in ${myScheduleTimeView} view.</div>`;
    } else {
        container.innerHTML = createCardHTML(mySchedule, 0);
    }
}

// Render Any Batch (Search)
document.getElementById('batchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    const container = document.getElementById('allBatchesResults');
    
    if (query.length < 2) {
        container.innerHTML = '<div class="welcome-msg">Start typing a batch code...</div>';
        return;
    }

    // Search in weekly data (usually contains everything)
    const matches = timetableData.weekly.filter(item => String(item.Batch).toLowerCase().includes(query));
    
    if (matches.length === 0) {
        container.innerHTML = `<div class="welcome-msg">No batches found matching "${query}"</div>`;
    } else {
        container.innerHTML = matches.map((m, i) => createCardHTML(m, i)).join('');
    }
});

// HTML Generator for Cards (Adapted from your original logic)
function createCardHTML(item, index) {
    const batchName = item['Batch'];
    const scheduleByDate = {};

    Object.keys(item).forEach(key => {
        if (key === "Batch") return;
        let dateKey = "Other", info = key;

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
        const roomBadge = data.room ? `<span class="room">${data.room}</span>` : '';
        const rows = data.classes.map(c => `
            <div class="class-row">
                <span class="time">${c.time}</span>
                <span class="subject">${c.subject}</span>
                ${roomBadge} 
            </div>
        `).join('');

        datesHtml += `<div class="date-group"><div class="date-header">📅 ${date}</div>${rows}</div>`;
    }

    return `
        <div class="schedule-card" style="animation-delay: ${index * 0.05}s">
            <div class="card-header-strip"><div class="batch-tag">${batchName}</div></div>
            <div class="card-body">
                ${datesHtml || '<div style="padding:10px; color:#94a3b8; font-size:0.9rem">No classes.</div>'}
            </div>
        </div>
    `;
}

// ==========================================
// 5. TEACHER AVAILABILITY ENGINE
// ==========================================

document.getElementById('teacherInput').addEventListener('input', (e) => {
    const query = e.target.value.trim().toUpperCase();
    const container = document.getElementById('teacherResults');

    if (query.length < 2) {
        container.innerHTML = '<div class="welcome-msg">Search a teacher code (e.g., FR) to see their schedule.</div>';
        return;
    }

    let busySlots = []; // Array to hold { batch, time, subject, date }

    // Scan through all weekly data to find where this teacher is mentioned
    timetableData.weekly.forEach(batchData => {
        const batchName = batchData.Batch;
        
        Object.keys(batchData).forEach(key => {
            if (key === "Batch" || key.toLowerCase().includes("room")) return;
            
            const subjectData = batchData[key]; // e.g., "Che(FR)" or "Che(FR)@10:00"
            
            // Check if the teacher code is in the subject string
            if (typeof subjectData === 'string' && subjectData.toUpperCase().includes(`(${query})`)) {
                // Extract date/time from the key (e.g., "31 Jan, Sat - 9:00 AM")
                let dateStr = "Scheduled", timeStr = key;
                if (key.includes('-')) {
                    const parts = key.split('-');
                    dateStr = parts[0].trim();
                    timeStr = parts.slice(1).join('-').trim();
                }
                
                busySlots.push({
                    batch: batchName,
                    date: dateStr,
                    time: timeStr,
                    subject: subjectData
                });
            }
        });
    });

    if (busySlots.length === 0) {
        container.innerHTML = `<div class="teacher-free-card">✅ Teacher <b>${query}</b> currently has no assigned classes in the schedule.</div>`;
    } else {
        // Group busy slots by Date
        const groupedByDate = {};
        busySlots.forEach(slot => {
            if (!groupedByDate[slot.date]) groupedByDate[slot.date] = [];
            groupedByDate[slot.date].push(slot);
        });

        let html = `<div style="margin-bottom: 15px; color:#334155; font-weight:600;">Schedule for Teacher: ${query}</div>`;
        
        for (const [date, slots] of Object.entries(groupedByDate)) {
            const rows = slots.map(s => `
                <div class="class-row">
                    <span class="time">${s.time}</span>
                    <span class="subject">${s.batch}</span>
                    <span class="room" style="background:#e0f2fe; color:#0369a1;">${s.subject}</span>
                </div>
            `).join('');

            html += `
                <div class="schedule-card">
                    <div class="card-body" style="padding-top:10px;">
                        <div class="date-group">
                            <div class="date-header">📅 ${date}</div>
                            ${rows}
                        </div>
                    </div>
                </div>`;
        }
        container.innerHTML = html;
    }
});