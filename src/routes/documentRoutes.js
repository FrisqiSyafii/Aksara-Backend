
const express = require("express");

const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createDocument,
  getDocuments,
  getDocumentById,
  approveDocument,
  rejectDocument,
  verifyDocument,
} = require("../controllers/documentController");

const router = express.Router();

// Verifikasi publik
router.get("/verify/:token", verifyDocument);

// Admin mengajukan laporan
router.post(
  "/",
  verifyToken,
  allowRoles("admin"),
  createDocument
);

// Daftar dokumen
router.get(
  "/",
  verifyToken,
  allowRoles("admin", "kepala_sekolah"),
  getDocuments
);

// Detail dan preview
router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "kepala_sekolah"),
  getDocumentById
);

// Persetujuan
router.post(
  "/:id/approve",
  verifyToken,
  allowRoles("kepala_sekolah"),
  approveDocument
);

// Penolakan
router.post(
  "/:id/reject",
  verifyToken,
  allowRoles("kepala_sekolah"),
  rejectDocument
);

module.exports = router;
