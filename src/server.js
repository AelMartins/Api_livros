// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Importe o CORS
const bookRoutes = require('./routes/bookRoutes'); // Importa as rotas de livros
// const authRoutes = require('./routes/authRoutes'); // Futuramente para autenticação
// const userStatusRoutes = require('./routes/userStatusRoutes'); // Futuramente para favoritos/lidos

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors()); // Habilita o CORS para permitir requisições do seu frontend
app.use(express.json()); // Para parsear JSON no corpo das requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Rotas ---
app.use('/api/books', bookRoutes); // Usa as rotas de livros sob o prefixo /api/books
// app.use('/api/auth', authRoutes); // Exemplo de como adicionar rotas de autenticação depois
// app.use('/api/user', userStatusRoutes); // Exemplo para rotas de status (favoritos/lidos)

// Rota de "health check"
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Tratamento básico para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// --- Tratamento de Erros Global (Opcional, mas bom) ---
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err.stack);
  res.status(500).json({ error: 'Ocorreu um erro inesperado no servidor.' });
});


// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse a API em http://localhost:${PORT}`);
});