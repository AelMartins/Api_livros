// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const bookRoutes = require('./routes/bookRoutes');
const authRoutes = require('./routes/authRoutes');
const genreRoutes = require('./routes/genreRoutes'); 
const cartRoutes = require('./routes/cartRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use('/api/books', bookRoutes);
app.use('/api/auth', authRoutes);   
app.use('/api/genres', genreRoutes); 
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes); 
app.use('/api/favorites', favoriteRoutes);

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.use((req, res, next) => {
    const error = new Error('Rota não encontrada');
    error.status = 404;
    next(error); 
});

app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err.stack || err.message); 
  res.status(err.status || 500).json({
       error: {
           message: err.message || 'Ocorreu um erro inesperado no servidor.',
       }
   });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse a API em http://localhost:${PORT}`);
});