const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const router = express.Router();

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded.user;
      }
    } catch (err) { /* Ignora erro */ }
  }
  next();
};


router.get('/', optionalAuthMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const sortBy = req.query.sortBy || 'title';
    const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const userId = req.user?.id;

    const allowedSortColumns = ['title', 'average_score', 'reviews_count', 'price', 'id', 'publishedDate'];
    const safeSortBy = allowedSortColumns.includes(sortBy.toLowerCase()) ? sortBy : 'title';

    try {
        let queryParams = [];
        let paramIndex = 1; 
        let selectFields = ` SELECT b.id, b.title, b.authors, b.image, b.categories, b.price, b.average_score, b.reviews_count, b.publishedDate `;
        let favoriteField = ', FALSE AS is_favorite'; 
        if (userId) {
            favoriteField = `, EXISTS (SELECT 1 FROM user_favorite_books ufb WHERE ufb.user_id = $${paramIndex} AND ufb.book_id = b.id) AS is_favorite`;
            queryParams.push(userId);
            paramIndex++;
        }
        let fromClause = ` FROM books b `;
        let whereClause = '';
        if (searchTerm) {
            whereClause = ` WHERE (b.title ILIKE $${paramIndex} OR b.authors ILIKE $${paramIndex} OR b.categories ILIKE $${paramIndex}) `;
            queryParams.push(`%${searchTerm}%`);
            paramIndex++;
        }
        const orderByClause = ` ORDER BY ${safeSortBy === 'publishedDate' ? 'NULLIF(b.publishedDate, \'\')' : `b.${safeSortBy}`} ${sortOrder} NULLS LAST, b.id ASC `;
        const limitOffsetClause = ` LIMIT $${paramIndex++} OFFSET $${paramIndex++} `;
        queryParams.push(limit, offset);

        const baseQuery = selectFields + favoriteField + fromClause + whereClause + orderByClause + limitOffsetClause;

        let countQuery = `SELECT COUNT(b.id) FROM books b`;
        let countQueryParams = [];
        if (searchTerm) {
            countQuery += ` WHERE (b.title ILIKE $1 OR b.authors ILIKE $1 OR b.categories ILIKE $1)`;
            countQueryParams.push(`%${searchTerm}%`);
        }


        const result = await db.query(baseQuery, queryParams);
        const totalResult = await db.query(countQuery, countQueryParams);

        const totalBooks = parseInt(totalResult.rows[0].count);
        const totalPages = Math.ceil(totalBooks / limit);

        res.json({
            data: result.rows,
            pagination: {
                currentPage: page, totalPages: totalPages, totalItems: totalBooks,
                limit: limit, searchTerm: searchTerm, sortBy: safeSortBy, sortOrder: sortOrder
            }
        });
    } catch (err) {
        console.error("Erro ao buscar livros:", err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar livros' });
    }
});


router.get('/:id', optionalAuthMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
        return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    try {
        const selectFields = 'b.*';
         const favoriteField = userId
            ? `, EXISTS (SELECT 1 FROM user_favorite_books ufb WHERE ufb.user_id = $2 AND ufb.book_id = b.id) AS is_favorite`
            : ', FALSE AS is_favorite';

        const query = `SELECT ${selectFields} ${favoriteField} FROM books b WHERE b.id = $1`;
        const queryParams = userId ? [id, userId] : [id];

        const result = await db.query(query, queryParams);

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
    if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
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
        if (bookExistsResult.rows.length === 0) { return res.status(404).json({ error: 'Livro não encontrado' }); }

        const reviewsQuery = `
            SELECT * FROM reviews WHERE book_id = $1
            ORDER BY ${safeSortByReviews} ${sortOrder} NULLS LAST, id DESC
            LIMIT $2 OFFSET $3
        `;
        const reviewsResult = await db.query(reviewsQuery, [id, limit, offset]);
        const totalReviewsResult = await db.query('SELECT COUNT(*) FROM reviews WHERE book_id = $1', [id]);
        const totalReviews = parseInt(totalReviewsResult.rows[0].count);
        const totalPages = Math.ceil(totalReviews / limit);

        res.json({
            data: reviewsResult.rows,
            pagination: {
                 currentPage: page, totalPages: totalPages, totalItems: totalReviews,
                 limit: limit, sortBy: safeSortByReviews, sortOrder: sortOrder
             }
        });
    } catch (err) {
        console.error(`Erro ao buscar reviews para o livro ${id}:`, err.message);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar reviews' });
    }
});


module.exports = router;