const express = require("express");

const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getStudents,
  getStudentById,
  getStudentByQrCode,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
} = require("../controllers/studentController");

const router = express.Router();

// ========================================
// GET SEMUA SISWA
// ========================================

router.get("/", verifyToken, allowRoles("admin"), getStudents);

// ========================================
// GET SISWA BERDASARKAN QR CODE
// ========================================

router.get(
  "/qr/:qr_code",
  verifyToken,
  allowRoles("admin", "guru"),
  getStudentByQrCode
);

// ========================================
// GET SISWA BERDASARKAN ID
// ========================================

router.get("/:id", verifyToken, allowRoles("admin"), getStudentById);

// ========================================
// TAMBAH SISWA
// ========================================

router.post("/", verifyToken, allowRoles("admin"), createStudent);

// ========================================
// UPDATE SISWA
// ========================================

router.put("/:id", verifyToken, allowRoles("admin"), updateStudent);

// IMPORT SISWA DARI EXCEL
router.post("/import", verifyToken, allowRoles("admin"), importStudents);

// ========================================
// DELETE SISWA
// ========================================

router.delete("/:id", verifyToken, allowRoles("admin"), deleteStudent);

module.exports = router;