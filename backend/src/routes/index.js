const express = require('express');
const router = express.Router();

const categories = require('./categories');
const streams = require('./streams');
const users = require('./users');

router.use('/categories', categories);
router.use('/streams', streams);
router.use('/users', users);

router.get('/', (req, res) => res.json({ ok: true, api: true }));

module.exports = router;
