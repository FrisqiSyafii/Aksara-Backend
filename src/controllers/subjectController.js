const pool = require('../config/database')

// ========================================
// GET SEMUA MATA PELAJARAN
// ========================================

const getSubjects = async (req, res) => {
  try {
    const [subjects] = await pool.execute(`
      SELECT
        id,
        nama_mapel,
        created_at
      FROM subjects
      ORDER BY nama_mapel ASC
    `)

    return res.status(200).json({
      success: true,
      message: 'Data mata pelajaran berhasil diambil.',
      data: subjects,
    })
  } catch (error) {
    console.error(
      'Get subjects error:',
      error
    )

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil mata pelajaran.',
    })
  }
}

module.exports = {
  getSubjects,
}