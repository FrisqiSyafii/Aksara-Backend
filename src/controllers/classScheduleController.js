
const pool = require('../config/database')

const DAYS = [
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
]

const validId = (value) =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0

const normalizeTime = (value) => {
  if (typeof value !== 'string') return null

  if (
    !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
  ) {
    return null
  }

  return value.length === 5
    ? `${value}:00`
    : value
}

const getAssignment = async (id) => {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      teacher_id,
      subject_id,
      class_id
    FROM teacher_subjects
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  )

  return rows[0] || null
}

// ========================================
// CEK BENTROK JADWAL
// ========================================

const checkConflict = async ({
  teacher_subject_id,
  hari,
  jam_mulai,
  jam_selesai,
  excludeId = 0,
}) => {
  const assignment = await getAssignment(
    teacher_subject_id
  )

  if (!assignment) {
    return {
      error: 'Pembagian tugas tidak ditemukan.',
    }
  }

  const [rows] = await pool.execute(
    `
    SELECT
      cs.id,
      cs.jam_mulai,
      cs.jam_selesai,
      ts.teacher_id,
      ts.class_id,
      u.nama AS nama_guru,
      c.nama_kelas

    FROM class_schedules cs

    JOIN teacher_subjects ts
      ON cs.teacher_subject_id = ts.id

    JOIN users u
      ON ts.teacher_id = u.id

    JOIN classes c
      ON ts.class_id = c.id

    WHERE cs.hari = ?
      AND cs.id <> ?

      AND cs.jam_mulai < ?
      AND cs.jam_selesai > ?

      AND (
        ts.teacher_id = ?
        OR ts.class_id = ?
      )

    LIMIT 1
    `,
    [
      hari,
      excludeId,
      jam_selesai,
      jam_mulai,
      assignment.teacher_id,
      assignment.class_id,
    ]
  )

  if (!rows.length) {
    return { error: null }
  }

  const conflict = rows[0]

  const sameTeacher =
    Number(conflict.teacher_id) ===
    Number(assignment.teacher_id)

  return {
    error: sameTeacher
      ? `Guru ${conflict.nama_guru} sudah ` +
        'memiliki jadwal pada waktu tersebut.'
      : `Kelas ${conflict.nama_kelas} sudah ` +
        'memiliki pelajaran pada waktu tersebut.',
    conflict,
  }
}

// ========================================
// QUERY DASAR JADWAL
// ========================================

const scheduleSelect = `
  SELECT
    cs.id,
    cs.teacher_subject_id,
    cs.hari,

    TIME_FORMAT(
      cs.jam_mulai, '%H:%i:%s'
    ) AS jam_mulai,

    TIME_FORMAT(
      cs.jam_selesai, '%H:%i:%s'
    ) AS jam_selesai,

    ts.teacher_id,
    ts.subject_id,
    ts.class_id,

    u.nama AS nama_guru,
    s.nama_mapel,
    c.nama_kelas,

    cs.created_at,
    cs.updated_at

  FROM class_schedules cs

  JOIN teacher_subjects ts
    ON cs.teacher_subject_id = ts.id

  JOIN users u
    ON ts.teacher_id = u.id

  JOIN subjects s
    ON ts.subject_id = s.id

  JOIN classes c
    ON ts.class_id = c.id
`

// ========================================
// GET SEMUA JADWAL
// ========================================

const getClassSchedules = async (req, res) => {
  try {
    const isTeacher = req.user.role === 'guru'

    const [rows] = await pool.execute(
      `
      ${scheduleSelect}

      ${isTeacher ? 'WHERE ts.teacher_id = ?' : ''}

      ORDER BY
        FIELD(
          cs.hari,
          'senin', 'selasa', 'rabu',
          'kamis', 'jumat', 'sabtu'
        ),
        cs.jam_mulai,
        c.nama_kelas
      `,
      isTeacher ? [req.user.id] : []
    )

    return res.json({
      success: true,
      data: rows,
    })
  } catch (error) {
    console.error('Get schedules:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil jadwal pelajaran.',
    })
  }
}

// ========================================
// GET JADWAL BERDASARKAN ID
// ========================================

const getClassScheduleById = async (
  req,
  res
) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID jadwal tidak valid.',
      })
    }

    const isTeacher = req.user.role === 'guru'

    const [rows] = await pool.execute(
      `
      ${scheduleSelect}

      WHERE cs.id = ?
      ${isTeacher ? 'AND ts.teacher_id = ?' : ''}

      LIMIT 1
      `,
      isTeacher ? [id, req.user.id] : [id]
    )

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal tidak ditemukan.',
      })
    }

    return res.json({
      success: true,
      data: rows[0],
    })
  } catch (error) {
    console.error('Get schedule by ID:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil jadwal.',
    })
  }
}

// ========================================
// VALIDASI INPUT JADWAL
// ========================================

