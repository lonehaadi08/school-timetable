require('dotenv').config();
const axios = require('axios');
const csv = require('csv-parser');
const { Readable } = require('stream');
const admin = require('firebase-admin');

// Load Firebase Admin Credentials
const serviceAccount = require('./serviceAccount.json');

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const SHEET_URL = process.env.SHEET_URL;

// 1. Fetch CSV as Raw Rows (No Headers)
async function fetchSheetData() {
  console.log('Fetching Google Sheet...');
  try {
    const response = await axios.get(SHEET_URL, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const stream = Readable.from(buffer);
    
    const results = [];
    return new Promise((resolve, reject) => {
      // headers: false tells the parser to give us raw arrays [ColA, ColB, ColC...]
      // instead of trying to guess names
      stream
        .pipe(csv({ headers: false })) 
        .on('data', (data) => results.push(Object.values(data)))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  } catch (error) {
    console.error("Error fetching CSV. Check URL.");
    throw error;
  }
}

// 2. Smart Grid Parser
function processData(rows) {
  const timetable = {};
  
  if (rows.length < 2) {
    console.log("CSV is too short.");
    return {};
  }

  // STEP A: Find the Header Row
  // We look for a row that contains "Room", "Class", or "Time"
  let headerRowIndex = -1;
  for (let i = 0; i < 5 && i < rows.length; i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    if (rowStr.includes('room') || rowStr.includes('class') || rowStr.includes('grade')) {
        headerRowIndex = i;
        break;
    }
  }

  if (headerRowIndex === -1) {
    console.error("Could not find a Header row (e.g. 'Class', 'Room') in first 5 rows.");
    return {};
  }

  const headers = rows[headerRowIndex];
  console.log(`Found headers on Row ${headerRowIndex + 1}:`, headers);

  // STEP B: Identify Time Columns
  // Any column after the first one is likely a Time Slot (e.g. "9:00 AM")
  const timeSlots = [];
  for (let i = 1; i < headers.length; i++) {
    if (headers[i] && headers[i].trim() !== '') {
        timeSlots.push({ index: i, time: headers[i].trim() });
    }
  }

  // STEP C: Parse Data Rows
  // Start reading from the row AFTER the header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const className = row[0]; // Assuming First Column is ALWAYS Class/Room Name

    if (!className || className.trim() === '') continue;

    // Sanitize Class Name for ID (e.g. "10 A" -> "10A")
    const cleanName = className.trim();

    if (!timetable[cleanName]) {
        timetable[cleanName] = { schedule: {} };
    }

    // Since your sheet seems to be "Daily", we will treat this as "Today's" schedule.
    // Or we can map specific days if the sheet has them. 
    // For now, we store the times flat.
    const dailySchedule = {};
    
    timeSlots.forEach(slot => {
        const subject = row[slot.index];
        if (subject && subject.trim() !== '') {
            dailySchedule[slot.time] = subject.trim();
        }
    });

    // Store under a generic 'Today' key or merge
    timetable[cleanName] = dailySchedule;
  }

  return timetable;
}

// 3. Upload to Firestore
async function updateFirestore(data) {
  const batch = db.batch();
  const collectionRef = db.collection('timetables');
  const classNames = Object.keys(data);

  console.log(`Preparing to update ${classNames.length} classes...`);

  for (const className of classNames) {
    const schedule = data[className];
    
    // Create Document ID (e.g. "10A")
    const docId = className.replace(/\//g, '-').trim(); 
    const docRef = collectionRef.doc(docId);
    
    // We update just the 'schedule' field
    batch.set(docRef, { 
      schedule: { "Today": schedule }, // Nesting under "Today" for the frontend
      lastUpdated: admin.firestore.FieldValue.serverTimestamp() 
    });
  }

  await batch.commit();
  console.log('✅ Firestore update complete.');
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