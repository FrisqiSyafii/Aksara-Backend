
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

// ========================================
// ROLE YANG DIIZINKAN
// ========================================

const ALLOWED_ROLES = [
  "admin",
  "guru",
  "kepala_sekolah",
];

// ========================================
// LOGIN
// ========================================

const login = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    // Validasi input
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi.",
      });
    }

    // Ambil pengguna berdasarkan username
    const [users] = await pool.execute(
      `
      SELECT
        id,
        username,
        password,
        nama,
        role
      FROM users
      WHERE username = ?
      LIMIT 1
      `,
      [username.trim()]
    );

    // Username tidak ditemukan
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah.",
      });
    }

    const user = users[0];

    // Periksa password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah.",
      });
    }

    // Validasi role
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Role pengguna tidak memiliki akses.",
      });
    }

    // Pastikan JWT_SECRET tersedia
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET belum dikonfigurasi.");
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        nama: user.nama,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    // Respons login berhasil
    return res.status(200).json({
      success: true,
      message: "Login berhasil.",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nama: user.nama,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

module.exports = {
  login,
};
