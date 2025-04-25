// scripts/importData.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

// Carrega variáveis de ambiente do arquivo .env na raiz do projeto
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


// --- Validação das Variáveis de Ambiente ---
function validateEnvVariables() {
    const requiredVars = ['DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT'];
    const missingVars = requiredVars.filter(v => !(v in process.env));
    if (missingVars.length > 0) {
        console.error(`ERRO CRÍTICO: Variáveis de ambiente faltando no .env: ${missingVars.join(', ')}`);
        process.exit(1);
    }
    if (typeof process.env.DB_PASSWORD !== 'string') {
        console.error("ERRO CRÍTICO: DB_PASSWORD precisa ser uma string no .env!");
        process.exit(1);
    }
    if (isNaN(parseInt(process.env.DB_PORT, 10))) {
        console.error("ERRO CRÍTICO: DB_PORT precisa ser um número válido no .env!");
        process.exit(1);
    }
}
validateEnvVariables(); // Executa a validação

// --- Configuração do Pool de Conexões ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    // statement_timeout: 600000, // Timeout para queries longas (10 min), descomente se necessário
});

// Mapa para guardar o ID do livro associado ao seu TÍTULO
const bookTitleToIdMap = new Map();

// --- Nomes das Colunas nos Arquivos CSV ---
// !! CONFIRA E AJUSTE ESTES NOMES CONFORME SEUS ARQUIVOS !!
const BOOK_TITLE_COLUMN_IN_BOOKS_CSV = 'Title';
const BOOK_AUTHORS_COLUMN_IN_BOOKS_CSV = 'authors';
const BOOK_DESCRIPTION_COLUMN_IN_BOOKS_CSV = 'description';
const BOOK_IMAGE_COLUMN_IN_BOOKS_CSV = 'image';
const BOOK_PREVIEWLINK_COLUMN_IN_BOOKS_CSV = 'previewLink';
const BOOK_PUBLISHER_COLUMN_IN_BOOKS_CSV = 'publisher';
const BOOK_PUBLISHEDDATE_COLUMN_IN_BOOKS_CSV = 'publishedDate';
const BOOK_INFOLINK_COLUMN_IN_BOOKS_CSV = 'infoLink';
const BOOK_CATEGORIES_COLUMN_IN_BOOKS_CSV = 'categories';
const BOOK_RATINGSCOUNT_COLUMN_IN_BOOKS_CSV = 'ratingsCount'; // Pode não ser usado, já que calculamos

const REVIEW_ID_COLUMN_IN_REVIEWS_CSV = 'Id';
const REVIEW_TITLE_COLUMN_IN_REVIEWS_CSV = 'Title';
const REVIEW_PRICE_COLUMN_IN_REVIEWS_CSV = 'Price'; // Usado para popular 'original_price_text'
const REVIEW_USERID_COLUMN_IN_REVIEWS_CSV = 'User_id';
const REVIEW_PROFILENAME_COLUMN_IN_REVIEWS_CSV = 'profileName';
const REVIEW_HELPFULNESS_COLUMN_IN_REVIEWS_CSV = 'review/helpfulness';
const REVIEW_SCORE_COLUMN_IN_REVIEWS_CSV = 'review/score';
const REVIEW_TIME_COLUMN_IN_REVIEWS_CSV = 'review/time';
const REVIEW_SUMMARY_COLUMN_IN_REVIEWS_CSV = 'review/summary';
const REVIEW_TEXT_COLUMN_IN_REVIEWS_CSV = 'review/text';
// --- Fim Nomes das Colunas ---

