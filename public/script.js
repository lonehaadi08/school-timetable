import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, orderBy, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const { LocalNotifications } = window.capacitorExports || window.Capacitor?.Plugins || {};

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

// FORCE FIREBASE TO SURVIVE "RECENT APPS" CLEAR
setPersistence(auth, browserLocalPersistence);

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23526b58'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
emailjs.init("eV9GmBZdy2ByqSZmw");
const IMGBB_API_KEY = "d7a0fd403ed8a561aab9d2b6d2961e9d";
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';

let timetableData = { daily: [], weekly: [] };
let currentUserProfile = null;
let myScheduleTimeView = 'daily';

let generatedOTP = null; let pendingRegistrationData = null; let pendingProfilePicFile = null;
let activeChatUnsubscribe = null; let requestsUnsubscribe = null; let friendsUnsubscribe = null; let currentChatFriendId = null;

// ==========================================
// UI UTILITIES
// ==========================================
window.toggleAuth = (view) => {
    document.getElementById('loginForm').classList.toggle('hidden', view !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', view !== 'register');
    document.getElementById('resetForm').classList.toggle('hidden', view !== 'reset');
    hideErrors();
};

window.cancelRegistration = () => {
    document.getElementById('otpView').classList.add('hidden'); 
    document.getElementById('authView').classList.remove('hidden');
    generatedOTP = null; pendingRegistrationData = null; toggleAuth('register');
}

document.getElementById('regProfilePic').addEventListener('change', function() {
    document.getElementById('fileNameDisplay').textContent = this.files[0] ? this.files[0].name : "No file chosen";
});

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

function hideErrors() { document.querySelectorAll('.error-msg').forEach(el => el.classList.add('hidden')); }
function showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); }

window.forceRefreshApp = async () => {
    const btn = document.getElementById('btnRefreshApp');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span style="animation: pulse 1s infinite;">⏳</span> Syncing...`;
    
    try {
        const res = await fetch(`${DATA_URL}?bust=${new Date().getTime()}`, { cache: "no-store" }); 
        timetableData = await res.json(); 
        window.timetableData = timetableData;
        populateBatchDropdown();
        
        // Reset dropdown to permanent batch on refresh
        if (currentUserProfile) document.getElementById('myScheduleBatchSelect').value = currentUserProfile.batch;
        renderMySchedule();
        
        const tInput = document.getElementById('teacherInput'); 
        if(tInput && tInput.value) tInput.dispatchEvent(new Event('input'));
    } catch(e) { 
        alert("Failed to sync. Please check your internet connection."); 
    } finally {
        btn.innerHTML = originalText;
    }
};

window.downloadPDF = (elementId, filename) => {
    const element = document.getElementById(elementId);
    if(element.innerText.includes("Start typing") || element.innerText.includes("Loading") || element.innerText.includes("❌")) return alert("Search for valid data first before exporting to PDF!");
    
    let activeBatch = "";
    if(elementId === 'myScheduleResults') activeBatch = document.getElementById('myScheduleBatchSelect').value;
    const safeFilename = activeBatch ? `${filename}_${activeBatch}` : filename;

    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    const opt = { margin: 0.5, filename: `${safeFilename}_${dateStr}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, allowTaint: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().set(opt).from(element).save();
};

// ==========================================
// BIOMETRIC (FINGERPRINT) ENGINE
// ==========================================
window.setupFingerprint = async () => {
    if (localStorage.getItem('fingerprintEnabled') === 'true') {
        localStorage.removeItem('fingerprintEnabled');
        localStorage.removeItem('fpCredId');
        alert("Fingerprint lock disabled.");
        document.getElementById('fpBtn').innerHTML = "🔒 Enable Fingerprint Lock";
        return;
    }
    
    if (!window.PublicKeyCredential) return alert("Biometrics not supported on this device/browser.");

    try {
        const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16); window.crypto.getRandomValues(userId);
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "Student Portal", id: window.location.hostname },
                user: { id: userId, name: currentUserProfile.email, displayName: currentUserProfile.name },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000,
            }
        });
        if (cred) {
            localStorage.setItem('fingerprintEnabled', 'true');
            localStorage.setItem('fpCredId', JSON.stringify(Array.from(new Uint8Array(cred.rawId))));
            alert("Fingerprint lock enabled successfully! Next time you clear the app, you will be asked to unlock.");
            document.getElementById('fpBtn').innerHTML = "🔓 Disable Fingerprint Lock";
        }
    } catch (e) {
        alert("Setup failed. Ensure your device has a screen lock/fingerprint set up.");
    }
};

