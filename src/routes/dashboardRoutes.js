const express = require("express");

const verifyToken = require("../middleware/authMiddleware");

const allowRoles = require("../middleware/roleMiddleware");

const { getDashboard } = require("../controllers/dashboardController");

const router = express.Router();

router.get(
  "/",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getDashboard
);

module.exports = router;
