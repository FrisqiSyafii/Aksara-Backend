const bcrypt = require('bcryptjs')
const pool = require('./config/database')

async function createAdmin() {
  try {
    const password = await bcrypt.hash(
      'admin123',
      10,
    )

    await pool.execute(
      `
      INSERT INTO users
      (username, password, nama, role)
      VALUES (?, ?, ?, ?)
      `,
      [
        'admin',
        password,
        'Administrator',
        'admin',
      ],
    )

    console.log('Admin berhasil dibuat.')

    process.exit(0)
  } catch (error) {
    console.error(
      'Gagal membuat admin:',
      error.message,
    )

    process.exit(1)
  }
}

createAdmin()