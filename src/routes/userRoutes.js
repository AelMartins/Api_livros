// src/routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { sendEmail } = require('../services/emailService'); // Ajuste o caminho se 'services' estiver em outro nível
// const authMiddleware = require('../middleware/authMiddleware'); // Para proteger outras rotas se necessário

const router = express.Router();
const saltRounds = 10;

// --- Rota para Listar Usuários ---
router.get('/', async (req, res) => {
  console.warn('AVISO DE SEGURANÇA: Endpoint GET /api/users acessado sem verificação de admin.');
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const offset = (page - 1) * limit;
  try {
    const usersQuery = `SELECT id, username, email, created_at, email_confirmed FROM users ORDER BY username ASC LIMIT $1 OFFSET $2;`;
    const usersResult = await db.query(usersQuery, [limit, offset]);
    const countQuery = 'SELECT COUNT(*) FROM users;';
    const countResult = await db.query(countQuery);
    const totalUsers = parseInt(countResult.rows[0].count);
    res.json({
      data: usersResult.rows,
      pagination: { currentPage: page, totalPages: Math.ceil(totalUsers / limit), totalItems: totalUsers, limit: limit },
    });
  } catch (err) {
    console.error('Erro ao buscar usuários:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar usuários.' });
  }
});

// --- Rota para Buscar Usuário por ID ---
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  console.warn(`AVISO DE SEGURANÇA: Endpoint GET /api/users/${id} acessado sem verificação de permissão.`);
  if (isNaN(parseInt(id)) || parseInt(id) <= 0) return res.status(400).json({ error: 'ID de usuário inválido.' });
  try {
    const userQuery = `SELECT id, username, email, created_at, email_confirmed FROM users WHERE id = $1;`;
    const userResult = await db.query(userQuery, [id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(`Erro ao buscar usuário ${id}:`, err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar usuário.' });
  }
});

// --- Rota para Buscar Favoritos do Usuário ---
// Considere adicionar authMiddleware aqui para proteger e pegar o req.user.id em vez de :id na URL
router.get('/:id/favorites', async (req, res) => {
  const { id } = req.params; // Este ID deve ser o do usuário logado
  if (isNaN(parseInt(id)) || parseInt(id) <= 0) return res.status(400).json({ error: 'ID de usuário inválido.' });
  try {
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userExists.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const favBooksQuery = `
        SELECT b.id, b.title, b.authors, b.image, b.price, b.average_score, b.reviews_count, TRUE as is_favorite
        FROM books b JOIN user_favorite_books ufb ON b.id = ufb.book_id
        WHERE ufb.user_id = $1 ORDER BY ufb.added_at DESC;`;
    const favBooksResult = await db.query(favBooksQuery, [id]);

    const favGenresQuery = `
        SELECT g.id, g.name FROM genres g
        JOIN user_favorite_genres ufg ON g.id = ufg.genre_id
        WHERE ufg.user_id = $1 ORDER BY g.name ASC;`;
    const favGenresResult = await db.query(favGenresQuery, [id]);

    const formattedFavBooks = favBooksResult.rows.map(book => ({
        ...book,
        price: parseFloat(book.price) || null
    }));

    res.json({ favoriteBooks: formattedFavBooks, favoriteGenres: favGenresResult.rows });
  } catch (err) {
    console.error(`Erro ao buscar favoritos para usuário ${id}:`, err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar favoritos.' });
  }
});

// --- ROTA DE REGISTRO ATUALIZADA COM SALVAMENTO DE FAVORITOS ---
router.post('/register', async (req, res) => {
  // AGORA PEGA OS FAVORITOS DO CORPO DA REQUISIÇÃO
  const { username, email, password, favoriteBookIds, favoriteGenreIds } = req.body;

  // Validações básicas
  if (!username || !email || !password) {
    return res.status(400).json({ errors: [{ msg: 'Nome de usuário, email e senha são obrigatórios.' }] });
  }
  if (password.length < 6) {
    return res.status(400).json({ errors: [{ msg: 'A senha precisa ter pelo menos 6 caracteres.' }] });
  }
  // Validação para os favoritos (opcional, mas bom)
  if (!Array.isArray(favoriteBookIds) || favoriteBookIds.length !== 2 || !favoriteBookIds.every(id => Number.isInteger(id) && id > 0)) {
    return res.status(400).json({ errors: [{ msg: 'É necessário selecionar exatamente 2 livros favoritos válidos.' }] });
  }
  if (!Array.isArray(favoriteGenreIds) || favoriteGenreIds.length < 1 || !favoriteGenreIds.every(id => Number.isInteger(id) && id > 0)) {
    return res.status(400).json({ errors: [{ msg: 'É necessário selecionar pelo menos 1 gênero favorito válido.' }] });
  }


  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1 FOR UPDATE', [email]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errors: [{ msg: 'E-mail já cadastrado.' }] });
    }

    const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1 FOR UPDATE', [username]);
    if (usernameCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ errors: [{ msg: 'Nome de usuário já cadastrado.' }] });
    }

    const passwordHash = await bcrypt.hash(password, saltRounds);

    const insertUserQuery = `
        INSERT INTO users (username, email, password_hash, created_at, email_confirmed)
        VALUES ($1, $2, $3, NOW(), FALSE)
        RETURNING id;
    `;
    const result = await client.query(insertUserQuery, [username, email, passwordHash]);
    const userId = result.rows[0].id;
    console.log(`Usuário ${userId} registrado. Inserindo favoritos...`);


    // <<< LÓGICA PARA SALVAR LIVROS FAVORITOS ADICIONADA AQUI >>>
    if (favoriteBookIds && favoriteBookIds.length > 0) {
        console.log(`Registrando ${favoriteBookIds.length} livros favoritos para userId ${userId}`);
        for (const bookId of favoriteBookIds) {
            // Adicionar verificação se bookId existe na tabela 'books' antes de inserir seria ideal
            const bookExists = await client.query('SELECT id FROM books WHERE id = $1', [bookId]);
            if (bookExists.rows.length > 0) {
                const insertFavBookQuery = `
                    INSERT INTO user_favorite_books (user_id, book_id)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id, book_id) DO NOTHING;
                `;
                await client.query(insertFavBookQuery, [userId, bookId]);
            } else {
                console.warn(`Livro favorito com ID ${bookId} não encontrado no banco, ignorando.`);
            }
        }
    }

    // <<< LÓGICA PARA SALVAR GÊNEROS FAVORITOS ADICIONADA AQUI >>>
    if (favoriteGenreIds && favoriteGenreIds.length > 0) {
        console.log(`Registrando ${favoriteGenreIds.length} gêneros favoritos para userId ${userId}`);
        for (const genreId of favoriteGenreIds) {
            // Adicionar verificação se genreId existe na tabela 'genres'
            const genreExists = await client.query('SELECT id FROM genres WHERE id = $1', [genreId]);
            if (genreExists.rows.length > 0) {
                const insertFavGenreQuery = `
                    INSERT INTO user_favorite_genres (user_id, genre_id)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id, genre_id) DO NOTHING;
                `;
                await client.query(insertFavGenreQuery, [userId, genreId]);
            } else {
                console.warn(`Gênero favorito com ID ${genreId} não encontrado no banco, ignorando.`);
            }
        }
    }

    // Envio de Email de Confirmação
    const confirmationToken = userId;
    const confirmationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/confirm-email/${confirmationToken}`;
    const emailHtml = `... (seu HTML do email) ...`;
    await sendEmail(email, 'Confirmação de Cadastro - A PÁGINA', emailHtml);

    await client.query('COMMIT');
    res.status(201).json({ msg: 'Usuário cadastrado com sucesso. Verifique seu e-mail para confirmar a conta.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar usuário:', err.message, err.stack);
    res.status(500).json({ errors: [{ msg: 'Erro interno do servidor ao registrar usuário.' }] });
  } finally {
    client.release();
  }
});

// --- ROTA DE CONFIRMAÇÃO DE EMAIL ---
router.get('/confirm/:token', async (req, res) => {
    // ... seu código existente para confirmar email ...
});

module.exports = router;