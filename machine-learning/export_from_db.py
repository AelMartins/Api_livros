import pandas as pd
from sqlalchemy import create_engine
import os

DB_USER = "postgres"
DB_PASSWORD = "79Ei87s7"
DB_HOST = "127.0.0.1"
DB_PORT = "5432"
DB_NAME = "bookstore_db"

OUTPUT_PATH = os.path.join("model_components", "df_books.csv")

print("Iniciando exportação do banco de dados para o arquivo CSV...")

try:
    db_url = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(db_url)

    query = """
        SELECT
            id,
            title,
            description,
            authors,
            image,
            previewlink,
            publisher,
            publisheddate,
            infolink,
            categories,
            price,
            average_score,
            reviews_count
        FROM
            books
        ORDER BY
            id ASC;
    """
    
    print(f"Conectando ao banco e executando a query...")

    df = pd.read_sql(query, engine)
    
    print(f"Sucesso! {len(df)} livros foram encontrados no banco de dados.")

    df.to_csv(OUTPUT_PATH, index=False)
    
    print(f"\nArquivo '{OUTPUT_PATH}' foi criado/atualizado com sucesso!")
    print("A primeira coluna do novo CSV agora deve ser 'id'.")

except Exception as e:
    print(f"\n[ERRO] Falha ao conectar ou exportar os dados do banco.")
    print(f"Detalhes do erro: {e}")
    print("\nVerifique os nomes das colunas na query SQL se o erro persistir.")