window.promptFingerprint = async () => {
    try {
        const credIdStr = localStorage.getItem('fpCredId');
        if (!credIdStr) return;
        const credentialId = new Uint8Array(JSON.parse(credIdStr));
        const assertion = await navigator.credentials.get({
            publicKey: { challenge: new Uint8Array(32), allowCredentials: [{ id: credentialId, type: "public-key" }], userVerification: "required" }
        });
        if (assertion) {
            sessionStorage.setItem('appUnlocked', 'true');
            window.location.reload(); 
        }
    } catch (e) {}
};

window.logoutFromLock = () => { sessionStorage.removeItem('appUnlocked'); signOut(auth); window.location.reload(); };

// ==========================================
// PROFILE EDITS & REMINDERS
// ==========================================
window.setCustomReminder = async () => {
    const text = document.getElementById('remText').value.trim(); const time = document.getElementById('remTime').value;
    if(!text || !time) return alert("Please enter both a message and a time.");
    const [hours, minutes] = time.split(':'); let alarmDate = new Date(); alarmDate.setHours(hours, minutes, 0, 0);
    if(alarmDate <= new Date()) alarmDate.setDate(alarmDate.getDate() + 1);
    
    if (LocalNotifications) {
        let permStatus = await LocalNotifications.checkPermissions(); 
        if (permStatus.display !== 'granted') await LocalNotifications.requestPermissions();
        await LocalNotifications.schedule({ notifications: [{ title: `⏰ Reminder`, body: text, id: new Date().getTime(), schedule: { at: alarmDate }, sound: null }] });
        const status = document.getElementById('remStatus'); status.textContent = `✅ Alarm set successfully!`; status.classList.remove('hidden');
        document.getElementById('remText').value = ''; document.getElementById('remTime').value = ''; setTimeout(() => status.classList.add('hidden'), 5000);
    } else alert("Native app reminders only work on installed phones.");
};

document.getElementById('liveProfilePicInput').addEventListener('change', async function() {
    if(!this.files[0] || !auth.currentUser) return;
    const file = this.files[0]; document.getElementById('profileImage').src = URL.createObjectURL(file); 
    try {
        const formData = new FormData(); formData.append("image", file);
        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const imgData = await imgRes.json();
        if(imgData.success) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { profilePic: imgData.data.url });
            currentUserProfile.profilePic = imgData.data.url;
        }
    } catch(e) { document.getElementById('profileImage').src = currentUserProfile.profilePic; }
});

window.editBio = async () => {
    if(!auth.currentUser) return;
    const newBio = prompt("Enter your new bio:", currentUserProfile.about || "");
    if(newBio !== null) {
        try { await updateDoc(doc(db, "users", auth.currentUser.uid), { about: newBio }); currentUserProfile.about = newBio; document.getElementById('profileAbout').textContent = `"${newBio}"`; } catch(e) {}
    }
};

window.removeProfilePic = async () => {
    if(!auth.currentUser || !confirm("Are you sure you want to remove your profile picture?")) return;
    try { await updateDoc(doc(db, "users", auth.currentUser.uid), { profilePic: DEFAULT_AVATAR }); currentUserProfile.profilePic = DEFAULT_AVATAR; document.getElementById('profileImage').src = DEFAULT_AVATAR; } catch(e) { }
};

// ==========================================
// OTP REGISTRATION & AUTH
// ==========================================
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault(); hideErrors(); const btn = document.getElementById('btnTriggerOTP'); btn.textContent = "Sending OTP..."; btn.disabled = true;
    pendingRegistrationData = { name: document.getElementById('regName').value, phone: document.getElementById('regPhone').value, email: document.getElementById('regEmail').value, studentClass: document.getElementById('regClass').value, aim: document.getElementById('regAim').value, batch: document.getElementById('regBatch').value.toUpperCase(), about: document.getElementById('regAbout').value, password: document.getElementById('regPassword').value };
    pendingProfilePicFile = document.getElementById('regProfilePic').files[0];
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); const expiryTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    try { await emailjs.send("service_z7a32gh", "template_fhqy1oh", { to_email: pendingRegistrationData.email, passcode: generatedOTP, time: expiryTime }); document.getElementById('authView').classList.add('hidden'); document.getElementById('otpView').classList.remove('hidden'); document.getElementById('otpEmailDisplay').textContent = pendingRegistrationData.email; } catch (error) { showError('registerError', "Failed to send OTP email."); } finally { btn.textContent = "Send OTP"; btn.disabled = false; }
});

