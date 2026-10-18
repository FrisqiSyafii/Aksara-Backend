const bcrypt = require('bcryptjs')
const pool = require('../config/database')

const validId = (value) =>
  /^[1-9]\d*$/.test(String(value)) &&
  Number.isSafeInteger(Number(value))

const validUsername = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9._-]{3,50}$/.test(value)

const validPassword = (value) =>
  typeof value === 'string' &&
  value.length >= 8 &&
  Buffer.byteLength(value, 'utf8') <= 72

const teacherFields = `
  id,
  nama,
  username,
  role,
  created_at,
  updated_at
`

// ========================================
// GET SEMUA GURU
// ========================================

const getTeachers = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ${teacherFields}
      FROM users
      WHERE role = 'guru'
      ORDER BY nama ASC
    `)

    return res.status(200).json({
      success: true,
      data: rows,
    })
  } catch (error) {
    console.error('Get teachers:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data guru.',
    })
  }
}

// ========================================
// GET GURU BERDASARKAN ID
// ========================================

const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID guru tidak valid.',
      })
    }

    const [rows] = await pool.execute(
      `
      SELECT ${teacherFields}
      FROM users
      WHERE id = ? AND role = 'guru'
      LIMIT 1
      `,
      [id]
    )

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Guru tidak ditemukan.',
      })
    }

    return res.json({
      success: true,
      data: rows[0],
    })
  } catch (error) {
    console.error('Get teacher:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data guru.',
    })
  }
}

// ========================================
// POST TAMBAH GURU
// ========================================

const createTeacher = async (req, res) => {
  try {
    const { nama, username, password } = req.body

    const cleanName =
      typeof nama === 'string' ? nama.trim() : ''

    const cleanUsername =
      typeof username === 'string'
        ? username.trim()
        : ''

    if (
      !cleanName ||
      cleanName.length > 100 ||
      !validUsername(cleanUsername) ||
      !validPassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Nama wajib diisi (maksimal 100 karakter), ' +
          'username 3–50 karakter (huruf, angka, titik, ' +
          'underscore atau strip), dan password 8–72 byte.',
      })
    }

    const hashedPassword = await bcrypt.hash(
      password,
      12
    )

    const [result] = await pool.execute(
      `
      INSERT INTO users
      (nama, username, password, role)
      VALUES (?, ?, ?, 'guru')
      `,
      [
        cleanName,
        cleanUsername,
        hashedPassword,
      ]
    )

    return res.status(201).json({
      success: true,
      message: 'Guru berhasil ditambahkan.',
      data: {
        id: result.insertId,
        nama: cleanName,
        username: cleanUsername,
        role: 'guru',
      },
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Username sudah digunakan.',
      })
    }

    console.error('Create teacher:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan guru.',
    })
  }
}

// ========================================
// PUT EDIT DATA GURU
// ========================================

const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params
    const { nama, username, password } = req.body

    const cleanName =
      typeof nama === 'string' ? nama.trim() : ''

    const cleanUsername =
      typeof username === 'string'
        ? username.trim()
        : ''

    if (
      !validId(id) ||
      !cleanName ||
      cleanName.length > 100 ||
      !validUsername(cleanUsername)
    ) {
      return res.status(400).json({
        success: false,
        message: 'ID, nama, atau username tidak valid.',
      })
    }

    const changePassword =
      password !== undefined && password !== ''

    if (
      changePassword &&
      !validPassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Password baru harus minimal 8 karakter ' +
          'dan maksimal 72 byte.',
      })
    }

    const [existing] = await pool.execute(
      `
      SELECT id
      FROM users
      WHERE id = ? AND role = 'guru'
      LIMIT 1
      `,
      [id]
    )

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: 'Guru tidak ditemukan.',
      })
    }

    if (changePassword) {
      const hashedPassword = await bcrypt.hash(
        password,
        12
      )

      await pool.execute(
        `
        UPDATE users
        SET
          nama = ?,
          username = ?,
          password = ?
        WHERE id = ? AND role = 'guru'
        `,
        [
          cleanName,
          cleanUsername,
          hashedPassword,
          id,
        ]
      )
    } else {
      await pool.execute(
        `
        UPDATE users
        SET nama = ?, username = ?
        WHERE id = ? AND role = 'guru'
        `,
        [cleanName, cleanUsername, id]
      )
    }

    return res.json({
      success: true,
      message: 'Data guru berhasil diperbarui.',
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Username sudah digunakan.',
      })
    }

    console.error('Update teacher:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui guru.',
    })
  }
}

// ========================================
// DELETE GURU
// ========================================

const deleteTeacher = async (req, res) => {
  let connection

  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID guru tidak valid.',
      })
    }

    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [teachers] = await connection.execute(
      `
      SELECT id
      FROM users
      WHERE id = ? AND role = 'guru'
      FOR UPDATE
      `,
      [id]
    )

    if (!teachers.length) {
      await connection.rollback()

      return res.status(404).json({
        success: false,
        message: 'Guru tidak ditemukan.',
      })
    }

    // Jangan hapus jika sudah memiliki penugasan.
    const [assignments] = await connection.execute(
      `
      SELECT id
      FROM teacher_subjects
      WHERE teacher_id = ?
      LIMIT 1
      `,
      [id]
    )

    if (assignments.length) {
      await connection.rollback()

      return res.status(409).json({
        success: false,
        message:
          'Guru masih mempunyai pembagian tugas. ' +
          'Data guru tidak dapat dihapus.',
      })
    }

    // Lindungi riwayat absensi yang diperiksa guru.
    const [attendance] = await connection.execute(
      `
      SELECT id
      FROM subject_attendance
      WHERE checked_by = ?
      LIMIT 1
      `,
      [id]
    )

    if (attendance.length) {
      await connection.rollback()

      return res.status(409).json({
        success: false,
        message:
          'Guru memiliki riwayat pemeriksaan absensi ' +
          'dan tidak dapat dihapus.',
      })
    }

    // Lindungi riwayat scan dan koreksi.
    const [dailyAttendance] = await connection.execute(
      `
      SELECT id
      FROM attendance
      WHERE scanned_by = ? OR updated_by = ?
      LIMIT 1
      `,
      [id, id]
    )

    if (dailyAttendance.length) {
      await connection.rollback()

      return res.status(409).json({
        success: false,
        message:
          'Guru memiliki riwayat absensi harian ' +
          'dan tidak dapat dihapus.',
      })
    }

    await connection.execute(
      `
      DELETE FROM users
      WHERE id = ? AND role = 'guru'
      `,
      [id]
    )

    await connection.commit()

    return res.json({
      success: true,
      message: 'Data guru berhasil dihapus.',
    })
  } catch (error) {
    if (connection) await connection.rollback()

    console.error('Delete teacher:', error)

    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        message:
          'Guru masih digunakan oleh data lain.',
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus guru.',
    })
  } finally {
    if (connection) connection.release()
  }
}

module.exports = {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
}