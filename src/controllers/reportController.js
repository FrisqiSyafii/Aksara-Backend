
const pool = require('../config/database')

const VALID_TYPES = ['harian', 'mapel']

const STATUSES = {
  harian: [
    'hadir',
    'terlambat',
    'izin',
    'sakit',
    'alpa',
  ],
  mapel: [
    'hadir',
    'terlambat',
    'izin',
    'sakit',
    'bolos',
  ],
}

const validDate = (value) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const date = new Date(`${value}T12:00:00Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

const dateDifference = (start, end) => {
  const from = Date.parse(`${start}T00:00:00Z`)
  const to = Date.parse(`${end}T00:00:00Z`)

  return Math.round(
    (to - from) / (24 * 60 * 60 * 1000)
  )
}

const initialCounts = (type) => {
  const result = {}

  for (const status of STATUSES[type]) {
    result[status] = 0
  }

  return result
}

const percentage = (counts, total) => {
  if (!total) return 0

  return Math.round(
    (
      (counts.hadir + counts.terlambat) /
      total
    ) * 100
  )
}

// ========================================
// LAPORAN BERDASARKAN RENTANG TANGGAL
// ========================================

const getAttendanceReport = async (req, res) => {
  try {
    const {
      type = 'harian',
      start_date,
      end_date,
      class_id = '',
    } = req.query

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Jenis laporan tidak valid.',
      })
    }

    if (
      !validDate(start_date) ||
      !validDate(end_date)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Tanggal awal dan akhir wajib menggunakan YYYY-MM-DD.',
      })
    }

    const diff = dateDifference(
      start_date,
      end_date
    )

    if (diff < 0 || diff > 366) {
      return res.status(400).json({
        success: false,
        message:
          'Rentang laporan maksimal 367 hari dan tanggal akhir tidak boleh lebih awal.',
      })
    }

    if (
      class_id &&
      (
        !/^[1-9]\d*$/.test(String(class_id)) ||
        !Number.isSafeInteger(Number(class_id))
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'ID kelas tidak valid.',
      })
    }

    const userRole = req.user.role
    const teacherId = req.user.id
    const teacherMapel =
      userRole === 'guru' && type === 'mapel'

    // Guru boleh membaca rekap harian sesuai
    // route yang telah diberikan sebelumnya.
    // Pada laporan mapel, guru hanya melihat
    // penugasan miliknya sendiri.

    // ====================================
    // AMBIL DAFTAR KELAS
    // ====================================

    let classSQL = `
      SELECT c.id, c.nama_kelas
      FROM classes c
      WHERE 1 = 1
    `
    const classParams = []

    if (teacherMapel) {
      classSQL += `
        AND EXISTS (
          SELECT 1
          FROM teacher_subjects ts
          INNER JOIN class_schedules cs
            ON cs.teacher_subject_id = ts.id
          WHERE ts.class_id = c.id
            AND ts.teacher_id = ?
        )
      `
      classParams.push(teacherId)
    }

    classSQL += ' ORDER BY c.nama_kelas ASC'

    const [classes] = await pool.execute(
      classSQL,
      classParams
    )

    // ====================================
    // AMBIL DAFTAR SISWA
    // ====================================

    let studentSQL = `
      SELECT
        s.id,
        s.nis,
        s.nama,
        s.kelas_id,
        c.nama_kelas
      FROM students s
      INNER JOIN classes c
        ON c.id = s.kelas_id
      WHERE 1 = 1
    `

    const studentParams = []

    if (class_id) {
      studentSQL += ' AND s.kelas_id = ?'
      studentParams.push(class_id)
    }

    if (teacherMapel) {
      studentSQL += `
        AND EXISTS (
          SELECT 1
          FROM teacher_subjects ts
          INNER JOIN class_schedules cs
            ON cs.teacher_subject_id = ts.id
          WHERE ts.class_id = s.kelas_id
            AND ts.teacher_id = ?
        )
      `
      studentParams.push(teacherId)
    }

    studentSQL += `
      ORDER BY c.nama_kelas, s.nama
    `

    const [students] = await pool.execute(
      studentSQL,
      studentParams
    )

    // ====================================
    // HITUNG ABSENSI PER SISWA DI SQL
    // ====================================

    let attendanceSQL = ''
    let attendanceParams = []

    if (type === 'harian') {
      attendanceSQL = `
        SELECT
          a.student_id,
          a.status,
          COUNT(*) AS jumlah
        FROM attendance a
        WHERE a.subject_id IS NULL
          AND a.tanggal BETWEEN ? AND ?
        GROUP BY a.student_id, a.status
      `

      attendanceParams = [
        start_date,
        end_date,
      ]
    } else {
      attendanceSQL = `
        SELECT
          sa.student_id,
          sa.status,
          COUNT(*) AS jumlah
        FROM subject_attendance sa
        INNER JOIN class_schedules cs
          ON cs.id = sa.schedule_id
        INNER JOIN teacher_subjects ts
          ON ts.id = cs.teacher_subject_id
        WHERE sa.tanggal BETWEEN ? AND ?
      `

      attendanceParams = [
        start_date,
        end_date,
      ]

      if (teacherMapel) {
        attendanceSQL += ' AND ts.teacher_id = ?'
        attendanceParams.push(teacherId)
      }

      attendanceSQL += `
        GROUP BY sa.student_id, sa.status
      `
    }

    const [attendanceRows] = await pool.execute(
      attendanceSQL,
      attendanceParams
    )

    const statusByStudent = new Map()

    for (const item of attendanceRows) {
      const id = Number(item.student_id)

      if (!statusByStudent.has(id)) {
        statusByStudent.set(
          id,
          initialCounts(type)
        )
      }

      const counts = statusByStudent.get(id)

      if (
        Object.prototype.hasOwnProperty.call(
          counts,
          item.status
        )
      ) {
        counts[item.status] += Number(item.jumlah)
      }
    }

    // ====================================
    // REKAP PER SISWA
    // ====================================

    const studentRecap = students.map((student) => {
      const counts =
        statusByStudent.get(Number(student.id)) ||
        initialCounts(type)

      const total = Object.values(counts).reduce(
        (sum, count) => sum + count,
        0
      )

      return {
        ...student,
        ...counts,
        total,
        percentage: percentage(counts, total),
      }
    })

    // ====================================
    // REKAP PER KELAS
    // ====================================

    const classMap = new Map()

    const targetClasses = class_id
      ? classes.filter(
          (item) =>
            String(item.id) === String(class_id)
        )
      : classes

    for (const kelas of targetClasses) {
      classMap.set(Number(kelas.id), {
        class_id: kelas.id,
        nama_kelas: kelas.nama_kelas,
        totalSiswa: 0,
        ...initialCounts(type),
        totalRecords: 0,
        belumTercatat: 0,
        percentage: 0,
      })
    }

    for (const student of studentRecap) {
      const kelas = classMap.get(
        Number(student.kelas_id)
      )

      if (!kelas) continue

      kelas.totalSiswa += 1
      kelas.totalRecords += student.total

      if (student.total === 0) {
        kelas.belumTercatat += 1
      }

      for (const status of STATUSES[type]) {
        kelas[status] += student[status]
      }
    }

    const classRecap = Array.from(
      classMap.values()
    ).map((kelas) => ({
      ...kelas,
      percentage: percentage(
        kelas,
        kelas.totalRecords
      ),
    }))

    // ====================================
    // STATISTIK KESELURUHAN
    // ====================================

    const summary = {
      totalSiswa: studentRecap.length,
      ...initialCounts(type),
      totalRecords: 0,
      belumTercatat: 0,
      percentage: 0,
    }

    for (const student of studentRecap) {
      summary.totalRecords += student.total

      if (student.total === 0) {
        summary.belumTercatat += 1
      }

      for (const status of STATUSES[type]) {
        summary[status] += student[status]
      }
    }

    summary.percentage = percentage(
      summary,
      summary.totalRecords
    )

    return res.status(200).json({
      success: true,
      message: 'Laporan absensi berhasil diambil.',
      data: {
        type,
        start_date,
        end_date,
        selected_class_id: class_id || null,
        classes,
        summary,
        classRecap,
        studentRecap,
      },
    })
  } catch (error) {
    console.error('Report error:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil laporan absensi.',
    })
  }
}

module.exports = {
  getAttendanceReport,
}