document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault(); hideErrors(); const enteredOTP = document.getElementById('otpInput').value; if (enteredOTP !== generatedOTP) return showError('otpError', "Invalid OTP.");
    const btn = document.getElementById('btnVerifyOTP'); const loadingText = document.getElementById('otpLoading'); btn.disabled = true; loadingText.classList.remove('hidden');
    try {
        let profilePicURL = DEFAULT_AVATAR; 
        if (pendingProfilePicFile) {
            loadingText.textContent = "Uploading profile picture..."; const formData = new FormData(); formData.append("image", pendingProfilePicFile); const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData }); const imgData = await imgRes.json(); if(imgData.success) profilePicURL = imgData.data.url;
        }
        loadingText.textContent = "Creating secure account..."; const userCredential = await createUserWithEmailAndPassword(auth, pendingRegistrationData.email, pendingRegistrationData.password);
        loadingText.textContent = "Saving profile details..."; await setDoc(doc(db, "users", userCredential.user.uid), { name: pendingRegistrationData.name, phone: pendingRegistrationData.phone, email: pendingRegistrationData.email, studentClass: pendingRegistrationData.studentClass, aim: pendingRegistrationData.aim, batch: pendingRegistrationData.batch, about: pendingRegistrationData.about, profilePic: profilePicURL });
    } catch (error) { showError('otpError', error.message.replace("Firebase: ", "")); btn.disabled = false; loadingText.classList.add('hidden'); }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value, document.getElementById('loginPassword').value); } catch (error) { showError('loginError', "Invalid email or password."); } });

document.getElementById('btnFingerprintLogin').addEventListener('click', async () => { 
    hideErrors(); const credIdStr = localStorage.getItem('fpCredId');
    if (!credIdStr) return showError('loginError', "Fingerprint not set up or browser cache was cleared. Please login with Email and Password.");
    try {
        const credentialId = new Uint8Array(JSON.parse(credIdStr));
        const assertion = await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), allowCredentials: [{ id: credentialId, type: "public-key" }], userVerification: "required" } });
        if (assertion) { sessionStorage.setItem('appUnlocked', 'true'); window.location.reload(); }
    } catch (error) { showError('loginError', "Fingerprint verification failed or was cancelled."); } 
});

document.getElementById('resetForm').addEventListener('submit', async (e) => { e.preventDefault(); hideErrors(); try { await sendPasswordResetEmail(auth, document.getElementById('resetEmail').value); document.getElementById('resetSuccess').textContent = "Reset link sent!"; document.getElementById('resetSuccess').classList.remove('hidden'); } catch (error) { showError('resetError', "Failed to send reset email."); } });
document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.removeItem('appUnlocked'); signOut(auth); });

document.getElementById('completeProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const user = auth.currentUser;
    if(user) { await setDoc(doc(db, "users", user.uid), { name: user.displayName || "Student", email: user.email, phone: document.getElementById('cpPhone').value, studentClass: document.getElementById('cpClass').value, aim: document.getElementById('cpAim').value, batch: document.getElementById('cpBatch').value.toUpperCase(), profilePic: user.photoURL || DEFAULT_AVATAR, about: "I'm a student!" }); window.location.reload(); }
});

