const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose"); // Added: Import mongoose for MongoDB
const generateQRCode = require("./qrGenerator.js");
const sendEmail = require("./mailService.js");
const bulkMailQueueRouter = require('./routes/bulkMailQueue'); // ← ADD THIS LINE
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
// Add these imports at the top of server.js:
const nodemailer = require("nodemailer");
const path = require('path');
try {
  require("dotenv").config();
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Missing EMAIL_USER or EMAIL_PASS in .env file");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in .env file");
  }
  console.log("dotenv loaded successfully");
} catch (error) {
  console.error("Error loading dotenv:", error.message);
  process.exit(1);
}
// Added: Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  retryWrites: true,
  w: "majority",
});
mongoose.connection.on("error", (err) => console.error("MongoDB connection error:", err));
mongoose.connection.once("open", () => console.log("Connected to MongoDB"));
const Participant = require('./models/Participant');
const app = express();
const upload = multer({ dest: "uploads/" });
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const accommodationRouter = require('./routes/accommodation');
const verifyRoute = require("./routes/verify.js");
app.use('/accommodation', accommodationRouter);
app.use("/api", verifyRoute);
app.use("/api/bulk-mail-queue", bulkMailQueueRouter); // ← ADD THIS LINE
// app.use("/allot", allotRouter);

// Add this custom mail service after your existing routes:

// Create a custom mail transporter
const createCustomMailTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send custom email function
const sendCustomEmail = async (to, name, subject, body) => {
  try {
    const transporter = createCustomMailTransporter();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .email-header {
      background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
      color: #ffffff;
      padding: 30px;
      text-align: center;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .email-body {
      padding: 30px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #000;
      margin-bottom: 20px;
    }
    .message-content {
      font-size: 15px;
      line-height: 1.8;
      color: #333;
      margin-bottom: 20px;
      white-space: pre-wrap;
    }
    .email-footer {
      background: #f8f8f8;
      padding: 20px 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer-text {
      font-size: 13px;
      color: #666;
      margin: 5px 0;
    }
    .signature {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1 style="margin:0;">COGNIZANCE 2026</h1>
      <p style="margin: 2px 0 0 0; opacity: 0.8; font-size: 11px;">IIT ROORKEE</p>
    </div>
    <div class="email-body">
      <div style="font-weight: bold; color: #d32f2f; font-size: 18px; margin-bottom: 10px; border-bottom: 2px solid #d32f2f; padding-bottom: 10px;">THIS IS THE FINAL ID CARD. PLEASE DISREGARD ANY PREVIOUS VERSIONS.</div>
      <div class="greeting">Dear ${name},</div>
      <div class="message-content">${body}</div>
    </div>
    <div class="email-footer">
      <p class="footer-text">© 2026 Cognizance, IIT Roorkee. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    console.log(`✅ Custom email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send custom email to ${to}:`, error.message);
    throw error;
  }
};

// Route 1: Send custom mail to selected participants (bulk)
app.post("/api/custom-mail/send-bulk", async (req, res) => {
  try {
    const { recipients, subject, body } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }

    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Subject and body are required'
      });
    }

    const logs = [];
    let successCount = 0;
    let failureCount = 0;

    // Send emails with delay to avoid rate limiting
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      try {
        // Add delay between emails (1 second)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await sendCustomEmail(
          recipient.email,
          recipient.name,
          subject,
          body
        );

        successCount++;
        logs.push({
          email: recipient.email,
          status: 'success',
          timestamp: Date.now()
        });

        console.log(`✅ Custom email sent to ${recipient.email} (${i + 1}/${recipients.length})`);
      } catch (error) {
        failureCount++;
        logs.push({
          email: recipient.email,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });

        console.error(`❌ Failed to send custom email to ${recipient.email}:`, error.message);
      }
    }
    res.status(200).json({
      success: true,
      total: recipients.length,
      successCount: successCount,
      failureCount: failureCount,
      logs: logs
    });
  } catch (error) {
    console.error("Error in bulk custom mail:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route 2: Send custom mail via Excel upload
app.post("/api/custom-mail/send-excel", upload.single("excelFile"), async (req, res) => {
  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Subject and body are required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Excel file is required'
      });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const participants = XLSX.utils.sheet_to_json(sheet);

    const logs = [];
    let successCount = 0;
    let failureCount = 0;

    // Process emails with delay to avoid rate limiting
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const { email, name } = participant;

      if (!email || !name) {
        logs.push({
          email: email || 'Unknown',
          status: 'failed',
          error: 'Missing email or name in Excel',
          timestamp: Date.now()
        });
        failureCount++;
        continue;
      }

      try {
        // Add delay between emails (1 second)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await sendCustomEmail(email, name, subject, body);

        successCount++;
        logs.push({
          email: email,
          status: 'success',
          timestamp: Date.now()
        });

        console.log(`✅ Custom email sent to ${email} (${i + 1}/${participants.length})`);
      } catch (error) {
        failureCount++;
        logs.push({
          email: email,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });

        console.error(`❌ Failed to send custom email to ${email}:`, error.message);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      total: participants.length,
      successCount: successCount,
      failureCount: failureCount,
      logs: logs
    });
  } catch (error) {
    console.error("Error in Excel custom mail:", error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk Excel Upload Endpoint with Rate Limiting and Logs
app.post("/upload-excel", upload.single("excelFile"), async (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const participants = XLSX.utils.sheet_to_json(sheet);
    const participantData = [];
    const logs = []; // Store all email results
    let successCount = 0;
    let failureCount = 0;

    // Process emails with delay to avoid rate limiting
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const { email, name, phoneNumber, collegeName, gender } = participant;
      const uniqueID = `USER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      try {
        // Add delay between emails (1 second)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await sendEmail(email, name, phoneNumber, collegeName, uniqueID);
        participantData.push({ email, name, phoneNumber, collegeName, gender: gender || 'male', uniqueID });

        // Save to MongoDB
        await Participant.create({
          email,
          name,
          phoneNumber,
          collegeName,
          gender: gender ? gender.toLowerCase() : 'male',
          uniqueID
        });
        successCount++;

        // Log success
        logs.push({
          email: email, // ACTUAL EMAIL ADDRESS
          status: 'success',
          timestamp: Date.now(),
          uniqueId: uniqueID // Optional: QR code ID
        });

        console.log(`✅ Email sent to ${email} (${i + 1}/${participants.length})`);
      } catch (error) {
        // Log failure with error message
        logs.push({
          email: email, // ACTUAL EMAIL ADDRESS
          status: 'failed',
          error: error.message, // ERROR REASON
          timestamp: Date.now()
        });
        failureCount++;

        console.error(`❌ Failed to send email to ${email}:`, error.message);
      }
    }

    // Save to filesystem
    fs.writeFileSync("uploads/allparticipants.json", JSON.stringify(participantData, null, 2));

    fs.unlinkSync(req.file.path);

    // Return response with logs
    res.status(200).json({
      success: true,
      total: participants.length,
      successCount: successCount,
      failureCount: failureCount,
      logs: logs // <-- IMPORTANT: Include the logs array!
    });
  } catch (error) {
    console.error("Error processing Excel:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// GET - Fetch current email config from .env
app.get('/api/email-config', (req, res) => {
  try {
    res.json({
      email: process.env.EMAIL_USER || '',
      // Return masked password for security (show first 2 and last 2 chars)
      password: process.env.EMAIL_PASS || ''
    });
  } catch (error) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email configuration' });
  }
});

// Add these routes to your server.js file

// Admin API - Get all participants
app.get('/api/admin/participants', async (req, res) => {
  try {
    const participants = await Participant.find({}).sort({ _id: -1 }).exec();
    res.json({
      success: true,
      participants: participants
    });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch participants'
    });
  }
});

// Admin API - Get all verified participants (scanned at gate)
app.get('/api/admin/scanned', async (req, res) => {
  try {
    const VerifiedParticipant = mongoose.model('VerifiedParticipant');
    const verified = await VerifiedParticipant.find({}).sort({ verifiedAt: -1 }).exec();
    res.json({
      success: true,
      scanned: verified, // Keep 'scanned' key for frontend compatibility
      total: verified.length
    });
  } catch (error) {
    console.error('Error fetching verified participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verified participants'
    });
  }
});
// // Admin API - Get all scanned participants
// app.get('/api/admin/scanned', async (req, res) => {
//   try {
//     const Scanned = mongoose.model('Scanned');
//     const scanned = await Scanned.find({}).sort({ scannedAt: -1 }).exec();
//     res.json({
//       success: true,
//       scanned: scanned
//     });
//   } catch (error) {
//     console.error('Error fetching scanned participants:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch scanned participants'
//     });
//   }
// });
// POST - Update email config in .env file
app.post('/api/email-config', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const envPath = path.join(__dirname, '.env');
    // Read current .env file
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    // Update or add EMAIL_USER
    if (envContent.includes('EMAIL_USER=')) {
      envContent = envContent.replace(/EMAIL_USER=.*/g, `EMAIL_USER=${email}`);
    } else {
      envContent += `\nEMAIL_USER=${email}`;
    }

    // Update or add EMAIL_PASS
    if (envContent.includes('EMAIL_PASS=')) {
      envContent = envContent.replace(/EMAIL_PASS=.*/g, `EMAIL_PASS=${password}`);
    } else {
      envContent += `\nEMAIL_PASS=${password}`;
    }

    // Write back to .env file
    fs.writeFileSync(envPath, envContent.trim() + '\n');

    // Update process.env immediately
    process.env.EMAIL_USER = email;
    process.env.EMAIL_PASS = password;

    res.json({
      success: true,
      message: 'Email configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating email config:', error);
    res.status(500).json({ error: 'Failed to update email configuration' });
  }
});
// Phone Verification Endpoint (unchanged)
app.post("/api/auth/verify-phone", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || phoneNumber.length < 10) {
      return res.status(400).json({ success: false, message: "Invalid phone number format" });
    }
    const userDoc = await db.collection("UserTeam").doc(phoneNumber).get();
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. Phone number not authorized.",
      });
    }
    const userData = userDoc.data();
    const { name } = userData;
    res.status(200).json({
      success: true,
      message: "Authentication successful",
      user: { phoneNumber, name },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ success: false, message: "Server error during authentication" });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});