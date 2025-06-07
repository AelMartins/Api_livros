import pandas as pd
import os

CSV_PATH = os.path.join("model_components", "df_books.csv")

try:
    df_books = pd.read_csv(CSV_PATH)
except FileNotFoundError:
    print(f"[ERRO] O arquivo 'df_books.csv' não foi encontrado em '{CSV_PATH}'!")
    print("Você precisa colocar o arquivo CSV com os dados dos livros nesta pasta.")
    exit()

def buscar_livro_por_indice(index):
    """Pega um índice e retorna os dados do livro daquela linha do CSV."""
    try:
        livro = df_books.iloc[index] 
        return {
        "title": livro.get("Title"), 
        "authors": livro.get("authors")
        }
    except IndexError:
        return {"error": f"Índice {index} não encontrado."}


indices_recomendados = [55938, 74533, 21455, 37169, 152540]

print("--- Buscando nomes dos livros a partir dos índices ---")
for idx in indices_recomendados:
    detalhes = buscar_livro_por_indice(idx)
    print(f"Índice {idx}: {detalhes}")