// ==========================================
// APP INIT
// ==========================================
onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('initialLoader'); const authView = document.getElementById('authView'); const appView = document.getElementById('appView'); const lockScreenView = document.getElementById('lockScreenView');

    if (user) {
        document.getElementById('otpView').classList.add('hidden'); authView.classList.add('hidden');
        const fpEnabled = localStorage.getItem('fingerprintEnabled') === 'true'; const isUnlocked = sessionStorage.getItem('appUnlocked') === 'true';
        
        if (fpEnabled && !isUnlocked) {
            loader.classList.add('hidden'); appView.classList.add('hidden'); lockScreenView.classList.remove('hidden');
            window.promptFingerprint(); return;
        }

        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            document.getElementById('profileName').textContent = currentUserProfile.name; document.getElementById('profileEmail').textContent = currentUserProfile.email; document.getElementById('profileBatch').textContent = currentUserProfile.batch; document.getElementById('profileAim').textContent = currentUserProfile.aim || "N/A"; document.getElementById('profileAbout').textContent = `"${currentUserProfile.about || ""}"`; document.getElementById('profileImage').src = currentUserProfile.profilePic || DEFAULT_AVATAR;
            document.getElementById('fpBtn').innerHTML = fpEnabled ? "🔓 Disable Fingerprint Lock" : "🔒 Enable Fingerprint Lock";

            await fetchTimetableData(); renderMySchedule(); checkForRTS(); initSocialEngine(); 
            
            loader.classList.add('hidden'); lockScreenView.classList.add('hidden'); appView.classList.remove('hidden');
        } else { loader.classList.add('hidden'); document.getElementById('completeProfileView').classList.remove('hidden'); }
    } else { 
        loader.classList.add('hidden'); appView.classList.add('hidden'); document.getElementById('completeProfileView').classList.add('hidden'); document.getElementById('otpView').classList.add('hidden'); lockScreenView.classList.add('hidden'); authView.classList.remove('hidden'); currentUserProfile = null; 
    }
});

async function fetchTimetableData() {
    try { 
        const res = await fetch(`${DATA_URL}?t=${new Date().getTime()}`, { cache: "no-store" }); 
        timetableData = await res.json(); 
        window.timetableData = timetableData; 
        populateBatchDropdown(); 
    } 
    catch (e) { document.getElementById('myScheduleResults').innerHTML = '<div class="error-msg">Failed to load timetable. Check your connection.</div>'; }
}

async function checkForRTS() {
    if (!currentUserProfile) return; const userBatch = currentUserProfile.batch; const mySchedule = timetableData.weekly.find(b => String(b.Batch).toUpperCase() === userBatch);
    if (!mySchedule) return; let rtsAlerts = []; const now = new Date(); const currentYear = now.getFullYear(); 

    if (LocalNotifications) { let permStatus = await LocalNotifications.checkPermissions(); if (permStatus.display !== 'granted') await LocalNotifications.requestPermissions(); }

    Object.keys(mySchedule).forEach(key => {
        const subject = String(mySchedule[key]).toUpperCase();
        if (subject.includes("RTS") && key !== "Batch") {
            try {
                const parts = key.split('-'); if (parts.length >= 2) {
                    const datePart = parts[0].split(',')[0].trim(); const timePart = parts.slice(1).join('-').trim();
                    let tempDate = new Date(`${datePart} ${currentYear}`);
                    if (!isNaN(tempDate)) {
                        if (tempDate.getMonth() > now.getMonth() + 2) tempDate.setFullYear(currentYear - 1);
                        const rtsDate = new Date(`${tempDate.toDateString()} ${timePart}`);
                        if (rtsDate >= now) {
                            rtsAlerts.push(key);
                            if (LocalNotifications) { const alarmTime = new Date(rtsDate.getTime() - (60 * 60 * 1000)); if(alarmTime > now) LocalNotifications.schedule({ notifications: [{ title: `🚨 Upcoming Test: ${subject}`, body: `Your RTS test starts in 1 hour at ${timePart}!`, id: rtsDate.getTime(), schedule: { at: alarmTime }, sound: null }] }); }
                        } 
                    }
                } else rtsAlerts.push(key);
            } catch (e) { rtsAlerts.push(key); }
        }
    });
    if (rtsAlerts.length > 0) { document.getElementById('rtsAlert').classList.remove('hidden'); document.getElementById('rtsBatchTitle').textContent = `Upcoming Test (RTS) for ${userBatch}`; document.getElementById('rtsTime').innerHTML = rtsAlerts.join('<br>'); } else { document.getElementById('rtsAlert').classList.add('hidden'); }
}

// ==========================================
// ALL BATCHES & DROPDOWN SCHEDULING
// ==========================================
function populateBatchDropdown() {
    const select = document.getElementById('myScheduleBatchSelect');
    if (!timetableData.weekly || timetableData.weekly.length === 0) return;
    
    const batches = [...new Set(timetableData.weekly.map(b => b.Batch).filter(Boolean))].sort();
    let html = ''; batches.forEach(b => { html += `<option value="${b}">${b}</option>`; });
    select.innerHTML = html;
    
    if (currentUserProfile && currentUserProfile.batch) select.value = currentUserProfile.batch;
}

