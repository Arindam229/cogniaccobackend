// const mongoose = require('mongoose');

// const participantSchema = new mongoose.Schema({
//   uniqueID: { type: String, required: true, unique: true },
//   email: { type: String, required: true },
//   name: { type: String, required: true },
//   phoneNumber: { type: String, required: true },
//   collegeName: { type: String },
//   groupId: { type: String },
//   accommodation: {
//     allocated: { type: Boolean, default: false },
//     roomId: String,
//     bhawanCode: String,
//     bhawanName: String,
//     roomType: String,
//     roomNumber: String,
//     bedNumber: String,
//     allocatedAt: Date
//   }
// });

// module.exports =
//   mongoose.models.Participant ||
//   mongoose.model('Participant', participantSchema);

// ============================================
// PARTICIPANT MODEL - WITH ACCOMMODATION
// File: models/Participant.js
// ============================================

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  uniqueID: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  collegeName: { type: String },
  groupId: { type: String }, // For group allocation
  accommodation: {
    allocated: { type: Boolean, default: false },
    roomId: { type: String },
    bhawanCode: { type: String },
    bhawanName: { type: String },
    roomType: { type: String },
    roomNumber: { type: String },
    bedNumber: { type: String },
    allocatedAt: { type: Date },
    allocationPriority: { type: Number, default: 0 } // For sorting
  },
  createdAt: { type: Date, default: Date.now }
});

// Index for faster queries
participantSchema.index({ uniqueID: 1 });
participantSchema.index({ email: 1 });
participantSchema.index({ 'accommodation.allocated': 1 });
participantSchema.index({ groupId: 1 });

module.exports = mongoose.model('Participant', participantSchema);