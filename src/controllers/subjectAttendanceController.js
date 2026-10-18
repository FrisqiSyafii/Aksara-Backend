// controllers/subjectAttendanceController.js

const pool = require('../config/database')

const {
  getCurrentDateTime,
} = require('../utils/attendanceTime')

const STATUSES = [
  'hadir',
  'terlambat',
  'izin',
  'sakit',
  'bolos',
]

const isValidId = (value) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0

const isValidDate = (value) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const parsed = new Date(
    `${value}T12:00:00Z`
  )

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

// ========================================
// CEK AKSES JADWAL
// ========================================

const getAuthorizedSchedule = async (
  req,
  scheduleId
) => {
  const [rows] = await pool.execute(
    `
    SELECT
      cs.id,
      cs.teacher_subject_id,
      cs.hari,
      cs.jam_mulai,
      cs.jam_selesai,

      ts.teacher_id,
      ts.subject_id,
      ts.class_id,

      sub.nama_mapel,
      c.nama_kelas,
      u.nama AS nama_guru

    FROM class_schedules cs

    INNER JOIN teacher_subjects ts
      ON cs.teacher_subject_id = ts.id

    INNER JOIN subjects sub
      ON ts.subject_id = sub.id

    INNER JOIN classes c
      ON ts.class_id = c.id

    INNER JOIN users u
      ON ts.teacher_id = u.id

    WHERE cs.id = ?
    LIMIT 1
    `,
    [scheduleId]
  )

  if (rows.length === 0) {
    return null
  }

  const schedule = rows[0]

  if (
    req.user.role === 'guru' &&
    Number(schedule.teacher_id) !==
      Number(req.user.id)
  ) {
    return 'FORBIDDEN'
  }

  return schedule
}

// ========================================
// VALIDASI HARI JADWAL
// ========================================

const matchesScheduleDay = (
  tanggal,
  hari
) => {
  const day = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'UTC',
      weekday: 'long',
    }
  ).format(
    new Date(`${tanggal}T12:00:00Z`)
  )

  const names = {
    Monday: 'senin',
    Tuesday: 'selasa',
    Wednesday: 'rabu',
    Thursday: 'kamis',
    Friday: 'jumat',
    Saturday: 'sabtu',
    Sunday: 'minggu',
  }

  return names[day] === hari
}

// ========================================
// GET JADWAL MENGAJAR
// ========================================

const getSchedules = async (req, res) => {
  try {
    const isTeacher =
      req.user.role === 'guru'

    const query = `
      SELECT
        cs.id AS schedule_id,
        cs.hari,
        cs.jam_mulai,
        cs.jam_selesai,

        ts.teacher_id,
        ts.subject_id,
        ts.class_id,

        sub.nama_mapel,
        c.nama_kelas,
        u.nama AS nama_guru

      FROM class_schedules cs

      INNER JOIN teacher_subjects ts
        ON cs.teacher_subject_id = ts.id

      INNER JOIN subjects sub
        ON ts.subject_id = sub.id

      INNER JOIN classes c
        ON ts.class_id = c.id

      INNER JOIN users u
        ON ts.teacher_id = u.id

      ${isTeacher ? 'WHERE ts.teacher_id = ?' : ''}

      ORDER BY
        FIELD(
          cs.hari,
          'senin', 'selasa', 'rabu',
          'kamis', 'jumat', 'sabtu'
        ),
        cs.jam_mulai
    `

    const [rows] = await pool.execute(
      query,
      isTeacher ? [req.user.id] : []
    )

    return res.status(200).json({
      success: true,
      data: rows,
    })
  } catch (error) {
    console.error('Get schedules error:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil jadwal.',
    })
  }
}

// ========================================
// GET DAFTAR SISWA DAN CROSS-CHECK
// ========================================

