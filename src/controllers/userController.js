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

    if (!nama || !username) {
      return res.status(400).json({
        success: false,
        message: "Nama dan username wajib diisi.",
      });
    }

    let query = `
      UPDATE users
      SET
        nama = ?,
        username = ?
    `;

    let params = [nama, username];

    // jika password diganti

    if (password) {
      const bcrypt = require("bcryptjs");

      const hash = await bcrypt.hash(password, 10);

      query += `,
        password = ?
      `;

      params.push(hash);
    }

    query += `
      WHERE id = ?
    `;

    params.push(id);

    await pool.execute(query, params);

    return res.json({
      success: true,
      message: "Profil berhasil diperbarui.",
    });
  } catch (error) {
    console.error("Update profile error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
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
