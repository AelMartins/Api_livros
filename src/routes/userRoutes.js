// src/routes/userRoutes.js
const express = require('express');
const db = require('../config/db');
// const authMiddleware = require('../middleware/authMiddleware'); // <<< DESCOMENTE QUANDO TIVER AUTENTICAÇÃO

const router = express.Router();

// --- ROTA PARA LISTAR USUÁRIOS (com paginação) ---
// IMPORTANTE: Em uma aplicação real, esta rota DEVE ser protegida
//             para que apenas administradores possam acessá-la.
router.get(
    '/',
    // authMiddleware, // <<< Adicionar middleware de autenticação aqui depois
    async (req, res) => {
        // Adiciona um aviso sobre segurança no console do servidor
        console.warn("AVISO DE SEGURANÇA: Endpoint GET /api/users acessado sem verificação de admin.");

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const offset = (page - 1) * limit;

        try {
            // Busca usuários paginados - NÃO INCLUA o password_hash!
            const usersQuery = `
                SELECT id, username, email, created_at
                FROM users
                ORDER BY username ASC
                LIMIT $1 OFFSET $2;
            `;
            const usersResult = await db.query(usersQuery, [limit, offset]);

            // Conta o total de usuários para paginação
            const countQuery = 'SELECT COUNT(*) FROM users;';
            const countResult = await db.query(countQuery);
            const totalUsers = parseInt(countResult.rows[0].count);
            const totalPages = Math.ceil(totalUsers / limit);

            res.json({
                data: usersResult.rows,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalItems: totalUsers,
                    limit: limit
                }
            });

        } catch (err) {
            console.error("Erro ao buscar usuários:", err.message);
            res.status(500).json({ error: 'Erro interno do servidor ao buscar usuários.' });
        }
    }
);

// --- ROTA PARA BUSCAR UM USUÁRIO ESPECÍFICO POR ID ---
// IMPORTANTE: Em uma aplicação real, proteja esta rota.
//             Um usuário comum só deveria poder ver seu próprio perfil,
//             ou um admin poderia ver qualquer perfil.
router.get(
    '/:id',
    // authMiddleware, // <<< Adicionar middleware de autenticação aqui depois
    async (req, res) => {
        const { id } = req.params;
        // Adiciona um aviso sobre segurança no console do servidor
        console.warn(`AVISO DE SEGURANÇA: Endpoint GET /api/users/${id} acessado sem verificação de permissão.`);


        // Validação básica do ID
        if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
            return res.status(400).json({ error: 'ID de usuário inválido.' });
        }

        try {
            // Busca usuário pelo ID - NÃO INCLUA o password_hash!
            const userQuery = `
                SELECT id, username, email, created_at
                FROM users
                WHERE id = $1;
            `;
            const userResult = await db.query(userQuery, [id]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            // Retorna os dados do usuário (sem a senha)
            res.json(userResult.rows[0]);

        } catch (err) {
            console.error(`Erro ao buscar usuário ${id}:`, err.message);
            res.status(500).json({ error: 'Erro interno do servidor ao buscar usuário.' });
        }
    }
);


// --- ROTA PARA BUSCAR OS FAVORITOS DE UM USUÁRIO ---
// Esta rota pode ser pública ou protegida dependendo da sua lógica
router.get(
    '/:id/favorites', // Pega livros e gêneros favoritos
    async (req, res) => {
         const { id } = req.params;
         if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
            return res.status(400).json({ error: 'ID de usuário inválido.' });
         }

         try {
            // Verifica se o usuário existe
             const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
             if (userExists.rows.length === 0) {
                 return res.status(404).json({ error: 'Usuário não encontrado.' });
             }

             // Busca livros favoritos
             const favBooksQuery = `
                SELECT b.id, b.title, b.authors, b.image
                FROM books b
                JOIN user_favorite_books ufb ON b.id = ufb.book_id
                WHERE ufb.user_id = $1
                ORDER BY ufb.added_at DESC;
             `;
             const favBooksResult = await db.query(favBooksQuery, [id]);

             // Busca gêneros favoritos
             const favGenresQuery = `
                 SELECT g.id, g.name
                 FROM genres g
                 JOIN user_favorite_genres ufg ON g.id = ufg.genre_id
                 WHERE ufg.user_id = $1
                 ORDER BY g.name ASC;
             `;
             const favGenresResult = await db.query(favGenresQuery, [id]);

             res.json({
                 favoriteBooks: favBooksResult.rows,
                 favoriteGenres: favGenresResult.rows
             });

         } catch (err) {
             console.error(`Erro ao buscar favoritos para usuário ${id}:`, err.message);
             res.status(500).json({ error: 'Erro interno do servidor ao buscar favoritos.' });
         }
    }
);


module.exports = router;