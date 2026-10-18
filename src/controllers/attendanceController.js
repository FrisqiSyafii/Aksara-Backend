const pool = require("../config/database");

const {
  getCurrentDateTime,
  getAttendanceStatus,
} = require("../utils/attendanceTime");

const ALLOWED_STATUSES = ["hadir", "terlambat", "izin", "sakit", "alpa"];

const isValidId = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;

// ========================================
// GET SEMUA ABSENSI HARIAN
// ========================================

const getAttendances = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        a.id,
        a.student_id,
        s.nis,
        s.nama AS nama_siswa,
        s.qr_code,
        c.nama_kelas,

        DATE_FORMAT(
          a.tanggal, '%Y-%m-%d'
        ) AS tanggal,

        TIME_FORMAT(
          a.jam, '%H:%i:%s'
        ) AS jam,

        a.status,
        a.keterangan,

        a.scanned_by,
        scanner.nama AS scanned_by_nama,

        a.updated_by,
        updater.nama AS updated_by_nama,

        a.created_at,
        a.updated_at

      FROM attendance a

      INNER JOIN students s
        ON a.student_id = s.id

      INNER JOIN classes c
        ON s.kelas_id = c.id

      LEFT JOIN users scanner
        ON a.scanned_by = scanner.id

      LEFT JOIN users updater
        ON a.updated_by = updater.id

      WHERE a.subject_id IS NULL

      ORDER BY
        a.tanggal DESC,
        a.jam DESC,
        a.id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Data absensi berhasil diambil.",
      data: rows,
    });
  } catch (error) {
    console.error("Get attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data absensi.",
    });
  }
};

// ========================================
// GET ABSENSI BERDASARKAN ID
// ========================================

const getAttendanceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID absensi tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        a.id,
        a.student_id,
        s.nis,
        s.nama AS nama_siswa,
        s.qr_code,
        c.nama_kelas,

        DATE_FORMAT(
          a.tanggal, '%Y-%m-%d'
        ) AS tanggal,

        TIME_FORMAT(
          a.jam, '%H:%i:%s'
        ) AS jam,

        a.status,
        a.keterangan,
        a.scanned_by,
        a.updated_by,
        a.created_at,
        a.updated_at

      FROM attendance a

      INNER JOIN students s
        ON a.student_id = s.id

      INNER JOIN classes c
        ON s.kelas_id = c.id

      WHERE a.id = ?
        AND a.subject_id IS NULL

      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Absensi tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get attendance by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

// ========================================
// POST ABSENSI SCAN QR OTOMATIS
// ========================================

