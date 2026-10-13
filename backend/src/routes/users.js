import express from 'express';
const router = express.Router();
import db from '../db.js';

//GET /api/users/:id -> fetch a user
router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, username, display_name, created_at FROM users WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ data: rows[0] });
    } catch (err) {
        next(err);
    }
});

export default router;