const validateInput = (body) => {
  const {
    teacher_subject_id,
    hari,
    jam_mulai,
    jam_selesai,
  } = body

  if (!validId(teacher_subject_id)) {
    return {
      error: 'Pembagian tugas tidak valid.',
    }
  }

  if (!DAYS.includes(hari)) {
    return {
      error: 'Hari jadwal tidak valid.',
    }
  }

  const start = normalizeTime(jam_mulai)
  const end = normalizeTime(jam_selesai)

  if (!start || !end) {
    return {
      error: 'Format waktu harus HH:MM atau HH:MM:SS.',
    }
  }

  if (start >= end) {
    return {
      error:
        'Jam selesai harus lebih besar dari jam mulai.',
    }
  }

  return {
    error: null,
    data: {
      teacher_subject_id,
      hari,
      jam_mulai: start,
      jam_selesai: end,
    },
  }
}

// ========================================
// POST JADWAL PELAJARAN
// ========================================

const createClassSchedule = async (req, res) => {
  try {
    const validation = validateInput(req.body)

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      })
    }

    const data = validation.data

    const check = await checkConflict({
      ...data,
    })

    if (check.error) {
      return res.status(
        check.conflict ? 409 : 404
      ).json({
        success: false,
        message: check.error,
      })
    }

    const [result] = await pool.execute(
      `
      INSERT INTO class_schedules
      (
        teacher_subject_id,
        hari,
        jam_mulai,
        jam_selesai
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        data.teacher_subject_id,
        data.hari,
        data.jam_mulai,
        data.jam_selesai,
      ]
    )

    return res.status(201).json({
      success: true,
      message: 'Jadwal pelajaran berhasil ditambahkan.',
      data: {
        id: result.insertId,
        ...data,
      },
    })
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({
        success: false,
        message: 'Pembagian tugas tidak ditemukan.',
      })
    }

    console.error('Create schedule:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan jadwal.',
    })
  }
}

// ========================================
// PUT JADWAL PELAJARAN
// ========================================

const updateClassSchedule = async (req, res) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID jadwal tidak valid.',
      })
    }

    const validation = validateInput(req.body)

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      })
    }

    const data = validation.data

    const [existing] = await pool.execute(
      `
      SELECT teacher_subject_id
      FROM class_schedules
      WHERE id = ?
      `,
      [id]
    )

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal tidak ditemukan.',
      })
    }

    // Jangan alihkan jadwal ke guru/mapel/kelas
    // berbeda jika sudah mempunyai data absensi.

    if (
      Number(existing[0].teacher_subject_id) !==
      Number(data.teacher_subject_id)
    ) {
      const [attendance] = await pool.execute(
        `
        SELECT id
        FROM subject_attendance
        WHERE schedule_id = ?
        LIMIT 1
        `,
        [id]
      )

      if (attendance.length) {
        return res.status(409).json({
          success: false,
          message:
            'Jadwal sudah memiliki riwayat absensi. ' +
            'Pembagian tugas tidak boleh dialihkan.',
        })
      }
    }

    const check = await checkConflict({
      ...data,
      excludeId: id,
    })

    if (check.error) {
      return res.status(
        check.conflict ? 409 : 404
      ).json({
        success: false,
        message: check.error,
      })
    }

    await pool.execute(
      `
      UPDATE class_schedules
      SET
        teacher_subject_id = ?,
        hari = ?,
        jam_mulai = ?,
        jam_selesai = ?
      WHERE id = ?
      `,
      [
        data.teacher_subject_id,
        data.hari,
        data.jam_mulai,
        data.jam_selesai,
        id,
      ]
    )

    return res.json({
      success: true,
      message: 'Jadwal berhasil diperbarui.',
    })
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({
        success: false,
        message: 'Pembagian tugas tidak ditemukan.',
      })
    }

    console.error('Update schedule:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui jadwal.',
    })
  }
}

// ========================================
// DELETE JADWAL PELAJARAN
// ========================================

const deleteClassSchedule = async (req, res) => {
  try {
    const { id } = req.params

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID jadwal tidak valid.',
      })
    }

    const [attendance] = await pool.execute(
      `
      SELECT id
      FROM subject_attendance
      WHERE schedule_id = ?
      LIMIT 1
      `,
      [id]
    )

    if (attendance.length) {
      return res.status(409).json({
        success: false,
        message:
          'Jadwal sudah memiliki absensi siswa ' +
          'dan tidak boleh dihapus.',
      })
    }

    const [result] = await pool.execute(
      `
      DELETE FROM class_schedules
      WHERE id = ?
      `,
      [id]
    )

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal tidak ditemukan.',
      })
    }

    return res.json({
      success: true,
      message: 'Jadwal berhasil dihapus.',
    })
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        message:
          'Jadwal masih digunakan dalam absensi.',
      })
    }

    console.error('Delete schedule:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus jadwal.',
    })
  }
}

module.exports = {
  getClassSchedules,
  getClassScheduleById,
  createClassSchedule,
  updateClassSchedule,
  deleteClassSchedule,
}
