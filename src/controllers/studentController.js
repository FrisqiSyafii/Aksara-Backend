const pool = require("../config/database");

// ========================================
// UTILITAS
// ========================================

const validId = (value) => {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0;
};

const cleanText = (value) => String(value ?? "").trim();

const handleDatabaseError = (res, error) => {
  console.error("Student database error:", error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "NIS atau QR Code sudah digunakan.",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Data siswa masih digunakan oleh data lain.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada server.",
  });
};

// ========================================
// GET SEMUA SISWA
// ========================================

const getStudents = async (req, res) => {
  try {
    const [students] = await pool.execute(`
      SELECT
        s.id,
        s.nis,
        s.nama,
        s.kelas_id,
        c.nama_kelas,
        s.qr_code,
        s.created_at,
        s.updated_at,
        CASE
          WHEN fp.student_id IS NOT NULL THEN 1
          ELSE 0
        END AS wajah_terdaftar
      FROM students s
      INNER JOIN classes c
        ON s.kelas_id = c.id
      LEFT JOIN student_face_profiles fp
        ON fp.student_id = s.id
      ORDER BY s.id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Data siswa berhasil diambil.",
      data: students,
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// ========================================
// GET SISWA BERDASARKAN ID
// ========================================

const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    const [students] = await pool.execute(
      `
      SELECT
        s.id,
        s.nis,
        s.nama,
        s.kelas_id,
        c.nama_kelas,
        s.qr_code,
        s.created_at,
        s.updated_at,
        CASE
          WHEN fp.student_id IS NOT NULL THEN 1
          ELSE 0
        END AS wajah_terdaftar
      FROM students s
      INNER JOIN classes c
        ON s.kelas_id = c.id
      LEFT JOIN student_face_profiles fp
        ON fp.student_id = s.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Data siswa tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Data siswa berhasil diambil.",
      data: students[0],
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// ========================================
// POST TAMBAH SISWA
// ========================================

const createStudent = async (req, res) => {
  try {
    const nis = cleanText(req.body.nis);
    const nama = cleanText(req.body.nama);
    const { kelas_id } = req.body;

    // QR Code sekarang opsional.
    const qr_code = cleanText(req.body.qr_code) || null;

    if (!nis || !nama || !validId(kelas_id)) {
      return res.status(400).json({
        success: false,
        message: "NIS, nama, dan kelas wajib diisi.",
      });
    }

    if (
      nis.length > 30 ||
      nama.length > 100 ||
      (qr_code && qr_code.length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Panjang NIS, nama, atau QR Code melebihi batas.",
      });
    }

    // Cek NIS.
    const [existingNis] = await pool.execute(
      "SELECT id FROM students WHERE nis = ? LIMIT 1",
      [nis]
    );

    if (existingNis.length) {
      return res.status(409).json({
        success: false,
        message: "NIS sudah digunakan.",
      });
    }

    // Cek QR hanya bila disertakan.
    if (qr_code) {
      const [existingQr] = await pool.execute(
        "SELECT id FROM students WHERE qr_code = ? LIMIT 1",
        [qr_code]
      );

      if (existingQr.length) {
        return res.status(409).json({
          success: false,
          message: "QR Code sudah digunakan.",
        });
      }
    }

    // Cek kelas.
    const [classes] = await pool.execute(
      "SELECT id FROM classes WHERE id = ? LIMIT 1",
      [kelas_id]
    );

    if (!classes.length) {
      return res.status(400).json({
        success: false,
        message: "Kelas tidak ditemukan.",
      });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO students
        (nis, nama, kelas_id, qr_code)
      VALUES (?, ?, ?, ?)
      `,
      [nis, nama, kelas_id, qr_code]
    );

    return res.status(201).json({
      success: true,
      message: "Data siswa berhasil ditambahkan.",
      data: {
        id: result.insertId,
        nis,
        nama,
        kelas_id,
        qr_code,
        wajah_terdaftar: 0,
      },
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// ========================================
// PUT EDIT SISWA
// ========================================

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const nis = cleanText(req.body.nis);
    const nama = cleanText(req.body.nama);
    const { kelas_id } = req.body;

    if (!validId(id) || !nis || !nama || !validId(kelas_id)) {
      return res.status(400).json({
        success: false,
        message: "Data siswa tidak valid.",
      });
    }

    const qr_code = cleanText(req.body.qr_code) || null;

    if (
      nis.length > 30 ||
      nama.length > 100 ||
      (qr_code && qr_code.length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Panjang data siswa melebihi batas.",
      });
    }

    const [students] = await pool.execute(
      "SELECT id FROM students WHERE id = ? LIMIT 1",
      [id]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Data siswa tidak ditemukan.",
      });
    }

    const [existingNis] = await pool.execute(
      `
      SELECT id FROM students
      WHERE nis = ? AND id != ?
      LIMIT 1
      `,
      [nis, id]
    );

    if (existingNis.length) {
      return res.status(409).json({
        success: false,
        message: "NIS sudah digunakan.",
      });
    }

    if (qr_code) {
      const [existingQr] = await pool.execute(
        `
        SELECT id FROM students
        WHERE qr_code = ? AND id != ?
        LIMIT 1
        `,
        [qr_code, id]
      );

      if (existingQr.length) {
        return res.status(409).json({
          success: false,
          message: "QR Code sudah digunakan.",
        });
      }
    }

    const [classes] = await pool.execute(
      "SELECT id FROM classes WHERE id = ? LIMIT 1",
      [kelas_id]
    );

    if (!classes.length) {
      return res.status(400).json({
        success: false,
        message: "Kelas tidak ditemukan.",
      });
    }

    await pool.execute(
      `
      UPDATE students
      SET
        nis = ?,
        nama = ?,
        kelas_id = ?,
        qr_code = ?
      WHERE id = ?
      `,
      [nis, nama, kelas_id, qr_code, id]
    );

    return res.status(200).json({
      success: true,
      message: "Data siswa berhasil diperbarui.",
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// ========================================
// DELETE SISWA
// ========================================

const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID siswa tidak valid.",
      });
    }

    const [students] = await pool.execute(
      "SELECT id FROM students WHERE id = ? LIMIT 1",
      [id]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "Data siswa tidak ditemukan.",
      });
    }

    await pool.execute("DELETE FROM students WHERE id = ?", [id]);

    return res.status(200).json({
      success: true,
      message: "Data siswa berhasil dihapus.",
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// ========================================
// GET SISWA BERDASARKAN QR
// DIPERTAHANKAN UNTUK KOMPATIBILITAS
// ========================================

const getStudentByQrCode = async (req, res) => {
  try {
    const qr_code = cleanText(req.params.qr_code);

    if (!qr_code) {
      return res.status(400).json({
        success: false,
        message: "QR Code wajib diisi.",
      });
    }

    const [students] = await pool.execute(
      `
      SELECT
        s.id,
        s.nis,
        s.nama,
        s.kelas_id,
        c.nama_kelas,
        s.qr_code
      FROM students s
      INNER JOIN classes c
        ON s.kelas_id = c.id
      WHERE s.qr_code = ?
      LIMIT 1
      `,
      [qr_code]
    );

    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: "QR Code siswa tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Data siswa berhasil ditemukan.",
      data: students[0],
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};


 // ========================================
 // IMPORT DATA SISWA DARI EXCEL
 // ========================================

 const importStudents = async (req, res) => {
  try {
    const { rows } = req.body;

    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Data harus berisi 1 sampai 500 siswa.",
      });
    }

    const [classes] = await pool.execute(`
      SELECT id, nama_kelas
      FROM classes
    `);

    const classMap = new Map(
      classes.map((item) => [
        String(item.nama_kelas).trim().toLowerCase(),
        item.id,
      ])
    );

    const [existingStudents] = await pool.execute(`
      SELECT nis FROM students
    `);

    const knownNis = new Set(
      existingStudents.map((item) => String(item.nis))
    );

    const seenInFile = new Set();

    const results = {
      total: rows.length,
      berhasil: 0,
      duplikat: 0,
      gagal: 0,
      details: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      const nomorBaris =
        Number.isSafeInteger(row.row_number) &&
        row.row_number >= 2
          ? row.row_number
          : i + 2;

      const nis = String(row.nis ?? "").trim();
      const nama = String(row.nama ?? "").trim();
      const kelas = String(row.kelas ?? "").trim();

      const detail = {
        baris: nomorBaris,
        nis,
        nama,
        kelas,
      };

      if (
        !nis ||
        !nama ||
        !kelas ||
        nis.length > 30 ||
        nama.length > 100
      ) {
        results.gagal++;

        results.details.push({
          ...detail,
          status: "gagal",
          keterangan: "Data wajib kosong atau terlalu panjang.",
        });

        continue;
      }

      const kelasId = classMap.get(kelas.toLowerCase());

      if (!kelasId) {
        results.gagal++;

        results.details.push({
          ...detail,
          status: "gagal",
          keterangan: "Kelas tidak ditemukan di database.",
        });

        continue;
      }

      if (seenInFile.has(nis) || knownNis.has(nis)) {
        results.duplikat++;

        results.details.push({
          ...detail,
          status: "duplikat",
          keterangan: "NIS sudah terdaftar atau berulang dalam Excel.",
        });

        continue;
      }

      seenInFile.add(nis);

      try {
        await pool.execute(
          `
          INSERT INTO students
            (nis, nama, kelas_id, qr_code)
          VALUES (?, ?, ?, NULL)
          `,
          [nis, nama, kelasId]
        );

        knownNis.add(nis);
        results.berhasil++;

        results.details.push({
          ...detail,
          status: "berhasil",
          keterangan: "Siswa berhasil ditambahkan.",
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          knownNis.add(nis);
          results.duplikat++;

          results.details.push({
            ...detail,
            status: "duplikat",
            keterangan: "NIS sudah terdaftar.",
          });
        } else {
          console.error("Import student row:", error);
          results.gagal++;

          results.details.push({
            ...detail,
            status: "gagal",
            keterangan: "Gagal menyimpan siswa.",
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Proses import selesai.",
      data: results,
    });
  } catch (error) {
    console.error("Import students error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat import siswa.",
    });
  }
};


module.exports = {
  getStudents,
  getStudentById,
  getStudentByQrCode,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
};