// Função para normalizar títulos (ignora case e espaços extras)
function normalizeTitle(title) {
    if (typeof title !== 'string' || !title) {
        return ''; // Retorna string vazia se não for string ou for vazia/null/undefined
    }
    return title.trim().toLowerCase();
}
// Função para importar Livros
async function importBooks() {
    console.log('Iniciando importação de books_details.csv...');
    const filePath = path.resolve(__dirname, '../data/books_details.csv');
    if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);

    let booksRead = 0;
    const client = await pool.connect();
    console.log('Conexão (livros) estabelecida.');

    try {
        await client.query('BEGIN');
        console.log('Transação (livros) iniciada.');

        const processedTitles = new Set();
        const stream = fs.createReadStream(filePath).pipe(csv());

        for await (const book of stream) {
            booksRead++;
            const bookTitle = book[BOOK_TITLE_COLUMN_IN_BOOKS_CSV];

            if (!bookTitle || processedTitles.has(bookTitle)) {
                if(!bookTitle && booksRead > 1) console.warn(`Linha ${booksRead}: Livro sem título encontrado, pulando.`); // Evita log excessivo para cabeçalho vazio
                continue;
            }

            try {
                const insertQuery = `
                    INSERT INTO books (title, description, authors, image, previewLink, publisher, publishedDate, infoLink, categories, price, average_score, reviews_count)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, 0.0, 0) -- Insere com agregados padrão
                    ON CONFLICT (title) DO NOTHING; -- Requer UNIQUE constraint em 'title'
                `;
                await client.query(insertQuery, [
                    bookTitle,
                    book[BOOK_DESCRIPTION_COLUMN_IN_BOOKS_CSV] || null, // Usa NULL se vazio
                    book[BOOK_AUTHORS_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_IMAGE_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_PREVIEWLINK_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_PUBLISHER_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_PUBLISHEDDATE_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_INFOLINK_COLUMN_IN_BOOKS_CSV] || null,
                    book[BOOK_CATEGORIES_COLUMN_IN_BOOKS_CSV] || null,
                ]);
                processedTitles.add(bookTitle);

                 if (booksRead % 20000 === 0) console.log(`Lidos ${booksRead} livros do CSV...`);

            } catch (insertError) {
                console.error(`Erro ao inserir/ignorar livro "${bookTitle}" (linha ~${booksRead}):`, insertError.message);
                // throw insertError; // Descomente para parar o script em caso de erro aqui
            }
        } // Fim do loop for await

        console.log(`Leitura do CSV de livros concluída (${booksRead} linhas lidas). Populando mapa de títulos...`);

        // Popula o mapa DEPOIS que todos os inserts/conflicts foram tratados
        const allBooks = await client.query('SELECT id, title FROM books WHERE title IS NOT NULL');
        allBooks.rows.forEach(row => {
            const normalized = normalizeTitle(row.title); // Normaliza aqui
            if (normalized) { // Só adiciona se o título normalizado não for vazio
                 bookTitleToIdMap.set(normalized, row.id); // Usa o título normalizado como chave
            }
        });
        console.log(`Mapa de títulos normalizados populado com ${bookTitleToIdMap.size} entradas.`);

        await client.query('COMMIT');
        console.log('Transação (livros) commitada.');
        console.log('Importação de livros concluída com sucesso.');

    } catch (error) {
        console.error('Erro GERAL na importação de livros:', error);
        try { await client.query('ROLLBACK'); console.log('Transação (livros) revertida devido a erro.'); } catch (rbErr) { console.error("Erro no ROLLBACK de livros:", rbErr);}
        throw error;
    } finally {
        client.release();
        console.log('Conexão (livros) liberada.');
    }
}