document.getElementById('myScheduleBatchSelect').addEventListener('change', () => { renderMySchedule(); });

function renderMySchedule() {
    const select = document.getElementById('myScheduleBatchSelect');
    let activeBatch = select.value || (currentUserProfile ? currentUserProfile.batch : null);
    if (!activeBatch) return;

    const dataSet = myScheduleTimeView === 'daily' ? timetableData.daily : timetableData.weekly;
    const mySchedule = dataSet.find(b => String(b.Batch).toUpperCase() === String(activeBatch).toUpperCase());
    const container = document.getElementById('myScheduleResults');
    
    if (!mySchedule) { container.innerHTML = `<div class="welcome-msg">No classes scheduled for <b>${activeBatch}</b>.</div>`; } else { container.innerHTML = createCardHTML(mySchedule, 0); }
}

document.getElementById('batchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase(); const container = document.getElementById('allBatchesResults');
    if (q.length < 2) return container.innerHTML = '<div class="welcome-msg">Start typing a batch code or date (e.g. 21 Apr)...</div>';
    
    const matches = timetableData.weekly.filter(item => {
        if(String(item.Batch).toLowerCase().includes(q)) return true;
        return Object.keys(item).some(k => k.toLowerCase().includes(q));
    });
    container.innerHTML = matches.length ? matches.map((m, i) => createCardHTML(m, i)).join('') : `<div class="welcome-msg">No results found.</div>`;
});

function createCardHTML(item, index) {
    const batchName = item['Batch']; const scheduleByDate = {};
    Object.keys(item).forEach(key => {
        if (key === "Batch") return; let dateKey = "Other", info = key;
        if (key.includes('-')) { const parts = key.split('-'); dateKey = parts[0].trim(); info = parts.slice(1).join('-').trim(); }
        if (!scheduleByDate[dateKey]) scheduleByDate[dateKey] = {};
        if (info.toLowerCase().includes('room')) { scheduleByDate[dateKey].room = item[key]; } else { if (!scheduleByDate[dateKey].classes) scheduleByDate[dateKey].classes = []; scheduleByDate[dateKey].classes.push({ time: info, subject: item[key] }); }
    });
    let datesHtml = '';
    for (const [date, data] of Object.entries(scheduleByDate)) {
        if (!data.classes) continue;
        const roomBadge = data.room ? `<span class="room">${data.room}</span>` : '';
        const rows = data.classes.map(c => `<div class="class-row"><span class="time">${c.time}</span><span class="subject">${c.subject}</span>${roomBadge}</div>`).join('');
        datesHtml += `<div class="date-group"><div class="date-header">📅 ${date}</div>${rows}</div>`;
    }
    return `<div class="schedule-card" style="animation-delay: ${index * 0.05}s"><div class="card-header-strip"><div class="batch-tag">${batchName}</div></div><div class="card-body">${datesHtml || '<div style="padding:10px; color:var(--text-light); font-size:0.9rem">No classes.</div>'}</div></div>`;
}

