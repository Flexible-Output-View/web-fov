import express from 'express';
const router = express.Router();

import categories from './categories.js';
import streams from './streams.js';
import users from './users.js';
import twitch from './twitch.js';
import auth from './auth.js';

router.use('/categories', categories);
router.use('/streams', streams);
router.use('/users', users);
router.use('/twitch', twitch);
router.use('/auth', auth);

router.get('/', (req, res) => res.json({ ok: true, api: true }));

export default router;