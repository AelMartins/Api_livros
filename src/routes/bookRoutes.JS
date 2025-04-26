const express = require('express');
const db = require('../config/db'); 

const router = express.Router();

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search || ''; 
    const sortBy = req.query.sortBy || 'title'; 
    const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const allowedSortColumns = ['title', 'average_score', 'reviews_count', 'price', 'id', 'publisheddate']; 
    const safeSortBy = allowedSortColumns.includes(sortBy.toLowerCase()) ? sortBy : 'title'; 

    try {
        let queryParams = [];
        let countParams = [];

        let baseQuery = `
            SELECT id, title, authors, image, categories,
                   price, average_score, reviews_count, publishedDate
            FROM books
        `;
        let countQuery = `SELECT COUNT(*) FROM books`;
        let whereClause = '';

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            whereClause = ' WHERE (title ILIKE $1 OR authors ILIKE $1 OR categories ILIKE $1)'; 
            queryParams.push(searchPattern);
            countParams.push(searchPattern);
        }

        countQuery += whereClause;

        let paramIndex = queryParams.length + 1;
        baseQuery += whereClause + ` ORDER BY ${safeSortBy} ${sortOrder}, id ASC`; 
        baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(limit, offset);



        const result = await db.query(baseQuery, queryParams);
        const totalResult = await db.query(countQuery, countParams);

        const totalBooks = parseInt(totalResult.rows[0].count);
        const totalPages = Math.ceil(totalBooks / limit);

        res.json({
            data: result.rows,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalBooks,
                limit: limit,
                searchTerm: searchTerm,
                sortBy: safeSortBy,
                sortOrder: sortOrder
            }
        });
    } catch (err) {
        console.error("Erro ao buscar livros:", err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar livros' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    try {
        const result = await db.query('SELECT * FROM books WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }
        res.json(result.rows[0]); 
    } catch (err) {
        console.error(`Erro ao buscar livro ${id}:`, err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar detalhes do livro' });
    }
});

router.get('/:id/reviews', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'review_time';
    const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const allowedSortColumnsReviews = ['review_time', 'review_score', 'created_at'];
    const safeSortByReviews = allowedSortColumnsReviews.includes(sortBy.toLowerCase()) ? sortBy : 'review_time';


    try {
        const bookExistsResult = await db.query('SELECT id FROM books WHERE id = $1', [id]);
        if (bookExistsResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }

        const reviewsQuery = `
            SELECT *
            FROM reviews
            WHERE book_id = $1
            ORDER BY ${safeSortByReviews} ${sortOrder}, id DESC -- Adiciona 'id' como desempate
            LIMIT $2 OFFSET $3
        `;
        const reviewsResult = await db.query(reviewsQuery, [id, limit, offset]);

        const totalReviewsResult = await db.query('SELECT COUNT(*) FROM reviews WHERE book_id = $1', [id]);
        const totalReviews = parseInt(totalReviewsResult.rows[0].count);
        const totalPages = Math.ceil(totalReviews / limit);

        res.json({
            data: reviewsResult.rows,
            pagination: {
                 currentPage: page,
                 totalPages: totalPages,
                 totalItems: totalReviews,
                 limit: limit,
                 sortBy: safeSortByReviews,
                 sortOrder: sortOrder
             }
        });

    } catch (err) {
        console.error(`Erro ao buscar reviews para o livro ${id}:`, err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar reviews' });
    }
});

module.exports = router;