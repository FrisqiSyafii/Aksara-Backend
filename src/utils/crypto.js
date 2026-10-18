const crypto = require("crypto");


// ========================================
// KONFIGURASI ENKRIPSI
// ========================================

// Ambil dari .env
// contoh:
// FACE_ENCRYPTION_KEY=12345678901234567890123456789012

const SECRET_KEY =
  process.env.FACE_ENCRYPTION_KEY ||
  "12345678901234567890123456789012";


// AES-256 membutuhkan key 32 byte
const KEY = crypto
  .createHash("sha256")
  .update(SECRET_KEY)
  .digest();

const IV_LENGTH = 16;



// ========================================
// ENCRYPT EMBEDDING
// ========================================

const encryptEmbedding = (embedding) => {

  if (!Array.isArray(embedding)) {
    throw new Error(
      "Embedding harus berupa array."
    );
  }


  const iv = crypto.randomBytes(
    IV_LENGTH
  );


  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    KEY,
    iv
  );


  const data = JSON.stringify(
    embedding
  );


  let encrypted =
    cipher.update(
      data,
      "utf8",
      "base64"
    );


  encrypted += cipher.final(
    "base64"
  );


  return (
    iv.toString("base64") +
    ":" +
    encrypted
  );

};





// ========================================
// DECRYPT EMBEDDING
// ========================================

const decryptEmbedding = (encryptedData) => {

  if (!encryptedData) {
    throw new Error(
      "Data encrypted kosong."
    );
  }


  const parts =
    encryptedData.toString().split(":");


  if (parts.length !== 2) {

    throw new Error(
      "Format encrypted embedding tidak valid."
    );

  }


  const iv = Buffer.from(
    parts[0],
    "base64"
  );


  const encryptedText =
    parts[1];



  const decipher =
    crypto.createDecipheriv(
      "aes-256-cbc",
      KEY,
      iv
    );



  let decrypted =
    decipher.update(
      encryptedText,
      "base64",
      "utf8"
    );


  decrypted += decipher.final(
    "utf8"
  );



  return JSON.parse(
    decrypted
  );

};





// ========================================
// EXPORT
// ========================================

module.exports = {

  encryptEmbedding,

  decryptEmbedding,

};