const express = require('express')

const verifyToken = require(
  '../middleware/authMiddleware'
)

const allowRoles = require(
  '../middleware/roleMiddleware'
)

const {
  getSubjects,
} = require(
  '../controllers/subjectController'
)

const router = express.Router()

router.get(
  '/',
  verifyToken,
  allowRoles('admin', 'guru', 'kepala_sekolah'),
  getSubjects
)

module.exports = router