// ==========================================
// TEACHER TIMELINE
// ==========================================
document.getElementById('teacherInput').addEventListener('input', (e) => {
    const rawInput = e.target.value.trim().toUpperCase(); const q = rawInput.replace(/[^A-Z0-9\s]/g, ''); const container = document.getElementById('teacherResults'); 
    if (q.length < 2) return container.innerHTML = '<div class="welcome-msg">Search teacher code or date (e.g., FN, 21 Apr)...</div>';

    let rawSlots = []; const now = new Date(); const currentYear = now.getFullYear(); 
    const maxPast = new Date(); maxPast.setDate(now.getDate() - 14); const maxFuture = new Date(); maxFuture.setDate(now.getDate() + 7);
    const searchRegex = new RegExp(`(^|[^a-zA-Z0-9])${q.replace(/\s+/g, '\\s*')}([^a-zA-Z0-9]|$)`, 'i');
    const allData = [...(timetableData.weekly || []).map(b => ({...b, _source: 'weekly'})), ...(timetableData.daily || []).map(b => ({...b, _source: 'daily'}))];

    allData.forEach(batch => {
        Object.keys(batch).forEach(key => {
            if (key === "Batch" || key === "_source" || key.toLowerCase().includes("room")) return;
            const cellValue = String(batch[key]).toUpperCase();
            if (searchRegex.test(cellValue) || searchRegex.test(key.toUpperCase())) {
                let dateStr = "Unknown", timeStr = key, isToday = false; let slotDate = null;
                if (key.includes('-') && key.match(/\d{1,2}\s[A-Za-z]{3}/)) {
                    const parts = key.split('-'); dateStr = parts[0].trim(); timeStr = parts.slice(1).join('-').trim(); const cleanDateStr = dateStr.split(',')[0].trim(); 
                    let tempDate = new Date(`${cleanDateStr} ${currentYear}`);
                    if (!isNaN(tempDate)) { if (tempDate.getMonth() > now.getMonth() + 2) tempDate.setFullYear(currentYear - 1); slotDate = tempDate; }
                }
                if (slotDate) { if (slotDate < maxPast || slotDate > maxFuture) return; if (slotDate.toDateString() === now.toDateString()) isToday = true; }
                rawSlots.push({ batch: batch.Batch, date: dateStr, time: timeStr, subject: cellValue, source: batch._source, isToday: isToday, timestamp: slotDate ? slotDate.getTime() : 0 });
            }
        });
    });

    if (!rawSlots.length) return container.innerHTML = `<div class="teacher-free-card" style="background:#fef2f2; border-color:#f87171; color:#991b1b;">❌ No classes found recently for <b>${q}</b>.</div>`;

    let busySlots = []; const groupedByTime = {};
    rawSlots.forEach(s => { const hash = `${s.batch}-${s.date}-${s.time}`; if(!groupedByTime[hash]) groupedByTime[hash] = []; groupedByTime[hash].push(s); });
    Object.values(groupedByTime).forEach(slotsArray => {
        const dailySlot = slotsArray.find(s => s.source === 'daily'); const weeklySlot = slotsArray.find(s => s.source === 'weekly');
        if(dailySlot && weeklySlot) { dailySlot.showBadge = false; busySlots.push(dailySlot); } else if (dailySlot) { dailySlot.showBadge = true; dailySlot.badgeType = 'changed'; busySlots.push(dailySlot); } else if (weeklySlot) { weeklySlot.showBadge = false; busySlots.push(weeklySlot); }
    });

    const todaySlots = []; const futureSlots = []; const pastSlots = [];
    busySlots.forEach(s => { if(s.isToday) todaySlots.push(s); else if (s.timestamp > now.getTime()) futureSlots.push(s); else pastSlots.push(s); });
    todaySlots.sort((a, b) => { const timeA = a.time.includes('-') ? a.time.split('-')[0].trim() : a.time; const timeB = b.time.includes('-') ? b.time.split('-')[0].trim() : b.time; return new Date(`2000/01/01 ${timeA}`) - new Date(`2000/01/01 ${timeB}`); });
    futureSlots.sort((a, b) => a.timestamp - b.timestamp); pastSlots.sort((a, b) => b.timestamp - a.timestamp);

    let html = '';
    const buildSection = (title, slotsArray, emoji) => {
        if(slotsArray.length === 0) return '';
        const grouped = {}; slotsArray.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
        let sectionHtml = `<h3 class="timeline-section-title">${emoji} ${title}</h3>`;
        for (const [date, slots] of Object.entries(grouped)) {
            const rows = slots.map(s => {
                let badge = ''; if(s.showBadge && s.badgeType === 'changed') badge = `<span class="source-tag src-changed">Changed Today</span>`;
                return `<div class="class-row" style="${s.isToday ? 'background: rgba(167, 201, 87, 0.1); border-radius: 8px; padding: 5px 10px; border-bottom: none; margin-bottom: 5px;' : ''}"><span class="time">${s.time}</span><span class="subject">${s.batch} ${badge}</span><span class="room" style="background:var(--vanilla-cream); color:var(--hunter-green); border-color:var(--yellow-green);">${s.subject}</span></div>`;
            }).join('');
            sectionHtml += `<div class="schedule-card"><div class="card-body"><div class="date-group"><div class="date-header">📅 ${date}</div>${rows}</div></div></div>`;
        }
        return sectionHtml;
    };

    html += buildSection('Today', todaySlots, '🌟');
    html += buildSection('Upcoming', futureSlots, '🔮');
    html += buildSection('Past (14 Days)', pastSlots, '🕰️');
    container.innerHTML = html;
});

