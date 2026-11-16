
const express = require('express');

const verifyToken = require('../middleware/authMiddleware');
const allowRoles = require('../middleware/roleMiddleware');

const {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
} = require('../controllers/subjectController');

const router = express.Router();

// GET semua mata pelajaran
router.get(
  '/',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getSubjects
);

// POST tambah mata pelajaran
router.post(
  '/',
  verifyToken,
  allowRoles('admin'),
  createSubject
);

// PUT edit mata pelajaran
router.put(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  updateSubject
);

// DELETE hapus mata pelajaran
router.delete(
  '/:id',
  verifyToken,
  allowRoles('admin'),
  deleteSubject
);

module.exports = router;
