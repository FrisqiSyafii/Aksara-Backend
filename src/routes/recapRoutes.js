const express = require("express");
const verifyToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const { getRecap } = require("../controllers/recapController");
const router = express.Router();

router.get("/", verifyToken, allowRoles("admin", "guru", "kepala_sekolah"), getRecap);

module.exports = router;