// ==========================================
// SOCIAL NETWORK ENGINE & CHAT CONTROLS
// ==========================================
function initSocialEngine() {
    if(!auth.currentUser) return; const myUid = auth.currentUser.uid;
    const reqQuery = query(collection(db, "friendRequests"), where("receiverId", "==", myUid), where("status", "==", "pending"));
    requestsUnsubscribe = onSnapshot(reqQuery, async (snapshot) => {
        const reqList = document.getElementById('friendRequestsList'); const reqArea = document.getElementById('friendRequestsArea');
        if (snapshot.empty) { reqArea.classList.add('hidden'); reqList.innerHTML = ''; return; }
        reqArea.classList.remove('hidden'); let html = '';
        for (const docSnap of snapshot.docs) {
            const reqData = docSnap.data(); const senderSnap = await getDoc(doc(db, "users", reqData.senderId));
            if (senderSnap.exists()) {
                const s = senderSnap.data();
                html += `<div class="user-card"><div class="user-card-info"><img src="${s.profilePic}" class="user-card-img"><div class="user-card-details"><h4>${s.name}</h4><p>Class: ${s.studentClass}</p></div></div><div style="display:flex; gap:5px;"><button class="btn-small" style="background:#ef4444;" onclick="rejectFriendRequest('${docSnap.id}')">✖</button><button class="btn-small" onclick="acceptFriendRequest('${docSnap.id}', '${reqData.senderId}', '${s.name}', '${s.profilePic}')">Accept</button></div></div>`;
                if (LocalNotifications && document.hidden) { LocalNotifications.schedule({ notifications: [{ title: `New Friend Request`, body: `${s.name} sent you a request!`, id: Date.now() }] }); }
            }
        }
        reqList.innerHTML = html;
    });

    const myFriendsRef = collection(db, "users", myUid, "friends");
    friendsUnsubscribe = onSnapshot(myFriendsRef, (snapshot) => {
        const fList = document.getElementById('friendsList');
        if (snapshot.empty) return fList.innerHTML = '<div class="sub-text">No friends yet. Search someone to connect!</div>';
        let html = '';
        snapshot.forEach(docSnap => {
            const f = docSnap.data();
            html += `<div class="user-card" style="cursor:pointer;" onclick="openChat('${docSnap.id}', '${f.name}', '${f.profilePic}')"><div class="user-card-info"><img src="${f.profilePic}" class="user-card-img"><div class="user-card-details"><h4>${f.name}</h4><p>Tap to chat</p></div></div><span style="color:var(--sage-green);">💬</span></div>`;
        });
        fList.innerHTML = html;
    });
}

document.getElementById('btnSearchUsers').addEventListener('click', async () => {
    const phone = document.getElementById('socialSearchInput').value.trim(); const resDiv = document.getElementById('socialSearchResults');
    if(phone.length < 10) return showError('socialSearchInput', 'Enter a valid 10-digit number');
    resDiv.innerHTML = '<div class="sub-text">Searching...</div>'; const q = query(collection(db, "users"), where("phone", "==", phone)); const snapshot = await getDocs(q);
    if(snapshot.empty) return resDiv.innerHTML = '<div class="sub-text">No user found.</div>';
    let html = '';
    snapshot.forEach(docSnap => {
        if(docSnap.id === auth.currentUser.uid) return; const u = docSnap.data();
        html += `<div class="user-card" style="margin-top: 15px; border-color: var(--sage-green);"><div class="user-card-info"><img src="${u.profilePic}" class="user-card-img"><div class="user-card-details"><h4>${u.name}</h4><p>Batch: ${u.batch}</p></div></div><button class="btn-small" onclick="sendFriendRequest('${docSnap.id}')">Add Friend</button></div>`;
    });
    resDiv.innerHTML = html || '<div class="sub-text">This is your own number!</div>';
});

