// src/routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db'); // Importa a conexão do banco

const router = express.Router();
const saltRounds = 10; // Custo do hashing com bcrypt

// === ROTA DE REGISTRO ===
router.post(
    '/register',
    // Validações de Entrada
    [
        body('username', 'Username é obrigatório e precisa ter pelo menos 3 caracteres').trim().isLength({ min: 3 }).escape(),
        body('email', 'Forneça um email válido').trim().isEmail().normalizeEmail(),
        body('password', 'Senha precisa ter pelo menos 6 caracteres').trim().isLength({ min: 6 }),
        // Validação dos IDs favoritos - garante que são arrays e contêm números inteiros
        body('favoriteBookIds', 'favoriteBookIds precisa ser um array com 2 IDs de livros').isArray({ min: 2, max: 2 }),
        body('favoriteBookIds.*', 'Cada ID de livro favorito precisa ser um número inteiro').isInt({ gt: 0 }), // Garante que seja maior que 0
        body('favoriteGenreIds', 'favoriteGenreIds precisa ser um array de IDs de gêneros').isArray({ min: 1 }), // Pelo menos 1 gênero
        body('favoriteGenreIds.*', 'Cada ID de gênero favorito precisa ser um número inteiro').isInt({ gt: 0 }), // Garante que seja maior que 0
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password, favoriteBookIds, favoriteGenreIds } = req.body;

        const client = await db.pool.connect(); // Pega um cliente do pool para a transação
        console.log('Iniciando transação de registro...'); // Log
        try {
            await client.query('BEGIN'); // Inicia transação

            // 1. Verifica se username ou email já existem
            console.log(`Verificando existência de username: ${username} ou email: ${email}`); // Log
            const userCheck = await client.query(
                'SELECT id FROM users WHERE username = $1 OR email = $2 FOR UPDATE;', // FOR UPDATE para bloquear linha se encontrada
                [username, email]
            );
            if (userCheck.rows.length > 0) {
                console.log('Usuário ou email já existe. Fazendo rollback.'); // Log
                await client.query('ROLLBACK'); // Desfaz a transação
                return res.status(400).json({ errors: [{ msg: 'Username ou Email já cadastrado.' }] });
            }
            console.log('Usuário/email disponível.'); // Log

            // 2. Gera o hash da senha
            console.log('Gerando hash da senha...'); // Log
            const passwordHash = await bcrypt.hash(password, saltRounds);
            console.log('Hash gerado.'); // Log

            // 3. Insere o novo usuário (COMENTÁRIO MOVIDO PARA FORA)
            console.log('Inserindo novo usuário...'); // Log
            const insertUserQuery = `
                INSERT INTO users (username, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id;
            `; // << COMENTÁRIO REMOVIDO DAQUI
            const newUserResult = await client.query(insertUserQuery, [username, email, passwordHash]);
            const userId = newUserResult.rows[0].id;
            console.log(`Usuário inserido com ID: ${userId}`); // Log

            // 4. Insere os livros favoritos (LOOP SIMPLIFICADO)
            if (favoriteBookIds && Array.isArray(favoriteBookIds) && favoriteBookIds.length > 0) {
                console.log(`Tentando inserir ${favoriteBookIds.length} livros favoritos para userId ${userId}`);
                for (const bookId of favoriteBookIds) {
                    if (Number.isInteger(bookId) && bookId > 0) {
                        try {
                            const insertFavBookQuery = `
                                INSERT INTO user_favorite_books (user_id, book_id)
                                VALUES ($1, $2)
                                ON CONFLICT (user_id, book_id) DO NOTHING;
                            `;
                            await client.query(insertFavBookQuery, [userId, bookId]);
                            // console.log(`Livro favorito ${bookId} processado para userId ${userId}`); // Log menos verboso
                        } catch (favBookError) {
                            console.error(`Erro ao inserir livro favorito ID ${bookId} para userId ${userId}:`, favBookError.message);
                        }
                    } else {
                         console.warn(`ID de livro inválido (${bookId}) ignorado para userId ${userId}`);
                    }
                }
                console.log('Processamento de livros favoritos concluído.'); // Log
            } else {
                console.log(`Nenhum favoriteBookIds válido fornecido para userId ${userId}`);
            }

            // 5. Insere os gêneros favoritos (LOOP SIMPLIFICADO)
             if (favoriteGenreIds && Array.isArray(favoriteGenreIds) && favoriteGenreIds.length > 0) {
                console.log(`Tentando inserir ${favoriteGenreIds.length} gêneros favoritos para userId ${userId}`);
                for (const genreId of favoriteGenreIds) {
                     if (Number.isInteger(genreId) && genreId > 0) {
                        try {
                            const insertFavGenreQuery = `
                                INSERT INTO user_favorite_genres (user_id, genre_id)
                                VALUES ($1, $2)
                                ON CONFLICT (user_id, genre_id) DO NOTHING;
                            `;
                            await client.query(insertFavGenreQuery, [userId, genreId]);
                            // console.log(`Gênero favorito ${genreId} processado para userId ${userId}`); // Log menos verboso
                        } catch (favGenreError) {
                            console.error(`Erro ao inserir gênero favorito ID ${genreId} para userId ${userId}:`, favGenreError.message);
                        }
                    } else {
                        console.warn(`ID de gênero inválido (${genreId}) ignorado para userId ${userId}`);
                    }
                }
                console.log('Processamento de gêneros favoritos concluído.'); // Log
            } else {
                 console.log(`Nenhum favoriteGenreIds válido fornecido para userId ${userId}`);
            }

            console.log('Commitando transação de registro...'); // Log
            await client.query('COMMIT'); // Confirma a transação
            console.log('Transação commitada.'); // Log
            res.status(201).json({ msg: 'Usuário registrado com sucesso!', userId: userId });

        } catch (err) {
            console.error('Erro DETECTADO no bloco catch do registro:', err.message); // Log mais específico
            console.error(err.stack); // Loga o stack trace completo do erro
            try {
                console.log('Tentando fazer rollback da transação de registro...'); // Log
                await client.query('ROLLBACK'); // Desfaz em caso de erro
                console.log('Rollback concluído.'); // Log
            } catch (rollbackError) {
                console.error('Erro ao tentar fazer rollback:', rollbackError.message); // Loga erro no rollback
            }
            res.status(500).json({ errors: [{ msg: 'Erro interno do servidor durante o registro.' }] });
        } finally {
            client.release(); // Libera o cliente de volta para o pool
            console.log('Cliente de registro liberado.'); // Log
        }
    }
);


