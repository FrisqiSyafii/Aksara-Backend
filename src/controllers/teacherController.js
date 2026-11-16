const bcrypt = require("bcryptjs");
const pool = require("../config/database");

// ========================================
// UTILITAS VALIDASI
// ========================================

const validId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

const validUsername = (username) => {
  if (typeof username !== "string") {
    return false;
  }

  const cleanUsername = username.trim();

  return (
    cleanUsername.length >= 6 &&
    cleanUsername.length <= 100 &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cleanUsername)
  );
};

const validPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  Buffer.byteLength(value, "utf8") <= 72;

// Role yang boleh dikelola pada halaman Data Guru.
// Role admin tidak boleh diubah melalui controller ini.
const ALLOWED_ROLES = ["guru", "kepala_sekolah"];

const validRole = (role) =>
  typeof role === "string" && ALLOWED_ROLES.includes(role);

const teacherFields = `
  id,
  nama,
  username,
  role,
  created_at,
  updated_at
`;

// ========================================
// GET SEMUA GURU DAN KEPALA SEKOLAH
// ========================================

const getTeachers = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ${teacherFields}
      FROM users
      WHERE role IN ('guru', 'kepala_sekolah')
      ORDER BY nama ASC
    `);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get teachers:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data guru.",
    });
  }
};

// ========================================
// GET GURU BERDASARKAN ID
// ========================================

const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID guru tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        ${teacherFields}
      FROM users
      WHERE id = ?
        AND role IN ('guru', 'kepala_sekolah')
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Akun guru atau kepala sekolah tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get teacher:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data guru.",
    });
  }
};

// ========================================
// POST TAMBAH GURU
// ========================================

const createTeacher = async (req, res) => {
  try {
    const { nama, username, password } = req.body;

    const cleanName = typeof nama === "string" ? nama.trim() : "";

    const cleanUsername =
      typeof username === "string" ? username.trim().toLowerCase() : "";

    // Saat menambahkan akun baru,
    // role otomatis menjadi guru.
    const role = "guru";

    // Validasi nama
    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Nama guru wajib diisi dan maksimal 100 karakter.",
      });
    }

    // Validasi username
    if (!validUsername(cleanUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username harus menggunakan format email yang valid, " +
          "contoh: teguhs@alkirom.my.id.",
      });
    }

    // Validasi password
    if (!validPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password harus minimal 8 karakter dan maksimal 72 byte.",
      });
    }

    // Periksa username duplikat
    const [existingUsername] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE username = ?
      LIMIT 1
      `,
      [cleanUsername]
    );

    if (existingUsername.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan oleh akun lain.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Simpan akun Guru
    const [result] = await pool.execute(
      `
      INSERT INTO users
        (nama, username, password, role)
      VALUES
        (?, ?, ?, ?)
      `,
      [cleanName, cleanUsername, hashedPassword, role]
    );

    return res.status(201).json({
      success: true,
      message: "Guru berhasil ditambahkan.",
      data: {
        id: result.insertId,
        nama: cleanName,
        username: cleanUsername,
        role,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan.",
      });
    }

    console.error("Create teacher:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menambahkan guru.",
    });
  }
};

// ========================================
// PUT EDIT GURU DAN HAK AKSES
// ========================================

