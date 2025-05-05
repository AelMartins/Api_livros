const express = require('express');
const db = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware'); 
const { body, param, validationResult } = require('express-validator');

const router = express.Router();


const fetchAndFormatCart = async (userId) => {
    const cartQuery = `
        SELECT
            ci.book_id AS id,
            ci.quantity,
            b.title,
            b.price,
            b.image
        FROM cart_items ci
        JOIN books b ON ci.book_id = b.id
        WHERE ci.user_id = $1
        ORDER BY ci.added_at ASC;
    `;
    const cartResult = await db.query(cartQuery, [userId]);
    const formattedCart = cartResult.rows.map(item => ({
        id: item.id,
        quantity: item.quantity,
        title: item.title,
        price: parseFloat(item.price) || 0,
        image: item.image
    }));
    return formattedCart;
};


router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const formattedCart = await fetchAndFormatCart(userId); 
        res.json(formattedCart);
    } catch (err) {
        console.error(`Erro ao buscar carrinho para user ${userId}:`, err.message);
        res.status(500).json({ errors: [{ msg: 'Erro interno ao buscar carrinho.' }] });
    }
});


router.post(
    '/',
    authMiddleware,
    [
        body('bookId', 'ID do livro inválido').isInt({ gt: 0 }),
        body('quantity', 'Quantidade inválida').optional().isInt({ gt: 0 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        const { bookId } = req.body;
        const quantityToAdd = req.body.quantity || 1; 

        try {
             const bookCheck = await db.query('SELECT id FROM books WHERE id = $1', [bookId]);
             if (bookCheck.rows.length === 0) {
                return res.status(404).json({ errors: [{ msg: 'Livro não encontrado.' }] });
             }

            const upsertQuery = `
                INSERT INTO cart_items (user_id, book_id, quantity)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, book_id) DO UPDATE SET
                    quantity = cart_items.quantity + EXCLUDED.quantity,
                    updated_at = NOW()
                RETURNING book_id, quantity;
            `;
            await db.query(upsertQuery, [userId, bookId, quantityToAdd]);

            const formattedCart = await fetchAndFormatCart(userId); 
            res.status(200).json(formattedCart);

        } catch (err) {
            console.error(`Erro ao adicionar/atualizar item ${bookId} para user ${userId}:`, err.message);
            res.status(500).json({ errors: [{ msg: 'Erro interno ao modificar carrinho.' }] });
        }
    }
);

router.put(
    '/:bookId',
    authMiddleware,
    [
        param('bookId', 'ID do livro inválido na URL').isInt({ gt: 0 }),
        body('quantity', 'Quantidade inválida').isInt({ gt: 0 })
    ],
     async (req, res) => {
         const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        const bookId = parseInt(req.params.bookId, 10);
        const { quantity } = req.body;

         try {
             const updateQuery = `
                UPDATE cart_items
                SET quantity = $1, updated_at = NOW()
                WHERE user_id = $2 AND book_id = $3
                RETURNING book_id;
             `;
             const result = await db.query(updateQuery, [quantity, userId, bookId]);

             if (result.rowCount === 0) {
                 return res.status(404).json({ errors: [{ msg: 'Item não encontrado no carrinho.' }] });
             }

             const formattedCart = await fetchAndFormatCart(userId); 
             res.status(200).json(formattedCart);

         } catch (err) {
             console.error(`Erro ao atualizar quantidade do item ${bookId} para user ${userId}:`, err.message);
            res.status(500).json({ errors: [{ msg: 'Erro interno ao atualizar quantidade no carrinho.' }] });
         }
     }
);


router.delete(
    '/:bookId',
    authMiddleware,
    [ param('bookId', 'ID do livro inválido na URL').isInt({ gt: 0 }) ],
     async (req, res) => {
         const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        const bookId = parseInt(req.params.bookId, 10);

         try {
             const deleteQuery = 'DELETE FROM cart_items WHERE user_id = $1 AND book_id = $2 RETURNING book_id;';
             const result = await db.query(deleteQuery, [userId, bookId]);

             if (result.rowCount === 0) {
                console.log(`Item ${bookId} não encontrado no carrinho do user ${userId} para remoção (sem erro).`);
             }

             const formattedCart = await fetchAndFormatCart(userId); 
             res.status(200).json(formattedCart);

         } catch (err) {
             console.error(`Erro ao remover item ${bookId} para user ${userId}:`, err.message);
             res.status(500).json({ errors: [{ msg: 'Erro interno ao remover item do carrinho.' }] });
         }
     }
);

router.delete('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
        res.status(200).json([]); 
    } catch (err) {
        console.error(`Erro ao limpar carrinho para user ${userId}:`, err.message);
        res.status(500).json({ errors: [{ msg: 'Erro interno ao limpar carrinho.' }] });
    }
});


module.exports = router;