// Função para importar Reviews em Lotes
async function importReviews(batchSize = 5000) {
    if (bookTitleToIdMap.size === 0) {
        console.warn("Mapa de títulos de livros está vazio. Importação de reviews abortada.");
        return { reviewsLinked: 0, reviewsUnlinked: 0 };
    }
    console.log(`Iniciando importação BATCH de reviews.csv (batch size: ${batchSize})...`);

    const filePath = path.resolve(__dirname, '../data/reviews.csv');
    if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);

    let batch = [];
    let reviewsLinked = 0;
    let reviewsUnlinked = 0;
    let totalProcessed = 0;
    let loggedKeys = false; // Flag para logar as chaves apenas uma vez
    const client = await pool.connect();
    console.log('Conexão (reviews) estabelecida.');

    try {
        await client.query('BEGIN');
        console.log('Transação (reviews) iniciada.');

        // Tenta remover a opção headers: true por enquanto, para ver se ajuda
        const stream = fs.createReadStream(filePath).pipe(csv({ escape: '"' }));

        for await (const review of stream) {
            totalProcessed++;

            // --- NOVO DEBUG ---
            // Loga as chaves do PRIMEIRO objeto 'review' recebido
            if (!loggedKeys && review) {
                console.log("--- DEBUG: Chaves encontradas no primeiro objeto 'review' ---");
                console.log(Object.keys(review));
                console.log("--- FIM DEBUG ---");
                loggedKeys = true; // Marca que já logou
            }
            // --- FIM NOVO DEBUG ---


            const originalBookTitle = review[REVIEW_TITLE_COLUMN_IN_REVIEWS_CSV]; // Continua usando a constante
            const normalizedBookTitle = normalizeTitle(originalBookTitle);
            const bookId = bookTitleToIdMap.get(normalizedBookTitle);

            // Log de debug original (mantido por enquanto)
            if (totalProcessed <= 5 || (totalProcessed % 500000 === 0 && totalProcessed > 0)) {
                 console.log(`DEBUG Review ${totalProcessed}: Original Title='${originalBookTitle}', Normalized='${normalizedBookTitle}', Found ID=${bookId}`);
            }

            if (bookId) {
                reviewsLinked++;
                const reviewScore = parseFloat(review[REVIEW_SCORE_COLUMN_IN_REVIEWS_CSV]) || null;
                const reviewTime = parseInt(review[REVIEW_TIME_COLUMN_IN_REVIEWS_CSV]) || null;
                batch.push([
                    bookId, review[REVIEW_ID_COLUMN_IN_REVIEWS_CSV] || null, review[REVIEW_USERID_COLUMN_IN_REVIEWS_CSV] || null,
                    review[REVIEW_PROFILENAME_COLUMN_IN_REVIEWS_CSV] || null, review[REVIEW_HELPFULNESS_COLUMN_IN_REVIEWS_CSV] || null,
                    reviewScore, reviewTime, review[REVIEW_SUMMARY_COLUMN_IN_REVIEWS_CSV] || null,
                    review[REVIEW_TEXT_COLUMN_IN_REVIEWS_CSV] || null,
                    review[REVIEW_PRICE_COLUMN_IN_REVIEWS_CSV] || null
                ]);
            } else {
                reviewsUnlinked++;
            }

            if (batch.length >= batchSize) {
                await processReviewBatch(client, batch);
                // Removido log daqui para evitar poluição
                batch = [];
            }
        } // Fim do loop for await

        // ... (resto da função igual: processa lote final, commit, return, catch, finally) ...
        if (batch.length > 0) {
            console.log(`Processando lote final com ${batch.length} reviews...`);
            await processReviewBatch(client, batch);
            batch = [];
        }

        console.log(`Leitura do CSV de reviews concluída. Total processado: ${totalProcessed}.`);
        await client.query('COMMIT');
        console.log('Transação (reviews) commitada.');
        return { reviewsLinked, reviewsUnlinked };

    } catch (error) {
        console.error('Erro GERAL na importação de reviews:', error);
        try { await client.query('ROLLBACK'); console.log('Transação (reviews) revertida devido a erro.');} catch (rbErr) { console.error("Erro no ROLLBACK de reviews:", rbErr);}
        throw error;
    } finally {
        client.release();
        console.log('Conexão (reviews) liberada.');
    }
}

