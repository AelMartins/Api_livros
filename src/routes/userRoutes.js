const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  console.warn('AVISO DE SEGURANÇA: Endpoint GET /api/users acessado sem verificação de admin.');

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const offset = (page - 1) * limit;

  try {
    const usersQuery = `
                SELECT id, username, email, created_at
                FROM users
                ORDER BY username ASC
                LIMIT $1 OFFSET $2;
            `;
    const usersResult = await db.query(usersQuery, [limit, offset]);

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
        limit: limit,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar usuários:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar usuários.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  console.warn(
    `AVISO DE SEGURANÇA: Endpoint GET /api/users/${id} acessado sem verificação de permissão.`,
  );

  if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
    return res.status(400).json({ error: 'ID de usuário inválido.' });
  }

  try {
    const userQuery = `
                SELECT id, username, email, created_at
                FROM users
                WHERE id = $1;
            `;
    const userResult = await db.query(userQuery, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(`Erro ao buscar usuário ${id}:`, err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar usuário.' });
  }
});

router.get('/:id/favorites', async (req, res) => {
  const { id } = req.params;
  if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
    return res.status(400).json({ error: 'ID de usuário inválido.' });
  }

  try {
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const favBooksQuery = `
                SELECT b.id, b.title, b.authors, b.image
                FROM books b
                JOIN user_favorite_books ufb ON b.id = ufb.book_id
                WHERE ufb.user_id = $1
                ORDER BY ufb.added_at DESC;
             `;
    const favBooksResult = await db.query(favBooksQuery, [id]);

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
      favoriteGenres: favGenresResult.rows,
    });
  } catch (err) {
    console.error(`Erro ao buscar favoritos para usuário ${id}:`, err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar favoritos.' });
  }
});

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const emailCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }

    const insertQuery = `
            INSERT INTO users (username, email, password, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id;
        `;
    const result = await db.query(insertQuery, [username, email, password]);
    const userId = result.rows[0].id;

    const confirmationLink = `http://localhost:3000/api/users/confirm/${userId}`;

    const emailHtml = `
            <h1>Bem-vindo, ${username}!</h1>
            <p>Obrigado por se cadastrar. Por favor, confirme seu e-mail clicando no link abaixo:</p>
            <a href="${confirmationLink}">Confirmar e-mail</a>
        `;
    await sendEmail(email, 'Confirmação de Cadastro', emailHtml);

    res
      .status(201)
      .json({ msg: 'Usuário cadastrado com sucesso. Verifique seu e-mail para confirmar.' });
  } catch (err) {
    console.error('Erro ao registrar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao registrar usuário.' });
  }
});

router.get('/confirm/:id', async (req, res) => {
  const { id } = req.params;

  if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
    return res.status(400).json({ error: 'ID de usuário inválido.' });
  }

  try {
    const updateQuery = `
            UPDATE users
            SET email_confirmed = TRUE
            WHERE id = $1
            RETURNING id, username, email;
        `;
    const result = await db.query(updateQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado ou já confirmado.' });
    }

    res.json({ msg: 'E-mail confirmado com sucesso!', user: result.rows[0] });
  } catch (err) {
    console.error('Erro ao confirmar e-mail:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao confirmar e-mail.' });
  }
});

module.exports = router;
