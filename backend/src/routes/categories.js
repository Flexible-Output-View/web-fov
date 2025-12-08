const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/categories -> list categories
router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, name, viewers, image_url FROM categories ORDER BY viewers DESC');
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, name, viewers, image_url FROM categories WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Categorie not found' });
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