const createAttendance = async (req, res) => {
  try {
    const { student_id } = req.body;

    if (!isValidId(student_id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    // Ambil pengaturan sekolah

    const [settings] = await pool.execute(`
      SELECT
        id,
        jam_masuk,
        batas_terlambat
      FROM settings
      ORDER BY id ASC
      LIMIT 1
    `);

    if (settings.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Pengaturan sekolah belum tersedia.",
      });
    }

    const setting = settings[0];

    // Gunakan waktu server, bukan browser

    const { tanggal, jam } = getCurrentDateTime();

    const status = getAttendanceStatus(
      jam,
      setting.jam_masuk,
      setting.batas_terlambat
    );

    // Periksa siswa

    const [students] = await pool.execute(
      `
      SELECT id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [student_id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Siswa tidak ditemukan.",
      });
    }

    // Cegah absensi gerbang ganda

    const [existing] = await pool.execute(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ?
        AND tanggal = ?
        AND subject_id IS NULL
      LIMIT 1
      `,
      [student_id, tanggal]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Siswa sudah melakukan absensi hari ini.",
      });
    }

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
      VALUES (?, NULL, ?, ?, ?, NULL, ?)
      `,
      [student_id, tanggal, jam, status, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: "Absensi berhasil disimpan.",
      data: {
        id: result.insertId,
        student_id,
        tanggal,
        jam,
        status,
      },
    });
  } catch (error) {
    console.error("Create attendance error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Absensi siswa sudah tercatat.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan absensi.",
    });
  }
};

// ========================================
// POST ABSENSI MANUAL
// UNTUK IZIN, SAKIT, ATAU ALPA
// ========================================

const createManualAttendance = async (req, res) => {
  try {
    const { student_id, tanggal, status, keterangan } = req.body;

    if (
      !isValidId(student_id) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal || "")) ||
      !ALLOWED_STATUSES.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Data absensi tidak valid.",
      });
    }

    const [students] = await pool.execute(
      `
      SELECT id
      FROM students
      WHERE id = ?
      LIMIT 1
      `,
      [student_id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Siswa tidak ditemukan.",
      });
    }

    const [existing] = await pool.execute(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ?
        AND tanggal = ?
        AND subject_id IS NULL
      LIMIT 1
      `,
      [student_id, tanggal]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Absensi harian sudah tercatat.",
      });
    }

    const { jam } = getCurrentDateTime();

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
      VALUES (?, NULL, ?, ?, ?, ?, ?)
      `,
      [student_id, tanggal, jam, status, keterangan || null, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: "Absensi manual berhasil.",
      data: {
        id: result.insertId,
      },
    });
  } catch (error) {
    console.error("Manual attendance error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Absensi sudah tercatat.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan absensi.",
    });
  }
};

// ========================================
// PUT UPDATE ABSENSI HARIAN
// ========================================

const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, keterangan } = req.body;

    if (!isValidId(id) || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Data absensi tidak valid.",
      });
    }

    const [result] = await pool.execute(
      `
      UPDATE attendance
      SET
        status = ?,
        keterangan = ?,
        updated_by = ?
      WHERE id = ?
        AND subject_id IS NULL
      `,
      [status, keterangan === undefined ? null : keterangan, req.user.id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Absensi tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Absensi berhasil diperbarui.",
    });
  } catch (error) {
    console.error("Update attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui absensi.",
    });
  }
};

// ========================================
// DELETE ABSENSI HARIAN
// ========================================

const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID tidak valid.",
      });
    }

    const [result] = await pool.execute(
      `
      DELETE FROM attendance
      WHERE id = ?
        AND subject_id IS NULL
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Absensi tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Absensi berhasil dihapus.",
    });
  } catch (error) {
    console.error("Delete attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus absensi.",
    });
  }
};

// ========================================
// GET DAFTAR ABSENSI HARIAN SEMUA SISWA
// ========================================

const getDailyAttendances = async (req, res) => {
  try {
    const today = getCurrentDateTime().tanggal;
    const tanggal = req.query.date || today;

    if (
      typeof tanggal !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ||
      Number.isNaN(Date.parse(`${tanggal}T00:00:00Z`)) ||
      new Date(`${tanggal}T00:00:00Z`)
        .toISOString()
        .slice(0, 10) !== tanggal
    ) {
      return res.status(400).json({
        success: false,
        message: "Format tanggal tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        a.id,
        s.id AS student_id,
        s.nis,
        s.nama AS nama_siswa,
        s.qr_code,
        c.nama_kelas,

        ? AS tanggal,

        TIME_FORMAT(a.jam, '%H:%i:%s') AS jam,

        COALESCE(a.status, 'belum_scan') AS status,

        a.keterangan,
        a.scanned_by,
        a.updated_by,
        a.created_at,
        a.updated_at

      FROM students s

      INNER JOIN classes c
        ON s.kelas_id = c.id

      LEFT JOIN attendance a
        ON a.student_id = s.id
        AND a.tanggal = ?
        AND a.subject_id IS NULL

      ORDER BY
        c.nama_kelas ASC,
        s.nama ASC
      `,
      [tanggal, tanggal]
    );

    return res.status(200).json({
      success: true,
      message: "Data absensi harian berhasil diambil.",
      data: rows,
    });
  } catch (error) {
    console.error("Get daily attendances error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data absensi harian.",
    });
  }
};

module.exports = {
  getAttendances,
  getDailyAttendances,
  getAttendanceById,
  createAttendance,
  createManualAttendance,
  updateAttendance,
  deleteAttendance,
};
