const EmailJob = require('../models/EmailJob');
const Participant = require('../models/Participant');
const sendEmail = require('../mailService');
// In-memory queue
const jobQueue = [];
let isProcessing = false;
const addJob = async (jobId, participants) => {
  jobQueue.push({ jobId, participants });
  if (!isProcessing) {
    processQueue();
  }
  return jobId;
};
const processQueue = async () => {
  if (jobQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift();

  try {
    await processJob(job.jobId, job.participants);
  } catch (error) {
    console.error(`Job ${job.jobId} failed:`, error);
  }

  setTimeout(() => processQueue(), 1000);
};

const processJob = async (jobId, participants) => {
  const emailJob = await EmailJob.findOne({ jobId });

  if (!emailJob) {
    console.error(`Job ${jobId} not found`);
    return;
  }

  emailJob.status = 'processing';
  await emailJob.save();

  for (let i = 0; i < participants.length; i++) {
    const { name, email, phoneNumber, collegeName } = participants[i];
    const uniqueID = `USER-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    try {
      // Send email...
      await sendEmail(email, name, phoneNumber, collegeName, uniqueID);

      // Save to Participant collection
      await Participant.create({
        uniqueID,
        name,
        email,
        phoneNumber, collegeName
      });

      emailJob.successCount++;
      emailJob.logs.push({
        email,
        status: 'success',
        uniqueID,
        timestamp: new Date()
      });

      console.log(`✅ Sent ${i + 1}/${participants.length}: ${email}`);

    } catch (error) {
      emailJob.failureCount++;
      emailJob.logs.push({
        email,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      });

      console.error(`❌ Queue: Failed ${email}:`, error.message);
    }

    emailJob.processedEmails = i + 1;
    await emailJob.save();

    // Rate limiting: 1 second delay
    if (i < participants.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  emailJob.status = 'completed';
  emailJob.completedAt = new Date();
  await emailJob.save();

  console.log(`✅ Job ${jobId} completed: ${emailJob.successCount}/${emailJob.totalEmails}`);
};

module.exports = { addJob };