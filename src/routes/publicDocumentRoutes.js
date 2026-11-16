
const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  issueDocument,
  verifyDocument,
  getDocumentById,
} = require("../controllers/publicDocumentController");

// PUBLIK - Tidak membutuhkan login.
// Letakkan sebelum route /:id.
router.get("/verify/:token", verifyDocument);

// ADMIN - Menerbitkan dokumen.
router.post(
  "/",
  verifyToken,
  allowRoles("admin"),
  issueDocument
);

// ADMIN - Mengambil snapshot dokumen terbitan.
router.get(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  getDocumentById
);

module.exports = router;
