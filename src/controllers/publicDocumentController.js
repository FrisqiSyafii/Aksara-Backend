
const crypto = require("crypto");

// Sesuaikan path jika koneksi MySQL AKSARA berbeda.
const pool = require("../config/database");

const {
  getAttendanceReport,
} = require("./reportController");

const SCHOOL_NAME =
  process.env.SCHOOL_NAME ||
  "SMKS Al Kirom Seputih Mataram";

const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL ||
  "http://localhost:5173"
).replace(/\/+$/, "");

const hashSnapshot = (snapshot) =>
  crypto
    .createHash("sha256")
    .update(snapshot, "utf8")
    .digest("hex");

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const getPrincipalName = async () => {
  const [rows] = await pool.execute(
    "SELECT * FROM settings LIMIT 1"
  );

  const settings = rows[0] || {};

  return String(
    settings.namaKepalaSekolah ??
      settings.nama_kepala_sekolah ??
      ""
  ).trim();
};

// Mengambil laporan dari fungsi backend AKSARA.
// Tidak menerima snapshot buatan browser.
const buildReport = async (req, filters) => {
  let captured = null;
  let httpStatus = 200;

  const fakeReq = {
    ...req,
    query: filters,
  };

  const fakeRes = {
    status(code) {
      httpStatus = code;
      return this;
    },

    json(body) {
      captured = body;
      return this;
    },
  };

  await getAttendanceReport(fakeReq, fakeRes);

  if (
    httpStatus >= 400 ||
    !captured?.success ||
    !captured?.data
  ) {
    const error = new Error(
      captured?.message ||
        "Tidak dapat membuat snapshot laporan."
    );

    error.statusCode = httpStatus >= 400 ? httpStatus : 500;
    throw error;
  }

  const report = captured.data;

  if (
    !Array.isArray(report.classRecap) ||
    !Array.isArray(report.studentRecap) ||
    !report.summary
  ) {
    throw new Error("Struktur laporan tidak valid.");
  }

  return report;
};

// ========================================
// POST /api/public-documents
// ADMIN SAJA
// ========================================

const issueDocument = async (req, res) => {
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
      start_date > end_date
    ) {
      return res.status(400).json({
        success: false,
        message: "Rentang tanggal tidak valid.",
      });
    }

    const startMs = Date.parse(`${start_date}T00:00:00Z`);
    const endMs = Date.parse(`${end_date}T00:00:00Z`);

    if ((endMs - startMs) / 86400000 > 366) {
      return res.status(400).json({
        success: false,
        message: "Periode maksimal 366 hari.",
      });
    }

    let selectedClassId = null;

    if (
      class_id !== null &&
      class_id !== undefined &&
      class_id !== "" &&
      class_id !== "semua"
    ) {
      const number = Number(class_id);

      if (!Number.isSafeInteger(number) || number <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID kelas tidak valid.",
        });
      }

      selectedClassId = number;
    }

    const filters = {
      type,
      start_date,
      end_date,
    };

    if (selectedClassId !== null) {
      filters.class_id = String(selectedClassId);
    }

    const report = await buildReport(req, filters);

    let className = "Semua Kelas";

    if (selectedClassId !== null) {
      const selected = (report.classes || []).find(
        (kelas) =>
          Number(kelas.id) === selectedClassId
      );

      if (!selected) {
        return res.status(400).json({
          success: false,
          message: "Kelas tidak ditemukan pada laporan.",
        });
      }

      className = selected.nama_kelas;
    }

    const schoolName = SCHOOL_NAME;
    const principalName = await getPrincipalName();

    const snapshotObject = {
      application: "AKSARA",
      school_name: schoolName,
      principal_name: principalName,
      document_type: type,
      period_start: start_date,
      period_end: end_date,
      class_id: selectedClassId,
      class_name: className,
      report,
    };

    const snapshot = JSON.stringify(snapshotObject);
    const documentHash = hashSnapshot(snapshot);

    const token = crypto
      .randomBytes(32)
      .toString("hex");

    const documentNumber =
      `AKS-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;

    const [result] = await pool.execute(
      `
      INSERT INTO public_documents (
        document_number,
        verification_token,
        document_type,
        period_start,
        period_end,
        class_id,
        class_name,
        school_name,
        principal_name,
        report_snapshot,
        document_hash,
        status,
        issued_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?)
      `,
      [
        documentNumber,
        token,
        type,
        start_date,
        end_date,
        selectedClassId,
        className,
        schoolName,
        principalName || null,
        snapshot,
        documentHash,
        req.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Dokumen berhasil diterbitkan.",
      data: {
        id: result.insertId,
        document_number: documentNumber,
        status: "registered",
        verification_url:
          `${PUBLIC_APP_URL}/verifikasi/${token}`,
      },
    });
  } catch (error) {
    console.error("Issue document error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : "Gagal menerbitkan dokumen.",
    });
  }
};

// ========================================
// GET /api/public-documents/verify/:token
// PUBLIK TANPA LOGIN
// ========================================

const verifyDocument = async (req, res) => {
  try {
    const { token } = req.params;

    if (!/^[a-f0-9]{64}$/.test(token || "")) {
      return res.status(400).json({
        success: false,
        message: "Kode verifikasi tidak valid.",
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
        principal_name,
        report_snapshot,
        document_hash,
        status,
        issued_at
      FROM public_documents
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

    // Jangan pernah mengirim snapshot berisi data siswa
    // melalui endpoint publik.
    return res.json({
      success: true,
      data: {
        document_number: doc.document_number,
        document_type: doc.document_type,
        period_start: doc.period_start,
        period_end: doc.period_end,
        class_name: doc.class_name,
        school_name: doc.school_name,
        principal_name: doc.principal_name,
        issued_at: doc.issued_at,
        status: doc.status,
        integrity_valid: integrityValid,
      },
    });
  } catch (error) {
    console.error("Verify document error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memverifikasi dokumen.",
    });
  }
};

// ========================================
// GET /api/public-documents/:id
// ADMIN SAJA - DETAIL SNAPSHOT
// ========================================

const getDocumentById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID dokumen tidak valid.",
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM public_documents
      WHERE id = ?
      LIMIT 1
      `,
      [id]
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

    if (!integrityValid) {
      return res.status(409).json({
        success: false,
        message: "Integritas snapshot dokumen tidak valid.",
      });
    }

    const snapshot = JSON.parse(doc.report_snapshot);

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
        principal_name: doc.principal_name,
        status: doc.status,
        issued_at: doc.issued_at,
        integrity_valid: integrityValid,
        snapshot,
        verification_url:
          `${PUBLIC_APP_URL}/verifikasi/` +
          doc.verification_token,
      },
    });
  } catch (error) {
    console.error("Document detail error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail dokumen.",
    });
  }
};

module.exports = {
  issueDocument,
  verifyDocument,
  getDocumentById,
};
