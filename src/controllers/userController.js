const bcrypt = require("bcryptjs");
const pool = require("../config/database");

// GET semua user
const getUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT
        id,
        username,
        nama,
        role,
        created_at,
        updated_at
      FROM users
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Data user berhasil diambil.",
      data: users,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// GET user berdasarkan ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await pool.execute(
      `
      SELECT
        id,
        username,
        nama,
        role,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Data user berhasil diambil.",
      data: users[0],
    });
  } catch (error) {
    console.error("Get user by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// POST membuat user baru
const createUser = async (req, res) => {
  try {
    const { username, password, nama, role } = req.body;

    if (!username || !password || !nama || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, password, nama, dan role wajib diisi.",
      });
    }

    const allowedRoles = ["admin", "guru", "yayasan"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role harus admin, guru, atau yayasan.",
      });
    }

    const [existingUsers] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE username = ?
      LIMIT 1
      `,
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `
      INSERT INTO users
      (username, password, nama, role)
      VALUES (?, ?, ?, ?)
      `,
      [username, hashedPassword, nama, role]
    );

    return res.status(201).json({
      success: true,
      message: "User berhasil dibuat.",
      data: {
        id: result.insertId,
        username,
        nama,
        role,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// PUT mengubah user
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { username, password, nama, role } = req.body;

    if (!username || !nama || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, nama, dan role wajib diisi.",
      });
    }

    const allowedRoles = ["admin", "guru", "yayasan"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role harus admin, guru, atau yayasan.",
      });
    }

    const [users] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    const [usernameUsers] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE username = ?
      AND id != ?
      LIMIT 1
      `,
      [username, id]
    );

    if (usernameUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan.",
      });
    }

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);

      await pool.execute(
        `
        UPDATE users
        SET
          username = ?,
          password = ?,
          nama = ?,
          role = ?
        WHERE id = ?
        `,
        [username, hashedPassword, nama, role, id]
      );
    } else {
      await pool.execute(
        `
        UPDATE users
        SET
          username = ?,
          nama = ?,
          role = ?
        WHERE id = ?
        `,
        [username, nama, role, id]
      );
    }

    return res.status(200).json({
      success: true,
      message: "User berhasil diperbarui.",
    });
  } catch (error) {
    console.error("Update user error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// DELETE user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Anda tidak dapat menghapus akun yang sedang digunakan.",
      });
    }

    const [users] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    await pool.execute(
      `
      DELETE FROM users
      WHERE id = ?
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "User berhasil dihapus.",
    });
  } catch (error) {
    console.error("Delete user error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

// ========================================
// UPDATE PROFILE
// ========================================


const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, username, password } = req.body;

    // ========================================
    // VALIDASI AKUN LOGIN
    // ========================================

    if (
      !/^[1-9]\d*$/.test(String(id)) ||
      !Number.isSafeInteger(Number(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid.",
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak valid. Silakan login kembali.",
      });
    }

    // Setiap pengguna hanya dapat mengubah profil sendiri.
    if (Number(req.user.id) !== Number(id)) {
      return res.status(403).json({
        success: false,
        message: "Anda hanya dapat mengubah profil sendiri.",
      });
    }

    // ========================================
    // VALIDASI NAMA DAN USERNAME
    // ========================================

    const cleanName =
      typeof nama === "string" ? nama.trim() : "";

    const cleanUsername =
      typeof username === "string"
        ? username.trim().toLowerCase()
        : "";

    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Nama wajib diisi dan maksimal 100 karakter.",
      });
    }

    const emailRegex =
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    if (
      cleanUsername.length < 6 ||
      cleanUsername.length > 100 ||
      !emailRegex.test(cleanUsername)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Username harus menggunakan format email yang valid, " +
          "contoh: teguhs@alkirom.my.id.",
      });
    }

    // ========================================
    // VALIDASI PASSWORD
    // ========================================

    // Null atau string kosong berarti password tidak diubah.
    const changePassword =
      password !== undefined &&
      password !== null &&
      password !== "";

    if (changePassword) {
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password baru minimal 8 karakter dan maksimal 72 byte.",
        });
      }
    }

    // ========================================
    // CEK AKUN DAN ROLE TERKINI
    // ========================================

    const [users] = await pool.execute(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Akun pengguna tidak ditemukan.",
      });
    }

    // Hak akses tidak boleh diubah melalui Edit Profil.
    const allowedRoles = [
      "admin",
      "guru",
      "kepala_sekolah",
    ];

    if (!allowedRoles.includes(users[0].role)) {
      return res.status(403).json({
        success: false,
        message: "Hak akses akun tidak diizinkan.",
      });
    }

    // ========================================
    // CEK USERNAME DUPLIKAT
    // ========================================

    const [duplicates] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE username = ?
        AND id <> ?
      LIMIT 1
      `,
      [cleanUsername, id]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan akun lain.",
      });
    }

    // ========================================
    // SIMPAN PERUBAHAN
    // ========================================

    if (changePassword) {
      const hashedPassword = await bcrypt.hash(
        password,
        12
      );

      await pool.execute(
        `
        UPDATE users
        SET nama = ?, username = ?, password = ?
        WHERE id = ?
        `,
        [
          cleanName,
          cleanUsername,
          hashedPassword,
          id,
        ]
      );
    } else {
      await pool.execute(
        `
        UPDATE users
        SET nama = ?, username = ?
        WHERE id = ?
        `,
        [cleanName, cleanUsername, id]
      );
    }

    return res.status(200).json({
      success: true,
      message: "Profil berhasil diperbarui.",
      data: {
        id: Number(id),
        nama: cleanName,
        username: cleanUsername,
        role: users[0].role,
      },
    });

  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan.",
      });
    }

    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui profil.",
    });
  }
};


// ========================================
// GET DATA GURU
// ========================================

const getTeachers = async (req, res) => {
  try {
    const [teachers] = await pool.execute(`
        SELECT
          id,
          username,
          nama,
          role,
          created_at
        FROM users
        WHERE role='guru'
        ORDER BY id DESC
      `);

    res.json({
      success: true,

      data: teachers,
    });
  } catch (error) {
    console.error("Get teachers error:", error);

    res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateProfile,
  getTeachers,
};
