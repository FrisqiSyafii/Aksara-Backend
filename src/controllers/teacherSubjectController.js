
const pool = require('../config/database')

const validId = (value) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0 &&
  value !== null &&
  value !== undefined &&
  value !== ''

const validateRelations = async (
  teacher_id,
  subject_id,
  class_id
) => {
  const [[teacherRows], [subjectRows], [classRows]] =
    await Promise.all([
      pool.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'guru'",
        [teacher_id]
      ),
      pool.execute(
        'SELECT id FROM subjects WHERE id = ?',
        [subject_id]
      ),
      pool.execute(
        'SELECT id FROM classes WHERE id = ?',
        [class_id]
      ),
    ])

  if (!teacherRows.length) {
    return 'Guru tidak ditemukan atau role bukan guru.'
  }

  if (!subjectRows.length) {
    return 'Mata pelajaran tidak ditemukan.'
  }

  if (!classRows.length) {
    return 'Kelas tidak ditemukan.'
  }

  return null
}

const getTeacherSubjects = async (req, res) => {
  try {
    const isTeacher = req.user.role === 'guru'

    const [rows] = await pool.execute(
      `
      SELECT
        ts.id,
        ts.teacher_id,
        u.nama AS nama_guru,
        ts.subject_id,
        s.nama_mapel,
        ts.class_id,
        c.nama_kelas,
        ts.created_at
      FROM teacher_subjects ts
      JOIN users u ON ts.teacher_id = u.id
      JOIN subjects s ON ts.subject_id = s.id
      JOIN classes c ON ts.class_id = c.id
      ${isTeacher ? 'WHERE ts.teacher_id = ?' : ''}
      ORDER BY c.nama_kelas, s.nama_mapel, u.nama
      `,
      isTeacher ? [req.user.id] : []
    )

    return res.json({
      success: true,
      data: rows,
    })
  } catch (error) {
    console.error('Get teacher subjects:', error)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil pembagian tugas.',
    })
  }
}

const getTeacherSubjectById = async (req, res) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID penugasan tidak valid.',
      })
    }

    const isTeacher = req.user.role === 'guru'

    const [rows] = await pool.execute(
      `
      SELECT
        ts.id,
        ts.teacher_id,
        u.nama AS nama_guru,
        ts.subject_id,
        s.nama_mapel,
        ts.class_id,
        c.nama_kelas,
        ts.created_at
      FROM teacher_subjects ts
      JOIN users u ON ts.teacher_id = u.id
      JOIN subjects s ON ts.subject_id = s.id
      JOIN classes c ON ts.class_id = c.id
      WHERE ts.id = ?
      ${isTeacher ? 'AND ts.teacher_id = ?' : ''}
      LIMIT 1
      `,
      isTeacher ? [id, req.user.id] : [id]
    )

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Penugasan tidak ditemukan.',
      })
    }

    return res.json({
      success: true,
      data: rows[0],
    })
  } catch (error) {
    console.error('Get teacher subject:', error)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil penugasan.',
    })
  }
}

const createTeacherSubject = async (req, res) => {
  try {
    const {
      teacher_id,
      subject_id,
      class_id,
    } = req.body

    if (![teacher_id, subject_id, class_id].every(validId)) {
      return res.status(400).json({
        success: false,
        message: 'Guru, mapel, dan kelas wajib valid.',
      })
    }

    const relationError = await validateRelations(
      teacher_id, subject_id, class_id
    )

    if (relationError) {
      return res.status(400).json({
        success: false,
        message: relationError,
      })
    }

    const [result] = await pool.execute(
      `
      INSERT INTO teacher_subjects
      (teacher_id, subject_id, class_id)
      VALUES (?, ?, ?)
      `,
      [teacher_id, subject_id, class_id]
    )

    return res.status(201).json({
      success: true,
      message: 'Pembagian tugas berhasil ditambahkan.',
      data: { id: result.insertId },
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Penugasan tersebut sudah ada.',
      })
    }

    console.error('Create teacher subject:', error)
    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan pembagian tugas.',
    })
  }
}

const updateTeacherSubject = async (req, res) => {
  try {
    const { id } = req.params
    const {
      teacher_id,
      subject_id,
      class_id,
    } = req.body

    if (
      !validId(id) ||
      ![teacher_id, subject_id, class_id].every(validId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Data penugasan tidak valid.',
      })
    }

    const relationError = await validateRelations(
      teacher_id, subject_id, class_id
    )

    if (relationError) {
      return res.status(400).json({
        success: false,
        message: relationError,
      })
    }

    // Penugasan yang telah digunakan jadwal
    // tidak boleh dialihkan ke guru/mapel/kelas lain.
    const [existing] = await pool.execute(
      `
      SELECT teacher_id, subject_id, class_id
      FROM teacher_subjects
      WHERE id = ?
      `,
      [id]
    )

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: 'Penugasan tidak ditemukan.',
      })
    }

    const old = existing[0]

    const changed =
      Number(old.teacher_id) !== Number(teacher_id) ||
      Number(old.subject_id) !== Number(subject_id) ||
      Number(old.class_id) !== Number(class_id)

    if (changed) {
      const [schedules] = await pool.execute(
        `
        SELECT id FROM class_schedules
        WHERE teacher_subject_id = ?
        LIMIT 1
        `,
        [id]
      )

      if (schedules.length) {
        return res.status(409).json({
          success: false,
          message:
            'Penugasan sudah mempunyai jadwal. ' +
            'Hapus atau pindahkan jadwal terlebih dahulu.',
        })
      }
    }

    await pool.execute(
      `
      UPDATE teacher_subjects
      SET teacher_id = ?, subject_id = ?, class_id = ?
      WHERE id = ?
      `,
      [teacher_id, subject_id, class_id, id]
    )

    return res.json({
      success: true,
      message: 'Pembagian tugas berhasil diperbarui.',
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Penugasan tersebut sudah ada.',
      })
    }

    console.error('Update teacher subject:', error)
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui pembagian tugas.',
    })
  }
}

const deleteTeacherSubject = async (req, res) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID penugasan tidak valid.',
      })
    }

    const [schedules] = await pool.execute(
      `
      SELECT id FROM class_schedules
      WHERE teacher_subject_id = ?
      LIMIT 1
      `,
      [id]
    )

    if (schedules.length) {
      return res.status(409).json({
        success: false,
        message:
          'Penugasan masih memiliki jadwal mengajar.',
      })
    }

    const [result] = await pool.execute(
      'DELETE FROM teacher_subjects WHERE id = ?',
      [id]
    )

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: 'Penugasan tidak ditemukan.',
      })
    }

    return res.json({
      success: true,
      message: 'Pembagian tugas berhasil dihapus.',
    })
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        message: 'Penugasan masih digunakan data lain.',
      })
    }

    console.error('Delete teacher subject:', error)
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus pembagian tugas.',
    })
  }
}

module.exports = {
  getTeacherSubjects,
  getTeacherSubjectById,
  createTeacherSubject,
  updateTeacherSubject,
  deleteTeacherSubject,
}
