const pool = require("../config/database");

// ========================================
// UTILITAS TANGGAL
// ========================================

const todayWIB = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const differenceInDays = (start, end) => {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000
  );
};

const listDates = (start, end) => {
  const dates = [];

  const cursor = new Date(`${start}T00:00:00Z`);
  const finalDate = new Date(`${end}T00:00:00Z`);

  while (cursor <= finalDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const emptyPie = () => ({
  hadir: 0,
  terlambat: 0,
  izin: 0,
  sakit: 0,
  alpa: 0,
});

// ========================================
// GET DASHBOARD
// ========================================

const getDashboard = async (req, res) => {
  try {
    const {
      start_date = todayWIB(),
      end_date = start_date,
      class_id = "",
    } = req.query;

    const role = req.user.role;
    const userId = req.user.id;
    const isTeacher = role === "guru";

    if (!["admin", "guru", "kepala_sekolah"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Akses tidak diizinkan.",
      });
    }

    // ====================================
    // VALIDASI FILTER
    // ====================================

    if (!validDate(start_date) || !validDate(end_date)) {
      return res.status(400).json({
        success: false,
        message: "Format tanggal harus YYYY-MM-DD.",
      });
    }

    const days = differenceInDays(start_date, end_date);

    if (days < 0 || days > 366) {
      return res.status(400).json({
        success: false,
        message: "Rentang tanggal tidak boleh terbalik atau melebihi 367 hari.",
      });
    }

    if (
      class_id &&
      (!/^[1-9]\d*$/.test(String(class_id)) ||
        !Number.isSafeInteger(Number(class_id)))
    ) {
      return res.status(400).json({
        success: false,
        message: "ID kelas tidak valid.",
      });
    }

    // ====================================
    // KELAS YANG DIIZINKAN
    // ====================================

    let classQuery = `
      SELECT c.id, c.nama_kelas
      FROM classes c
      WHERE 1 = 1
    `;

    const classParams = [];

    if (isTeacher) {
      classQuery += `
        AND EXISTS (
          SELECT 1
          FROM teacher_subjects ts
          INNER JOIN class_schedules cs
            ON cs.teacher_subject_id = ts.id
          WHERE ts.teacher_id = ?
            AND ts.class_id = c.id
        )
      `;

      classParams.push(userId);
    }

    classQuery += " ORDER BY c.nama_kelas ASC";

    const [classes] = await pool.execute(classQuery, classParams);

    const allowedClassIds = classes.map((item) => Number(item.id));

    if (class_id && !allowedClassIds.includes(Number(class_id))) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke kelas tersebut.",
      });
    }

    const selectedClassIds = class_id ? [Number(class_id)] : allowedClassIds;

    // Guru tanpa jadwal tidak boleh memperoleh
    // data seluruh sekolah.
    if (selectedClassIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          role,
          start_date,
          end_date,
          classes,
          jumlahSiswa: 0,
          jumlahGuru: isTeacher ? null : 0,
          jumlahKelas: 0,
          totalCatatan: 0,
          belumTercatat: 0,
          pie: emptyPie(),
          persentase: 0,
          bar: listDates(start_date, end_date).map((tanggal) => ({
            tanggal,
            hadir: 0,
            terlambat: 0,
            total: 0,
          })),
          terbaru: [],
        },
      });
    }

    const placeholders = selectedClassIds.map(() => "?").join(",");

    // ====================================
    // JUMLAH SISWA DAN KELAS
    // ====================================

    const [studentRows] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM students s
      WHERE s.kelas_id IN (${placeholders})
      `,
      selectedClassIds
    );

    const jumlahSiswa = Number(studentRows[0].total || 0);

    const jumlahKelas = selectedClassIds.length;

    // ====================================
    // JUMLAH GURU
    // ====================================

    let jumlahGuru = null;

    if (!isTeacher) {
      const [teacherRows] = await pool.execute(
        `
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'guru'
        `
      );

      jumlahGuru = Number(teacherRows[0].total || 0);
    }

    // ====================================
    // REKAP STATUS
    // ====================================

    const [statusRows] = await pool.execute(
      `
      SELECT
        a.status,
        COUNT(*) AS jumlah
      FROM attendance a
      INNER JOIN students s
        ON s.id = a.student_id
      WHERE a.subject_id IS NULL
        AND a.tanggal BETWEEN ? AND ?
        AND s.kelas_id IN (${placeholders})
      GROUP BY a.status
      `,
      [start_date, end_date, ...selectedClassIds]
    );

    const pie = emptyPie();

    for (const item of statusRows) {
      if (Object.prototype.hasOwnProperty.call(pie, item.status)) {
        pie[item.status] = Number(item.jumlah);
      }
    }

    const totalCatatan = Object.values(pie).reduce(
      (total, value) => total + value,
      0
    );

    const persentase =
      totalCatatan > 0
        ? Math.round(((pie.hadir + pie.terlambat) / totalCatatan) * 100)
        : 0;

    // ====================================
    // SISWA TANPA CATATAN DI PERIODE
    // ====================================

    const [missingRows] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM students s
      WHERE s.kelas_id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1
          FROM attendance a
          WHERE a.student_id = s.id
            AND a.subject_id IS NULL
            AND a.tanggal BETWEEN ? AND ?
        )
      `,
      [...selectedClassIds, start_date, end_date]
    );

    const belumTercatat = Number(missingRows[0].total || 0);

    // ====================================
    // GRAFIK HARIAN
    // ====================================

    const [chartRows] = await pool.execute(
      `
      SELECT
        DATE_FORMAT(a.tanggal, '%Y-%m-%d')
          AS tanggal,
        a.status,
        COUNT(*) AS jumlah
      FROM attendance a
      INNER JOIN students s
        ON s.id = a.student_id
      WHERE a.subject_id IS NULL
        AND a.tanggal BETWEEN ? AND ?
        AND s.kelas_id IN (${placeholders})
      GROUP BY a.tanggal, a.status
      ORDER BY a.tanggal ASC
      `,
      [start_date, end_date, ...selectedClassIds]
    );

    const chartMap = new Map();

    for (const tanggal of listDates(start_date, end_date)) {
      chartMap.set(tanggal, {
        tanggal,
        hadir: 0,
        terlambat: 0,
        total: 0,
      });
    }

    for (const item of chartRows) {
      const point = chartMap.get(item.tanggal);

      if (!point) continue;

      const jumlah = Number(item.jumlah);

      if (item.status === "hadir") {
        point.hadir += jumlah;
      }

      if (item.status === "terlambat") {
        point.terlambat += jumlah;
      }

      point.total += jumlah;
    }

    // ====================================
    // ABSENSI TERBARU
    // ====================================

    const [terbaru] = await pool.execute(
      `
      SELECT
        a.id,
        s.nis,
        s.nama,
        c.nama_kelas,
        DATE_FORMAT(a.tanggal, '%Y-%m-%d')
          AS tanggal,
        TIME_FORMAT(a.jam, '%H:%i')
          AS jam,
        a.status
      FROM attendance a
      INNER JOIN students s
        ON s.id = a.student_id
      INNER JOIN classes c
        ON c.id = s.kelas_id
      WHERE a.subject_id IS NULL
        AND a.tanggal BETWEEN ? AND ?
        AND s.kelas_id IN (${placeholders})
      ORDER BY a.tanggal DESC, a.jam DESC,
        a.id DESC
      LIMIT 10
      `,
      [start_date, end_date, ...selectedClassIds]
    );

    return res.status(200).json({
      success: true,
      message: "Dashboard berhasil diambil.",
      data: {
        role,
        start_date,
        end_date,
        classes,
        jumlahSiswa,
        jumlahGuru,
        jumlahKelas,
        totalCatatan,
        belumTercatat,
        pie,
        persentase,
        bar: Array.from(chartMap.values()),
        terbaru,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard.",
    });
  }
};

module.exports = {
  getDashboard,
};
