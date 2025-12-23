// backend/run-once.js
const { runSync } = require('./sync');

// This executes the sync function immediately, then tells the computer "I'm done"
runSync()
  .then(() => {
    console.log("Execution finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Execution failed:", error);
    process.exit(1);
  });