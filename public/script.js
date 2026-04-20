// ==========================================
// 1. FIREBASE SETUP
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXfLXB1GdOG8uZYSPwzOctkgJAlWX0GZA",
  authDomain: "digikashmiri.firebaseapp.com",
  projectId: "digikashmiri",
  storageBucket: "digikashmiri.firebasestorage.app",
  messagingSenderId: "788359622246",
  appId: "1:788359622246:web:0f89ad2600e95df13bc7a7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Data & State
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';
let timetableData = { daily: [], weekly: [] };
let currentUserProfile = null;
let myScheduleTimeView = 'daily';

// ==========================================
// 2. UI NAVIGATION TOGGLES
// ==========================================
window.toggleAuth = (view) => {
    document.getElementById('loginForm').classList.toggle('hidden', view !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', view !== 'register');
    document.getElementById('resetForm').classList.toggle('hidden', view !== 'reset');
    hideErrors();
};

window.switchTab = (tabId, title) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(p => p.classList.remove('active'));
    
    document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.remove('hidden');
    document.getElementById(`nav${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.add('active');
    document.getElementById('headerTitle').textContent = title;
};

window.switchTimeView = (view) => {
    myScheduleTimeView = view;
    document.getElementById('btnDailyMy').classList.toggle('active', view === 'daily');
    document.getElementById('btnWeeklyMy').classList.toggle('active', view === 'weekly');
    renderMySchedule();
};

function hideErrors() {
    document.querySelectorAll('.error-msg').forEach(el => el.classList.add('hidden'));
    document.getElementById('resetSuccess').classList.add('hidden');
}
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ==========================================
// 3. AUTHENTICATION LOGIC
// ==========================================

// Email Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
    } catch (error) { showError('loginError', "Invalid email or password."); }
});

// Email Register
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, document.getElementById('regEmail').value, document.getElementById('regPassword').value);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            name: document.getElementById('regName').value,
            studentClass: document.getElementById('regClass').value,
            batch: document.getElementById('regBatch').value.toUpperCase(),
            email: document.getElementById('regEmail').value
        });
    } catch (error) { showError('registerError', error.message.replace("Firebase: ", "")); }
});

// Password Reset
document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    hideErrors();
    try {
        await sendPasswordResetEmail(auth, email);
        const successEl = document.getElementById('resetSuccess');
        successEl.textContent = "Reset link sent! Please check your inbox.";
        successEl.classList.remove('hidden');
        document.getElementById('resetEmail').value = "";
    } catch (error) {
        let errorMsg = "Failed to send reset email.";
        if (error.code === 'auth/invalid-email') errorMsg = "Please enter a valid email address.";
        if (error.code === 'auth/user-not-found') errorMsg = "No account found with this email.";
        showError('resetError', errorMsg);
    }
});

// Google Sign-In
document.getElementById('btnGoogleSignIn').addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) { showError('loginError', "Google sign-in failed."); }
});

// Complete Profile (New Google Users)
document.getElementById('completeProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(user) {
        await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || "Student",
            email: user.email,
            studentClass: document.getElementById('cpClass').value,
            batch: document.getElementById('cpBatch').value.toUpperCase()
        });
        window.location.reload(); 
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => { signOut(auth); });

// ==========================================
// 4. APP INITIALIZATION & RTS SCANNER
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('authView').classList.add('hidden');
        const docSnap = await getDoc(doc(db, "users", user.uid));
        
        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            
            // Populate Profile
            document.getElementById('profileName').textContent = currentUserProfile.name;
            document.getElementById('profileEmail').textContent = currentUserProfile.email;
            document.getElementById('profileBatch').textContent = currentUserProfile.batch;
            document.getElementById('profileClass').textContent = currentUserProfile.studentClass;

            document.getElementById('appView').classList.remove('hidden');
            await fetchTimetableData();
            renderMySchedule();
            checkForRTS(); 
        } else {
            // New Google User
            document.getElementById('completeProfileView').classList.remove('hidden');
        }
    } else {
        document.getElementById('appView').classList.add('hidden');
        document.getElementById('completeProfileView').classList.add('hidden');
        document.getElementById('authView').classList.remove('hidden');
        currentUserProfile = null;
    }
});

async function fetchTimetableData() {
    try {
        const res = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        timetableData = await res.json();
    } catch (e) {
        document.getElementById('myScheduleResults').innerHTML = '<div class="error-msg" style="margin-top:20px;">Failed to load timetable.</div>';
    }
}

// Personalized & Time-Aware RTS Checker
function checkForRTS() {
    if (!currentUserProfile) return;
    const userBatch = currentUserProfile.batch;
    const mySchedule = timetableData.weekly.find(b => String(b.Batch).toUpperCase() === userBatch);
    
    if (!mySchedule) return;

    let rtsAlerts = [];
    const now = new Date(); // Get current live time
    const currentYear = now.getFullYear(); // Extract current year

    Object.keys(mySchedule).forEach(key => {
        const subject = String(mySchedule[key]).toUpperCase();
        
        if (subject.includes("RTS") && key !== "Batch") {
            try {
                // Parse the key (e.g., "31 Jan, Sat - 3:30 PM") into a real Date object
                const parts = key.split('-');
                if (parts.length >= 2) {
                    const datePart = parts[0].split(',')[0].trim(); // Extracts "31 Jan"
                    const timePart = parts.slice(1).join('-').trim(); // Extracts "3:30 PM"
                    
                    // Combine into a standard format: "31 Jan 2026 3:30 PM"
                    const rtsDate = new Date(`${datePart} ${currentYear} ${timePart}`);
                    
                    // Only push to alerts if the test date is IN THE FUTURE
                    if (rtsDate >= now) {
                        rtsAlerts.push(key); 
                    }
                } else {
                    // Fallback just in case the formatting is weird
                    rtsAlerts.push(key);
                }
            } catch (e) {
                console.error("Could not parse date for RTS alert");
                rtsAlerts.push(key); // Fallback
            }
        }
    });

    // If there are future alerts, show the banner!
    if (rtsAlerts.length > 0) {
        document.getElementById('rtsAlert').classList.remove('hidden');
        document.getElementById('rtsBatchTitle').textContent = `Upcoming Test (RTS) for ${userBatch}`;
        document.getElementById('rtsTime').innerHTML = rtsAlerts.join('<br>'); 
    } else {
        // Ensure it stays hidden if tests have passed
        document.getElementById('rtsAlert').classList.add('hidden');
    }
}

// ==========================================
// 5. RENDERING LOGIC
// ==========================================

function renderMySchedule() {
    if (!currentUserProfile) return;
    const dataSet = myScheduleTimeView === 'daily' ? timetableData.daily : timetableData.weekly;
    const mySchedule = dataSet.find(b => String(b.Batch).toUpperCase() === currentUserProfile.batch);
    const container = document.getElementById('myScheduleResults');

    if (!mySchedule) container.innerHTML = `<div class="welcome-msg">No classes scheduled.</div>`;
    else container.innerHTML = createCardHTML(mySchedule, 0);
}

document.getElementById('batchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const container = document.getElementById('allBatchesResults');
    if (q.length < 2) return container.innerHTML = '<div class="welcome-msg">Start typing...</div>';
    
    const matches = timetableData.weekly.filter(item => String(item.Batch).toLowerCase().includes(q));
    container.innerHTML = matches.length ? matches.map((m, i) => createCardHTML(m, i)).join('') : `<div class="welcome-msg">No batches found.</div>`;
});

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
        if (info.toLowerCase().includes('room')) scheduleByDate[dateKey].room = item[key];
        else {
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
    return `<div class="schedule-card" style="animation-delay: ${index * 0.05}s"><div class="card-header-strip"><div class="batch-tag">${batchName}</div></div><div class="card-body">${datesHtml || '<div style="padding:10px; color:var(--text-light); font-size:0.9rem">No classes.</div>'}</div></div>`;
}

// Teacher Search
document.getElementById('teacherInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toUpperCase();
    const container = document.getElementById('teacherResults');
    if (q.length < 2) return container.innerHTML = '<div class="welcome-msg">Search teacher code (e.g., FR)...</div>';

    let busySlots = [];
    timetableData.weekly.forEach(batch => {
        Object.keys(batch).forEach(key => {
            if (key === "Batch" || key.toLowerCase().includes("room")) return;
            if (typeof batch[key] === 'string' && batch[key].toUpperCase().includes(`(${q})`)) {
                let dateStr = "Scheduled", timeStr = key;
                if (key.includes('-')) {
                    const parts = key.split('-');
                    dateStr = parts[0].trim(); timeStr = parts.slice(1).join('-').trim();
                }
                busySlots.push({ batch: batch.Batch, date: dateStr, time: timeStr, subject: batch[key] });
            }
        });
    });

    if (!busySlots.length) return container.innerHTML = `<div class="teacher-free-card">✅ Teacher <b>${q}</b> is currently free in the schedule.</div>`;
    
    const grouped = {};
    busySlots.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
    
    let html = `<div style="margin-bottom: 15px; font-weight:600; color: var(--hunter-green);">Schedule for: ${q}</div>`;
    for (const [date, slots] of Object.entries(grouped)) {
        const rows = slots.map(s => `<div class="class-row"><span class="time">${s.time}</span><span class="subject">${s.batch}</span><span class="room" style="background:var(--vanilla-cream); color:var(--hunter-green); border-color:var(--yellow-green);">${s.subject}</span></div>`).join('');
        html += `<div class="schedule-card"><div class="card-body"><div class="date-group"><div class="date-header">📅 ${date}</div>${rows}</div></div></div>`;
    }
    container.innerHTML = html;
});