// Função auxiliar para processar um lote de reviews
async function processReviewBatch(client, batch) {
    if (!batch || batch.length === 0) return;

    const columns = [
        'book_id', 'original_review_id', 'user_id', 'profileName',
        'review_helpfulness', 'review_score', 'review_time',
        'review_summary', 'review_text',
        'original_price_text' // Inclui a coluna para o texto do preço
    ];
    const numColumns = columns.length;
    const numRows = batch.length;
    const valuesPlaceholders = [];
    const flatValues = [];
    let placeholderIndex = 1;

    for (let i = 0; i < numRows; i++) {
        const rowPlaceholders = [];
        if (!batch[i] || batch[i].length !== numColumns) {
             console.warn(`Linha de review ignorada no batch devido a dados inválidos/colunas (${batch[i] ? batch[i].length : 'undefined'} vs ${numColumns})`);
             continue;
        }
        for (let j = 0; j < numColumns; j++) {
            rowPlaceholders.push(`$${placeholderIndex++}`);
            flatValues.push(batch[i][j]);
        }
        valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    if (valuesPlaceholders.length === 0) {
        console.log(`Nenhuma review válida no lote atual para inserir.`);
        return;
    }

    // Insere diretamente na tabela 'reviews' (assumindo que a coluna 'original_price_text' foi adicionada)
    const insertQuery = `INSERT INTO reviews (${columns.join(', ')}) VALUES ${valuesPlaceholders.join(', ')} ON CONFLICT DO NOTHING`; // Adiciona ON CONFLICT por segurança se houver ID duplicado em reviews.csv

    try {
        await client.query(insertQuery, flatValues);
    } catch (batchError) {
         console.error(`Erro ao inserir lote de reviews:`, batchError.message);
         throw batchError; // Propaga o erro para causar rollback da transação principal
    }
}

// Função para atualizar agregados (Contagem, Média de Score e Preço)
async function updateBookAggregates() {
    console.log("Iniciando atualização de agregados (contagem, média, preço) na tabela books...");
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Atualiza a Contagem e Média de Score
        console.log("Atualizando reviews_count e average_score...");
        const updateCountsAndAvgQuery = `
            WITH Aggregates AS (
                SELECT
                    r.book_id,
                    COUNT(r.id) as book_review_count,
                    AVG(r.review_score) as avg_score
                FROM reviews r
                WHERE r.book_id IS NOT NULL AND r.review_score IS NOT NULL
                GROUP BY r.book_id
            )
            UPDATE books b
            SET
                reviews_count = COALESCE(a.book_review_count, 0),
                average_score = COALESCE(a.avg_score, 0.0)
            FROM Aggregates a
            WHERE b.id = a.book_id;
        `;
        const aggResult = await client.query(updateCountsAndAvgQuery);
        console.log(`${aggResult.rowCount} livros tiveram contagem/média atualizados a partir das reviews.`);

        const zeroAggQuery = `
            UPDATE books
            SET reviews_count = 0, average_score = 0.0
            WHERE id NOT IN (SELECT DISTINCT book_id FROM reviews WHERE book_id IS NOT NULL);
        `;
        const zeroAggResult = await client.query(zeroAggQuery);
        console.log(`${zeroAggResult.rowCount} livros tiveram contagem/média zerados.`);

        // 2. Atualiza o Preço (pegando da primeira review com 'original_price_text' válido)
        console.log("Atualizando price (pegando da primeira review com 'original_price_text' válido)...");
        const updatePriceQuery = `
             WITH FirstValidPrice AS (
                 SELECT
                     r.book_id,
                     -- Limpa o texto original do preço e converte
                     CAST(NULLIF(regexp_replace(r.original_price_text, '[^0-9.]+', '', 'g'), '') AS NUMERIC(10,2)) as price_value,
                     -- Ordena por tempo da review (mais antiga primeiro), depois por ID da review
                     ROW_NUMBER() OVER(PARTITION BY r.book_id ORDER BY r.review_time ASC NULLS LAST, r.id ASC) as rn
                 FROM reviews r
                 WHERE r.original_price_text IS NOT NULL       -- Garante que há texto
                   AND NULLIF(regexp_replace(r.original_price_text, '[^0-9.]+', '', 'g'), '') IS NOT NULL -- Garante que sobrou algo numérico
                   AND regexp_replace(r.original_price_text, '[^0-9.]+', '', 'g') ~ '^[0-9]*\.?[0-9]+$' -- Garante que é um número válido (permite .50, 10, 10.50)
                   AND CAST(NULLIF(regexp_replace(r.original_price_text, '[^0-9.]+', '', 'g'), '') AS NUMERIC) >= 0 -- Garante que é não negativo
             )
             UPDATE books b
             SET price = fvp.price_value
             FROM FirstValidPrice fvp
             WHERE b.id = fvp.book_id -- Liga livro com o preço encontrado
               AND fvp.rn = 1         -- Pega apenas a primeira review válida (a mais antiga)
               AND (b.price IS NULL OR b.price <= 0.00); -- Só atualiza se o livro não tiver preço válido
         `;

         try {
            // << DESCOMENTE ESTA LINHA SE VOCÊ ADICIONOU A COLUNA 'original_price_text' em 'reviews' >>
             const priceResult = await client.query(updatePriceQuery);
             console.log(`${priceResult.rowCount} livros tiveram 'price' atualizado.`);
         } catch (priceError) {
             console.error("ERRO ao executar a query de atualização de preços:", priceError.message);
             console.warn("Verifique se a coluna 'original_price_text' existe na tabela 'reviews' e se a query está correta para seus dados.");
             // throw priceError; // Descomente para parar o script se o preço falhar
         }

        await client.query('COMMIT');
        console.log("Atualização de agregados concluída com sucesso.");

    } catch (error) {
        console.error("Erro ao atualizar agregados na tabela books:", error);
        try { await client.query('ROLLBACK'); console.log('Transação (agregados) revertida devido a erro.'); } catch (rbErr) { console.error("Erro no ROLLBACK de agregados:", rbErr);}
        throw error;
    } finally {
        client.release();
        console.log("Cliente de atualização de agregados liberado.");
    }
}

