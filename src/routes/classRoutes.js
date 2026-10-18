const express = require('express')

const verifyToken = require('../middleware/authMiddleware')
const allowRoles = require('../middleware/roleMiddleware')

const {
  getClasses,
} = require('../controllers/classController')

const router = express.Router()

router.get(
  '/',
  verifyToken,
  allowRoles('admin'),
  getClasses,
)

module.exports = router