const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');

router.get('/', requirePermission('AUDIT_VIEW'), (req, res) => {
  const logs = [...db.auditLogs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200);
  res.json(logs);
});

module.exports = router;