window.sendFriendRequest = async (targetId) => { try { await addDoc(collection(db, "friendRequests"), { senderId: auth.currentUser.uid, receiverId: targetId, status: "pending", timestamp: serverTimestamp() }); document.getElementById('socialSearchResults').innerHTML = '<div class="success-msg">Friend request sent!</div>'; } catch(e) {} };
window.rejectFriendRequest = async (reqId) => { try { await deleteDoc(doc(db, "friendRequests", reqId)); } catch(e) {} };
window.acceptFriendRequest = async (reqId, senderId, senderName, senderPic) => { const myUid = auth.currentUser.uid; try { await updateDoc(doc(db, "friendRequests", reqId), { status: "accepted" }); await setDoc(doc(db, "users", myUid, "friends", senderId), { name: senderName, profilePic: senderPic }); await setDoc(doc(db, "users", senderId, "friends", myUid), { name: currentUserProfile.name, profilePic: currentUserProfile.profilePic }); } catch(e) {} };

window.openChat = (friendId, friendName, friendPic) => {
    currentChatFriendId = friendId; document.getElementById('chatHeaderName').textContent = friendName; document.getElementById('chatHeaderImg').src = friendPic; document.getElementById('chatWindow').classList.remove('hidden');
    const myUid = auth.currentUser.uid; const chatId = myUid < friendId ? `${myUid}_${friendId}` : `${friendId}_${myUid}`;
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    let initialLoad = true;
    
    activeChatUnsubscribe = onSnapshot(q, (snapshot) => {
        const msgContainer = document.getElementById('chatMessages'); let html = '';
        if (!initialLoad) {
            snapshot.docChanges().forEach(change => { 
                if (change.type === 'added' && change.doc.data().senderId !== myUid) { 
                    const audio = document.getElementById('msgSound'); if(audio) audio.play().catch(e=>{}); 
                    if (LocalNotifications && document.hidden) { LocalNotifications.schedule({ notifications: [{ title: `Message from ${friendName}`, body: change.doc.data().text, id: Date.now() }] }); }
                } 
            });
        }
        snapshot.forEach(docSnap => {
            const msg = docSnap.data(); const isMe = msg.senderId === myUid; const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Sending...';
            const delBtn = isMe ? `<span onclick="deleteMessage('${docSnap.id}')" style="font-size:0.8rem; cursor:pointer; margin-left:8px; opacity:0.8;" title="Delete Message">🗑️</span>` : '';
            html += `<div class="msg-bubble ${isMe ? 'msg-sent' : 'msg-received'}">${msg.text} ${delBtn}<span class="msg-time">${timeStr}</span></div>`;
        });
        msgContainer.innerHTML = html; msgContainer.scrollTop = msgContainer.scrollHeight; initialLoad = false;
    });
};

window.closeChat = () => { document.getElementById('chatWindow').classList.add('hidden'); currentChatFriendId = null; if(activeChatUnsubscribe) activeChatUnsubscribe(); };
document.getElementById('chatInputForm').addEventListener('submit', async (e) => { e.preventDefault(); const input = document.getElementById('chatMessageInput'); const text = input.value.trim(); if(!text || !currentChatFriendId) return; input.value = ''; const myUid = auth.currentUser.uid; const chatId = myUid < currentChatFriendId ? `${myUid}_${currentChatFriendId}` : `${currentChatFriendId}_${myUid}`; try { await addDoc(collection(db, "chats", chatId, "messages"), { text: text, senderId: myUid, timestamp: serverTimestamp() }); } catch(e) {} });
window.deleteMessage = async (msgId) => { if(!currentChatFriendId || !confirm("Delete this message?")) return; const myUid = auth.currentUser.uid; const chatId = myUid < currentChatFriendId ? `${myUid}_${currentChatFriendId}` : `${currentChatFriendId}_${myUid}`; try { await deleteDoc(doc(db, "chats", chatId, "messages", msgId)); } catch(e) {} };
window.clearChat = async () => { if(!currentChatFriendId || !confirm("Clear entire chat history?")) return; const myUid = auth.currentUser.uid; const chatId = myUid < currentChatFriendId ? `${myUid}_${currentChatFriendId}` : `${currentChatFriendId}_${myUid}`; try { const q = query(collection(db, "chats", chatId, "messages")); const snapshot = await getDocs(q); snapshot.forEach(d => deleteDoc(doc(db, "chats", chatId, "messages", d.id))); } catch(e) {} };
window.removeFriend = async () => { if(!currentChatFriendId || !confirm("Unfriend this person and delete chat?")) return; const myUid = auth.currentUser.uid; try { await deleteDoc(doc(db, "users", myUid, "friends", currentChatFriendId)); await deleteDoc(doc(db, "users", currentChatFriendId, "friends", myUid)); window.clearChat(); window.closeChat(); } catch(e) { } };