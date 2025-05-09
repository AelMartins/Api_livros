-- =============================================================================
-- Script de Configuração COMPLETO do Banco de Dados para o Projeto Bookstore
-- Banco de Dados Alvo: bookstore_db
--
-- INSTRUÇÕES DE USO:
-- 1. Com psql:
--    a. Conecte-se ao servidor PostgreSQL SEM especificar um banco:
--       psql -U seu_usuario_postgres -h localhost
--    b. Execute os comandos de DROP/CREATE DATABASE (descomente-os abaixo).
--    c. Conecte-se ao banco criado: \connect bookstore_db
--    d. Execute o restante do script: \i caminho/para/setup_full_database.sql
-- 2. Com pgAdmin:
--    a. Crie manualmente o banco de dados 'bookstore_db' através da interface.
--    b. Abra uma Query Tool conectada ao 'bookstore_db'.
--    c. Copie e cole o conteúdo DESTE ARQUIVO (a partir de "Limpeza") e execute.
-- =============================================================================

-- Descomente as linhas abaixo se estiver usando psql e quiser automatizar a criação do banco.
-- Necessário rodar conectado ao servidor, não a um banco específico inicialmente.
/*
\echo 'Tentando dropar banco de dados existente bookstore_db (ignorar erro se não existir)...'
DROP DATABASE IF EXISTS bookstore_db;

\echo 'Criando banco de dados bookstore_db...'
CREATE DATABASE bookstore_db;

-- Se estiver em psql, você precisaria de um \connect bookstore_db aqui
-- ou rodar o restante do script em uma nova conexão com o banco bookstore_db.
*/

-- GARANTA QUE VOCÊ ESTÁ CONECTADO AO BANCO 'bookstore_db' ANTES DE RODAR DAQUI PARA BAIXO.

-- =============================================================================
-- Limpeza: Dropar Tabelas Existentes (na ordem correta de dependência)
-- =============================================================================
\echo 'Droppando tabelas existentes (se houver) na ordem correta...'

DROP TABLE IF EXISTS user_favorite_genres CASCADE;
DROP TABLE IF EXISTS user_favorite_books CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS genres CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS books CASCADE;

-- =============================================================================
-- Criação da Tabela: users
-- =============================================================================
\echo 'Criando tabela users...'
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
\echo 'Tabela users criada.'

-- =============================================================================
-- Criação da Tabela: genres
-- =============================================================================
\echo 'Criando tabela genres...'
CREATE TABLE genres (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);
ALTER TABLE genres ADD CONSTRAINT genres_name_unique UNIQUE (name);
CREATE INDEX IF NOT EXISTS idx_genres_name_lower ON genres (LOWER(name));
\echo 'Tabela genres criada.'

-- =============================================================================
-- Criação da Tabela: books
-- =============================================================================
\echo 'Criando tabela books...'
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    authors TEXT,
    image TEXT,
    previewLink TEXT,
    publisher TEXT,
    publishedDate TEXT,
    infoLink TEXT,
    categories TEXT, -- String original das categorias do CSV
    price NUMERIC(10, 2) DEFAULT 0.00, -- Preço (pode ser atualizado depois)
    average_score REAL DEFAULT 0.0,
    reviews_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE books ADD CONSTRAINT books_title_unique UNIQUE (title);
CREATE INDEX IF NOT EXISTS idx_books_title_text_pattern ON books (title text_pattern_ops);
\echo 'Tabela books criada.'

-- =============================================================================
-- Criação da Tabela: reviews
-- =============================================================================
\echo 'Criando tabela reviews...'
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL,
    original_review_id TEXT,
    user_id TEXT, -- ID do usuário do dataset original de reviews
    profileName TEXT,
    review_helpfulness TEXT,
    review_score REAL,
    review_time BIGINT,
    review_summary TEXT,
    review_text TEXT,
    original_price_text TEXT, -- Para guardar o texto do preço do CSV
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_review_time ON reviews(review_time DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_review_score ON reviews(review_score DESC NULLS LAST);
\echo 'Tabela reviews criada.'

-- =============================================================================
-- Criação da Tabela: user_favorite_books
-- =============================================================================
\echo 'Criando tabela user_favorite_books...'
CREATE TABLE user_favorite_books (
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_favbooks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_favbooks_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_favorite_books_user_id ON user_favorite_books(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_books_book_id ON user_favorite_books(book_id);
\echo 'Tabela user_favorite_books criada.'

-- =============================================================================
-- Criação da Tabela: user_favorite_genres
-- =============================================================================
\echo 'Criando tabela user_favorite_genres...'
CREATE TABLE user_favorite_genres (
    user_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, genre_id),
    CONSTRAINT fk_favgenres_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_favgenres_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);
\echo 'Tabela user_favorite_genres criada.'

-- =============================================================================
-- Criação da Tabela: cart_items
-- =============================================================================
\echo 'Criando tabela cart_items...'
CREATE TABLE cart_items (
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_cartitems_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cartitems_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    CONSTRAINT check_quantity_positive CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
\echo 'Tabela cart_items criada.'

-- =============================================================================
-- Trigger para atualizar 'updated_at' em cart_items (e books, se quiser)
-- =============================================================================
\echo 'Criando função de trigger para timestamps...'
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicando trigger à tabela cart_items
DROP TRIGGER IF EXISTS set_cart_timestamp ON cart_items;
CREATE TRIGGER set_cart_timestamp
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
\echo 'Trigger para cart_items.updated_at criado.'

-- Opcional: Aplicar trigger à tabela books também, se for ter updates diretos nela
DROP TRIGGER IF EXISTS set_books_timestamp ON books;
CREATE TRIGGER set_books_timestamp
BEFORE UPDATE ON books
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
\echo 'Trigger para books.updated_at criado (opcional).'

-- =============================================================================
\echo 'Script de configuração do banco de dados COMPLETO concluído.'
-- =============================================================================