const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, username, password, role } = req.body;

    const cleanName = typeof nama === "string" ? nama.trim() : "";

    const cleanUsername =
      typeof username === "string" ? username.trim().toLowerCase() : "";

    const cleanRole = typeof role === "string" ? role.trim() : "";

    // ========================================
    // VALIDASI ID
    // ========================================

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID akun tidak valid.",
      });
    }

    // ========================================
    // VALIDASI NAMA
    // ========================================

    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Nama wajib diisi dan maksimal 100 karakter.",
      });
    }

    // ========================================
    // VALIDASI USERNAME
    // ========================================

    if (!validUsername(cleanUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username harus menggunakan format email yang valid, " +
          "contoh: teguhs@alkirom.my.id.",
      });
    }

    // ========================================
    // VALIDASI HAK AKSES
    // ========================================

    if (!validRole(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: "Hak akses hanya boleh Guru atau Kepala Sekolah.",
      });
    }

    // ========================================
    // VALIDASI PASSWORD
    // ========================================

    // Jika kosong, password lama tidak diubah.
    const changePassword = password !== undefined && password !== "";

    if (changePassword && !validPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password baru harus minimal 8 karakter " + "dan maksimal 72 byte.",
      });
    }

    // ========================================
    // CEK AKUN YANG AKAN DIEDIT
    // ========================================

    const [existing] = await pool.execute(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
        AND role IN ('guru', 'kepala_sekolah')
      LIMIT 1
      `,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Akun Guru atau Kepala Sekolah tidak ditemukan.",
      });
    }

    // ========================================
    // CEK USERNAME DUPLIKAT
    // ========================================

    const [duplicateUsername] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE username = ?
        AND id <> ?
      LIMIT 1
      `,
      [cleanUsername, id]
    );

    if (duplicateUsername.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan oleh akun lain.",
      });
    }

    // ========================================
    // UPDATE DATA AKUN
    // ========================================

    if (changePassword) {
      // Edit nama, username, password dan role
      const hashedPassword = await bcrypt.hash(password, 12);

      const [result] = await pool.execute(
        `
        UPDATE users
        SET
          nama = ?,
          username = ?,
          password = ?,
          role = ?
        WHERE id = ?
          AND role IN ('guru', 'kepala_sekolah')
        `,
        [cleanName, cleanUsername, hashedPassword, cleanRole, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Akun tidak ditemukan.",
        });
      }
    } else {
      // Edit nama, username, dan role
      // tanpa mengubah password lama
      const [result] = await pool.execute(
        `
        UPDATE users
        SET
          nama = ?,
          username = ?,
          role = ?
        WHERE id = ?
          AND role IN ('guru', 'kepala_sekolah')
        `,
        [cleanName, cleanUsername, cleanRole, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Akun tidak ditemukan.",
        });
      }
    }

    // ========================================
    // RESPONSE BERHASIL
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Data akun dan hak akses berhasil diperbarui.",
      data: {
        id: Number(id),
        nama: cleanName,
        username: cleanUsername,
        role: cleanRole,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan.",
      });
    }

    console.error("Update teacher:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui data dan hak akses akun.",
    });
  }
};

// ========================================
// DELETE GURU
// ========================================

const deleteTeacher = async (req, res) => {
  let connection;

  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID akun tidak valid.",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Pastikan hanya Guru atau Kepala Sekolah.
    // Akun Admin tidak boleh dihapus melalui fitur ini.
    const [teachers] = await connection.execute(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
        AND role IN ('guru', 'kepala_sekolah')
      FOR UPDATE
      `,
      [id]
    );

    if (!teachers.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Akun Guru atau Kepala Sekolah tidak ditemukan.",
      });
    }

    // Jangan hapus akun yang sudah memiliki penugasan
    const [assignments] = await connection.execute(
      `
      SELECT id
      FROM teacher_subjects
      WHERE teacher_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (assignments.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Akun masih memiliki pembagian tugas " + "dan tidak dapat dihapus.",
      });
    }

    // Lindungi riwayat absensi mata pelajaran
    const [attendance] = await connection.execute(
      `
      SELECT id
      FROM subject_attendance
      WHERE checked_by = ?
      LIMIT 1
      `,
      [id]
    );

    if (attendance.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Akun memiliki riwayat pemeriksaan absensi " +
          "dan tidak dapat dihapus.",
      });
    }

    // Lindungi riwayat scan dan koreksi
    const [dailyAttendance] = await connection.execute(
      `
      SELECT id
      FROM attendance
      WHERE scanned_by = ?
         OR updated_by = ?
      LIMIT 1
      `,
      [id, id]
    );

    if (dailyAttendance.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Akun memiliki riwayat absensi harian " + "dan tidak dapat dihapus.",
      });
    }

    // Hapus akun
    const [result] = await connection.execute(
      `
      DELETE FROM users
      WHERE id = ?
        AND role IN ('guru', 'kepala_sekolah')
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Akun tidak ditemukan.",
      });
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Akun berhasil dihapus.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Delete teacher:", error);

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        success: false,
        message:
          "Akun masih digunakan oleh data lain " + "dan tidak dapat dihapus.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus akun.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ========================================
// EXPORT CONTROLLER
// ========================================

module.exports = {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
};
