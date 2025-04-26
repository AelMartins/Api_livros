const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name FROM genres ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error("Erro ao buscar gêneros:", err.message);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar gêneros.' });
    }
});

module.exports = router;