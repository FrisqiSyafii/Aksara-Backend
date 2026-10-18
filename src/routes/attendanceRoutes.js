const express = require("express");

const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getAttendances,
  getDailyAttendances,
  getAttendanceById,
  createAttendance,
  createManualAttendance,
  updateAttendance,
  deleteAttendance,
} = require("../controllers/attendanceController");

const router = express.Router();

// GET semua riwayat absensi
router.get(
  "/",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getAttendances
);

// POST scan QR otomatis
router.post(
  "/",
  verifyToken,
  allowRoles("admin", "guru"),
  createAttendance
);

// POST absensi manual
router.post(
  "/manual",
  verifyToken,
  allowRoles("admin"),
  createManualAttendance
);

// GET daftar absensi harian semua siswa
router.get(
  "/daily",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getDailyAttendances
);

// GET absensi berdasarkan ID
router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getAttendanceById
);

// UPDATE absensi
router.put(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  updateAttendance
);

// DELETE absensi
router.delete(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  deleteAttendance
);

module.exports = router;