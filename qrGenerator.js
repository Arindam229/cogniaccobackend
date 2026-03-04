const QRCode = require("qrcode");
const fs = require("fs");
const generateQRCode = async (text) => {
  return new Promise((resolve, reject) => {
    const filePath = `./uploads/${Date.now()}.png`; // Save QR code with timestamp
    QRCode.toFile(filePath, text, { width: 300 }, (err) => {
      if (err) reject(err);
      else resolve(filePath);
    });
  });
};

module.exports = generateQRCode;
