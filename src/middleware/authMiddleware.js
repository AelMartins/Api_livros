const jwt = require('jsonwebtoken');
require('dotenv').config(); 

const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ errors: [{ msg: 'Nenhum token, autorização negada.' }] });
    }

    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
             console.error("ERRO FATAL no Middleware: JWT_SECRET não definido!");
             return res.status(500).json({ errors: [{ msg: 'Erro interno do servidor (configuração).'}]});
        }

        const decoded = jwt.verify(token, jwtSecret);

        req.user = decoded.user;
        next(); 

    } catch (err) {
        console.error("Erro na verificação do token:", err.message);
        res.status(401).json({ errors: [{ msg: 'Token inválido.' }] });
    }
};

module.exports = authMiddleware;