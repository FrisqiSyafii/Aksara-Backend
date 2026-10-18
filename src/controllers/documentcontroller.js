
const crypto = require("node:crypto");

const pool = require("../config/database");

const {
  getAttendanceReport,
} = require("./reportController");

// ========================================
// KONFIGURASI
// ========================================

const SCHOOL_NAME =
  process.env.SCHOOL_NAME ||
  "SMKS Al Kirom Seputih Mataram";

const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL ||
  "http://localhost:5173";

// ========================================
// HELPER
// ========================================

const hashSnapshot = (snapshot) => {
  return crypto
    .createHash("sha256")
    .update(snapshot, "utf8")
    .digest("hex");
};

const validDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const validId = (value) => {
  const text = String(value || "");

  return (
    /^[1-9]\d*$/.test(text) &&
    Number.isSafeInteger(Number(text))
  );
};

const getRole = (req) =>
  String(req.user?.role || "").toLowerCase();

const isAdmin = (req) =>
  getRole(req) === "admin";

const isPrincipal = (req) =>
  getRole(req) === "kepala_sekolah";

const getVerificationUrl = (token) =>
  `${PUBLIC_APP_URL.replace(/\/$/, "")}/verifikasi/${token}`;

const serverError = (res, error) => {
  console.error("Document controller error:", error);

  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada sistem dokumen.",
  });
};

// ========================================
// MENGGUNAKAN REPORT CONTROLLER YANG ADA
// ========================================

// Adapter sementara untuk memanggil controller laporan
// melalui antarmuka req/res yang telah digunakan AKSARA.
// Ini menjaga seluruh perhitungan laporan tetap sama.
//
// Ke depan, lebih ideal memindahkan perhitungan laporan
// menjadi service bersama.

const buildReportFromServer = async (user, params) => {
  let capturedStatus = 200;
  let capturedBody = null;

  const fakeReq = {
    query: {
      type: params.type,
      start_date: params.start_date,
      end_date: params.end_date,
      class_id: params.class_id || "",
    },
    user,
  };

  const fakeRes = {
    status(code) {
      capturedStatus = code;
      return this;
    },
    json(body) {
      capturedBody = body;
      return this;
    },
  };

  await getAttendanceReport(fakeReq, fakeRes);

  if (
    capturedStatus !== 200 ||
    !capturedBody?.success ||
    !capturedBody?.data
  ) {
    const error = new Error(
      capturedBody?.message ||
      "Laporan tidak dapat dibuat."
    );

    error.statusCode = capturedStatus;
    throw error;
  }

  return capturedBody.data;
};

// ========================================
// ADMIN: AJUKAN LAPORAN
// POST /api/documents
// ========================================

const createDocument = async (req, res) => {
  try {
    const {
      type,
      start_date,
      end_date,
      class_id,
    } = req.body || {};

    if (!["harian", "mapel"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Jenis laporan tidak valid.",
      });
    }

    if (
      !validDate(start_date) ||
      !validDate(end_date) ||
      end_date < start_date
    ) {
      return res.status(400).json({
        success: false,
        message: "Rentang tanggal tidak valid.",
      });
    }

    const diff = Math.round(
      (
        Date.parse(`${end_date}T00:00:00Z`) -
        Date.parse(`${start_date}T00:00:00Z`)
      ) / 86400000
    );

    if (diff > 366) {
      return res.status(400).json({
        success: false,
        message: "Rentang laporan maksimal 367 hari.",
      });
    }

    const normalizedClassId =
      class_id === null ||
      class_id === undefined ||
      class_id === "" ||
      class_id === "semua"
        ? null
        : class_id;

    if (
      normalizedClassId !== null &&
      (
        !validId(normalizedClassId) ||
        Number(normalizedClassId) > 2147483647
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "ID kelas tidak valid.",
      });
    }

    // Data laporan diambil langsung dari database,
    // bukan menerima rekap buatan dari frontend.
    const report = await buildReportFromServer(
      req.user,
      {
        type,
        start_date,
        end_date,
        class_id: normalizedClassId,
      }
    );

    if (
      !Array.isArray(report.classes) ||
      !Array.isArray(report.classRecap) ||
      !Array.isArray(report.studentRecap) ||
      !report.summary
    ) {
      throw new Error("Struktur laporan tidak valid.");
    }

    let className = "Semua Kelas";

    if (normalizedClassId !== null) {
      const selectedClass = report.classes.find(
        (item) =>
          String(item.id) === String(normalizedClassId)
      );

      if (!selectedClass) {
        return res.status(400).json({
          success: false,
          message: "Kelas tidak ditemukan.",
        });
      }

      className = selectedClass.nama_kelas;
    }

    const documentNumber =
      `ALK-${Date.now()}-` +
      crypto.randomBytes(5)
        .toString("hex")
        .toUpperCase();

    const verificationToken =
      crypto.randomBytes(32).toString("hex");

    // Snapshot tidak boleh berubah setelah diajukan.
    const snapshot = JSON.stringify({
      document_number: documentNumber,
      school_name: SCHOOL_NAME,
      document_type: type,
      period_start: start_date,
      period_end: end_date,
      class_id: normalizedClassId,
      class_name: className,
      report,
    });

    const snapshotBytes =
      Buffer.byteLength(snapshot, "utf8");

    if (snapshotBytes > 8 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: "Ukuran laporan terlalu besar.",
      });
    }

    const documentHash = hashSnapshot(snapshot);

    await pool.execute(
      `
      INSERT INTO verified_documents (
        document_number,
        verification_token,
        document_type,
        period_start,
        period_end,
        class_id,
        class_name,
        school_name,
        report_snapshot,
        document_hash,
        status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `,
      [
        documentNumber,
        verificationToken,
        type,
        start_date,
        end_date,
        normalizedClassId,
        className,
        SCHOOL_NAME,
        snapshot,
        documentHash,
        req.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        "Laporan berhasil diajukan kepada Kepala Sekolah.",
      data: {
        document_number: documentNumber,
        status: "pending",
      },
    });
  } catch (error) {
    if (
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return serverError(res, error);
  }
};

