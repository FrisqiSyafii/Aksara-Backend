
const pool = require('../config/database')

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T12:00:00Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

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

// ========================================
// GET REKAPITULASI
// ========================================

const getRecap = async (req, res) => {
  try {
    const {
      type = 'harian',
      tanggal = '',
      class_id = '',
    } = req.query

    if (!['harian', 'mapel'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Jenis rekap tidak valid.',
      })
    }

    if (tanggal && !isValidDate(tanggal)) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal tidak valid.',
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

    const teacherMapel =
      type === 'mapel' &&
      req.user.role === 'guru'

    // ====================================
    // AMBIL DAFTAR KELAS
    // ====================================

    const classParams = []
    let classWhere = ''

    if (teacherMapel) {
      classWhere = `
        WHERE EXISTS (
          SELECT 1
          FROM teacher_subjects ts
          INNER JOIN class_schedules cs
            ON cs.teacher_subject_id = ts.id
          WHERE ts.class_id = c.id
            AND ts.teacher_id = ?
        )
      `

      classParams.push(req.user.id)
    }

    const [classes] = await pool.execute(
      `
      SELECT
        c.id,
        c.nama_kelas
      FROM classes c
      ${classWhere}
      ORDER BY c.nama_kelas ASC
      `,
      classParams
    )

    // ====================================
    // AMBIL SEMUA SISWA SESUAI AKSES
    // ====================================

    const studentWhere = []
    const studentParams = []

    if (class_id) {
      studentWhere.push('s.kelas_id = ?')
      studentParams.push(class_id)
    }

    if (teacherMapel) {
      studentWhere.push(`
        EXISTS (
          SELECT 1
          FROM teacher_subjects ts
          INNER JOIN class_schedules cs
            ON cs.teacher_subject_id = ts.id
          WHERE ts.class_id = s.kelas_id
            AND ts.teacher_id = ?
        )
      `)

      studentParams.push(req.user.id)
    }

    const [students] = await pool.execute(
      `
      SELECT
        s.id,
        s.nis,
        s.nama,
        s.kelas_id,
        c.nama_kelas
      FROM students s
      INNER JOIN classes c
        ON s.kelas_id = c.id
      ${
        studentWhere.length
          ? 'WHERE ' + studentWhere.join(' AND ')
          : ''
      }
      ORDER BY c.nama_kelas, s.nama
      `,
      studentParams
    )

    // ====================================
    // AMBIL CATATAN ABSENSI
    // ====================================

    let sql = ''
    const params = []

    if (type === 'harian') {
      sql = `
        SELECT
          a.student_id,
          a.status
        FROM attendance a
        WHERE a.subject_id IS NULL
      `

      if (tanggal) {
        sql += ' AND a.tanggal = ?'
        params.push(tanggal)
      }
    } else {
      sql = `
        SELECT
          sa.student_id,
          sa.status
        FROM subject_attendance sa

        INNER JOIN class_schedules cs
          ON sa.schedule_id = cs.id

        INNER JOIN teacher_subjects ts
          ON cs.teacher_subject_id = ts.id

        WHERE 1 = 1
      `

      if (teacherMapel) {
        sql += ' AND ts.teacher_id = ?'
        params.push(req.user.id)
      }

      if (tanggal) {
        sql += ' AND sa.tanggal = ?'
        params.push(tanggal)
      }
    }

    // Batasi berdasarkan siswa yang masuk cakupan.
    // Menggunakan Set agar tidak terjadi penghitungan
    // status dari kelas di luar filter.

    const allowedStudents = new Set(
      students.map((student) => Number(student.id))
    )

    const [records] = await pool.execute(sql, params)

    const attendanceByStudent = new Map()

    for (const record of records) {
      const id = Number(record.student_id)

      if (!allowedStudents.has(id)) continue

      if (!attendanceByStudent.has(id)) {
        attendanceByStudent.set(id, [])
      }

      attendanceByStudent.get(id).push(record.status)
    }

    // ====================================
    // HITUNG REKAP PER SISWA
    // ====================================

    const statuses = STATUSES[type]

    const studentRecap = students.map((student) => {
      const values =
        attendanceByStudent.get(Number(student.id)) || []

      const counts = Object.fromEntries(
        statuses.map((status) => [status, 0])
      )

      for (const status of values) {
        if (
          Object.prototype.hasOwnProperty.call(
            counts,
            status
          )
        ) {
          counts[status] += 1
        }
      }

      const total = Object.values(counts).reduce(
        (sum, number) => sum + number,
        0
      )

      const attended =
        counts.hadir + counts.terlambat

      return {
        id: student.id,
        nis: student.nis,
        nama: student.nama,
        kelas_id: student.kelas_id,
        nama_kelas: student.nama_kelas,
        ...counts,
        total,
        percentage: total > 0
          ? Math.round((attended / total) * 100)
          : 0,
      }
    })

    // ====================================
    // STATISTIK KESELURUHAN
    // ====================================

    const totals = Object.fromEntries(
      statuses.map((status) => [status, 0])
    )

    for (const row of studentRecap) {
      for (const status of statuses) {
        totals[status] += row[status]
      }
    }

    const totalRecords = Object.values(totals).reduce(
      (sum, number) => sum + number,
      0
    )

    const totalPresent =
      totals.hadir + totals.terlambat

    const statistics = {
      totalSiswa: students.length,
      ...totals,
      totalRecords,
      belumTercatat: studentRecap.filter(
        (student) => student.total === 0
      ).length,
      percentage: totalRecords > 0
        ? Math.round(
            (totalPresent / totalRecords) * 100
          )
        : 0,
    }

    return res.status(200).json({
      success: true,
      message: 'Rekapitulasi berhasil diambil.',
      data: {
        type,
        tanggal: tanggal || null,
        classes,
        statistics,
        students: studentRecap,
      },
    })
  } catch (error) {
    console.error('Get recap error:', error)

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil rekapitulasi.',
    })
  }
}

module.exports = {
  getRecap,
}
