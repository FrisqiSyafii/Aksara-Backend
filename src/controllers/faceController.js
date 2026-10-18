const pool = require("../config/database");
const axios = require("axios");

const { encryptEmbedding, decryptEmbedding } = require("../utils/crypto");

const {
  getCurrentDateTime,
  getAttendanceStatus,
} = require("../utils/attendanceTime");

const validId = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;

// ========================================
// COSINE SIMILARITY
// ========================================

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];

    normA += a[i] * a[i];

    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ========================================
// GET STATUS PENDAFTARAN WAJAH
// ========================================

const getFaceStatus = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        s.id,
        s.nama,
        CASE
          WHEN fp.id IS NULL THEN 0
          ELSE 1
        END AS wajah_terdaftar,
        fp.model_version,
        fp.registered_at
      FROM students s
      LEFT JOIN student_face_profiles fp
        ON fp.student_id = s.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Siswa tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get face status:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal membaca status wajah.",
    });
  }
};

// ========================================
// DELETE PROFIL WAJAH
// ========================================

const deleteFace = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    const [students] = await pool.execute(
      `
      SELECT id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Siswa tidak ditemukan.",
      });
    }

    const [result] = await pool.execute(
      `
      DELETE FROM student_face_profiles
      WHERE student_id = ?
      `,
      [req.params.id]
    );

    return res.json({
      success: true,
      message: result.affectedRows
        ? "Profil wajah berhasil dihapus."
        : "Tidak ada profil wajah yang perlu dihapus.",
      data: {
        wajah_terdaftar: false,
      },
    });
  } catch (error) {
    console.error("Delete face:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus profil wajah.",
    });
  }
};

// ========================================
// POST PENDAFTARAN WAJAH
// BELUM TERHUBUNG DENGAN MODEL ML
// ========================================

const enrollFace = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Gambar wajah wajib dikirim.",
      });
    }

    // cek siswa

    const [students] = await pool.execute(
      `
        SELECT id,nama
        FROM students
        WHERE id = ?
        LIMIT 1
        `,
      [id]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Siswa tidak ditemukan.",
      });
    }

    // kirim ke FastAPI

    const response = await axios.post("http://127.0.0.1:8001/analyze", {
      image,
    });

    if (!response.data.success) {
      return res.status(400).json({
        success: false,
        message: "Wajah gagal dianalisis.",
      });
    }

    const embedding = response.data.data.embedding;

    const modelVersion = response.data.data.model_version;

    // encrypt embedding

    const encrypted = encryptEmbedding(embedding);

    // hapus jika sudah ada

    await pool.execute(
      `
      DELETE FROM student_face_profiles
      WHERE student_id = ?
      `,
      [id]
    );

    // simpan wajah baru

    await pool.execute(
      `
      INSERT INTO student_face_profiles
      (
        student_id,
        embedding_encrypted,
        model_version,
        consent_recorded_at
      )
      VALUES (?, ?, ?, NOW())
      `,
      [id, encrypted, modelVersion]
    );

    return res.json({
      success: true,

      message: "Profil wajah berhasil didaftarkan.",

      data: {
        student_id: Number(id),

        wajah_terdaftar: true,

        model_version: modelVersion,

        registered_at: new Date(),
      },
    });
  } catch (error) {
    console.error("Enroll face error:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal mendaftarkan wajah.",
    });
  }
};

// ========================================
// POST ABSENSI WAJAH
// BELUM TERHUBUNG DENGAN MODEL ML
// ========================================

// ========================================
// ABSENSI WAJAH OTOMATIS
// ========================================

const faceAttendance = async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,

        message: "Gambar wajah wajib dikirim.",
      });
    }

    // ========================================
    // 1. ANALYZE WAJAH DARI FASTAPI
    // ========================================

    const faceResponse = await axios.post(
      "http://127.0.0.1:8001/analyze",

      {
        image,
      }
    );

    if (!faceResponse.data.success) {
      return res.status(400).json({
        success: false,

        message: "Wajah tidak terdeteksi.",
      });
    }

    const inputEmbedding = faceResponse.data.data.embedding;

    // ========================================
    // 2. AMBIL SEMUA PROFIL WAJAH SISWA
    // ========================================

    const [profiles] = await pool.execute(
      `
SELECT

fp.student_id,

fp.embedding_encrypted,

s.nis,

s.nama,

s.kelas_id,

c.nama_kelas

FROM student_face_profiles fp


INNER JOIN students s

ON fp.student_id = s.id


INNER JOIN classes c

ON s.kelas_id = c.id

`
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,

        message: "Belum ada data wajah siswa.",
      });
    }

    // ========================================
    // 3. CARI SIMILARITY TERTINGGI
    // ========================================

    let bestMatch = null;

    let highestScore = 0;

    for (const profile of profiles) {
      const storedEmbedding = decryptEmbedding(profile.embedding_encrypted);

      const score = cosineSimilarity(
        inputEmbedding,

        storedEmbedding
      );

      if (score > highestScore) {
        highestScore = score;

        bestMatch = profile;
      }
    }

    // ========================================
    // THRESHOLD
    // ========================================

    const threshold = 0.45;

    if (!bestMatch || highestScore < threshold) {
      return res.status(401).json({
        success: false,

        message: "Wajah tidak dikenali.",

        data: {
          similarity: Number(highestScore.toFixed(4)),
        },
      });
    }

    // ========================================
    // 4. CEK DUPLIKAT ABSEN
    // ========================================

    const { tanggal, jam } = getCurrentDateTime();

    const [existing] = await pool.execute(
      `
SELECT id

FROM attendance

WHERE student_id = ?

AND tanggal = ?

AND subject_id IS NULL

LIMIT 1

`,

      [bestMatch.student_id, tanggal]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,

        message: "Siswa sudah melakukan absensi hari ini.",

        data: {
          student: bestMatch,
          similarity: Number(highestScore.toFixed(4)),
        },
      });
    }

    // ========================================
    // 5. STATUS HADIR / TERLAMBAT
    // ========================================

    const [settings] = await pool.execute(
      `
SELECT

jam_masuk,

batas_terlambat

FROM settings

ORDER BY id ASC

LIMIT 1

`
    );

    let status = "hadir";

    if (settings.length) {
      status = getAttendanceStatus(
        jam,

        settings[0].jam_masuk,

        settings[0].batas_terlambat
      );
    }

    // ========================================
    // 6. SIMPAN ABSENSI
    // ========================================

    const [result] = await pool.execute(
      `
INSERT INTO attendance

(

student_id,

subject_id,

tanggal,

jam,

status,

keterangan,

scanned_by

)

VALUES

(?,NULL,?,?,?,NULL,?)

`,

      [bestMatch.student_id, tanggal, jam, status, req.user.id]
    );

    return res.status(201).json({
      success: true,

      message: "Absensi wajah berhasil.",

      data: {
        student: {
          id: bestMatch.student_id,

          nis: bestMatch.nis,

          nama: bestMatch.nama,

          nama_kelas: bestMatch.nama_kelas,
        },

        attendance: {
          id: result.insertId,

          tanggal,

          jam,

          status,
        },

        verification: {
          similarity: Number(highestScore.toFixed(4)),

          threshold,
        },
      },
    });
  } catch (error) {
    console.error("Face attendance error:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal melakukan absensi wajah.",
    });
  }
};

module.exports = {
  getFaceStatus,
  deleteFace,
  enrollFace,
  faceAttendance,
};