// ========================================
// DAFTAR DOKUMEN
// GET /api/documents
// ========================================

const getDocuments = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const principal = isPrincipal(req);

    if (!admin && !principal) {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak.",
      });
    }

    const [rows] = admin
      ? await pool.execute(
          `
          SELECT
            id,
            document_number,
            document_type,
            period_start,
            period_end,
            class_name,
            school_name,
            status,
            created_by,
            created_at,
            approved_at,
            review_note
          FROM verified_documents
          WHERE created_by = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 100
          `,
          [req.user.id]
        )
      : await pool.execute(
          `
          SELECT
            id,
            document_number,
            document_type,
            period_start,
            period_end,
            class_name,
            school_name,
            status,
            created_by,
            created_at,
            approved_at,
            review_note
          FROM verified_documents
          ORDER BY created_at DESC, id DESC
          LIMIT 100
          `
        );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ========================================
// DETAIL LAPORAN / PREVIEW
// GET /api/documents/:id
// ========================================

const getDocumentById = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID dokumen tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM verified_documents
      WHERE id = ?
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan.",
      });
    }

    const doc = rows[0];

    if (
      !isPrincipal(req) &&
      !(isAdmin(req) &&
        Number(doc.created_by) === Number(req.user.id))
    ) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak berhak melihat dokumen ini.",
      });
    }

    const integrityValid =
      hashSnapshot(doc.report_snapshot) ===
      doc.document_hash;

    if (!integrityValid) {
      return res.status(409).json({
        success: false,
        message:
          "Integritas dokumen tidak valid. " +
          "Dokumen tidak boleh disahkan.",
      });
    }

    let snapshot;

    try {
      snapshot = JSON.parse(doc.report_snapshot);
    } catch {
      return res.status(409).json({
        success: false,
        message: "Snapshot dokumen tidak dapat dibaca.",
      });
    }

    return res.json({
      success: true,
      data: {
        id: doc.id,
        document_number: doc.document_number,
        document_type: doc.document_type,
        period_start: doc.period_start,
        period_end: doc.period_end,
        class_name: doc.class_name,
        school_name: doc.school_name,
        status: doc.status,
        created_by: doc.created_by,
        created_at: doc.created_at,
        approved_by: doc.approved_by,
        approved_by_name: doc.approved_by_name,
        approved_at: doc.approved_at,
        review_note: doc.review_note,
        integrity_valid: true,
        verification_url:
          doc.status === "approved"
            ? getVerificationUrl(doc.verification_token)
            : null,
        snapshot,
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ========================================
// KEPALA SEKOLAH: SETUJUI
// POST /api/documents/:id/approve
// ========================================

const approveDocument = async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "ID dokumen tidak valid.",
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Kunci dokumen agar tidak diproses bersamaan.
    const [rows] = await connection.execute(
      `
      SELECT *
      FROM verified_documents
      WHERE id = ?
      FOR UPDATE
      `,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan.",
      });
    }

    const [principals] = await connection.execute(
        `
        SELECT id, nama
        FROM users
        WHERE id = ?
          AND role = 'kepala_sekolah'
        LIMIT 1
        `,
        [req.user.id]
      );
      
      if (!principals.length) {
        await connection.rollback();
      
        return res.status(403).json({
          success: false,
          message: "Akun tidak memiliki kewenangan Kepala Sekolah.",
        });
      }
      
      const principal = principals[0];
      
      await connection.execute(
        `
        UPDATE verified_documents
        SET
          status = 'approved',
          approved_by = ?,
          approved_by_name = ?,
          approved_at = NOW(),
          review_note = NULL
        WHERE id = ?
          AND status = 'pending'
        `,
        [principal.id, principal.nama, doc.id]
      );

    const doc = rows[0];

    if (doc.status !== "pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Dokumen sudah diproses sebelumnya.",
      });
    }

    if (
      Number(doc.created_by) === Number(req.user.id)
    ) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message:
          "Pengaju tidak boleh mengesahkan " +
          "dokumennya sendiri.",
      });
    }

    const integrityValid =
      hashSnapshot(doc.report_snapshot) ===
      doc.document_hash;

    if (!integrityValid) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Integritas dokumen gagal diverifikasi.",
      });
    }

    let snapshot;

    try {
      snapshot = JSON.parse(doc.report_snapshot);
    } catch {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Snapshot dokumen tidak dapat dibaca.",
      });
    }

    if (
      !snapshot?.report ||
      !Array.isArray(snapshot.report.studentRecap) ||
      !Array.isArray(snapshot.report.classRecap)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Isi snapshot laporan tidak valid.",
      });
    }

    await connection.execute(
      `
      UPDATE verified_documents
      SET
        status = 'approved',
        approved_by = ?,
        approved_at = NOW(),
        review_note = NULL
      WHERE id = ?
        AND status = 'pending'
      `,
      [req.user.id, doc.id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Laporan berhasil disahkan.",
      data: {
        document_number: doc.document_number,
        status: "approved",
        verification_url: getVerificationUrl(
          doc.verification_token
        ),
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }
    }

    return serverError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

// ========================================
// KEPALA SEKOLAH: TOLAK
// POST /api/documents/:id/reject
// ========================================

const rejectDocument = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ID dokumen tidak valid.",
      });
    }

    const note = String(req.body?.note || "").trim();

    if (!note || note.length > 1000) {
      return res.status(400).json({
        success: false,
        message:
          "Alasan penolakan wajib diisi " +
          "dan maksimal 1000 karakter.",
      });
    }

    const [result] = await pool.execute(
      `
      UPDATE verified_documents
      SET
        status = 'rejected',
        rejected_by = ?,
        rejected_at = NOW(),
        review_note = ?
      WHERE id = ?
        AND status = 'pending'
        AND created_by <> ?
      `,
      [
        req.user.id,
        note,
        req.params.id,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Dokumen tidak ditemukan " +
          "atau sudah diproses.",
      });
    }

    return res.json({
      success: true,
      message: "Laporan berhasil ditolak.",
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ========================================
// PUBLIK: VERIFIKASI QR
// GET /api/documents/verify/:token
// ========================================

const verifyDocument = async (req, res) => {
  try {
    const { token } = req.params;

    if (!/^[a-f0-9]{64}$/.test(token)) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        document_number,
        document_type,
        period_start,
        period_end,
        class_name,
        school_name,
        status,
        approved_at,
        report_snapshot,
        document_hash
      FROM verified_documents
      WHERE verification_token = ?
      LIMIT 1
      `,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Dokumen tidak ditemukan.",
      });
    }

    const doc = rows[0];

    const integrityValid =
      hashSnapshot(doc.report_snapshot) ===
      doc.document_hash;

    return res.json({
      success: true,
      data: {
        document_number: doc.document_number,
        document_type: doc.document_type,
        period_start: doc.period_start,
        period_end: doc.period_end,
        class_name: doc.class_name,
        school_name: doc.school_name,
        status: integrityValid
          ? doc.status
          : "invalid",
        integrity_valid: integrityValid,
        approved_at:
          integrityValid && doc.status === "approved"
            ? doc.approved_at
            : null,
      },
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  createDocument,
  getDocuments,
  getDocumentById,
  approveDocument,
  rejectDocument,
  verifyDocument,
};
