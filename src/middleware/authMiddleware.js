// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Para carregar JWT_SECRET

const authMiddleware = (req, res, next) => {
    // Pega o token do header Authorization: Bearer TOKEN
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1]; // Pega só a parte do token

    // Verifica se não há token
    if (!token) {
        return res.status(401).json({ errors: [{ msg: 'Nenhum token, autorização negada.' }] });
    }

    // Verifica o token
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
             console.error("ERRO FATAL no Middleware: JWT_SECRET não definido!");
             return res.status(500).json({ errors: [{ msg: 'Erro interno do servidor (configuração).'}]});
        }

        const decoded = jwt.verify(token, jwtSecret);

        // Adiciona o payload do usuário (que contém o id) ao objeto req
        // Assim as rotas protegidas podem acessar req.user.id
        req.user = decoded.user;
        next(); // Passa para a próxima função (a rota)

    } catch (err) {
        console.error("Erro na verificação do token:", err.message);
        res.status(401).json({ errors: [{ msg: 'Token inválido.' }] });
    }
};

module.exports = authMiddleware;