// Função Principal de Execução
async function runImport() {
    const startTime = Date.now();
    console.log(`--- Iniciando processo de importação em ${new Date().toISOString()} ---`);
    let importSuccessful = false;
    try {
        console.log('Limpando tabelas (reviews e books)...');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE reviews RESTART IDENTITY CASCADE');
            await client.query('TRUNCATE TABLE books RESTART IDENTITY CASCADE');
            await client.query('COMMIT');
            console.log('Tabelas limpas com TRUNCATE.');
        } catch (e) {
            await client.query('ROLLBACK');
            console.warn("Falha ao usar TRUNCATE, tentando DELETE...");
            try {
                 await client.query('BEGIN');
                 await client.query('DELETE FROM reviews');
                 await client.query('DELETE FROM books');
                 await client.query('COMMIT');
                 console.log('Tabelas limpas com DELETE.');
            } catch (delErr){
                 await client.query('ROLLBACK');
                 console.error("Erro fatal ao limpar tabelas com DELETE:", delErr);
                 throw delErr;
            }
        } finally {
            client.release();
        }

        await importBooks();
        const { reviewsLinked, reviewsUnlinked } = await importReviews(5000); // Ajuste batch size se necessário
        console.log(`Importação de reviews finalizada: ${reviewsLinked} vinculadas, ${reviewsUnlinked} não vinculadas.`);

        if (reviewsLinked > 0) {
            await updateBookAggregates();
        } else {
            console.log("Nenhuma review vinculada inserida, pulando atualização de agregados.");
        }

        importSuccessful = true;
        console.log('--- Processo de importação e atualização completo ---');

    } catch (error) {
        console.error('--- Falha GERAL no processo de importação ---:', error.message);
        // console.error(error.stack); // Descomente para ver o stack trace completo do erro JS
    } finally {
        await pool.end();
        const endTime = Date.now();
        const durationMinutes = ((endTime - startTime) / 1000 / 60).toFixed(2);
        console.log(`--- Importação finalizada. Tempo total: ${durationMinutes} minutos. Status: ${importSuccessful ? 'SUCESSO' : 'FALHA'} ---`);
        console.log('Conexão com o banco de dados fechada.');
    }
}

// Executa o script
runImport();