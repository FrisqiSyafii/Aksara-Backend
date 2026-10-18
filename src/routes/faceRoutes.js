const express = require("express");

const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getFaceStatus,
  deleteFace,
  enrollFace,
  faceAttendance,
} = require("../controllers/faceController");


const router = express.Router();


// TEST
router.get(
  "/test",
  (req, res) => {
    res.json({
      success: true,
      message: "Face route aktif",
    });
  }
);


// STATUS WAJAH SISWA
router.get(
  "/students/:id/status",
  verifyToken,
  allowRoles("admin"),
  getFaceStatus
);


// DAFTAR WAJAH
router.post(
  "/students/:id/enroll",
  verifyToken,
  allowRoles("admin"),
  enrollFace
);


// HAPUS WAJAH
router.delete(
  "/students/:id",
  verifyToken,
  allowRoles("admin"),
  deleteFace
);


// ABSENSI WAJAH
router.post(
  "/attendance",
  verifyToken,
  allowRoles("admin", "guru"),
  faceAttendance
);


module.exports = router;