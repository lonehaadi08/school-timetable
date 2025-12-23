const cron = require('node-cron');
const { runSync } = require('./sync');

console.log('Timetable Sync Service Started');

// Run immediately on startup so you don't have to wait 5 mins to see if it works
runSync();

// Schedule: Run every 5 minutes
// The "*/5" means "every step of 5" (0, 5, 10, 15...)
cron.schedule('*/5 * * * *', () => {
  console.log(`[${new Date().toISOString()}] Starting scheduled sync...`);
  runSync();
});