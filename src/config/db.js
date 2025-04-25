// src/config/db.js
const { Pool } = require('pg');
require('dotenv').config(); // Carrega variáveis de ambiente

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

module.exports = {
    query: (text, params) => pool.query(text, params), // Exporta um método para fazer queries
    pool: pool // Exporta o pool se precisar de mais controle
};