// === ROTA DE LOGIN ===
router.post(
    '/login',
    [
         body('loginIdentifier', 'Username ou Email é obrigatório').trim().notEmpty().escape(),
         body('password', 'Senha é obrigatória').notEmpty(),
    ],
     async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { loginIdentifier, password } = req.body;
        console.log(`Tentativa de login para: ${loginIdentifier}`); // Log

        try {
             // Tenta encontrar o usuário pelo username OU pelo email
             const findUserQuery = `
                SELECT id, username, email, password_hash FROM users
                WHERE username = $1 OR email = $1;
             `;
             const userResult = await db.query(findUserQuery, [loginIdentifier]);

             if (userResult.rows.length === 0) {
                console.log(`Login falhou: Usuário ${loginIdentifier} não encontrado.`); // Log
                return res.status(401).json({ errors: [{ msg: 'Credenciais inválidas.' }] });
             }

             const user = userResult.rows[0];
             console.log(`Usuário ${loginIdentifier} encontrado. Verificando senha...`); // Log

             // Compara a senha fornecida com o hash armazenado
             const isMatch = await bcrypt.compare(password, user.password_hash);

             if (!isMatch) {
                console.log(`Login falhou para ${loginIdentifier}: Senha incorreta.`); // Log
                return res.status(401).json({ errors: [{ msg: 'Credenciais inválidas.' }] });
             }

             console.log(`Login bem-sucedido para ${loginIdentifier}. Gerando token...`); // Log
             // Senha correta -> Gerar Token JWT
             const payload = {
                 user: {
                     id: user.id,
                     username: user.username,
                 }
             };

             const jwtSecret = process.env.JWT_SECRET;
             if (!jwtSecret) {
                console.error("ERRO FATAL: JWT_SECRET não definido no arquivo .env!");
                return res.status(500).json({ errors: [{ msg: 'Erro interno do servidor (configuração).'}]});
             }

             jwt.sign(
                 payload,
                 jwtSecret,
                 { expiresIn: '1h' },
                 (err, token) => {
                     if (err) {
                        console.error('Erro ao gerar token JWT:', err); // Log específico
                        // Lança o erro para ser pego pelo catch externo
                        throw new Error('Falha ao gerar token de autenticação.');
                     }
                     console.log(`Token gerado para usuário ${user.id}.`); // Log
                     res.json({ token });
                 }
             );

        } catch (err) {
            console.error('Erro no processo de login:', err.message); // Log mais específico
            console.error(err.stack); // Loga o stack trace
            res.status(500).json({ errors: [{ msg: 'Erro interno do servidor durante o login.' }] });
        }
     }
);

module.exports = router;