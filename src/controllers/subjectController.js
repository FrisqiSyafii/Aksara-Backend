
const pool = require('../config/database');

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
    `);

    return res.status(200).json({
      success: true,
      message: 'Data mata pelajaran berhasil diambil.',
      data: subjects,
    });
  } catch (error) {
    console.error('Get subjects error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil mata pelajaran.',
    });
  }
};

// ========================================
// TAMBAH MATA PELAJARAN
// ========================================

const createSubject = async (req, res) => {
  try {
    const { nama_mapel } = req.body;

    if (!nama_mapel || !nama_mapel.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama mata pelajaran wajib diisi.',
      });
    }

    const namaMapel = nama_mapel.trim();

    if (namaMapel.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Nama mata pelajaran maksimal 100 karakter.',
      });
    }

    const [existing] = await pool.execute(
      `SELECT id FROM subjects WHERE LOWER(nama_mapel) = LOWER(?)`,
      [namaMapel]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Mata pelajaran sudah terdaftar.',
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO subjects (nama_mapel) VALUES (?)`,
      [namaMapel]
    );

    return res.status(201).json({
      success: true,
      message: 'Mata pelajaran berhasil ditambahkan.',
      data: {
        id: result.insertId,
        nama_mapel: namaMapel,
      },
    });
  } catch (error) {
    console.error('Create subject error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan mata pelajaran.',
    });
  }
};

// ========================================
// EDIT MATA PELAJARAN
// ========================================

const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama_mapel } = req.body;

    if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID mata pelajaran tidak valid.',
      });
    }

    if (!nama_mapel || !nama_mapel.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama mata pelajaran wajib diisi.',
      });
    }

    const namaMapel = nama_mapel.trim();

    if (namaMapel.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Nama mata pelajaran maksimal 100 karakter.',
      });
    }

    const [subject] = await pool.execute(
      `SELECT id FROM subjects WHERE id = ?`,
      [id]
    );

    if (subject.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mata pelajaran tidak ditemukan.',
      });
    }

    const [existing] = await pool.execute(
      `SELECT id FROM subjects
       WHERE LOWER(nama_mapel) = LOWER(?) AND id != ?`,
      [namaMapel, id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Nama mata pelajaran sudah digunakan.',
      });
    }

    await pool.execute(
      `UPDATE subjects SET nama_mapel = ? WHERE id = ?`,
      [namaMapel, id]
    );

    return res.status(200).json({
      success: true,
      message: 'Mata pelajaran berhasil diperbarui.',
    });
  } catch (error) {
    console.error('Update subject error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui mata pelajaran.',
    });
  }
};

// ========================================
// HAPUS MATA PELAJARAN
// ========================================

const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID mata pelajaran tidak valid.',
      });
    }

    const [subject] = await pool.execute(
      `SELECT id FROM subjects WHERE id = ?`,
      [id]
    );

    if (subject.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mata pelajaran tidak ditemukan.',
      });
    }

    const [attendance] = await pool.execute(
      `SELECT 1 FROM attendance WHERE subject_id = ? LIMIT 1`,
      [id]
    );

    if (attendance.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Mata pelajaran tidak dapat dihapus karena sudah digunakan dalam data absensi.',
      });
    }

    const [teacherSubjects] = await pool.execute(
      `SELECT 1 FROM teacher_subjects WHERE subject_id = ? LIMIT 1`,
      [id]
    );

    if (teacherSubjects.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Mata pelajaran tidak dapat dihapus karena masih memiliki relasi dengan guru.',
      });
    }

    await pool.execute(
      `DELETE FROM subjects WHERE id = ?`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Mata pelajaran berhasil dihapus.',
    });
  } catch (error) {
    console.error('Delete subject error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus mata pelajaran.',
    });
  }
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
};
