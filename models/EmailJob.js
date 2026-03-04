const mongoose = require('mongoose');

const emailJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  totalEmails: { type: Number, default: 0 },
  processedEmails: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  logs: [
    {
      email: String,
      status: String,
      uniqueID: String,
      error: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

module.exports = mongoose.model('EmailJob', emailJobSchema);