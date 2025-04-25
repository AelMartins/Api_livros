// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const bookRoutes = require('./routes/bookRoutes');
const authRoutes = require('./routes/authRoutes'); // <<< Importa rotas de autenticação
const genreRoutes = require('./routes/genreRoutes'); // <<< Importa rotas de gênero

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json()); // Essencial para ler o body JSON das requisições POST
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Rotas ---
app.use('/api/books', bookRoutes);
app.use('/api/auth', authRoutes);   // <<< Usa as rotas de autenticação
app.use('/api/genres', genreRoutes); // <<< Usa as rotas de gênero
app.use('/api/users', userRoutes);

// ... (Rota /health e tratamento 404/500 como antes) ...
// Rota de "health check"
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Tratamento básico para rotas não encontradas
app.use((req, res, next) => {
    // Cria um erro para passar para o próximo middleware
    const error = new Error('Rota não encontrada');
    error.status = 404;
    next(error); // Passa o erro para o error handler
});

// --- Tratamento de Erros Global ---
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err.stack || err.message); // Loga o stack trace ou a mensagem
  // Retorna uma resposta JSON padronizada para erros
  res.status(err.status || 500).json({
       error: {
           message: err.message || 'Ocorreu um erro inesperado no servidor.',
           // Não exponha o stack trace em produção
           // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
       }
   });
});


// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse a API em http://localhost:${PORT}`);
});