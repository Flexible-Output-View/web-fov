const express = require('express');
const router = express.Router();
const db = require('../db');

//GET /api/users/:id -> fetch a user
router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, username, display_name, created_at FROM users WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    const { username, display_name } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    try {
        const result = await db.query('INSERT INTO users (username, display_name, created_at) VALUES (?, ?, NOW())', [username, display_name || null]);
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