const getSubjectAttendance = async (
  req,
  res
) => {
  try {
    const { scheduleId } = req.params

    const tanggal =
      req.query.tanggal ||
      getCurrentDateTime().tanggal

    if (
      !isValidId(scheduleId) ||
      !isValidDate(tanggal)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Jadwal atau tanggal tidak valid.',
      })
    }

    const schedule =
      await getAuthorizedSchedule(
        req,
        scheduleId
      )

    if (schedule === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message:
          'Anda tidak memiliki akses ke jadwal ini.',
      })
    }

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal tidak ditemukan.',
      })
    }

    if (
      !matchesScheduleDay(
        tanggal,
        schedule.hari
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Tanggal tidak sesuai hari jadwal.',
      })
    }

    const [students] = await pool.execute(
      `
      SELECT
        s.id AS student_id,
        s.nis,
        s.nama AS nama_siswa,
        s.qr_code,

        a.status AS status_gerbang,

        TIME_FORMAT(
          a.jam, '%H:%i:%s'
        ) AS jam_gerbang,

        sa.id AS subject_attendance_id,
        sa.status AS status_mapel,
        sa.keterangan,
        sa.checked_by

      FROM students s

      LEFT JOIN attendance a
        ON a.student_id = s.id
        AND a.tanggal = ?
        AND a.subject_id IS NULL

      LEFT JOIN subject_attendance sa
        ON sa.student_id = s.id
        AND sa.schedule_id = ?
        AND sa.tanggal = ?

      WHERE s.kelas_id = ?

      ORDER BY s.nama ASC
      `,
      [
        tanggal,
        scheduleId,
        tanggal,
        schedule.class_id,
      ]
    )

    return res.status(200).json({
      success: true,
      data: {
        schedule,
        tanggal,
        students,
      },
    })
  } catch (error) {
    console.error(
      'Get subject attendance error:',
      error
    )

    return res.status(500).json({
      success: false,
      message:
        'Gagal mengambil absensi mata pelajaran.',
    })
  }
}

// ========================================
// SIMPAN / UPDATE CROSS-CHECK SATU SISWA
// ========================================

const saveSubjectAttendance = async (
  req,
  res
) => {
  try {
    const {
      schedule_id,
      student_id,
      tanggal,
      status,
      keterangan,
    } = req.body

    if (
      !isValidId(schedule_id) ||
      !isValidId(student_id) ||
      !isValidDate(tanggal) ||
      !STATUSES.includes(status) ||
      (
        keterangan !== undefined &&
        keterangan !== null &&
        typeof keterangan !== 'string'
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Data absensi tidak valid.',
      })
    }

    const schedule =
      await getAuthorizedSchedule(
        req,
        schedule_id
      )

    if (schedule === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message:
          'Anda tidak memiliki akses ke jadwal ini.',
      })
    }

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal tidak ditemukan.',
      })
    }

    if (
      !matchesScheduleDay(
        tanggal,
        schedule.hari
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Tanggal tidak sesuai hari jadwal.',
      })
    }

    // Pastikan siswa memang berada di kelas itu

    const [students] = await pool.execute(
      `
      SELECT id
      FROM students
      WHERE id = ?
        AND kelas_id = ?
      LIMIT 1
      `,
      [
        student_id,
        schedule.class_id,
      ]
    )

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          'Siswa tidak terdaftar pada kelas ini.',
      })
    }

    // Tambah atau perbarui hasil cross-check

    await pool.execute(
      `
      INSERT INTO subject_attendance
      (
        student_id,
        schedule_id,
        tanggal,
        status,
        keterangan,
        checked_by
      )
      VALUES (?, ?, ?, ?, ?, ?)

      ON DUPLICATE KEY UPDATE
        status = ?,
        keterangan = ?,
        checked_by = ?
      `,
      [
        student_id,
        schedule_id,
        tanggal,
        status,
        keterangan ?? null,
        req.user.id,

        status,
        keterangan ?? null,
        req.user.id,
      ]
    )

    return res.status(200).json({
      success: true,
      message:
        'Absensi mata pelajaran berhasil disimpan.',
      data: {
        student_id,
        schedule_id,
        tanggal,
        status,
      },
    })
  } catch (error) {
    console.error(
      'Save subject attendance error:',
      error
    )

    return res.status(500).json({
      success: false,
      message:
        'Gagal menyimpan absensi mata pelajaran.',
    })
  }
}

module.exports = {
  getSchedules,
  getSubjectAttendance,
  saveSubjectAttendance,
}