// ==========================================
// 1. FIREBASE, EMAILJS & CAPACITOR SETUP
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, orderBy, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Import Capacitor Notifications (Works safely in both web and app environments)
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
const googleProvider = new GoogleAuthProvider();

// Initialize EmailJS
emailjs.init("eV9GmBZdy2ByqSZmw");
const IMGBB_API_KEY = "d7a0fd403ed8a561aab9d2b6d2961e9d";

// Data & State
const DATA_URL = 'https://raw.githubusercontent.com/lonehaadi08/school-timetable/main/public/data.json';
let timetableData = { daily: [], weekly: [] };
let currentUserProfile = null;
let myScheduleTimeView = 'daily';

// Registration Engine State
let generatedOTP = null;
let pendingRegistrationData = null;
let pendingProfilePicFile = null;

// Social Engine State
let activeChatUnsubscribe = null;
let requestsUnsubscribe = null;
let friendsUnsubscribe = null;
let currentChatFriendId = null;

// ==========================================
// 2. UI UTILITIES & FILE UPLOAD LISTENER
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
    generatedOTP = null;
    pendingRegistrationData = null;
    toggleAuth('register');
}

document.getElementById('regProfilePic').addEventListener('change', function() {
    const fileName = this.files[0] ? this.files[0].name : "No file chosen";
    document.getElementById('fileNameDisplay').textContent = fileName;
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

function hideErrors() {
    document.querySelectorAll('.error-msg').forEach(el => el.classList.add('hidden'));
}
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ==========================================
// 3. THE SUPER-REGISTRATION ENGINE (OTP)
// ==========================================

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrors();
    const btn = document.getElementById('btnTriggerOTP');
    btn.textContent = "Sending OTP...";
    btn.disabled = true;

    pendingRegistrationData = {
        name: document.getElementById('regName').value,
        phone: document.getElementById('regPhone').value,
        email: document.getElementById('regEmail').value,
        studentClass: document.getElementById('regClass').value,
        aim: document.getElementById('regAim').value,
        batch: document.getElementById('regBatch').value.toUpperCase(),
        about: document.getElementById('regAbout').value,
        password: document.getElementById('regPassword').value 
    };
    pendingProfilePicFile = document.getElementById('regProfilePic').files[0];

    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    try {
        await emailjs.send("service_z7a32gh", "template_fhqy1oh", {
            to_email: pendingRegistrationData.email,
            passcode: generatedOTP,
            time: expiryTime
        });

        document.getElementById('authView').classList.add('hidden');
        document.getElementById('otpView').classList.remove('hidden');
        document.getElementById('otpEmailDisplay').textContent = pendingRegistrationData.email;
        
    } catch (error) {
        showError('registerError', "Failed to send OTP email. Please check your email address.");
    } finally {
        btn.textContent = "Send OTP";
        btn.disabled = false;
    }
});

document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrors();
    
    const enteredOTP = document.getElementById('otpInput').value;
    if (enteredOTP !== generatedOTP) return showError('otpError', "Invalid OTP. Please try again.");

    const btn = document.getElementById('btnVerifyOTP');
    const loadingText = document.getElementById('otpLoading');
    btn.disabled = true;
    loadingText.classList.remove('hidden');

    try {
        let profilePicURL = "https://i.ibb.co/7XqX7q8/default-avatar.png"; 
        if (pendingProfilePicFile) {
            loadingText.textContent = "Uploading profile picture...";
            const formData = new FormData();
            formData.append("image", pendingProfilePicFile);
            const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
            const imgData = await imgRes.json();
            if(imgData.success) profilePicURL = imgData.data.url;
        }

        loadingText.textContent = "Creating secure account...";
        const userCredential = await createUserWithEmailAndPassword(auth, pendingRegistrationData.email, pendingRegistrationData.password);
        
        loadingText.textContent = "Saving profile details...";
        await setDoc(doc(db, "users", userCredential.user.uid), {
            name: pendingRegistrationData.name,
            phone: pendingRegistrationData.phone,
            email: pendingRegistrationData.email,
            studentClass: pendingRegistrationData.studentClass,
            aim: pendingRegistrationData.aim,
            batch: pendingRegistrationData.batch,
            about: pendingRegistrationData.about,
            profilePic: profilePicURL
        });
    } catch (error) {
        showError('otpError', error.message.replace("Firebase: ", ""));
        btn.disabled = false;
        loadingText.classList.add('hidden');
    }
});

// ==========================================
// 4. STANDARD AUTHENTICATION LOGIC
// ==========================================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value, document.getElementById('loginPassword').value); } 
    catch (error) { showError('loginError', "Invalid email or password."); }
});

document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrors();
    try {
        await sendPasswordResetEmail(auth, document.getElementById('resetEmail').value);
        document.getElementById('resetSuccess').textContent = "Reset link sent! Please check your inbox.";
        document.getElementById('resetSuccess').classList.remove('hidden');
        document.getElementById('resetEmail').value = "";
    } catch (error) { showError('resetError', "Failed to send reset email."); }
});

