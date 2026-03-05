const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// VerifiedParticipants Schema (permanent record)
const verifiedParticipantSchema = new mongoose.Schema({
  uniqueID: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phoneNumber: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  collegeName: { type: String },
  accommodation: {
    allocated: { type: Boolean, default: false },
    roomId: String,
    bhawanCode: String,
    bhawanName: String,
    roomType: String,
    roomNumber: String,
    bedNumber: String,
    allocatedAt: Date
  },
  verifiedAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

const VerifiedParticipant = mongoose.model('VerifiedParticipant', verifiedParticipantSchema);
const Participant = mongoose.model('Participant');

// MAIN SCAN ENDPOINT - Points to Participants collection
router.post('/scan', async (req, res) => {
  try {
    const { uniqueID } = req.body;

    if (!uniqueID) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    // STEP 1: Find in Participants collection
    const participant = await Participant.findOne({ uniqueID });

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: '❌ Participant not found!'
      });
    }
    // STEP 2: Check if already verified
    const alreadyVerified = await VerifiedParticipant.findOne({ uniqueID });

    if (alreadyVerified) {
      // Update existing record with latest accommodation info
      alreadyVerified.accommodation = participant.accommodation || { allocated: false };
      alreadyVerified.lastUpdated = new Date();
      await alreadyVerified.save();

      return res.json({
        success: true,
        message: '⚠️ Already Entered!',
        alreadyScanned: true,
        participant: {
          uniqueID: alreadyVerified.uniqueID,
          name: alreadyVerified.name,
          email: alreadyVerified.email,
          phoneNumber: alreadyVerified.phoneNumber,
          collegeName: alreadyVerified.collegeName,
          accommodation: alreadyVerified.accommodation
        }
      });
    }

    // STEP 3: Save to VerifiedParticipant (first scan - PERMANENT)
    await VerifiedParticipant.create({
      uniqueID: participant.uniqueID,
      name: participant.name,
      email: participant.email,
      phoneNumber: participant.phoneNumber,
      collegeName: participant.collegeName,
      accommodation: participant.accommodation || { allocated: false },
      verifiedAt: new Date(),
      lastUpdated: new Date()
    });

    // STEP 4: Return participant data
    res.json({
      success: true,
      message: '✅ Scan successful',
      alreadyScanned: false,
      participant: {
        uniqueID: participant.uniqueID,
        name: participant.name,
        email: participant.email,
        phoneNumber: participant.phoneNumber,
        collegeName: participant.collegeName,
        accommodation: participant.accommodation || { allocated: false }
      }
    });

  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during scan',
      error: error.message
    });
  }
});

// Get all verified participants with current status
router.get('/verified', async (req, res) => {
  try {
    const verified = await VerifiedParticipant.find().sort({ verifiedAt: -1 });

    // Sync with current Participant data
    for (const v of verified) {
      const current = await Participant.findOne({ uniqueID: v.uniqueID });
      if (current) {
        v.accommodation = current.accommodation || { allocated: false };
        await v.save();
      }
    }

    res.json({
      success: true,
      total: verified.length,
      verified
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync verified participants with current accommodation status
router.post('/sync-verified', async (req, res) => {
  try {
    const verified = await VerifiedParticipant.find();
    let updated = 0;

    for (const v of verified) {
      const participant = await Participant.findOne({ uniqueID: v.uniqueID });
      if (participant) {
        v.accommodation = participant.accommodation || { allocated: false };
        v.lastUpdated = new Date();
        await v.save();
        updated++;
      }
    }

    res.json({
      success: true,
      message: `Synced ${updated} verified participants`,
      updated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;