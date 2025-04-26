const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db'); 

const router = express.Router();
const saltRounds = 10; 


router.post(
    '/register',
    [
        body('username', 'Username é obrigatório e precisa ter pelo menos 3 caracteres').trim().isLength({ min: 3 }).escape(),
        body('email', 'Forneça um email válido').trim().isEmail().normalizeEmail(),
        body('password', 'Senha precisa ter pelo menos 6 caracteres').trim().isLength({ min: 6 }),
        body('favoriteBookIds', 'favoriteBookIds precisa ser um array com 2 IDs de livros').isArray({ min: 2, max: 2 }),
        body('favoriteBookIds.*', 'Cada ID de livro favorito precisa ser um número inteiro').isInt({ gt: 0 }),  
        body('favoriteGenreIds', 'favoriteGenreIds precisa ser um array de IDs de gêneros').isArray({ min: 1 }), 
        body('favoriteGenreIds.*', 'Cada ID de gênero favorito precisa ser um número inteiro').isInt({ gt: 0 }), 
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password, favoriteBookIds, favoriteGenreIds } = req.body;

        const client = await db.pool.connect(); 
        console.log('Iniciando transação de registro...'); 
        try {
            await client.query('BEGIN'); 

            console.log(`Verificando existência de username: ${username} ou email: ${email}`); 
            const userCheck = await client.query(
                'SELECT id FROM users WHERE username = $1 OR email = $2 FOR UPDATE;', 
                [username, email]
            );
            if (userCheck.rows.length > 0) {
                console.log('Usuário ou email já existe. Fazendo rollback.'); 
                await client.query('ROLLBACK'); 
                return res.status(400).json({ errors: [{ msg: 'Username ou Email já cadastrado.' }] });
            }
            console.log('Usuário/email disponível.'); 

            console.log('Gerando hash da senha...'); 
            const passwordHash = await bcrypt.hash(password, saltRounds);
            console.log('Hash gerado.'); 

            console.log('Inserindo novo usuário...');
            const insertUserQuery = `
                INSERT INTO users (username, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id;
            `; 
            const newUserResult = await client.query(insertUserQuery, [username, email, passwordHash]);
            const userId = newUserResult.rows[0].id;
            console.log(`Usuário inserido com ID: ${userId}`); 

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
                        } catch (favBookError) {
                            console.error(`Erro ao inserir livro favorito ID ${bookId} para userId ${userId}:`, favBookError.message);
                        }
                    } else {
                         console.warn(`ID de livro inválido (${bookId}) ignorado para userId ${userId}`);
                    }
                }
                console.log('Processamento de livros favoritos concluído.'); 
            } else {
                console.log(`Nenhum favoriteBookIds válido fornecido para userId ${userId}`);
            }

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
                        } catch (favGenreError) {
                            console.error(`Erro ao inserir gênero favorito ID ${genreId} para userId ${userId}:`, favGenreError.message);
                        }
                    } else {
                        console.warn(`ID de gênero inválido (${genreId}) ignorado para userId ${userId}`);
                    }
                }
                console.log('Processamento de gêneros favoritos concluído.'); 
            } else {
                 console.log(`Nenhum favoriteGenreIds válido fornecido para userId ${userId}`);
            }

            console.log('Commitando transação de registro...'); 
            await client.query('COMMIT'); 
            console.log('Transação commitada.'); 
            res.status(201).json({ msg: 'Usuário registrado com sucesso!', userId: userId });

        } catch (err) {
            console.error('Erro DETECTADO no bloco catch do registro:', err.message); 
            console.error(err.stack); 
            try {
                console.log('Tentando fazer rollback da transação de registro...'); 
                await client.query('ROLLBACK'); 
                console.log('Rollback concluído.');
            } catch (rollbackError) {
                console.error('Erro ao tentar fazer rollback:', rollbackError.message); 
            }
            res.status(500).json({ errors: [{ msg: 'Erro interno do servidor durante o registro.' }] });
        } finally {
            client.release(); 
            console.log('Cliente de registro liberado.');
        }
    }
);


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
        console.log(`Tentativa de login para: ${loginIdentifier}`); 
        try {
             const findUserQuery = `
                SELECT id, username, email, password_hash FROM users
                WHERE username = $1 OR email = $1;
             `;
             const userResult = await db.query(findUserQuery, [loginIdentifier]);

             if (userResult.rows.length === 0) {
                console.log(`Login falhou: Usuário ${loginIdentifier} não encontrado.`);
                return res.status(401).json({ errors: [{ msg: 'Credenciais inválidas.' }] });
             }

             const user = userResult.rows[0];
             console.log(`Usuário ${loginIdentifier} encontrado. Verificando senha...`);

             const isMatch = await bcrypt.compare(password, user.password_hash);

             if (!isMatch) {
                console.log(`Login falhou para ${loginIdentifier}: Senha incorreta.`); 
                return res.status(401).json({ errors: [{ msg: 'Credenciais inválidas.' }] });
             }

             console.log(`Login bem-sucedido para ${loginIdentifier}. Gerando token...`); 
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
                        console.error('Erro ao gerar token JWT:', err); 
                        throw new Error('Falha ao gerar token de autenticação.');
                     }
                     console.log(`Token gerado para usuário ${user.id}.`); 
                     res.json({ token });
                 }
             );

        } catch (err) {
            console.error('Erro no processo de login:', err.message); 
            console.error(err.stack); 
            res.status(500).json({ errors: [{ msg: 'Erro interno do servidor durante o login.' }] });
        }
     }
);

module.exports = router;