document.getElementById('btnGoogleSignIn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { showError('loginError', "Google sign-in failed."); }
});

document.getElementById('completeProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(user) {
        await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || "Student",
            email: user.email,
            phone: document.getElementById('cpPhone').value,
            studentClass: document.getElementById('cpClass').value,
            aim: document.getElementById('cpAim').value,
            batch: document.getElementById('cpBatch').value.toUpperCase(),
            profilePic: user.photoURL || "https://i.ibb.co/7XqX7q8/default-avatar.png",
            about: "I'm a student!"
        });
        window.location.reload(); 
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => { signOut(auth); });

// ==========================================
// 5. APP INITIALIZATION & RTS SCANNER
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('authView').classList.add('hidden');
        document.getElementById('otpView').classList.add('hidden');
        const docSnap = await getDoc(doc(db, "users", user.uid));
        
        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            
            document.getElementById('profileName').textContent = currentUserProfile.name;
            document.getElementById('profileEmail').textContent = currentUserProfile.email;
            document.getElementById('profileBatch').textContent = currentUserProfile.batch;
            document.getElementById('profileAim').textContent = currentUserProfile.aim || "N/A";
            document.getElementById('profileAbout').textContent = `"${currentUserProfile.about || "Focused on my studies."}"`;
            document.getElementById('profileImage').src = currentUserProfile.profilePic || "https://i.ibb.co/7XqX7q8/default-avatar.png";

            document.getElementById('appView').classList.remove('hidden');
            await fetchTimetableData();
            renderMySchedule();
            checkForRTS(); 
            initSocialEngine(); 
        } else {
            document.getElementById('completeProfileView').classList.remove('hidden');
        }
    } else {
        document.getElementById('appView').classList.add('hidden');
        document.getElementById('completeProfileView').classList.add('hidden');
        document.getElementById('otpView').classList.add('hidden');
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

// Personalized & Native App Notification RTS Checker
async function checkForRTS() {
    if (!currentUserProfile) return;
    const userBatch = currentUserProfile.batch;
    const mySchedule = timetableData.weekly.find(b => String(b.Batch).toUpperCase() === userBatch);
    if (!mySchedule) return;

    let rtsAlerts = [];
    const now = new Date(); 
    const currentYear = now.getFullYear(); 

    // Ask phone for Notification Permission (if running as an app)
    if (LocalNotifications) {
        let permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }
    }

    Object.keys(mySchedule).forEach(key => {
        const subject = String(mySchedule[key]).toUpperCase();
        if (subject.includes("RTS") && key !== "Batch") {
            try {
                const parts = key.split('-');
                if (parts.length >= 2) {
                    const datePart = parts[0].split(',')[0].trim();
                    const timePart = parts.slice(1).join('-').trim();
                    const rtsDate = new Date(`${datePart} ${currentYear} ${timePart}`);
                    
                    if (rtsDate >= now) {
                        rtsAlerts.push(key);
                        
                        // Schedule Native App Notification 1 hour before the test!
                        if (LocalNotifications) {
                            const alarmTime = new Date(rtsDate.getTime() - (60 * 60 * 1000));
                            if(alarmTime > now) {
                                LocalNotifications.schedule({
                                    notifications: [{
                                        title: `🚨 Upcoming Test: ${subject}`,
                                        body: `Your RTS test starts in 1 hour at ${timePart}!`,
                                        id: rtsDate.getTime(),
                                        schedule: { at: alarmTime },
                                        sound: null,
                                    }]
                                });
                            }
                        }
                    } 
                } else rtsAlerts.push(key);
            } catch (e) { rtsAlerts.push(key); }
        }
    });

    if (rtsAlerts.length > 0) {
        document.getElementById('rtsAlert').classList.remove('hidden');
        document.getElementById('rtsBatchTitle').textContent = `Upcoming Test (RTS) for ${userBatch}`;
        document.getElementById('rtsTime').innerHTML = rtsAlerts.join('<br>'); 
    } else {
        document.getElementById('rtsAlert').classList.add('hidden');
    }
}

// ==========================================
// 6. RENDERING LOGIC
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
        if (key.includes('(')) { const match = key.match(/\((.*?)\)/); if (match) dateKey = match[1]; info = key.split('(')[0].trim(); }
        else if (key.includes('-')) { const parts = key.split('-'); dateKey = parts[0].trim(); info = parts.slice(1).join('-').trim(); }
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
        const rows = data.classes.map(c => `<div class="class-row"><span class="time">${c.time}</span><span class="subject">${c.subject}</span>${roomBadge}</div>`).join('');
        datesHtml += `<div class="date-group"><div class="date-header">📅 ${date}</div>${rows}</div>`;
    }
    return `<div class="schedule-card" style="animation-delay: ${index * 0.05}s"><div class="card-header-strip"><div class="batch-tag">${batchName}</div></div><div class="card-body">${datesHtml || '<div style="padding:10px; color:var(--text-light); font-size:0.9rem">No classes.</div>'}</div></div>`;
}

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

