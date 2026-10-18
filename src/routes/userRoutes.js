const express = require("express");

const verifyToken = require("../middleware/authMiddleware");

const allowRoles = require("../middleware/roleMiddleware");

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getTeachers,
  updateProfile
 
 } = require('../controllers/userController')

const router = express.Router();

// ========================================
// UPDATE PROFILE
// Guru bisa edit diri sendiri
// Admin bisa edit semua
// ========================================

router.put(
  "/profile/:id",

  verifyToken,

  allowRoles("admin", "guru", "kepala_sekolah"),

  updateProfile
);

// ========================================
// CRUD USER ADMIN
// ========================================

router.get(
  "/",

  verifyToken,

  allowRoles("admin"),

  getUsers
);

router.get(
  "/:id",

  verifyToken,

  allowRoles("admin"),

  getUserById
);

router.post(
  "/",

  verifyToken,

  allowRoles("admin"),

  createUser
);

router.put(
  "/:id",

  verifyToken,

  allowRoles("admin"),

  updateUser
);

router.delete(
  "/:id",

  verifyToken,

  allowRoles("admin"),

  deleteUser
);

router.get(
  '/teachers',
  verifyToken,
  allowRoles('admin'),
  getTeachers
 )

module.exports = router;
