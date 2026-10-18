const pool = require('../config/database')

const getClasses = async (req, res) => {
  try {
    const [classes] = await pool.execute(`
      SELECT
        id,
        nama_kelas,
        created_at
      FROM classes
      ORDER BY id ASC
    `)

    return res.status(200).json({
      success: true,
      message: 'Data kelas berhasil diambil.',
      data: classes,
    })
  } catch (error) {
    console.error(
      'Get classes error:',
      error,
    )

    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
    })
  }
}

module.exports = {
  getClasses,
}