// ==========================================
// 7. THE SOCIAL NETWORK ENGINE
// ==========================================

function initSocialEngine() {
    if(!auth.currentUser) return;
    const myUid = auth.currentUser.uid;

    const reqQuery = query(collection(db, "friendRequests"), where("receiverId", "==", myUid), where("status", "==", "pending"));
    requestsUnsubscribe = onSnapshot(reqQuery, async (snapshot) => {
        const reqList = document.getElementById('friendRequestsList');
        const reqArea = document.getElementById('friendRequestsArea');
        if (snapshot.empty) { reqArea.classList.add('hidden'); reqList.innerHTML = ''; return; }

        reqArea.classList.remove('hidden');
        let html = '';
        for (const docSnap of snapshot.docs) {
            const reqData = docSnap.data();
            const senderSnap = await getDoc(doc(db, "users", reqData.senderId));
            if (senderSnap.exists()) {
                const s = senderSnap.data();
                html += `<div class="user-card"><div class="user-card-info"><img src="${s.profilePic}" class="user-card-img"><div class="user-card-details"><h4>${s.name}</h4><p>Class: ${s.studentClass}</p></div></div><button class="btn-small" onclick="acceptFriendRequest('${docSnap.id}', '${reqData.senderId}', '${s.name}', '${s.profilePic}')">Accept</button></div>`;
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
    const phone = document.getElementById('socialSearchInput').value.trim();
    const resDiv = document.getElementById('socialSearchResults');
    if(phone.length < 10) return showError('socialSearchInput', 'Enter a valid 10-digit number');
    
    resDiv.innerHTML = '<div class="sub-text">Searching...</div>';
    const q = query(collection(db, "users"), where("phone", "==", phone));
    const snapshot = await getDocs(q);
    
    if(snapshot.empty) return resDiv.innerHTML = '<div class="sub-text">No user found with this number.</div>';
    
    let html = '';
    snapshot.forEach(docSnap => {
        if(docSnap.id === auth.currentUser.uid) return; 
        const u = docSnap.data();
        html += `<div class="user-card" style="margin-top: 15px; border-color: var(--sage-green);"><div class="user-card-info"><img src="${u.profilePic}" class="user-card-img"><div class="user-card-details"><h4>${u.name}</h4><p>Batch: ${u.batch}</p></div></div><button class="btn-small" onclick="sendFriendRequest('${docSnap.id}')">Add Friend</button></div>`;
    });
    resDiv.innerHTML = html || '<div class="sub-text">This is your own number!</div>';
});

window.sendFriendRequest = async (targetId) => {
    try {
        await addDoc(collection(db, "friendRequests"), { senderId: auth.currentUser.uid, receiverId: targetId, status: "pending", timestamp: serverTimestamp() });
        document.getElementById('socialSearchResults').innerHTML = '<div class="success-msg">Friend request sent!</div>';
    } catch(e) { alert("Failed to send request."); }
};

window.acceptFriendRequest = async (reqId, senderId, senderName, senderPic) => {
    const myUid = auth.currentUser.uid;
    try {
        await updateDoc(doc(db, "friendRequests", reqId), { status: "accepted" });
        await setDoc(doc(db, "users", myUid, "friends", senderId), { name: senderName, profilePic: senderPic });
        await setDoc(doc(db, "users", senderId, "friends", myUid), { name: currentUserProfile.name, profilePic: currentUserProfile.profilePic });
    } catch(e) { alert("Error accepting request."); }
};

window.openChat = (friendId, friendName, friendPic) => {
    currentChatFriendId = friendId;
    document.getElementById('chatHeaderName').textContent = friendName;
    document.getElementById('chatHeaderImg').src = friendPic;
    document.getElementById('chatWindow').classList.remove('hidden');
    
    const myUid = auth.currentUser.uid;
    const chatId = myUid < friendId ? `${myUid}_${friendId}` : `${friendId}_${myUid}`;
    
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    activeChatUnsubscribe = onSnapshot(q, (snapshot) => {
        const msgContainer = document.getElementById('chatMessages');
        let html = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === myUid;
            const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Sending...';
            html += `<div class="msg-bubble ${isMe ? 'msg-sent' : 'msg-received'}">${msg.text}<span class="msg-time">${timeStr}</span></div>`;
        });
        msgContainer.innerHTML = html;
        msgContainer.scrollTop = msgContainer.scrollHeight; 
    });
};

window.closeChat = () => {
    document.getElementById('chatWindow').classList.add('hidden');
    currentChatFriendId = null;
    if(activeChatUnsubscribe) activeChatUnsubscribe(); 
};

document.getElementById('chatInputForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if(!text || !currentChatFriendId) return;
    input.value = ''; 
    const myUid = auth.currentUser.uid;
    const chatId = myUid < currentChatFriendId ? `${myUid}_${currentChatFriendId}` : `${currentChatFriendId}_${myUid}`;
    try { await addDoc(collection(db, "chats", chatId, "messages"), { text: text, senderId: myUid, timestamp: serverTimestamp() }); } 
    catch(e) { alert("Failed to send message."); }
});