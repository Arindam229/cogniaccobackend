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

    // ===== HEADER SECTION WITH CYBERPUNK THEME (CLIPPED PATH) =====
    const headerHeight = 60;

    // Custom "Cyber" Clipped Shape Path
    const drawClippedCard = (doc, x, y, w, h, clipSize) => {
      doc.save();
      doc.moveTo(x + clipSize, y)
        .lineTo(x + w, y)
        .lineTo(x + w, y + h - clipSize)
        .lineTo(x + w - clipSize, y + h)
        .lineTo(x, y + h)
        .lineTo(x, y + clipSize)
        .closePath();
    };

    // Draw card background with clipped shape
    drawClippedCard(idCardDoc, idCardX, idCardY, idCardWidth, idCardHeight, 15);
    idCardDoc.fill('#0D0221');

    // Draw header background (clipped top only)
    idCardDoc.save();
    idCardDoc.moveTo(idCardX + 15, idCardY)
      .lineTo(idCardX + idCardWidth, idCardY)
      .lineTo(idCardX + idCardWidth, idCardY + headerHeight)
      .lineTo(idCardX, idCardY + headerHeight)
      .lineTo(idCardX, idCardY + 15)
      .closePath()
      .fill('#1A0B2E');

    // Manual SVG Logo Rendering (cogni.svg)
    const renderCogniLogo = (doc, x, y, scale) => {
      doc.save();
      doc.translate(x, y);
      doc.scale(scale);

      const whitePaths = [
        "M54.4676 44.9769C52.8271 43.6103 50.9155 42.6083 48.8594 42.0372C50.137 43.3196 51.32 44.6933 52.3989 46.1474C53.653 47.9012 54.7412 49.7682 55.6497 51.7241L59.1691 50.5469C57.8782 48.473 56.2946 46.5969 54.4676 44.9769Z",
        "M45.8955 47.3208C45.0327 48.9111 44.0539 50.4356 42.9672 51.8817C41.6397 53.5845 40.158 55.1608 38.541 56.5906L40.697 59.6244C42.3185 57.7914 43.6648 55.7315 44.6933 53.5096C45.5293 51.5583 45.9392 49.4505 45.8955 47.3275",
        "M35.1031 44.6012C33.051 43.9222 31.0657 43.0552 29.1725 42.0114L27.0098 45.0385C29.2886 45.9502 31.6861 46.5301 34.1292 46.7606C36.2596 46.9016 38.3956 46.5875 40.3956 45.839C38.6035 45.5573 36.8345 45.1436 35.1031 44.6012Z",
        "M40.0768 28.109L36.5709 26.999C36.4073 29.4149 36.5951 31.8418 37.1283 34.2036C37.6503 36.247 38.5979 38.1566 39.9089 39.8072C39.6242 38.0271 39.4716 36.2283 39.4522 34.4256C39.4639 32.2941 39.673 30.1682 40.0768 28.0753",
        "M49.7093 33.4736C47.8652 34.5352 46.2636 35.972 45.0078 37.6914C46.6514 36.9236 48.3484 36.2761 50.0854 35.754C52.1763 35.1624 54.3164 34.7616 56.4795 34.5566L56.587 30.9241C54.1907 31.447 51.88 32.3052 49.7228 33.4736"
      ];

      const cyanPaths = [
        "M34.6999 33.522C33.1484 29.0284 33.82 23.5459 33.82 23.5459L24.6655 21.7834C24.6655 21.7834 23.3222 31.6654 27.6207 37.047C32.6111 43.303 41.7857 44.3794 41.7857 44.3794C41.7857 44.3794 37.5342 41.6886 34.6999 33.522Z",
        "M58.3864 18.0901C58.3864 18.0901 48.4998 19.7584 44.611 25.4292C40.0841 32.0284 41.7766 41.0627 41.7766 41.0627C41.7766 41.0627 43.0729 36.2395 50.0983 31.1068C53.9468 28.2949 59.414 27.306 59.414 27.306L58.3864 18.0901Z",
        "M60.9201 37.3926C53.2432 35.0651 45.123 39.4107 45.123 39.4107C45.123 39.4107 50.1268 39.1954 57.1455 44.3415C61.0007 47.1601 63.5932 52.0574 63.5932 52.0574L72.0895 48.3172C72.0895 48.3172 67.5089 39.4174 60.9201 37.4128",
        "M47.4965 42.558C47.4965 42.558 49.2226 47.213 46.4689 55.393C44.9577 59.8867 41.0957 63.8287 41.0957 63.8287L47.2547 70.6902C47.2547 70.6902 54.3338 63.6605 54.2263 56.8394C54.1054 48.8948 47.5099 42.558 47.5099 42.558",
        "M32.51 48.3796C27.7346 48.319 22.7578 45.8233 22.7578 45.8233L18.0898 53.8284C18.0898 53.8284 27.0294 58.4364 33.5376 56.2367C41.1071 53.6737 45.1302 45.413 45.1302 45.413C45.1302 45.413 41.2078 48.5006 32.51 48.3796Z"
      ];

      whitePaths.forEach(p => doc.path(p).fill('white'));
      cyanPaths.forEach(p => doc.path(p).fill('#2FFCFE'));
      doc.restore();
    };

    renderCogniLogo(idCardDoc, idCardX + 5, idCardY + 5, 0.55);

    const logoSize = 45; // Simulated for layout consistency

    // Event title in header
    idCardDoc.font("Helvetica-Bold")
      .fontSize(16)
      .fillColor('#00FFFF') // Cyber Cyan
      .text("COGNIZANCE 2026", idCardX + logoSize + 22, idCardY + 12, {
        width: idCardWidth - logoSize - 40,
        align: "left"
      });

    idCardDoc.font("Helvetica")
      .fontSize(10)
      .fillColor('#FF00FF') // Neon Magenta
      .text("IIT Roorkee", idCardX + logoSize + 22, idCardY + 32, {
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
      .strokeColor('#FF00FF') // Neon Magenta
      .lineWidth(1.5)
      .stroke();

    idCardDoc.fontSize(9)
      .fillColor('#00FFFF') // Cyber Cyan
      .text("PHOTO", photoX + 22, photoY + 37);

    // ===== PARTICIPANT DETAILS SECTION =====
    const detailsX = photoX + photoSize + 15;
    const detailsY = photoY + 5;
    const detailsWidth = idCardWidth - photoSize - 40;

    idCardDoc.fillColor('#000000');

    // Name
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#00FFFF') // Cyber Cyan
      .text("Name:", detailsX, detailsY);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#FFFFFF')
      .text(name, detailsX, detailsY + 13, {
        width: detailsWidth,
        ellipsis: true
      });

    // Contact
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#00FFFF') // Cyber Cyan
      .text("Contact:", detailsX, detailsY + 30);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#FFFFFF')
      .text(phoneNumber, detailsX, detailsY + 43);

    // College
    idCardDoc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor('#00FFFF') // Cyber Cyan
      .text("College:", detailsX, detailsY + 60);

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#FFFFFF')
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
      .fillColor('#FF00FF') // Neon Magenta
      .text("Accommodation:", accomX, accomY);

    // Checkbox for accommodation
    idCardDoc.roundedRect(accomX, accomY + 15, 10, 10, 2)
      .strokeColor('#00FFFF') // Cyber Cyan
      .stroke();

    idCardDoc.font("Helvetica")
      .fontSize(9)
      .fillColor('#FFFFFF')
      .text("Required", accomX + 15, accomY + 15.5);

    // ===== OUTER BORDER (CLIPPED) =====
    drawClippedCard(idCardDoc, idCardX, idCardY, idCardWidth, idCardHeight, 15);
    idCardDoc.lineWidth(2)
      .strokeColor('#00FFFF')
      .stroke();
    idCardDoc.restore();

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
    rulesDoc.font("Helvetica-Bold").fontSize(20).text("COGNIZANCE 2026", 50, 50);
    rulesDoc.moveDown(2);

    // Important Instructions for Participants
    rulesDoc.font("Helvetica-Bold").fontSize(16).text("Important Instructions for Participants");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("All participants must adhere to the following instructions to ensure a smooth registration and participation process in Cognizance 2026:");
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
    rulesDoc.text("• ID Card: Carry a printed Cognizance 2026 ID Card with your photograph affixed at the designated space. This ID Card is provisional and will be verified and authorized by the Cognizance Organizing Committee at the Control Desk.");
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
    rulesDoc.font("Helvetica-Bold").fontSize(16).text("Rules and Guidelines for Participants - Cognizance 2026");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("Participants must adhere to the following rules and guidelines during Cognizance 2026. Any violation may result in disqualification, removal from the venue, or further disciplinary action at the discretion of the organizing committee.");
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
    rulesDoc.font("Helvetica-Bold").fontSize(12).text("2.1 A valid government-issued ID and the official Cognizance 2026 Provisional ID Card must be presented upon request by the organizing committee, security personnel, or administrative authorities.");
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
    rulesDoc.font("Helvetica").fontSize(12).text("8.2 Participation in Cognizance 2026 implies acceptance of these rules and guidelines.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("8.3 Selection for participation in Cognizance 2026 is based on the information provided by the participant. During physical verification, if any mismatch is found, the organizing committee reserves the right to cancel the selection with immediate effect. In such cases, no reimbursement will be offered.");
    rulesDoc.moveDown(0.5);
    rulesDoc.font("Helvetica").fontSize(12).text("8.4 The organizing committee reserves the right to change selection decisions, modify schedules, or alter event plans at any time. The decision of the committee shall be considered final and binding.");
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
    rulesDoc.font("Helvetica").text("The Cognizance 2026 organizing committee reserves the right to modify or update these rules at any time without prior notice. Participants are expected to stay informed about any changes through official channels.");
    rulesDoc.moveDown(1);

    // Page 3: NO OBJECTION CERTIFICATE (NOC)
    rulesDoc.addPage();
    rulesDoc.font("Helvetica-Bold").fontSize(20).text("NO OBJECTION CERTIFICATE (NOC)", 50, 50, { align: "center" });
    rulesDoc.font("Helvetica-Oblique").fontSize(10).text("(To be printed, filled, and signed by the participant)", 50, 80, { align: "center" });
    rulesDoc.moveTo(50, 100).lineTo(545, 100).stroke();

    rulesDoc.font("Helvetica").fontSize(12).text("To Whom It May Concern,", 50, 120);
    rulesDoc.moveDown(1.5);

    rulesDoc.font("Helvetica").fontSize(12).text("I, ___________________________ (Participant's Full Name), son/daughter of", 50, 150);
    rulesDoc.moveDown(1);
    rulesDoc.text("___________________________ (Parent/Guardian's Full Name), residing at", 50, 175);
    rulesDoc.moveDown(1);
    rulesDoc.text("___________________________ (Full Address), hereby declare that I have no objection to participating in Cognizance 2026, organized at the Indian Institute of Technology Roorkee (IIT Roorkee) from March 13-15, 2026.", 50, 200);
    rulesDoc.moveDown(2);

    rulesDoc.font("Helvetica-Bold").fontSize(12).text("I understand and acknowledge that:", 50, 270);
    rulesDoc.moveDown(1);

    rulesDoc.font("Helvetica").fontSize(12).text("1. My participation in the event is voluntary, and I shall abide by all rules, regulations, and", 50, 290);
    rulesDoc.text(" guidelines set forth by the organizing committee.", 50, 305);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("2. The organizers of Cognizance 2026, IIT Roorkee, and associated authorities shall not be held liable for any injuries, losses, or damages incurred during the event.", 50, 330);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("3. I am solely responsible for my personal belongings and conduct throughout the event.", 50, 370);
    rulesDoc.moveDown(1.5);

    rulesDoc.text("4. I have informed my parents/guardians about my participation, and they have no objection to the same.", 50, 395);
    rulesDoc.moveDown(2);

    rulesDoc.font("Helvetica-Bold").fontSize(12).text("I confirm that I have read and understood all terms and conditions associated with my participation in", 50, 450);
    rulesDoc.moveDown(0.8);
    rulesDoc.text("Cognizance 2026. I further affirm that this NOC is signed by me in full consent and without any external pressure.", 50, 480);
    rulesDoc.moveDown(2);

    rulesDoc.moveTo(50, 510).lineTo(545, 510).stroke();
    rulesDoc.font("Helvetica-Oblique").fontSize(10).text("Signature of the Participant", 50, 530);
    rulesDoc.font("Helvetica").fontSize(10).text("Date: .../03/2026", 50, 545);

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
      subject: "Your Cognizance 2026 Ticket & Event Guidelines",
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
          <div style="background-color: #d32f2f; color: white; padding: 20px; text-align: center; font-weight: bold; font-size: 22px; letter-spacing: 1px;">
            THIS IS THE FINAL ID CARD
          </div>
          
          <div style="padding: 30px; background-color: #ffffff;">
            <p style="font-size: 20px; color: #000; margin-bottom: 20px;">Dear <strong>${name}</strong>,</p>
            <p style="font-size: 18px; color: #444;">Greetings from <strong>Cognizance 2026!</strong></p>
            
            <div style="background-color: #e3f2fd; padding: 20px; border-left: 6px solid #0066CC; margin: 25px 0; border-radius: 4px;">
              <p style="font-size: 20px; margin: 0; color: #01579b;"><strong>Your UniqueId: <span style="color: #d32f2f;">${uniqueId}</span></strong></p>
            </div>

            <p style="font-size: 18px;">Your official <strong>Entry Ticket</strong> and <strong>Event Guidelines</strong> (including the NOC) are attached to this email. Please print them and carry them to the venue for a seamless check-in.</p>

            <div style="border: 3px solid #FF00FF; border-radius: 20px; padding: 30px; text-align: center; margin: 40px 0; background-color: #fff0ff;">
              <img src="cid:glamfestLogo" style="width: 220px; margin-bottom: 20px;" />
              <h2 style="color: #FF00FF; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Pronite Entry Notice</h2>
              <div style="width: 50px; hieght: 4px; background-color: #FF00FF; margin: 15px auto;"></div>
              <p style="font-size: 18px; font-weight: bold; color: #000; margin: 15px 0;">Scanning the Myntra QR code is <span style="color: #d32f2f;">COMPULSORY</span> for Pronite entry.</p>
              <p style="font-size: 15px; color: #555; margin-bottom: 25px;">Please scan this QR using a phone that has the <strong>Myntra App</strong> installed.</p>
              
              <div style="margin: 25px 0; display: inline-block; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 10px;">
                <img src="cid:myntraQR" style="width: 180px; display: block;" />
              </div>

              <div style="margin-top: 25px;">
                <a href="https://myntra.onelink.me/dNYC/psb0vkzt" style="display: inline-block; background-color: #FF00FF; color: white; padding: 15px 35px; text-decoration: none; font-weight: bold; border-radius: 50px; font-size: 18px; box-shadow: 0 4px 10px rgba(255, 0, 255, 0.3);">Register Now →</a>
              </div>
            </div>

            <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 25px;">
              <h3 style="font-size: 20px; color: #0066CC; margin-top: 0;">Essential Instructions:</h3>
              <ul style="font-size: 17px; color: #444; padding-left: 20px;">
                <li style="margin-bottom: 10px;">🪪 Carry a <strong>valid ID proof</strong> along with the printed documents.</li>
                <li style="margin-bottom: 10px;">📜 Adhere to all rules in the <strong>Guidelines & NOC</strong> document.</li>
                <li style="margin-bottom: 10px;">⏰ Report to the venue on time to avoid entry delays.</li>
                <li style="margin-bottom: 10px;">💬 Join the official WhatsApp channel: <a href="https://whatsapp.com/channel/0029Vb7i7uH2Jl8IwRvoxH25" style="color: #0066CC; text-decoration: none; font-weight: bold;">Click to Join</a></li>
              </ul>
            </div>

            <p style="font-size: 18px; margin-top: 35px; border-top: 1px solid #eee; padding-top: 25px;">We look forward to seeing you at <strong>Cognizance 2026!</strong></p>
            
            <div style="margin-top: 30px;">
              <p style="margin: 0; font-weight: bold; font-size: 18px; color: #0066CC;">Best Regards,</p>
              <p style="margin: 5px 0; font-size: 18px; color: #333;">Team Cognizance 2026</p>
              <p style="margin: 0; font-size: 15px; color: #777;">Indian Institute of Technology Roorkee</p>
            </div>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 13px; color: #999;">
            © 2026 Cognizance, IIT Roorkee. All rights reserved.
          </div>
        </div>
      `,
      attachments: [
        {
          filename: "Cognizance_2026_ID_Card.pdf",
          path: idCardPath,
          contentType: "application/pdf",
        },
        {
          filename: "Cognizance_2026_Rules_Guidelines.pdf",
          path: rulesPath,
          contentType: "application/pdf",
        },
        {
          filename: "glamfest_logo.png",
          path: "./src/WHITE_Glamfest Logo.png",
          cid: "glamfestLogo"
        },
        {
          filename: "myntra_qr.jpeg",
          path: "./src/QR CODE - Registrations.jpeg",
          cid: "myntraQR"
        }
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