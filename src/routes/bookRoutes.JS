// src/routes/bookRoutes.js
const express = require('express');
const db = require('../config/db'); // Ajuste o caminho se necessário

const router = express.Router();

// Rota para buscar todos os livros (com paginação, busca e dados agregados)
router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search || ''; // Parâmetro de busca
    // Opcional: Parâmetros de ordenação
    const sortBy = req.query.sortBy || 'title'; // 'title', 'average_score', 'reviews_count', 'price'
    const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Valida colunas permitidas para ordenação para evitar SQL Injection
    const allowedSortColumns = ['title', 'average_score', 'reviews_count', 'price', 'id', 'publisheddate']; // Adicione outras se necessário
    const safeSortBy = allowedSortColumns.includes(sortBy.toLowerCase()) ? sortBy : 'title'; // Usa 'title' como padrão seguro

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

        // Adiciona condição de busca se houver searchTerm
        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            whereClause = ' WHERE (title ILIKE $1 OR authors ILIKE $1 OR categories ILIKE $1)'; // Busca em mais campos
            queryParams.push(searchPattern);
            countParams.push(searchPattern);
        }

        countQuery += whereClause;

        // Adiciona ordenação, limite e offset à query principal
        // Usando $ como placeholders para limite e offset, mas não para coluna/ordem de sort
        let paramIndex = queryParams.length + 1;
        baseQuery += whereClause + ` ORDER BY ${safeSortBy} ${sortOrder}, id ASC`; // Adiciona 'id' como desempate
        baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(limit, offset);


        // Executa as queries
        // console.log("Query Livros:", baseQuery, queryParams); // Para debug
        // console.log("Query Contagem:", countQuery, countParams); // Para debug
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

// Rota para buscar detalhes de um livro específico pelo ID (com dados agregados)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    // Valida se o ID é um número para segurança básica
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    try {
        // SELECT * pega todas as colunas, incluindo price, average_score, reviews_count
        const result = await db.query('SELECT * FROM books WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }
        res.json(result.rows[0]); // Retorna o objeto completo do livro
    } catch (err) {
        console.error(`Erro ao buscar livro ${id}:`, err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar detalhes do livro' });
    }
});

// Rota para buscar reviews individuais de um livro específico pelo ID do livro
router.get('/:id/reviews', async (req, res) => {
    const { id } = req.params; // Este é o book_id
    // Valida se o ID é um número
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    // Paginação para reviews
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    // Opcional: Ordenação para reviews
    const sortBy = req.query.sortBy || 'review_time'; // 'review_time', 'review_score'
    const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const allowedSortColumnsReviews = ['review_time', 'review_score', 'created_at'];
    const safeSortByReviews = allowedSortColumnsReviews.includes(sortBy.toLowerCase()) ? sortBy : 'review_time';


    try {
        // 1. Verifica se o livro existe (bom para retornar 404 correto)
        const bookExistsResult = await db.query('SELECT id FROM books WHERE id = $1', [id]);
        if (bookExistsResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }

        // 2. Busca as reviews paginadas e ordenadas para o livro
        const reviewsQuery = `
            SELECT *
            FROM reviews
            WHERE book_id = $1
            ORDER BY ${safeSortByReviews} ${sortOrder}, id DESC -- Adiciona 'id' como desempate
            LIMIT $2 OFFSET $3
        `;
        const reviewsResult = await db.query(reviewsQuery, [id, limit, offset]);

        // 3. Conta o total de reviews para o livro (para paginação)
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