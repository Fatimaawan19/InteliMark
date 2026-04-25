/**
 * Assessment Scheduler - Automatically publishes assessments at scheduled time
 * Runs as a background job checking every minute for assessments to publish
 */

const Assessment = require("../models/Assessment");
const Course = require("../models/Course");
const cron = require('node-cron');

let isSchedulerRunning = false;

/**
 * Start the assessment scheduler
 * Checks every minute for scheduled assessments that should be published
 */
function startAssessmentScheduler() {
  if (isSchedulerRunning) {
    console.log('⚠️  Assessment scheduler already running');
    return;
  }

  console.log('⏰ Starting assessment scheduler...');
  
  // Run every minute
  const task = cron.schedule('* * * * *', async () => {
    try {
      await publishScheduledAssessments();
    } catch (error) {
      console.error('❌ Scheduler error:', error.message);
    }
  });

  isSchedulerRunning = true;
  console.log('✅ Assessment scheduler started');
  console.log('   📅 Checking for scheduled assessments every minute');

  return task;
}

/**
 * Check and publish all assessments that have reached their scheduled time
 */
async function publishScheduledAssessments() {
  try {
    const now = new Date();
    
    // Find assessments with status 'scheduled' and scheduledTime <= now
    const assessmentsToPublish = await Assessment.find({
      status: 'scheduled',
      scheduledTime: { $lte: now }
    });

    if (assessmentsToPublish.length === 0) {
      // Silently skip if nothing to publish (too noisy otherwise)
      return;
    }

    console.log(`\n⏳ Found ${assessmentsToPublish.length} assessment(s) to publish`);

    // Create array of promises for all publishing tasks
    const publishPromises = assessmentsToPublish.map(async (assessment) => {
      try {
        console.log(`\n📋 Processing: ${assessment.title} (${assessment._id})`);
        
        const course = await Course.findById(assessment.courseId);
        if (!course) {
          throw new Error(`Course not found for assessment ${assessment._id}`);
        }

        // Import publishAssessment from controller
        const { 
          publishAssessment: publishFunc 
        } = require('../controllers/assessmentController');

        // Publish the assessment
        await publishFunc(assessment._id, course);

        console.log(`✅ Published: ${assessment.title}`);
        return { success: true, assessmentId: assessment._id };

      } catch (error) {
        console.error(`❌ Failed to publish ${assessment.title}:`, error.message);
        return { success: false, assessmentId: assessment._id, error: error.message };
      }
    });

    // Wait for all publishing tasks
    const results = await Promise.all(publishPromises);

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (successful > 0 || failed > 0) {
      console.log(`\n📊 Publishing Results: ${successful} successful, ${failed} failed`);
    }

  } catch (error) {
    console.error('❌ Error in publishScheduledAssessments:', error.message);
  }
}

/**
 * Stop the assessment scheduler
 */
function stopAssessmentScheduler() {
  if (!isSchedulerRunning) {
    console.log('ℹ️  Assessment scheduler is not running');
    return;
  }

  console.log('⏹️  Stopping assessment scheduler...');
  isSchedulerRunning = false;
  // Note: To properly stop cron, you need to keep reference to the task
}

module.exports = {
  startAssessmentScheduler,
  stopAssessmentScheduler,
  publishScheduledAssessments
};
