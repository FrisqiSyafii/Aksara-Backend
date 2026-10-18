const express = require("express");

const verifyToken = require("../middleware/authMiddleware");

const allowRoles = require("../middleware/roleMiddleware");

const { getAttendanceReport } = require("../controllers/reportController");

const router = express.Router();

router.get(
  "/attendance",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getAttendanceReport
);

module.exports = router;
