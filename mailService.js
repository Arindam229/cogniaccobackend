const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const QRCode = require("qrcode");
require("dotenv").config();

// Ensure the uploads directory exists
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const sendEmail = async (to, name, phoneNumber, collegeName, uniqueId) => {
  try {
    // Validate inputs
    if (!to || !name || !phoneNumber || !collegeName || !uniqueId) {
      throw new Error("All fields (to, name, phoneNumber, collegeName, uniqueId) are required");
    }

    // Convert uniqueId to string to handle both numbers and strings
    const uniqueIdStr = String(uniqueId);

    // Validate uniqueId for QR code
    if (uniqueIdStr.trim() === "") {
      throw new Error(`Invalid uniqueId: ${uniqueId}. It must be a non-empty string after conversion.`);
    }

    // Log the uniqueId for debugging
    console.log(`Generating QR code for uniqueId: ${uniqueIdStr}`);

    // Paths for two PDFs
    const idCardPath = `./uploads/${uniqueIdStr}_ID.pdf`;
    const rulesPath = `./uploads/${uniqueIdStr}_Rules.pdf`;

    // Generate QR Code as base64
    let qrCodeData;
    try {
      qrCodeData = await QRCode.toDataURL(uniqueIdStr);
    } catch (qrError) {
      throw new Error(`Failed to generate QR code for uniqueId ${uniqueIdStr}: ${qrError.message}`);
    }

    // ==========================================
    // FIRST PDF: PROFESSIONAL ID CARD
    // ==========================================
    const idCardDoc = new PDFDocument({
      size: "A4",
      margins: { top: 50, left: 50, right: 50, bottom: 50 }
    });
    idCardDoc.pipe(fs.createWriteStream(idCardPath));

    // ID Card dimensions (same as original: 9.4cm x 9.8cm)
    const idCardWidth = 355 * 0.75; // 266.25pt
    const idCardHeight = 370 * 0.75; // 277.5pt
    const idCardX = (595.28 - idCardWidth) / 2; // Center horizontally
    const idCardY = 120;

    // ===== HEADER SECTION WITH GRADIENT EFFECT =====
    const headerHeight = 60;

    // Draw gradient-like header with blue shades
    idCardDoc.rect(idCardX, idCardY, idCardWidth, headerHeight)
      .fillAndStroke('#0066CC', '#0066CC');

    // Logo in header (left side)
    const logoPath = "./src/cogni.jpg";
    const logoSize = 45;
    idCardDoc.image(logoPath, idCardX + 10, idCardY + 7.5, {
      width: logoSize,
      height: logoSize
    });

    // Event title in header
    idCardDoc.font("Helvetica-Bold")
      .fontSize(16)
      .fillColor('#FFFFFF')
      .text("COGNIZANCE 2025", idCardX + logoSize + 20, idCardY + 12, {
        width: idCardWidth - logoSize - 40,
        align: "left"
      });

    idCardDoc.font("Helvetica")
      .fontSize(10)
      .fillColor('#FFFFFF')
      .text("IIT Roorkee", idCardX + logoSize + 20, idCardY + 32, {
        width: idCardWidth - logoSize - 40,
        align: "left"
      });

    // Decorative line under header
    idCardDoc.moveTo(idCardX, idCardY + headerHeight)
      .lineTo(idCardX + idCardWidth, idCardY + headerHeight)
      .strokeColor('#FFD700')
      .lineWidth(3)
      .stroke();

    // ===== PHOTO SECTION =====
    const photoX = idCardX + 15;
    const photoY = idCardY + headerHeight + 15;
    const photoSize = 85;

    // Photo frame - plain simple border
    idCardDoc.roundedRect(photoX, photoY, photoSize, photoSize, 3)
      .strokeColor('#CCCCCC')
      .lineWidth(1)
      .stroke();

    idCardDoc.fontSize(9)
      .fillColor('#666666')
      .text("PHOTO", photoX + 22, photoY + 37);

    // ===== PARTICIPANT DETAILS SECTION =====
    const detailsX = photoX + photoSize + 15;
    const detailsY = photoY + 5;
    const detailsWidth = idCardWidth - photoSize - 40;

    idCardDoc.fillColor('#000000');

    // Name
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#0066CC')
      .text("Name:", detailsX, detailsY);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#000000')
      .text(name, detailsX, detailsY + 13, {
        width: detailsWidth,
        ellipsis: true
      });

    // Contact
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#0066CC')
      .text("Contact:", detailsX, detailsY + 30);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#000000')
      .text(phoneNumber, detailsX, detailsY + 43);

    // College
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#0066CC')
      .text("College:", detailsX, detailsY + 60);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#000000')
      .text(collegeName, detailsX, detailsY + 73, {
        width: detailsWidth,
        ellipsis: true
      });

    // ===== QR CODE SECTION =====
    const qrY = idCardY + idCardHeight - 90;
    const qrSize = 70;
    const qrX = idCardX + 15;

    // QR code without border - plain
    idCardDoc.image(qrCodeData, qrX, qrY, {
      width: qrSize,
      height: qrSize
    });

    // ===== ACCOMMODATION SECTION =====
    const accomX = idCardX + idCardWidth - 120;
    const accomY = idCardY + idCardHeight - 35;

    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#0066CC')
      .text("Accommodation:", accomX, accomY);

    // Checkbox for accommodation
    idCardDoc.roundedRect(accomX, accomY + 15, 10, 10, 2)
      .strokeColor('#0066CC')
      .stroke();

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#000000')
      .text("Required", accomX + 15, accomY + 15.5);

    // ===== OUTER BORDER =====
    idCardDoc.roundedRect(idCardX, idCardY, idCardWidth, idCardHeight, 8)
      .lineWidth(2.5)
      .strokeColor('#0066CC')
      .stroke();

    // ===== INSTRUCTIONS SECTION (Below ID Card) =====
    const instructionX = 70;
    const instructionY = idCardY + idCardHeight + 30;

    idCardDoc.font("Helvetica-Bold")
      .fontSize(14)
      .fillColor('#0066CC')
      .text("Important Instructions", instructionX, instructionY);

    idCardDoc.moveTo(instructionX, instructionY + 18)
      .lineTo(instructionX + 180, instructionY + 18)
      .strokeColor('#FFD700')
      .lineWidth(2)
      .stroke();

    idCardDoc.font("Helvetica")
      .fontSize(10)
      .fillColor('#000000');

    const instructions = [
      "• Carry THREE (3) passport-size photographs for registration",
      "• Bring ₹300 cash as security deposit (refundable on final night)",
      "• Print and carry the signed NOC (attached in this email)",
      "• Affix your photo on this ID card and carry it to the venue",
      "• ID will be verified at the Control Desk upon arrival"
    ];

    let currentY = instructionY + 30;
    instructions.forEach(instruction => {
      idCardDoc.text(instruction, instructionX, currentY, {
        width: 450
      });
      currentY += 22;
    });

    idCardDoc.end();

    // ==========================================
    // SECOND PDF: RULES AND GUIDELINES (Unchanged)
    // ==========================================
    const rulesDoc = new PDFDocument({
      size: "A4",
      margins: { top: 50, left: 50, right: 50, bottom: 50 }
    });
    rulesDoc.pipe(fs.createWriteStream(rulesPath));

    // Page 1: Important Instructions and Rules and Guidelines
    rulesDoc.font("Helvetica-Bold").fontSize(20).text("COGNIZANCE 2025", 50, 50);
    rulesDoc.moveDown(2);

    // Important Instructions for Participants
    rulesDoc.font("Helvetica-Bold").fontSize(16).text("Important Instructions for Participants");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("All participants must adhere to the following instructions to ensure a smooth registration and participation process in Cognizance 2025:");
    rulesDoc.moveDown(1);

    // 1. Required Documents & Essentials
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("1. Required Documents & Essentials");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12);
    rulesDoc.text("• Photographs: Carry three (3) passport-size photographs for registration purposes.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").text("• Security Deposit: Bring Rupees 300 in cash as a security deposit, which will be refunded on the final night of the fest.");
    rulesDoc.font("Helvetica").text("");
    rulesDoc.moveDown(0.5);
    rulesDoc.text("• No-Objection Certificate (NOC): Carry a printed copy of the NOC, duly filled and signed in advance. The NOC is attached to this document.");
    rulesDoc.moveDown(0.5);
    rulesDoc.text("• Extension Boards: Participants should bring their own extension boards as per their requirements.");
    rulesDoc.moveDown(0.5);
    rulesDoc.text("• ID Card: Carry a printed Cognizance 2025 ID Card with your photograph affixed at the designated space. This ID Card is provisional and will be verified and authorized by the Cognizance Organizing Committee at the Control Desk.");
    rulesDoc.moveDown(1);

    // 2. Compliance & Conduct
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("2. Compliance & Conduct");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12);
    rulesDoc.text("• Participants must strictly follow all rules and guidelines set by the Cognizance Organizing Committee.");
    rulesDoc.moveDown(0.5);
    rulesDoc.text("• Any rule violation may result in immediate disqualification, cancellation of the participant's ID Card, and expulsion from the institute premises.");
    rulesDoc.moveDown(0.5);
    rulesDoc.text("• Failure to comply with the above instructions may lead to denial of entry or participation in the event.");
    rulesDoc.moveDown(1);

    // Rules and Guidelines for Participants
    rulesDoc.font("Helvetica-Bold").fontSize(16).text("Rules and Guidelines for Participants - Cognizance 2025");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("Participants must adhere to the following rules and guidelines during Cognizance 2025. Any violation may result in disqualification, removal from the venue, or further disciplinary action at the discretion of the organizing committee.");
    rulesDoc.moveDown(1);

    // 1. General Conduct
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("1. General Conduct");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("1.1 Participants must maintain professionalism and decorum throughout the event.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("1.2 Any form of misconduct, harassment, verbal/physical abuse, or indecent behavior will result in immediate disqualification and expulsion.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("1.3 Participants must comply with all instructions from event coordinators and staff at all times.");
    rulesDoc.moveDown(1);

    // 2. Verification and Identification
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("2. Verification and Identification");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("2.1 A valid government-issued ID and the official Cognizance 2025 Provisional ID Card must be presented upon request by the organizing committee, security personnel, or administrative authorities.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("2.2 Once approved, the Provisional ID Card must be visibly worn at all times within the institute premises.");
    rulesDoc.moveDown(1);

    // 3. Event Participation
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("3. Event Participation");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("3.1 Participants must report to their respective event locations at least 15 minutes before the scheduled time. Late arrivals may result in disqualification.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("3.2 Cheating, plagiarism, or the use of unfair means during competitions will lead to immediate disqualification.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("3.3 Event-related materials and information provided to participants must be kept confidential.");
    rulesDoc.moveDown(1);

    // 4. Safety and Security
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("4. Safety and Security");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("4.1 Weapons, explosives, or hazardous materials are strictly prohibited.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("4.2 Smoking, alcohol consumption, and narcotic use are strictly prohibited both within and beyond the institute premises during Cognizance.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("4.3 Participants must follow all safety protocols and evacuation procedures as directed by the organizing committee and security personnel.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("4.4 Tampering with safety equipment (e.g., fire extinguishers, alarms) is strictly forbidden and will lead to immediate expulsion along with potential legal action.");
    rulesDoc.moveDown(1);

    // 5. Property and Equipment
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("5. Property and Equipment");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("5.1 Participants must handle all provided equipment and property responsibly. Any damage caused due to negligence will be the participant's responsibility.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("5.2 Unauthorized removal or misuse of event property is strictly prohibited and may result in disciplinary action.");
    rulesDoc.moveDown(1);

    // 6. Communication and Media
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("6. Communication and Media");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("6.1 Unauthorized recording, live streaming, or broadcasting of event activities is prohibited unless explicitly approved by the organizing committee.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("6.2 Participants must refrain from making derogatory or defamatory remarks about the event, organizers, or fellow participants on public platforms, including social media.");
    rulesDoc.moveDown(1);

    // 7. Disciplinary Actions
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("7. Disciplinary Actions");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("7.1 The organizing committee reserves the right to impose disciplinary measures, including but not limited to disqualification, suspension, or legal action, for any breach of rules.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("7.2 Decisions made by the organizing committee regarding disputes or rule violations are final and binding.");
    rulesDoc.moveDown(1);

    // 8. Legal and Liability
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("8. Legal and Liability");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("8.1 The organizing committee is not responsible for any loss of personal belongings or injuries sustained during the event.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("8.2 Participation in Cognizance 2025 implies acceptance of these rules and guidelines.");
    rulesDoc.moveDown(1);

    // 9. Movement and Discipline
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("9. Movement and Discipline");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("9.1 Participants must remain within their allocated accommodation between 2am – 6am. Unauthorized roaming in restricted areas or outside designated zones will result in strict action, including immediate disqualification and expulsion from the institute premises.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("9.2 Any act of indiscipline, including but not limited to misconduct, rule violations, or disrespect towards event coordinators, faculty, or security personnel, will lead to disqualification of the participant and/or their entire contingent.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("9.3 If a participant is found disobeying the rules and regulations, their ID Card will be rendered invalid, and the security deposit will be forfeited. Further, they may be banned from participating in future editions of Cognizance.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("9.4 Serious violations of discipline will be officially reported to the participant's college/university administration, which may take further action as per their institutional policies.");
    rulesDoc.moveDown(1);

    // Note
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("Note: ", { continued: true });
    rulesDoc.font("Helvetica").text("The Cognizance 2025 organizing committee reserves the right to modify or update these rules at any time without prior notice. Participants are expected to stay informed about any changes through official channels.");
    rulesDoc.moveDown(1);

    // Page 3: NO OBJECTION CERTIFICATE (NOC)
    rulesDoc.addPage();
    rulesDoc.font("Helvetica-Bold").fontSize(20).text("NO OBJECTION CERTIFICATE (NOC)", 50, 50, { align: "center" });
    rulesDoc.font("Helvetica-Oblique").fontSize(10).text("(To be printed, filled, and signed by the participant)", 50, 80, { align: "center" });
    rulesDoc.moveTo(50, 100).lineTo(545, 100).stroke();

    rulesDoc.font("Helvetica").fontSize(12).text("To Whom It May Concern,", 50, 120);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("I, ___________________________ (Participant's Full Name), son/daughter of", 50, 150);
    rulesDoc.moveDown(1);
    rulesDoc.text("___________________________ (Parent/Guardian's Full Name), residing at", 50, 175);
    rulesDoc.moveDown(1);
    rulesDoc.text("___________________________ (Full Address), hereby declare that I have no objection to participating in Cognizance 2025, organized at the Indian Institute of Technology Roorkee (IIT Roorkee) from March 20-23, 2025.", 50, 200);
    rulesDoc.moveDown(2);

    rulesDoc.font("Helvetica-Bold").fontSize(12).text("I understand and acknowledge that:", 50, 270);
    rulesDoc.moveDown(1);

    rulesDoc.font("Helvetica").fontSize(12).text("1. My participation in the event is voluntary, and I shall abide by all rules, regulations, and", 50, 290);
    rulesDoc.text(" guidelines set forth by the organizing committee.", 50, 305);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("2. The organizers of Cognizance 2025, IIT Roorkee, and associated authorities shall not be held liable for any injuries, losses, or damages incurred during the event.", 50, 330);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("3. I am solely responsible for my personal belongings and conduct throughout the event.", 50, 370);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("4. I have informed my parents/guardians about my participation, and they have no objection to the same.", 50, 395);
    rulesDoc.moveDown(2);

    rulesDoc.font("Helvetica-Bold").fontSize(12).text("I confirm that I have read and understood all terms and conditions associated with my participation in", 50, 450);
    rulesDoc.moveDown(0.8);
    rulesDoc.text("Cognizance 2025. I further affirm that this NOC is signed by me in full consent and without any external pressure.", 50, 480);
    rulesDoc.moveDown(2);

    rulesDoc.moveTo(50, 510).lineTo(545, 510).stroke();
    rulesDoc.font("Helvetica-Oblique").fontSize(10).text("Signature of the Participant", 50, 530);
    rulesDoc.font("Helvetica").fontSize(10).text("Date: .../03/2025", 50, 545);

    rulesDoc.end();

    // ==========================================
    // EMAIL SETUP AND SENDING
    // ==========================================
    const transporter = nodemailer.createTransport({
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

    // Verify transporter configuration
    transporter.verify(function (error, success) {
      if (error) {
        console.error("SMTP connection error:", error);
      } else {
        console.log("✅ Server is ready to send emails");
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: "Your Cognizance 2025 Ticket & Event Guidelines",
      text: `Dear ${name},

Greetings from Cognizance 2025!

Your UniqueId for Cognizance'25: ${uniqueId}

Attached are your Entry Ticket, Rules & Guidelines (including the NOC) for Cognizance 2025. Please print these documents and bring them with you to the event for a smooth check-in process.

Important Instructions:
✔ Carry a valid ID proof along with the printed documents attached below.
✔ Follow all rules mentioned in the Guidelines & NOC document.
✔ Ensure you arrive on time to avoid any entry issues.
✔ Ensure that you have joined the cognizance whatsapp group using the link before your arrival: https://whatsapp.com/channel/0029Vb9lCTd4SpkHOMEsC834.

Looking forward to welcoming you to Cognizance 2025!

Best Regards
Team Cognizance 2025
IIT Roorkee`,
      attachments: [
        {
          filename: "Cognizance_2025_ID_Card.pdf",
          path: idCardPath,
          contentType: "application/pdf",
        },
        {
          filename: "Cognizance_2025_Rules_Guidelines.pdf",
          path: rulesPath,
          contentType: "application/pdf",
        },
      ],
    });

    // Clean up PDF files
    fs.unlinkSync(idCardPath);
    fs.unlinkSync(rulesPath);

    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = sendEmail;