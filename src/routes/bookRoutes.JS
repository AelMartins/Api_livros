// src/routes/bookRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken'); // Necessário para o optionalAuthMiddleware
const db = require('../config/db');
require('dotenv').config(); // Garante que JWT_SECRET seja carregado

const router = express.Router();

// --- Middleware Opcional de Autenticação ---
// Tenta verificar o token, mas não bloqueia se ausente/inválido
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded.user; // Define req.user se o token for válido
        // console.log("DEBUG optionalAuth: Usuário encontrado no token:", req.user); // Descomente para debug
      } else {
           console.error("Erro no optionalAuth: JWT_SECRET não definido.");
      }
    } catch (err) {
      // Ignora token inválido/expirado silenciosamente para rotas públicas
      // console.log("DEBUG optionalAuth: Token inválido/expirado - ignorando."); // Descomente para debug
    }
  } else {
       // console.log("DEBUG optionalAuth: Nenhum token encontrado."); // Descomente para debug
  }
  next(); // Sempre continua para a rota
};


// --- ROTA GET /api/books (Lista de Livros) ---
// Adicionado optionalAuthMiddleware e lógica is_favorite
router.get('/', optionalAuthMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const sortBy = req.query.sortBy || 'title';
    const sortOrder = (req.query.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const userId = req.user?.id; // ID do usuário logado (ou undefined)

    // Validação de Ordenação
    const allowedSortColumns = ['title', 'average_score', 'reviews_count', 'price', 'id', 'publishedDate']; // Note 'publishedDate' em minúsculas aqui se o nome da coluna for assim
    const safeSortBy = allowedSortColumns.includes(sortBy.toLowerCase()) ? sortBy : 'title';

    try {
        let queryParams = [];
        let countParams = [];

        // Campos básicos a selecionar
        const selectFields = ` b.id, b.title, b.authors, b.image, b.categories, b.price, b.average_score, b.reviews_count, b.publishedDate `;

        // Campo 'is_favorite' condicional
        // O placeholder para userId será $1 se userId existir, senão não haverá $1 para isso
        let favoriteField = ', FALSE AS is_favorite'; // Default para não logado
        if (userId) {
            queryParams.push(userId); // Adiciona userId como primeiro parâmetro
            favoriteField = `, EXISTS (SELECT 1 FROM user_favorite_books ufb WHERE ufb.user_id = $1 AND ufb.book_id = b.id) AS is_favorite`;
        }

        // Monta a query principal
        let baseQuery = `SELECT ${selectFields} ${favoriteField} FROM books b`;
        let countQuery = `SELECT COUNT(b.id) FROM books b`;
        let whereClause = '';

        // Adiciona busca (ajustando placeholders se userId foi adicionado)
        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            const searchParamIndex = queryParams.length + 1; // Próximo índice de parâmetro
            whereClause = ` WHERE (b.title ILIKE $${searchParamIndex} OR b.authors ILIKE $${searchParamIndex} OR b.categories ILIKE $${searchParamIndex})`;
            queryParams.push(searchPattern);
            countParams.push(searchPattern); // countParams só tem search
        }

        baseQuery += whereClause;
        countQuery += whereClause;

        // Adiciona ordenação, limite e offset
        let paramIndex = queryParams.length + 1;
        // Tratamento especial para ordenar por data que pode ser string/null
        const orderByClause = ` ORDER BY ${safeSortBy === 'publishedDate' ? 'NULLIF(b.publishedDate, \'\')' : `b.${safeSortBy}`} ${sortOrder} NULLS LAST, b.id ASC`;
        baseQuery += orderByClause;
        baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(limit, offset);

        // Executa as queries
        const result = await db.query(baseQuery, queryParams);
        const totalResult = await db.query(countQuery, countParams);

        const totalBooks = parseInt(totalResult.rows[0].count);
        const totalPages = Math.ceil(totalBooks / limit);

        // Não precisamos formatar/parsear preço aqui, API retorna string, frontend trata
        res.json({
            data: result.rows, // Retorna com is_favorite
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

// --- ROTA GET /api/books/:id (Detalhes do Livro) ---
// Adicionado optionalAuthMiddleware e lógica is_favorite
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
        return res.status(400).json({ error: 'ID do livro inválido.' });
    }

    try {
        const selectFields = 'b.*'; // Pega todas as colunas de books
         const favoriteField = userId
            ? `, EXISTS (SELECT 1 FROM user_favorite_books ufb WHERE ufb.user_id = $2 AND ufb.book_id = b.id) AS is_favorite`
            : ', FALSE AS is_favorite';

        const query = `SELECT ${selectFields} ${favoriteField} FROM books b WHERE b.id = $1`;
        // Parâmetros dependem se userId existe
        const queryParams = userId ? [id, userId] : [id];

        const result = await db.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }

        // Retorna os dados do livro (incluindo is_favorite). Preço vem como string.
        res.json(result.rows[0]);

    } catch (err) {
        console.error(`Erro ao buscar livro ${id}:`, err.message, err.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar detalhes do livro' });
    }
});

// --- ROTA GET /api/books/:id/reviews (Lista de Reviews) ---
// Nenhuma mudança necessária aqui
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