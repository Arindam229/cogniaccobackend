const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// ============================================
// MONGODB SCHEMAS
// ============================================

const bhawanSchema = new mongoose.Schema({
  bhawanCode: { type: String, required: true, unique: true },
  bhawanName: { type: String, required: true },
  totalCapacity: { type: Number, default: 0 },
  occupiedCapacity: { type: Number, default: 0 },
  availableCapacity: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  bhawanCode: { type: String, required: true },
  bhawanName: { type: String, required: true },
  roomType: { type: String, required: true },
  roomNumber: { type: String, required: true },
  capacity: { type: Number, required: true },
  occupied: { type: Number, default: 0 },
  available: { type: Number },
  members: [{ type: String }],
  status: { type: String, enum: ['available', 'partial', 'full'], default: 'available' },
  floor: { type: String },
  gender: { type: String, enum: ['male', 'female', 'mixed'], default: 'mixed' },
  amenities: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

roomSchema.pre('save', function (next) {
  this.available = this.capacity - this.occupied;
  if (this.occupied === 0) this.status = 'available';
  else if (this.occupied < this.capacity) this.status = 'partial';
  else this.status = 'full';
  next();
});

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  groupIdentifier: { type: String },
  members: [{ type: String }],
  size: { type: Number, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  allocatedRooms: [{ type: String }],
  status: { type: String, enum: ['pending', 'allocated'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const allocationLogSchema = new mongoose.Schema({
  participantId: { type: String, required: true },
  roomId: { type: String, required: true },
  bhawanCode: { type: String },
  roomNumber: { type: String },
  allocationMethod: { type: String },
  allocatedAt: { type: Date, default: Date.now }
});

//Allocated Accommodation Collection
const allocatedAccommodationSchema = new mongoose.Schema({
  uniqueID: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phoneNumber: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  collegeName: { type: String },
  roomId: { type: String, required: true },
  bhawanCode: { type: String, required: true },
  bhawanName: { type: String, required: true },
  roomType: { type: String, required: true },
  roomNumber: { type: String, required: true },
  bedNumber: { type: String },
  allocationMethod: { type: String },
  allocatedAt: { type: Date, default: Date.now }
});

const Bhawan = mongoose.model('Bhawan', bhawanSchema);
const Room = mongoose.model('AccommodationRoom', roomSchema);
const Group = mongoose.model('ParticipantGroup', groupSchema);
const AllocationLog = mongoose.model('AllocationLog', allocationLogSchema);
const AllocatedAccommodation = mongoose.model('AllocatedAccommodation', allocatedAccommodationSchema);
const Participant = mongoose.model('Participant');


// Helper: Normalize college names for smart matching
function normalizeCollege(collegeName) {
  if (!collegeName) return null;
  return collegeName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// Helper: Check if two colleges match
function collegesMatch(college1, college2) {
  if (!college1 || !college2) return false;
  const norm1 = normalizeCollege(college1);
  const norm2 = normalizeCollege(college2);

  // Exact match
  if (norm1 === norm2) return true;

  // Fuzzy match for common variations
  // IIT-Patna, IIT Patna, IITP all match
  const keywords1 = norm1.match(/[a-z]{3,}/g) || [];
  const keywords2 = norm2.match(/[a-z]{3,}/g) || [];

  const commonKeywords = keywords1.filter(k => keywords2.includes(k));
  return commonKeywords.length >= 2; // At least 2 common keywords
}
// ============================================
// UTILITY FUNCTIONS
// ============================================

const roomMapping = {
  "RR": "Recreational Room", "STR": "Study Room", "TVR": "TV Room",
  "GR": "Guest Room", "ATR": "Activity Room", "SR": "Student Room",
  "MH": "Mess Hall", "H": "Hall", "GMR": "Gym Room", "YR": "Yoga Room",
  "CR": "Cyber Room", "LR": "Luggage Room", "TTR": "TT Room",
  "CHR": "Chess Room", "CRR": "Carrom Room", "PR": "Periodical Room",
  "CLR": "Cultural Room", "SOR": "Store Room", "FR": "Faculty Room",
  "OR": "Other Rooms"
};

const bhawanMapping = {
  "RJB": "Rajendra", "RKB": "Radha Krishna", "CB": "Cautley",
  "GGB": "Ganga Bhawan", "RB": "Rajiv", "VKBB": "VK (Boys)",
  "JB": "Jawahar", "GB": "Govind Bhawan", "RVB": "Ravindra Bhawan",
  "AB": "Azad Bhawan", "EWS": "Aravali", "SB": "Sarojni",
  "KB": "Kasturba", "HB": "Himalaya", "VKGB": "VK (Girls)"
};

// ============================================
// MULTI-LEVEL ALLOCATION ALGORITHM
// ============================================

// Level 1: Group by Email Domain
async function groupByEmail() {
  const participants = await Participant.find({
    'accommodation.allocated': false
  }).lean();

  participants.forEach(p => {
    const domain = p.email.split('@')[1];
    const gender = p.gender || 'male';
    const key = `${domain}_${gender}`;
    if (!emailGroups[key]) emailGroups[key] = [];
    emailGroups[key].push(p);
  });

  const groups = [];

  for (const domainKey in emailGroups) {
    const members = emailGroups[domainKey];
    const gender = members[0].gender || 'male';
    const domain = domainKey.split('_')[0];

    if (members.length >= 2 && members.length <= 6) {
      const groupId = `EMAIL_${domainKey}_${Date.now()}`;
      const group = new Group({
        groupId,
        groupIdentifier: `email_${domain}`,
        gender,
        members: members.map(m => m.uniqueID),
        size: members.length,
        status: 'pending'
      });

      await group.save();

      await Participant.updateMany(
        { uniqueID: { $in: group.members } },
        {
          $set: {
            groupId: group.groupId,
            'accommodation.allocationPriority': 1
          }
        }
      );

      groups.push(group);
    } else if (members.length > 6) {
      for (let i = 0; i < members.length; i += 4) {
        const chunk = members.slice(i, i + 4);
        if (chunk.length >= 2) {
          const groupId = `EMAIL_${domainKey}_${Date.now()}_${i}`;
          const group = new Group({
            groupId,
            groupIdentifier: `email_${domain}`,
            gender,
            members: chunk.map(m => m.uniqueID),
            size: chunk.length,
            status: 'pending'
          });

          await group.save();

          await Participant.updateMany(
            { uniqueID: { $in: group.members } },
            {
              $set: {
                groupId: group.groupId,
                'accommodation.allocationPriority': 1
              }
            }
          );

          groups.push(group);
        }
      }
    }
  }

  return groups;
}

// Level 2: Group by Phone Number
async function groupByPhone() {
  const participants = await Participant.find({
    'accommodation.allocated': false,
    groupId: { $exists: false }
  }).lean();

  const phoneGroups = {};

  participants.forEach(p => {
    const phonePrefix = p.phoneNumber.substring(0, 6);
    const gender = p.gender || 'male';
    const key = `${phonePrefix}_${gender}`;
    if (!phoneGroups[key]) phoneGroups[key] = [];
    phoneGroups[key].push(p);
  });

  const groups = [];

  for (const prefixKey in phoneGroups) {
    const members = phoneGroups[prefixKey];
    const gender = members[0].gender || 'male';
    const prefix = prefixKey.split('_')[0];

    if (members.length >= 2 && members.length <= 4) {
      const groupId = `PHONE_${prefixKey}_${Date.now()}`;
      const group = new Group({
        groupId,
        groupIdentifier: `phone_${prefix}`,
        gender,
        members: members.map(m => m.uniqueID),
        size: members.length,
        status: 'pending'
      });

      await group.save();

      await Participant.updateMany(
        { uniqueID: { $in: group.members } },
        {
          $set: {
            groupId: group.groupId,
            'accommodation.allocationPriority': 2
          }
        }
      );

      groups.push(group);
    }
  }

  return groups;
}

// Level 3: Group by College
async function groupByCollege() {
  const participants = await Participant.find({
    'accommodation.allocated': false,
    groupId: { $exists: false },
    collegeName: { $exists: true, $ne: null }
  }).lean();

  const collegeGroups = {};

  participants.forEach(p => {
    const college = p.collegeName.toLowerCase().trim();
    const gender = p.gender || 'male';
    const key = `${college}_${gender}`;
    if (!collegeGroups[key]) collegeGroups[key] = [];
    collegeGroups[key].push(p);
  });

  const groups = [];

  for (const collegeKey in collegeGroups) {
    const members = collegeGroups[collegeKey];
    const gender = members[0].gender || 'male';
    const college = collegeKey.split('_')[0];

    for (let i = 0; i < members.length; i += 3) {
      const chunk = members.slice(i, i + 3);
      if (chunk.length >= 2) {
        const groupId = `COLLEGE_${collegeKey}_${Date.now()}_${i}`;
        const group = new Group({
          groupId,
          groupIdentifier: `college_${college}`,
          gender,
          members: chunk.map(m => m.uniqueID),
          size: chunk.length,
          status: 'pending'
        });

        await group.save();

        await Participant.updateMany(
          { uniqueID: { $in: group.members } },
          {
            $set: {
              groupId: group.groupId,
              'accommodation.allocationPriority': 3
            }
          }
        );

        groups.push(group);
      }
    }
  }

  return groups;
}

// Allocate a group to rooms
async function allocateGroup(group, allocationMethod) {
  const groupSize = group.size;

  if (groupSize <= 3) {
    const room = await Room.findOne({
      status: { $in: ['available', 'partial'] },
      gender: { $in: [group.gender, 'mixed'] },
      available: { $gte: groupSize }
    }).sort({ available: 1 }).exec();

    if (room) {
      room.members.push(...group.members);
      room.occupied += groupSize;
      await room.save();

      group.allocatedRooms = [room.roomId];
      group.status = 'allocated';
      await group.save();

      for (let i = 0; i < group.members.length; i++) {
        const participant = await Participant.findOne({ uniqueID: group.members[i] });

        await Participant.findOneAndUpdate(
          { uniqueID: group.members[i] },
          {
            $set: {
              'accommodation.allocated': true,
              'accommodation.roomId': room.roomId,
              'accommodation.bhawanCode': room.bhawanCode,
              'accommodation.bhawanName': room.bhawanName,
              'accommodation.roomType': room.roomType,
              'accommodation.roomNumber': room.roomNumber,
              'accommodation.bedNumber': String.fromCharCode(65 + i),
              'accommodation.allocatedAt': new Date()
            }
          }
        );

        // Add to AllocatedAccommodation collection
        await AllocatedAccommodation.findOneAndUpdate(
          { uniqueID: group.members[i] },
          {
            uniqueID: group.members[i],
            name: participant.name,
            email: participant.email,
            phoneNumber: participant.phoneNumber,
            gender: participant.gender,
            collegeName: participant.collegeName,
            roomId: room.roomId,
            bhawanCode: room.bhawanCode,
            bhawanName: room.bhawanName,
            roomType: room.roomType,
            roomNumber: room.roomNumber,
            bedNumber: String.fromCharCode(65 + i),
            allocationMethod,
            allocatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        await AllocationLog.create({
          participantId: group.members[i],
          roomId: room.roomId,
          bhawanCode: room.bhawanCode,
          roomNumber: room.roomNumber,
          allocationMethod
        });
      }

      return true;
    }
  }

  const rooms = await Room.find({
    status: { $in: ['available', 'partial'] },
    available: { $gt: 0 }
  }).sort({ bhawanCode: 1, floor: 1, roomNumber: 1 })
    .limit(Math.ceil(groupSize / 2))
    .exec();

  if (rooms.length > 0) {
    let remainingMembers = [...group.members];
    const allocatedRooms = [];

    for (const room of rooms) {
      if (remainingMembers.length === 0) break;

      const toAllocate = Math.min(room.available, remainingMembers.length);
      const membersForRoom = remainingMembers.splice(0, toAllocate);

      room.members.push(...membersForRoom);
      room.occupied += toAllocate;
      await room.save();

      allocatedRooms.push(room.roomId);

      for (let i = 0; i < membersForRoom.length; i++) {
        const participant = await Participant.findOne({ uniqueID: membersForRoom[i] });

        await Participant.findOneAndUpdate(
          { uniqueID: membersForRoom[i] },
          {
            $set: {
              'accommodation.allocated': true,
              'accommodation.roomId': room.roomId,
              'accommodation.bhawanCode': room.bhawanCode,
              'accommodation.bhawanName': room.bhawanName,
              'accommodation.roomType': room.roomType,
              'accommodation.roomNumber': room.roomNumber,
              'accommodation.bedNumber': String.fromCharCode(65 + i),
              'accommodation.allocatedAt': new Date()
            }
          }
        );

        await AllocatedAccommodation.findOneAndUpdate(
          { uniqueID: membersForRoom[i] },
          {
            uniqueID: membersForRoom[i],
            name: participant.name,
            email: participant.email,
            phoneNumber: participant.phoneNumber,
            collegeName: participant.collegeName,
            roomId: room.roomId,
            bhawanCode: room.bhawanCode,
            bhawanName: room.bhawanName,
            roomType: room.roomType,
            roomNumber: room.roomNumber,
            bedNumber: String.fromCharCode(65 + i),
            allocationMethod,
            allocatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        await AllocationLog.create({
          participantId: membersForRoom[i],
          roomId: room.roomId,
          bhawanCode: room.bhawanCode,
          roomNumber: room.roomNumber,
          allocationMethod
        });
      }
    }

    group.allocatedRooms = allocatedRooms;
    group.status = 'allocated';
    await group.save();

    return true;
  }

  return false;
}

// ============================================
// API ROUTES
// ============================================
// Helper function to update bhawan capacity
async function updateBhawanCapacity(bhawanCode) {
  try {
    const rooms = await Room.find({ bhawanCode });
    const totalOccupied = rooms.reduce((sum, r) => sum + r.occupied, 0);

    const bhawan = await Bhawan.findOne({ bhawanCode });
    if (bhawan) {
      bhawan.occupiedCapacity = totalOccupied;
      bhawan.availableCapacity = bhawan.totalCapacity - totalOccupied;
      await bhawan.save();
    }
  } catch (error) {
    console.error('Error updating bhawan capacity:', error);
  }
}
router.post('/upload-rooms', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'CSV file is required' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rooms = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let errorCount = 0;

    await Room.deleteMany({});
    await Bhawan.deleteMany({});

    const bhawanCapacities = {};

    for (const roomData of rooms) {
      try {
        const { BhawanCode, RoomType, RoomNumber, Capacity, Floor, Gender, Amenities } = roomData;

        if (!BhawanCode || !RoomType || !RoomNumber || !Capacity) {
          errorCount++;
          continue;
        }

        const bhawanName = bhawanMapping[BhawanCode] || BhawanCode;
        const roomTypeName = roomMapping[RoomType] || RoomType;
        const roomId = `${BhawanCode}_${RoomType}_${RoomNumber}`;

        const room = new Room({
          roomId,
          bhawanCode: BhawanCode,
          bhawanName,
          roomType: roomTypeName,
          roomNumber: RoomNumber,
          capacity: parseInt(Capacity),
          occupied: 0,
          available: parseInt(Capacity),
          members: [],
          status: 'available',
          floor: Floor ? String(Floor) : '1',
          gender: Gender ? Gender.toLowerCase() : 'mixed',
          amenities: Amenities ? Amenities.split(';') : []
        });

        await room.save();
        successCount++;

        if (!bhawanCapacities[BhawanCode]) {
          bhawanCapacities[BhawanCode] = { name: bhawanName, total: 0 };
        }
        bhawanCapacities[BhawanCode].total += parseInt(Capacity);

      } catch (error) {
        errorCount++;
      }
    }

    for (const code in bhawanCapacities) {
      await Bhawan.findOneAndUpdate(
        { bhawanCode: code },
        {
          bhawanCode: code,
          bhawanName: bhawanCapacities[code].name,
          totalCapacity: bhawanCapacities[code].total,
          occupiedCapacity: 0,
          availableCapacity: bhawanCapacities[code].total
        },
        { upsert: true, new: true }
      );
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'Rooms uploaded successfully',
      total: rooms.length,
      successCount,
      errorCount
    });

  } catch (error) {
    console.error('Error uploading rooms:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/check-rooms', async (req, res) => {
  try {
    const roomCount = await Room.countDocuments();
    const bhawanCount = await Bhawan.countDocuments();

    res.json({
      success: true,
      roomsUploaded: roomCount > 0,
      roomCount,
      bhawanCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/bhawans', async (req, res) => {
  try {
    const bhawans = await Bhawan.find().sort({ bhawanCode: 1 });

    const bhawansWithDetails = await Promise.all(
      bhawans.map(async (bhawan) => {
        const rooms = await Room.find({ bhawanCode: bhawan.bhawanCode });

        const roomTypes = {};
        rooms.forEach(room => {
          if (!roomTypes[room.roomType]) {
            roomTypes[room.roomType] = { total: 0, available: 0, occupied: 0 };
          }
          roomTypes[room.roomType].total += room.capacity;
          roomTypes[room.roomType].available += room.available;
          roomTypes[room.roomType].occupied += room.occupied;
        });

        return {
          ...bhawan.toObject(),
          roomTypes,
          totalRooms: rooms.length
        };
      })
    );

    res.json({
      success: true,
      bhawans: bhawansWithDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// 1. FIX: Get Room Details with Participant Names (Line ~450 - Replace existing /rooms route)
router.get('/rooms/:bhawanCode/:roomType?', async (req, res) => {
  try {
    const { bhawanCode, roomType } = req.params;

    const query = { bhawanCode };
    if (roomType && roomType !== 'all') {
      query.roomType = roomType;
    }

    const rooms = await Room.find(query).sort({ roomNumber: 1 });

    // Fetch participant details for ALL rooms (including full)
    const roomsWithDetails = await Promise.all(
      rooms.map(async (room) => {
        const participantDetails = await Promise.all(
          room.members.map(async (uniqueID) => {
            // Fetch from AllocatedAccommodation instead
            const allocated = await AllocatedAccommodation.findOne({ uniqueID }).select('uniqueID name email');
            return allocated ? {
              uniqueID: allocated.uniqueID,
              name: allocated.name,
              email: allocated.email
            } : { uniqueID, name: 'Unknown', email: 'N/A' };
          })
        );

        return {
          ...room.toObject(),
          participantDetails
        };
      })
    );

    res.json({
      success: true,
      rooms: roomsWithDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// 2. FIX: Improved Auto-Allocation with Better Logic
router.post('/allocate-auto', async (req, res) => {
  try {
    console.log('🚀 Starting improved auto-allocation...');
    // Check available capacity
    const totalCapacity = await Room.aggregate([
      { $match: { status: { $in: ['available', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$available' } } }
    ]);

    const availableSeats = totalCapacity[0]?.total || 0;

    if (availableSeats === 0) {
      return res.json({
        success: false,
        error: 'All accommodations are full! No rooms available.'
      });
    }

    const totalPending = await Participant.countDocuments({ 'accommodation.allocated': false });

    console.log(`📊 Available: ${availableSeats} seats | Pending: ${totalPending} participants`);

    // Clear old groups
    await Group.deleteMany({});
    await Participant.updateMany({}, { $unset: { groupId: '' } });

    let totalAllocated = 0;

    // Level 1: Email Domain Groups
    console.log('📧 Level 1: Email grouping...');
    const emailGroups = await groupByEmail();
    for (const group of emailGroups) {
      const capacity = await Room.aggregate([
        { $match: { status: { $in: ['available', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$available' } } }
      ]);
      if ((capacity[0]?.total || 0) === 0) break;

      const success = await allocateGroup(group, 'email');
      if (success) totalAllocated += group.size;
    }

    // Level 2: Phone Groups
    console.log('📱 Level 2: Phone grouping...');
    const phoneGroups = await groupByPhone();
    for (const group of phoneGroups) {
      const capacity = await Room.aggregate([
        { $match: { status: { $in: ['available', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$available' } } }
      ]);
      if ((capacity[0]?.total || 0) === 0) break;

      const success = await allocateGroup(group, 'phone');
      if (success) totalAllocated += group.size;
    }

    // Level 3: College Groups
    console.log('🎓 Level 3: College grouping...');
    const collegeGroups = await groupByCollege();
    for (const group of collegeGroups) {
      const capacity = await Room.aggregate([
        { $match: { status: { $in: ['available', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$available' } } }
      ]);
      if ((capacity[0]?.total || 0) === 0) break;

      const success = await allocateGroup(group, 'college');
      if (success) totalAllocated += group.size;
    }

    // Level 4: Individual Allocation
    console.log('🎲 Level 4: Individual allocation...');
    const remainingCapacity = await Room.aggregate([
      { $match: { status: { $in: ['available', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$available' } } }
    ]);

    const individuals = await Participant.find({
      'accommodation.allocated': false
    }).limit(remainingCapacity[0]?.total || 0);

    let individualCount = 0;

    for (const individual of individuals) {
      const room = await Room.findOne({
        status: { $in: ['available', 'partial'] },
        gender: { $in: [individual.gender || 'male', 'mixed'] },
        available: { $gt: 0 }
      }).sort({ available: -1 }).exec();

      if (!room) break;

      // Check for duplicates
      if (room.members.includes(individual.uniqueID)) {
        console.log(`⚠️ Duplicate prevented: ${individual.uniqueID}`);
        continue;
      }

      room.members.push(individual.uniqueID);
      room.occupied += 1;
      await room.save();

      const bedNumber = String.fromCharCode(65 + room.members.length - 1);

      individual.accommodation = {
        allocated: true,
        roomId: room.roomId,
        bhawanCode: room.bhawanCode,
        bhawanName: room.bhawanName,
        roomType: room.roomType,
        roomNumber: room.roomNumber,
        bedNumber,
        allocatedAt: new Date()
      };
      await individual.save();

      await AllocatedAccommodation.findOneAndUpdate(
        { uniqueID: individual.uniqueID },
        {
          uniqueID: individual.uniqueID,
          name: individual.name,
          email: individual.email,
          phoneNumber: individual.phoneNumber,
          gender: individual.gender,
          collegeName: individual.collegeName,
          roomId: room.roomId,
          bhawanCode: room.bhawanCode,
          bhawanName: room.bhawanName,
          roomType: room.roomType,
          roomNumber: room.roomNumber,
          bedNumber,
          allocationMethod: 'random',
          allocatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      await AllocationLog.create({
        participantId: individual.uniqueID,
        roomId: room.roomId,
        bhawanCode: room.bhawanCode,
        roomNumber: room.roomNumber,
        allocationMethod: 'random'
      });

      individualCount++;
      totalAllocated++;
    }

    // Update bhawan occupancy
    const allRooms = await Room.find();
    const bhawanOccupancy = {};

    allRooms.forEach(room => {
      if (!bhawanOccupancy[room.bhawanCode]) {
        bhawanOccupancy[room.bhawanCode] = 0;
      }
      bhawanOccupancy[room.bhawanCode] += room.occupied;
    });

    for (const code in bhawanOccupancy) {
      const bhawan = await Bhawan.findOne({ bhawanCode: code });
      if (bhawan) {
        bhawan.occupiedCapacity = bhawanOccupancy[code];
        bhawan.availableCapacity = bhawan.totalCapacity - bhawan.occupiedCapacity;
        await bhawan.save();
      }
    }

    // Final capacity check
    const finalCapacity = await Room.aggregate([
      { $match: { status: { $in: ['available', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$available' } } }
    ]);

    const remaining = finalCapacity[0]?.total || 0;

    console.log(`✅ Allocation complete! Allocated: ${totalAllocated}, Remaining: ${remaining}`);

    res.json({
      success: true,
      message: remaining === 0 ? '🔴 All accommodations FULL!' : 'Auto-allocation completed',
      allocatedGroups: emailGroups.length + phoneGroups.length + collegeGroups.length,
      allocatedIndividuals: individualCount,
      totalAllocated,
      remainingParticipants: totalPending - totalAllocated,
      remainingBeds: remaining,
      isFull: remaining === 0
    });

  } catch (error) {
    console.error('Error in auto-allocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
})
// ============================================
// ROUTE 1: Build All Containers
// ============================================
router.post('/allocate-staged/build-containers', async (req, res) => {
  try {
    console.log('🏗️ Building allocation containers...');

    // Get all unallocated participants from Participant collection
    // This ensures we get participants who don't have accommodation.allocated = true
    const participants = await Participant.find({
      $or: [
        { 'accommodation.allocated': { $exists: false } },
        { 'accommodation.allocated': false },
        { 'accommodation': { $exists: false } }
      ]
    }).lean();

    console.log(`📊 Found ${participants.length} unallocated participants from Participant collection`);

    if (participants.length === 0) {
      return res.json({
        success: true,
        message: 'No participants to allocate',
        containers: []
      });
    }

    console.log(`📊 Total unallocated: ${participants.length}`);

    const containers = [];
    const processedIds = new Set();
    let containerIdCounter = 1;

    // ============================================
    // PRIORITY 1: EMAIL DOMAIN GROUPS
    // ============================================
    console.log('📧 Building email containers...');
    const emailGroups = {};

    participants.forEach(p => {
      if (processedIds.has(p.uniqueID)) return;
      const domain = p.email.split('@')[1];
      const gender = p.gender || 'male';
      const key = `${domain}_${gender}`;
      if (!emailGroups[key]) emailGroups[key] = [];
      emailGroups[key].push(p);
    });

    for (const domainKey in emailGroups) {
      const members = emailGroups[domainKey];
      const domain = domainKey.split('_')[0];

      if (members.length >= 2) {
        // Split into chunks of max 6
        for (let i = 0; i < members.length; i += 6) {
          const chunk = members.slice(i, i + 6);
          if (chunk.length >= 2) {
            containers.push({
              containerId: `EMAIL_${containerIdCounter++}`,
              type: 'email',
              identifier: domain,
              gender: members[0].gender || 'male',
              size: chunk.length,
              members: chunk.map(m => ({
                uniqueID: m.uniqueID,
                name: m.name,
                email: m.email,
                phone: m.phoneNumber,
                gender: m.gender || 'male',
                college: m.collegeName
              })),
              priority: 1,
              status: 'pending',
              suggestedBhawan: null
            });

            chunk.forEach(m => processedIds.add(m.uniqueID));
          }
        }
      }
    }

    // ============================================
    // PRIORITY 2: COLLEGE GROUPS (with smart matching)
    // ============================================
    console.log('🎓 Building college containers...');
    const collegeGroups = {};

    participants.forEach(p => {
      if (processedIds.has(p.uniqueID)) return;
      if (!p.collegeName || p.collegeName.trim() === '') return;

      const gender = p.gender || 'male';
      const college = p.collegeName.toLowerCase().trim();
      const key = `${college}_${gender}`;

      if (!collegeGroups[key]) collegeGroups[key] = [];
      collegeGroups[key].push(p);
    });

    for (const collegeKey in collegeGroups) {
      const members = collegeGroups[collegeKey];
      const college = members[0].collegeName;

      if (members.length >= 2) {
        // Split into chunks of max 4
        for (let i = 0; i < members.length; i += 4) {
          const chunk = members.slice(i, i + 4);
          if (chunk.length >= 2) {
            containers.push({
              containerId: `COLLEGE_${containerIdCounter++}`,
              type: 'college',
              identifier: college,
              gender: members[0].gender || 'male',
              size: chunk.length,
              members: chunk.map(m => ({
                uniqueID: m.uniqueID,
                name: m.name,
                email: m.email,
                phone: m.phoneNumber,
                gender: m.gender || 'male',
                college: m.collegeName
              })),
              priority: 2,
              status: 'pending',
              suggestedBhawan: null
            });

            chunk.forEach(m => processedIds.add(m.uniqueID));
          }
        }
      }
    }

    // ============================================
    // PRIORITY 3: PHONE PREFIX GROUPS
    // ============================================
    console.log('📱 Building phone containers...');
    const phoneGroups = {};

    participants.forEach(p => {
      if (processedIds.has(p.uniqueID)) return;
      if (!p.phoneNumber || typeof p.phoneNumber !== 'string') return;
      const prefix = p.phoneNumber.substring(0, 6);
      const gender = p.gender || 'male';
      const key = `${prefix}_${gender}`;
      if (!phoneGroups[key]) phoneGroups[key] = [];
      phoneGroups[key].push(p);
    });

    for (const prefixKey in phoneGroups) {
      const members = phoneGroups[prefixKey];
      const prefix = prefixKey.split('_')[0];

      if (members.length >= 2 && members.length <= 4) {
        containers.push({
          containerId: `PHONE_${containerIdCounter++}`,
          type: 'phone',
          identifier: prefix,
          gender: members[0].gender || 'male',
          size: members.length,
          members: members.map(m => ({
            uniqueID: m.uniqueID,
            name: m.name,
            email: m.email,
            phone: m.phoneNumber,
            gender: m.gender || 'male',
            college: m.collegeName
          })),
          priority: 3,
          status: 'pending',
          suggestedBhawan: null
        });

        members.forEach(m => processedIds.add(m.uniqueID));
      }
    }

    // ============================================
    // RANDOM POOL: Remaining individuals
    // ============================================
    console.log('🎲 Building random pool...');
    const randomPoolRaw = participants.filter(p => !processedIds.has(p.uniqueID));
    const randomPoolByGender = {};
    randomPoolRaw.forEach(p => {
      const gender = p.gender || 'male';
      if (!randomPoolByGender[gender]) randomPoolByGender[gender] = [];
      randomPoolByGender[gender].push(p);
    });

    for (const gender in randomPoolByGender) {
      const pool = randomPoolByGender[gender];
      // Split into manageable chunks of 20
      for (let i = 0; i < pool.length; i += 20) {
        const chunk = pool.slice(i, i + 20);
        containers.push({
          containerId: `RANDOM_${gender.toUpperCase()}_${containerIdCounter++}`,
          type: 'random',
          identifier: `Individual Allocation (${gender})`,
          gender,
          size: chunk.length,
          members: chunk.map(m => ({
            uniqueID: m.uniqueID,
            name: m.name,
            email: m.email,
            phone: m.phoneNumber,
            gender: m.gender || 'male',
            college: m.collegeName
          })),
          priority: 4,
          status: 'pending',
          suggestedBhawan: null
        });
      }
    }

    // Sort by priority
    containers.sort((a, b) => a.priority - b.priority);

    console.log(`✅ Built ${containers.length} containers`);
    console.log(`   - Email: ${containers.filter(c => c.type === 'email').length}`);
    console.log(`   - College: ${containers.filter(c => c.type === 'college').length}`);
    console.log(`   - Phone: ${containers.filter(c => c.type === 'phone').length}`);
    console.log(`   - Random: ${containers.filter(c => c.type === 'random').length}`);

    res.json({
      success: true,
      totalContainers: containers.length,
      totalParticipants: participants.length,
      processedParticipants: processedIds.size,
      containers
    });

  } catch (error) {
    console.error('Error building containers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE 2: Allocate Specific Container
// ============================================
router.post('/allocate-staged/allocate-container', async (req, res) => {
  try {
    const { container, bhawanCode } = req.body;

    if (!container || !bhawanCode) {
      return res.status(400).json({
        success: false,
        error: 'Container and bhawanCode required'
      });
    }

    console.log(`🎯 Allocating container ${container.containerId} to ${bhawanCode}...`);
    // Get available rooms in the selected bhawan and room type
    const { roomType } = req.body; // Add this
    const query = {
      bhawanCode,
      status: { $in: ['available', 'partial'] },
      available: { $gt: 0 }
    };
    // Filter by room type if specified
    if (roomType && roomType !== 'all') {
      query.roomType = roomType;
    }

    const rooms = await Room.find(query).sort({ roomNumber: 1 });
    // const rooms = await Room.find({
    //   bhawanCode,
    //   status: { $in: ['available', 'partial'] },
    //   available: { $gt: 0 }
    // }).sort({ roomNumber: 1 });

    if (rooms.length === 0) {
      return res.json({
        success: false,
        error: `No available rooms in ${bhawanCode}`
      });
    }

    // Calculate total available capacity
    const totalAvailable = rooms.reduce((sum, r) => sum + r.available, 0);

    if (totalAvailable < container.size) {
      return res.json({
        success: false,
        error: `Not enough capacity. Need ${container.size}, have ${totalAvailable}`
      });
    }

    // Allocate members to rooms
    let allocatedCount = 0;
    let remainingMembers = [...container.members];

    for (const room of rooms) {
      if (remainingMembers.length === 0) break;

      const toAllocate = Math.min(room.available, remainingMembers.length);
      const membersForRoom = remainingMembers.splice(0, toAllocate);

      for (let i = 0; i < membersForRoom.length; i++) {
        const member = membersForRoom[i];

        // Check if already allocated
        const participant = await Participant.findOne({ uniqueID: member.uniqueID });
        if (participant?.accommodation?.allocated) {
          console.log(`⚠️ ${member.uniqueID} already allocated, skipping`);
          continue;
        }

        // Add to room
        room.members.push(member.uniqueID);
        room.occupied += 1;

        const bedNumber = String.fromCharCode(65 + room.members.length - 1);

        // Update participant
        await Participant.findOneAndUpdate(
          { uniqueID: member.uniqueID },
          {
            $set: {
              'accommodation.allocated': true,
              'accommodation.roomId': room.roomId,
              'accommodation.bhawanCode': room.bhawanCode,
              'accommodation.bhawanName': room.bhawanName,
              'accommodation.roomType': room.roomType,
              'accommodation.roomNumber': room.roomNumber,
              'accommodation.bedNumber': bedNumber,
              'accommodation.allocatedAt': new Date()
            }
          }
        );

        // Add to AllocatedAccommodation
        await AllocatedAccommodation.findOneAndUpdate(
          { uniqueID: member.uniqueID },
          {
            uniqueID: member.uniqueID,
            name: member.name,
            email: member.email,
            phoneNumber: member.phone,
            gender: member.gender || 'male',
            collegeName: member.college,
            roomId: room.roomId,
            bhawanCode: room.bhawanCode,
            bhawanName: room.bhawanName,
            roomType: room.roomType,
            roomNumber: room.roomNumber,
            bedNumber,
            allocationMethod: `staged_${container.type}`,
            allocatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        // Log allocation
        await AllocationLog.create({
          participantId: member.uniqueID,
          roomId: room.roomId,
          bhawanCode: room.bhawanCode,
          roomNumber: room.roomNumber,
          allocationMethod: `staged_${container.type}`
        });

        allocatedCount++;
      }

      await room.save();
    }

    // Update bhawan capacity
    await updateBhawanCapacity(bhawanCode);

    console.log(`✅ Allocated ${allocatedCount}/${container.size} members`);

    res.json({
      success: true,
      allocated: allocatedCount,
      total: container.size,
      message: `Successfully allocated ${allocatedCount} participants to ${bhawanCode}`
    });

  } catch (error) {
    console.error('Error allocating container:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE 3: Get Available Bhawans with Capacity
// ============================================
router.get('/allocate-staged/available-bhawans', async (req, res) => {
  try {
    const { requiredCapacity } = req.query;
    const required = parseInt(requiredCapacity) || 1;

    const bhawans = await Bhawan.find({
      availableCapacity: { $gte: required }
    }).sort({ availableCapacity: -1 });

    res.json({
      success: true,
      bhawans
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
//Allocation Status Route
router.get('/allocation-status', async (req, res) => {
  try {
    const totalParticipants = await Participant.countDocuments();
    const allocatedParticipants = await Participant.countDocuments({ 'accommodation.allocated': true });
    const totalRooms = await Room.countDocuments();
    const occupiedRooms = await Room.countDocuments({ occupied: { $gt: 0 } });
    const fullRooms = await Room.countDocuments({ status: 'full' });

    const totalCapacity = await Room.aggregate([
      { $group: { _id: null, total: { $sum: '$capacity' } } }
    ]);

    const totalOccupied = await Room.aggregate([
      { $group: { _id: null, total: { $sum: '$occupied' } } }
    ]);

    res.json({
      success: true,
      participants: {
        total: totalParticipants,
        allocated: allocatedParticipants,
        pending: totalParticipants - allocatedParticipants
      },
      rooms: {
        total: totalRooms,
        occupied: occupiedRooms,
        full: fullRooms,
        available: totalRooms - fullRooms
      },
      capacity: {
        total: totalCapacity[0]?.total || 0,
        occupied: totalOccupied[0]?.total || 0,
        available: (totalCapacity[0]?.total || 0) - (totalOccupied[0]?.total || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Update/Reassign Allocation..
router.post('/reallocate', async (req, res) => {
  try {
    const { uniqueID, newRoomId } = req.body;

    if (!uniqueID || !newRoomId) {
      return res.status(400).json({
        success: false,
        error: 'uniqueID and newRoomId required'
      });
    }

    const participant = await Participant.findOne({ uniqueID });
    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    const newRoom = await Room.findOne({ roomId: newRoomId });
    if (!newRoom) {
      return res.status(404).json({ success: false, error: 'New room not found' });
    }

    // Validate gender
    if (newRoom.gender !== 'mixed' && newRoom.gender !== participant.gender) {
      return res.status(400).json({
        success: false,
        error: `Gender mismatch: Participant is ${participant.gender}, Room is ${newRoom.gender}`
      });
    }

    if (newRoom.available === 0) {
      return res.status(400).json({ success: false, error: 'New room is full' });
    }

    // Store old bhawan code for capacity update
    const oldBhawanCode = participant.accommodation?.bhawanCode;

    // Remove from old room
    if (participant.accommodation?.roomId) {
      const oldRoom = await Room.findOne({ roomId: participant.accommodation.roomId });
      if (oldRoom) {
        oldRoom.members = oldRoom.members.filter(m => m !== uniqueID);
        oldRoom.occupied -= 1;
        await oldRoom.save();
      }
    }

    // Add to new room
    newRoom.members.push(uniqueID);
    newRoom.occupied += 1;
    await newRoom.save();

    const bedNumber = String.fromCharCode(65 + newRoom.members.length - 1);

    // Update participant
    participant.accommodation = {
      allocated: true,
      roomId: newRoom.roomId,
      bhawanCode: newRoom.bhawanCode,
      bhawanName: newRoom.bhawanName,
      roomType: newRoom.roomType,
      roomNumber: newRoom.roomNumber,
      bedNumber,
      allocatedAt: new Date()
    };
    await participant.save();

    // Update AllocatedAccommodation
    await AllocatedAccommodation.findOneAndUpdate(
      { uniqueID },
      {
        roomId: newRoom.roomId,
        bhawanCode: newRoom.bhawanCode,
        bhawanName: newRoom.bhawanName,
        roomType: newRoom.roomType,
        roomNumber: newRoom.roomNumber,
        gender: participant.gender,
        bedNumber,
        allocationMethod: 'reassigned',
        allocatedAt: new Date()
      }
    );

    // Update both old and new bhawan capacities
    if (oldBhawanCode) {
      await updateBhawanCapacity(oldBhawanCode);
    }
    await updateBhawanCapacity(newRoom.bhawanCode);

    res.json({
      success: true,
      message: 'Reallocation successful'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// 5. NEW: Deallocate Participant
router.post('/deallocate', async (req, res) => {
  try {
    const { uniqueID } = req.body;

    const participant = await Participant.findOne({ uniqueID });
    if (!participant || !participant.accommodation?.allocated) {
      return res.status(404).json({ success: false, error: 'No allocation found' });
    }

    const bhawanCode = participant.accommodation.bhawanCode;

    // Remove from room
    const room = await Room.findOne({ roomId: participant.accommodation.roomId });
    if (room) {
      room.members = room.members.filter(m => m !== uniqueID);
      room.occupied -= 1;
      await room.save();
    }

    // Clear accommodation in Participant
    participant.accommodation = { allocated: false };
    await participant.save();

    // Remove from AllocatedAccommodation
    await AllocatedAccommodation.deleteOne({ uniqueID });

    // **IMPORTANT: Update bhawan capacity**
    await updateBhawanCapacity(bhawanCode);

    res.json({
      success: true,
      message: 'Deallocation successful'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. ADD NEW ENDPOINT for search in allocated (Line ~900, after /deallocate)
router.get('/search-allocated', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      const all = await AllocatedAccommodation.find().sort({ allocatedAt: -1 });
      return res.json({ success: true, results: all });
    }

    // Search in multiple fields
    const results = await AllocatedAccommodation.find({
      $or: [
        { uniqueID: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
        { roomNumber: { $regex: query, $options: 'i' } },
        { bhawanName: { $regex: query, $options: 'i' } }
      ]
    }).sort({ allocatedAt: -1 });

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available rooms by bhawan and room type
router.get('/allocate-staged/available-rooms/:bhawanCode/:roomType?', async (req, res) => {
  try {
    const { bhawanCode, roomType } = req.params;

    const query = {
      bhawanCode,
      status: { $in: ['available', 'partial'] },
      available: { $gt: 0 }
    };

    // Filter by room type if specified
    if (roomType && roomType !== 'all') {
      query.roomType = roomType;
    }

    const rooms = await Room.find(query).sort({ roomNumber: 1 });

    const totalAvailable = rooms.reduce((sum, r) => sum + r.available, 0);

    res.json({
      success: true,
      totalAvailable,
      rooms: rooms.map(r => ({
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        roomType: r.roomType,
        capacity: r.capacity,
        occupied: r.occupied,
        available: r.available
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available room types in a bhawan
router.get('/allocate-staged/room-types/:bhawanCode', async (req, res) => {
  try {
    const { bhawanCode } = req.params;

    const roomTypes = await Room.distinct('roomType', {
      bhawanCode,
      status: { $in: ['available', 'partial'] },
      available: { $gt: 0 }
    });

    // Get capacity for each room type
    const typesWithCapacity = await Promise.all(
      roomTypes.map(async (type) => {
        const rooms = await Room.find({
          bhawanCode,
          roomType: type,
          status: { $in: ['available', 'partial'] }
        });

        const totalAvailable = rooms.reduce((sum, r) => sum + r.available, 0);

        return {
          roomType: type,
          available: totalAvailable
        };
      })
    );

    res.json({
      success: true,
      roomTypes: typesWithCapacity.filter(t => t.available > 0)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. FIX: Manual Allocation with Duplicate Check..
router.post('/allocate-manual', async (req, res) => {
  try {
    const { participantIds, roomId } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || !roomId) {
      return res.status(400).json({
        success: false,
        error: 'participantIds (array) and roomId are required'
      });
    }

    // Validate participants exist
    const validParticipants = await Participant.find({
      uniqueID: { $in: participantIds }
    });

    if (validParticipants.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Some participant IDs do not exist'
      });
    }

    // Check for already allocated participants
    const alreadyAllocated = validParticipants.filter(p => p.accommodation?.allocated);
    if (alreadyAllocated.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Already allocated: ${alreadyAllocated.map(p => `${p.name} (${p.uniqueID})`).join(', ')}`
      });
    }

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    if (room.available < participantIds.length) {
      return res.status(400).json({
        success: false,
        error: `Room has only ${room.available} available spaces`
      });
    }

    // Validate gender
    if (room.gender !== 'mixed') {
      const invalidGender = validParticipants.filter(p => p.gender !== room.gender);
      if (invalidGender.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Gender mismatch: Room is ${room.gender}, but some participants are not.`
        });
      }
    }

    // Check for duplicates in room
    const duplicates = participantIds.filter(pid => room.members.includes(pid));
    if (duplicates.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Already in this room: ${duplicates.join(', ')}`
      });
    }

    // Remove from old rooms if exists
    for (const pid of participantIds) {
      const participant = await Participant.findOne({ uniqueID: pid });
      if (participant?.accommodation?.roomId) {
        const oldRoom = await Room.findOne({ roomId: participant.accommodation.roomId });
        if (oldRoom) {
          oldRoom.members = oldRoom.members.filter(m => m !== pid);
          oldRoom.occupied -= 1;
          await oldRoom.save();
        }
        await AllocatedAccommodation.deleteOne({ uniqueID: pid });
      }
    }

    // Add to new room
    room.members.push(...participantIds);
    room.occupied += participantIds.length;
    await room.save();

    // Update participants
    for (let i = 0; i < participantIds.length; i++) {
      const participant = await Participant.findOne({ uniqueID: participantIds[i] });
      const bedNumber = String.fromCharCode(65 + room.members.length - participantIds.length + i);

      await Participant.findOneAndUpdate(
        { uniqueID: participantIds[i] },
        {
          $set: {
            'accommodation.allocated': true,
            'accommodation.roomId': room.roomId,
            'accommodation.bhawanCode': room.bhawanCode,
            'accommodation.bhawanName': room.bhawanName,
            'accommodation.roomType': room.roomType,
            'accommodation.roomNumber': room.roomNumber,
            'accommodation.bedNumber': bedNumber,
            'accommodation.allocatedAt': new Date()
          }
        }
      );

      await AllocatedAccommodation.findOneAndUpdate(
        { uniqueID: participantIds[i] },
        {
          uniqueID: participantIds[i],
          name: participant.name,
          email: participant.email,
          phoneNumber: participant.phoneNumber,
          collegeName: participant.collegeName,
          gender: participant.gender,
          roomId: room.roomId,
          bhawanCode: room.bhawanCode,
          bhawanName: room.bhawanName,
          roomType: room.roomType,
          roomNumber: room.roomNumber,
          bedNumber,
          allocationMethod: 'manual',
          allocatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      await AllocationLog.create({
        participantId: participantIds[i],
        roomId: room.roomId,
        bhawanCode: room.bhawanCode,
        roomNumber: room.roomNumber,
        allocationMethod: 'manual'
      });
    }
    await updateBhawanCapacity(room.bhawanCode);
    res.json({
      success: true,
      message: 'Manual allocation successful'
    });

  } catch (error) {
    console.error('Manual allocation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// 5. ADD NEW ENDPOINT to get room details with occupants (Line ~930)
router.get('/room-details/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    // Get all occupant details from AllocatedAccommodation
    const occupants = await AllocatedAccommodation.find({
      roomId: room.roomId
    }).select('uniqueID name email phoneNumber bedNumber');

    res.json({
      success: true,
      room: {
        ...room.toObject(),
        occupants
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Get participant accommodation info (for QR scan)
router.get('/participant/:uniqueId', async (req, res) => {
  try {
    const participant = await Participant.findOne({ uniqueID: req.params.uniqueId });

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' });
    }

    res.json({
      success: true,
      participant: {
        uniqueID: participant.uniqueID,
        name: participant.name,
        email: participant.email,
        accommodation: participant.accommodation
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all allocated accommodations
router.get('/allocated', async (req, res) => {
  try {
    const allocated = await AllocatedAccommodation.find().sort({ allocatedAt: -1 });

    res.json({
      success: true,
      total: allocated.length,
      allocated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    const totalParticipants = await Participant.countDocuments();
    const allocatedCount = await AllocatedAccommodation.countDocuments();
    const pendingCount = totalParticipants - allocatedCount;

    const totalRooms = await Room.countDocuments();
    const occupiedRooms = await Room.countDocuments({ occupied: { $gt: 0 } });

    const capacityStats = await Room.aggregate([
      {
        $group: {
          _id: null,
          totalCapacity: { $sum: '$capacity' },
          totalOccupied: { $sum: '$occupied' }
        }
      }
    ]);

    const allocationByMethod = await AllocationLog.aggregate([
      {
        $group: {
          _id: '$allocationMethod',
          count: { $sum: 1 }
        }
      }
    ]);

    const bhawanStats = await Bhawan.find().sort({ bhawanCode: 1 });

    res.json({
      success: true,
      overview: {
        totalParticipants,
        allocatedParticipants: allocatedCount,
        pendingParticipants: pendingCount,
        allocationPercentage: totalParticipants > 0 ? ((allocatedCount / totalParticipants) * 100).toFixed(2) : 0
      },
      rooms: {
        total: totalRooms,
        occupied: occupiedRooms,
        available: totalRooms - occupiedRooms
      },
      capacity: {
        total: capacityStats[0]?.totalCapacity || 0,
        occupied: capacityStats[0]?.totalOccupied || 0,
        available: (capacityStats[0]?.totalCapacity || 0) - (capacityStats[0]?.totalOccupied || 0)
      },
      allocationMethods: allocationByMethod,
      bhawanStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;