require('dotenv').config();
const axios = require('axios');
const csv = require('csv-parser');
const { Readable } = require('stream');
const admin = require('firebase-admin');
const crypto = require('crypto');

// --- SMART LOGIN FIX ---
let serviceAccount;
// Check if running on GitHub (Env Var) or Local (File)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./serviceAccount.json');
}
// -----------------------

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const SHEET_URL = process.env.SHEET_URL;

// --- Memory Cache for Smart Sync ---
let lastDataHash = "";

async function fetchSheetData() {
  try {
    const response = await axios.get(SHEET_URL, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const stream = Readable.from(buffer);
    
    const results = [];
    return new Promise((resolve, reject) => {
      stream
        .pipe(csv({ headers: false })) 
        .on('data', (data) => results.push(Object.values(data)))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  } catch (error) {
    console.error("Error fetching CSV.");
    throw error;
  }
}

function processData(rows) {
  const timetable = {};
  if (rows.length < 2) return {};

  let headerRowIndex = -1;
  for (let i = 0; i < 5 && i < rows.length; i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    if (rowStr.includes('room') || rowStr.includes('class') || rowStr.includes('grade')) {
        headerRowIndex = i;
        break;
    }
  }

  if (headerRowIndex === -1) return {};

  const headers = rows[headerRowIndex];
  const timeSlots = [];
  for (let i = 1; i < headers.length; i++) {
    if (headers[i] && headers[i].trim() !== '') {
        timeSlots.push({ index: i, time: headers[i].trim() });
    }
  }

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const className = row[0];
    if (!className || className.trim() === '') continue;

    const cleanName = className.trim();
    if (!timetable[cleanName]) timetable[cleanName] = { schedule: {} };

    const dailySchedule = {};
    timeSlots.forEach(slot => {
        const subject = row[slot.index];
        if (subject && subject.trim() !== '') {
            dailySchedule[slot.time] = subject.trim();
        }
    });
    timetable[cleanName] = dailySchedule;
  }
  return timetable;
}

async function updateFirestore(data) {
  // Use a fallback if data is empty to prevent crashes
  const currentJsonString = JSON.stringify(data || {});
  const currentHash = crypto.createHash('md5').update(currentJsonString).digest('hex');

  if (currentHash === lastDataHash) {
    console.log("⏸️ Data unchanged. Skipping.");
    return;
  }
  
  const batch = db.batch();
  const collectionRef = db.collection('timetables');
  const classNames = Object.keys(data);

  for (const className of classNames) {
    const docId = className.replace(/\//g, '-').trim(); 
    const docRef = collectionRef.doc(docId);
    batch.set(docRef, { 
      schedule: { "Today": data[className] },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp() 
    });
  }

  await batch.commit();
  lastDataHash = currentHash;
  console.log('✅ Updated.');
}

async function runSync() {
  try {
    const rows = await fetchSheetData();
    const structuredData = processData(rows);
    await updateFirestore(structuredData);
  } catch (error) {
    console.error('❌ Sync Error:', error);
  }
}

module.exports = { runSync };