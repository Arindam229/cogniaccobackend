const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const EmailJob = require('../models/EmailJob');
const { addJob } = require('../services/emailQueue');
const router = express.Router();
const upload = multer({ dest: 'uploads/' });
// Upload CSV and start background job
router.post('/upload', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'CSV file is required' 
      });
    }
    
    // Read CSV
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const participants = XLSX.utils.sheet_to_json(sheet);
    
    // Validate CSV format
    if (participants.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        error: 'CSV is empty' 
      });
    }
    
    // Check required columns
    const firstRow = participants[0];
    if (!firstRow.name || !firstRow.email) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        success: false, 
        error: 'CSV must have "name" and "email" columns' 
      });
    }
    
    // Create job
    const jobId = `job_${Date.now()}`;
    const emailJob = new EmailJob({
      jobId,
      totalEmails: participants.length,
      status: 'pending'
    });
    await emailJob.save();
    
    // Add to queue
    await addJob(jobId, participants);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    // Return immediately
    res.json({
      success: true,
      message: 'Job created successfully. Processing in background.',
      jobId,
      totalEmails: participants.length
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await EmailJob.findOne({ jobId });
    
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: 'Job not found' 
      });
    }
    
    res.json({
      success: true,
      job: {
        jobId: job.jobId,
        status: job.status,
        totalEmails: job.totalEmails,
        processedEmails: job.processedEmails,
        successCount: job.successCount,
        failureCount: job.failureCount,
        progress: Math.round((job.processedEmails / job.totalEmails) * 100),
        createdAt: job.createdAt,
        completedAt: job.completedAt
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get job logs
router.get('/logs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await EmailJob.findOne({ jobId });
    
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: 'Job not found' 
      });
    }
    
    res.json({
      success: true,
      logs: job.logs
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;