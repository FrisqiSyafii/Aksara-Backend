const pool = require("../config/database");

const DEFAULT_SETTINGS = {
  namaSekolah: "SMKS Al Kirom Seputih Mataram",
  alamatSekolah: "Seputih Mataram, Lampung Tengah",
  namaKepalaSekolah: "",
  nipKepalaSekolah: "",
  jamMasuk: "07:00",
  batasTerlambat: 15,
  scannerOtomatis: true,
  suaraScan: true,
};

const formatSettings = (row) => ({
  namaSekolah: row.nama_sekolah,
  alamatSekolah: row.alamat_sekolah || "",
  namaKepalaSekolah: row.nama_kepala_sekolah || "",
  nipKepalaSekolah: row.nip_kepala_sekolah || "",
  jamMasuk: String(row.jam_masuk).slice(0, 5),
  batasTerlambat: Number(row.batas_terlambat),
  scannerOtomatis: Boolean(row.scanner_otomatis),
  suaraScan: Boolean(row.suara_scan),
});

// ========================================
// GET SETTINGS
// ========================================

const getSettings = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM settings ORDER BY id ASC LIMIT 1"
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: DEFAULT_SETTINGS,
      });
    }

    return res.json({
      success: true,
      data: formatSettings(rows[0]),
    });
  } catch (error) {
    console.error("Get settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil pengaturan.",
    });
  }
};

// ========================================
// UPDATE SETTINGS
// ========================================

const updateSettings = async (req, res) => {
  try {
    const {
      namaSekolah,
      alamatSekolah,
      namaKepalaSekolah,
      nipKepalaSekolah,
      jamMasuk,
      batasTerlambat,
      scannerOtomatis,
      suaraScan,
    } = req.body;

    const nama = String(namaSekolah ?? "").trim();
    const alamat = String(alamatSekolah ?? "").trim();
    const kepala = String(namaKepalaSekolah ?? "").trim();
    const nip = String(nipKepalaSekolah ?? "").trim();
    const batas = Number(batasTerlambat);

    if (!nama || nama.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Nama sekolah wajib diisi (maksimal 150 karakter).",
      });
    }

    if (kepala.length > 150 || nip.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Nama kepala sekolah atau NIP terlalu panjang.",
      });
    }

    if (
      typeof jamMasuk !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(jamMasuk)
    ) {
      return res.status(400).json({
        success: false,
        message: "Jam masuk harus berformat HH:mm.",
      });
    }

    if (!Number.isInteger(batas) || batas < 0 || batas > 1440) {
      return res.status(400).json({
        success: false,
        message: "Batas terlambat harus antara 0–1440 menit.",
      });
    }

    if (
      typeof scannerOtomatis !== "boolean" ||
      typeof suaraScan !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Pengaturan scanner tidak valid.",
      });
    }

    const values = [
      nama,
      alamat,
      kepala,
      nip,
      `${jamMasuk}:00`,
      batas,
      scannerOtomatis ? 1 : 0,
      suaraScan ? 1 : 0,
    ];

    const [rows] = await pool.execute(
      "SELECT id FROM settings ORDER BY id ASC LIMIT 1"
    );

    if (rows.length) {
      await pool.execute(
        `
        UPDATE settings
        SET
          nama_sekolah = ?,
          alamat_sekolah = ?,
          nama_kepala_sekolah = ?,
          nip_kepala_sekolah = ?,
          jam_masuk = ?,
          batas_terlambat = ?,
          scanner_otomatis = ?,
          suara_scan = ?
        WHERE id = ?
        `,
        [...values, rows[0].id]
      );
    } else {
      await pool.execute(
        `
        INSERT INTO settings (
          nama_sekolah,
          alamat_sekolah,
          nama_kepala_sekolah,
          nip_kepala_sekolah,
          jam_masuk,
          batas_terlambat,
          scanner_otomatis,
          suara_scan
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        values
      );
    }

    const [updatedRows] = await pool.execute(
      "SELECT * FROM settings ORDER BY id ASC LIMIT 1"
    );

    return res.json({
      success: true,
      message: "Pengaturan berhasil disimpan.",
      data: formatSettings(updatedRows[0]),
    });
  } catch (error) {
    console.error("Update settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan pengaturan.",
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
