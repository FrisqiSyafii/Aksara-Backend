// routes/settingsRoutes.js

const express = require("express");

const verifyToken = require("../middleware/authMiddleware");

const allowRoles = require("../middleware/roleMiddleware");

const {
  getSettings,
  updateSettings,
} = require("../controllers/settingsController");

const router = express.Router();

router.get(
  "/",
  verifyToken,
  allowRoles("admin", "guru", "kepala_sekolah"),
  getSettings
);

router.put("/", verifyToken, allowRoles("admin"), updateSettings);

module.exports = router;
