"""
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
"""
import os
import json
import pickle
import numpy as np
from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model, Model
from tensorflow.keras.preprocessing.sequence import pad_sequences
from sklearn.metrics.pairwise import cosine_similarity

# ===== 1. Carregar os componentes =====
BASE = "model_components"
MODEL_PATH       = os.path.join(BASE, "modelo_embeddings.keras")
EMB_PATH         = os.path.join(BASE, "book_embeddings.npy")
TOK_AUTH_PATH    = os.path.join(BASE, "tokenizer_auth.pkl")
TOK_CAT_PATH     = os.path.join(BASE, "tokenizer_cat.pkl")
LE_PUB_PATH      = os.path.join(BASE, "le_pub.pkl")
LE_YEAR_PATH     = os.path.join(BASE, "le_year.pkl")

model = load_model(MODEL_PATH)
book_embeddings = np.load(EMB_PATH)
with open(TOK_AUTH_PATH, "rb") as f:
    tok_auth = pickle.load(f)
with open(TOK_CAT_PATH, "rb") as f:
    tok_cat = pickle.load(f)
with open(LE_PUB_PATH, "rb") as f:
    le_pub = pickle.load(f)
with open(LE_YEAR_PATH, "rb") as f:
    le_year = pickle.load(f)

MAX_AUTH = int(model.inputs[0].shape[1])
MAX_CAT  = int(model.inputs[1].shape[1])

embedding_model = Model(
    inputs=model.input,
    outputs=model.get_layer("book_embedding").output
)

# ===== 2. Função de recomendação com retorno de índices =====
def recomendar_livros(data, top_k=5):
    authors_raw    = data.get("authors",        ["Unknown"])
    categories_raw = data.get("categories",     ["General"])
    publisher_raw  = data.get("publisher",      "Unknown")
    year_raw       = data.get("published_year", "2000")
    avg_rating_val = float(data.get("average_rating",        3.5))
    avg_review_val = float(data.get("average_review_rating", 3.5))

    auth_seq = tok_auth.texts_to_sequences([[a.strip() for a in authors_raw]])
    cat_seq  = tok_cat.texts_to_sequences([[c.strip() for c in categories_raw]])
    authors    = pad_sequences(auth_seq, maxlen=MAX_AUTH, padding="post")
    categories = pad_sequences(cat_seq, maxlen=MAX_CAT,  padding="post")

    pub_id = le_pub.transform([publisher_raw]) \
             if publisher_raw in le_pub.classes_ else le_pub.transform(["Unknown"])
    try:
        yr = int(year_raw)
        year_id = le_year.transform([yr]) if yr in le_year.classes_ else le_year.transform([0])
    except:
        year_id = le_year.transform([0])

    pub_id   = np.array(pub_id).reshape(1,1)
    year_id  = np.array(year_id).reshape(1,1)
    avg_rating = np.array([[avg_rating_val]])
    avg_review = np.array([[avg_review_val]])

    input_data = {
        "authors":    authors,
        "categories": categories,
        "publisher":  pub_id,
        "year":       year_id,
        "avg_rating": avg_rating,
        "avg_review": avg_review
    }

    emb = embedding_model.predict(input_data)
    sims = cosine_similarity(emb, book_embeddings)[0]
    top_idx = sims.argsort()[::-1][:top_k]

    return top_idx.tolist(), sims[top_idx].tolist()

# ===== 3. Servidor Flask =====
app = Flask(__name__)

@app.route("/predict", methods=["POST"])
def predict():
    """
    Retorna a predião do modelo de IA
    """
    if not request.is_json:
        return jsonify({"error": "Invalid data format. Expected JSON."}), 400

    data = request.get_json()
    try:
        indices, scores = recomendar_livros(data, top_k=5)
        # Resultado básico com índice e score (para buscar no banco)
        recommendations = [
            {"index": int(idx), "score": float(score)}
            for idx, score in zip(indices, scores)
        ]
        return jsonify({"recommendations": recommendations})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===== 4. Execução local =====
if __name__ == "__main__":
    PORT = 5000
    print(f"Starting machine learning server on port {PORT}...")
    app.run(host="0.0.0.0", port=PORT, debug=True)
