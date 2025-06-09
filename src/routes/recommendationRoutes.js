const express = require('express');
const db = require('../config/db');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const authMiddleware = require('../middleware/authMiddleware');
require('dotenv').config();

const router = express.Router();
const ML_SERVER_URL = process.env.ML_SERVER_URL || 'http://localhost:5000/predict';

let bookIndexMap = new Map();

const loadBookIndexMap = () => {
  try {
    const csvFilePath = path.join(process.cwd(), 'machine-learning', 'model_components', 'df_books.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    records.forEach((record, index) => {
      if (record.id) { 
        bookIndexMap.set(index, parseInt(record.id, 10));
      }
    });

    console.log(`[Recommender] Mapa de livros carregado com sucesso. ${bookIndexMap.size} livros mapeados.`);
  } catch (error) {
    console.error('[Recommender] ERRO CRÍTICO: Falha ao carregar e mapear o df_books.csv.', error);
  }
};

loadBookIndexMap();


const createMetaBookFromFavorites = (favoriteBooks) => {
    if (!favoriteBooks || favoriteBooks.length === 0) {
        return null;
    }

    const allAuthors = new Set();
    const allCategories = new Set();
    let totalRating = 0;
    let validRatings = 0;

    favoriteBooks.forEach(book => {
        if (book.authors) {
            try {
                book.authors.replace(/[\[\]']+/g, '').split(',').forEach(author => {
                    const trimmed = author.trim();
                    if (trimmed) allAuthors.add(trimmed);
                });
            } catch (e) { /* ignora */ }
        }

        if (book.categories) {
            try {
                book.categories.replace(/[\[\]']+/g, '').split(',').forEach(category => {
                    const trimmed = category.trim();
                    if (trimmed) allCategories.add(trimmed);
                });
            } catch (e) { /* ignora */ }
        }
        
        if (book.average_score !== null && !isNaN(book.average_score)) {
            totalRating += parseFloat(book.average_score);
            validRatings++;
        }
    });
    
    return {
        authors: allAuthors.size > 0 ? Array.from(allAuthors) : ["Unknown"],
        categories: allCategories.size > 0 ? Array.from(allCategories) : ["General"],
        average_rating: validRatings > 0 ? (totalRating / validRatings) : 3.5,
        publisher: "Unknown",
        published_year: "2010",
        average_review_rating: validRatings > 0 ? (totalRating / validRatings) : 3.5,
    };
};


router.get('/user', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    
    try {
        const favoritesResult = await db.query(
            `SELECT b.* FROM books b
             JOIN user_favorite_books ufb ON b.id = ufb.book_id
             WHERE ufb.user_id = $1`,
            [userId]
        );
        const favoriteBooks = favoritesResult.rows;

        console.log(`\n--- INICIANDO DEBUG DA RECOMENDAÇÃO PARA USER ${userId} ---`);
        console.log(`[DEBUG 1] Livros favoritos encontrados: ${favoriteBooks.length}`);

        if (favoriteBooks.length === 0) {
            console.log(`[Recommender] User ${userId} não tem favoritos. Usando fallback para recomendações gerais.`);
            const generalRecs = await db.query(
                `SELECT *, EXISTS(SELECT 1 FROM user_favorite_books WHERE user_id = $1 AND book_id = b.id) AS is_favorite
                 FROM books b WHERE average_score >= 4.0 ORDER BY reviews_count DESC, RANDOM() LIMIT $2`,
                [userId, limit]
            );
            return res.json(generalRecs.rows);
        }

        const metaBookPayload = createMetaBookFromFavorites(favoriteBooks);
        console.log('[DEBUG 2] Payload enviado para o ML:', JSON.stringify(metaBookPayload, null, 2));

        const mlResponse = await axios.post(ML_SERVER_URL, metaBookPayload);
        console.log('[DEBUG 3] Resposta recebida do ML:', JSON.stringify(mlResponse.data, null, 2));
        
        const mlRecommendations = mlResponse.data.recommendations;
        if (!mlRecommendations) throw new Error("A resposta do ML não contém a chave 'recommendations'.");

        const recommendedDbIds = mlRecommendations
            .map(rec => bookIndexMap.get(rec.index))
            .filter(id => id !== undefined);
        console.log(`[DEBUG 4] IDs de livros traduzidos do ML: (${recommendedDbIds.length})`, recommendedDbIds);

        const uniqueRecommendedIds = [...new Set(recommendedDbIds)];
        const favoriteIds = new Set(favoriteBooks.map(b => b.id));
        const finalIdsToFetch = uniqueRecommendedIds.filter(id => !favoriteIds.has(id));
        console.log(`[DEBUG 5] IDs após filtrar favoritos já existentes: (${finalIdsToFetch.length})`, finalIdsToFetch);

        const limitedIds = finalIdsToFetch.slice(0, limit);
        console.log(`[DEBUG 6] IDs finais a serem buscados no banco: (${limitedIds.length})`, limitedIds);

        if (limitedIds.length === 0) {
            console.log(`[DEBUG 7] Lista final está vazia. ATIVANDO FALLBACK.`);
            const generalRecs = await db.query(
                `SELECT *, EXISTS(SELECT 1 FROM user_favorite_books WHERE user_id = $1 AND book_id = b.id) AS is_favorite
                 FROM books b WHERE average_score >= 4.0 AND id NOT IN (SELECT book_id FROM user_favorite_books WHERE user_id = $1) ORDER BY reviews_count DESC, RANDOM() LIMIT $2`,
                [userId, limit]
            );
            return res.json(generalRecs.rows);
        }
        
        const idPlaceholders = limitedIds.map((_, i) => `$${i + 1}`).join(','); 
        const booksQuery = await db.query(
            `SELECT *, FALSE as is_favorite FROM books WHERE id IN (${idPlaceholders})`,
            [...limitedIds] 
        );
        
        const finalResult = limitedIds
            .map(id => booksQuery.rows.find(book => book.id === id))
            .filter(book => book);

        console.log(`--- FIM DO DEBUG DA RECOMENDAÇÃO: ENVIANDO ${finalResult.length} LIVROS ---`);
        res.json(finalResult);

    } catch (err) {
        console.error('\n--- ERRO NO PROCESSO DE RECOMENDAÇÃO ---');
        console.error('[DEBUG FINAL] O processo falhou com o erro:', err.message);
        if (err.response) {
            console.error('[DEBUG FINAL] Detalhes da resposta do erro (se for do axios):', err.response.data);
        }
        
        try {
            console.log('[DEBUG FINAL] Tentando fallback para recomendações gerais...');
            const generalRecs = await db.query(
                `SELECT *, EXISTS(SELECT 1 FROM user_favorite_books WHERE user_id = $1 AND book_id = b.id) AS is_favorite
                 FROM books b WHERE average_score >= 4.0 ORDER BY reviews_count DESC, RANDOM() LIMIT $2`,
                [userId, limit]
            );
            res.json(generalRecs.rows);
        } catch (fallbackError) {
            console.error('[DEBUG FINAL] Erro no fallback de recomendações gerais:', fallbackError.message);
            res.status(500).json({ error: 'Falha ao buscar recomendações.' });
        }
    }
});


router.get('/general', async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    try {
        const result = await db.query(
            `SELECT *, FALSE as is_favorite FROM books b
             WHERE b.average_score >= 4.0 AND b.reviews_count >= 5
             ORDER BY b.average_score DESC, b.reviews_count DESC, RANDOM() LIMIT $1`,
            [limit]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar recomendações gerais:', err.message);
        res.status(500).json({ error: 'Erro ao obter recomendações.' });
    }
});

module.exports = router;