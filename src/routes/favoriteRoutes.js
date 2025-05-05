const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware'); 
const { param, validationResult } = require('express-validator');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const favBooksQuery = `
            SELECT
                b.id, b.title, b.authors, b.image, b.price,
                b.average_score, b.reviews_count,
                TRUE as is_favorite -- Adiciona flag indicando que é favorito
            FROM books b
            JOIN user_favorite_books ufb ON b.id = ufb.book_id
            WHERE ufb.user_id = $1
            ORDER BY ufb.added_at DESC; -- Ordena por mais recente adicionado
        `;
        const favBooksResult = await db.query(favBooksQuery, [userId]);

        const formattedResults = favBooksResult.rows.map(book => ({
            ...book,
            price: parseFloat(book.price) || null
        }));

        res.json(formattedResults); 

    } catch (err) {
        console.error(`Erro ao buscar favoritos para user ${userId}:`, err.message);
        res.status(500).json({ errors: [{ msg: 'Erro interno ao buscar favoritos.' }] });
    }
});


router.post(
    '/:bookId',
    authMiddleware,
    [ param('bookId', 'ID do livro inválido').isInt({ gt: 0 }) ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        const bookId = parseInt(req.params.bookId, 10);

        try {
             const bookCheck = await db.query('SELECT id FROM books WHERE id = $1', [bookId]);
             if (bookCheck.rows.length === 0) {
                return res.status(404).json({ errors: [{ msg: 'Livro não encontrado para favoritar.' }] });
             }

            const insertQuery = `
                INSERT INTO user_favorite_books (user_id, book_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, book_id) DO NOTHING;
            `;
            await db.query(insertQuery, [userId, bookId]);

            res.status(201).json({ msg: 'Livro adicionado aos favoritos.' }); 

        } catch (err) {
            console.error(`Erro ao adicionar favorito ${bookId} para user ${userId}:`, err.message);
            res.status(500).json({ errors: [{ msg: 'Erro interno ao adicionar favorito.' }] });
        }
    }
);

router.delete(
    '/:bookId',
    authMiddleware,
    [ param('bookId', 'ID do livro inválido').isInt({ gt: 0 }) ],
    async (req, res) => {
         const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        const bookId = parseInt(req.params.bookId, 10);

        try {
            const deleteQuery = 'DELETE FROM user_favorite_books WHERE user_id = $1 AND book_id = $2;';
            const result = await db.query(deleteQuery, [userId, bookId]);

            if (result.rowCount > 0) {
                res.status(200).json({ msg: 'Livro removido dos favoritos.' });
            } else {
                res.status(404).json({ msg: 'Livro não encontrado nos favoritos para remover.' });
            }

        } catch (err) {
             console.error(`Erro ao remover favorito ${bookId} para user ${userId}:`, err.message);
             res.status(500).json({ errors: [{ msg: 'Erro interno ao remover favorito.' }] });
        }
    }
);


module.exports = router;