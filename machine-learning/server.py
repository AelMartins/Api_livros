"""
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
"""
# import pandas as pd
# from joblib import load
from flask import Flask, jsonify, request

# model = load('./model.pkl')

app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict():
    """
    Envia request e recebe response da IA
    """
    # data = request.get_json()
    # required_keys = [
    #     "categories", 
    #     "titles", 
    #     "scores"
    # ]

    # if not isinstance(data, dict):
    #     return jsonify({"error": "Invalid data format. Expected JSON."}), 400
    
    # if not all(key in data for key in required_keys):
    #     return jsonify({"error": "Missing one or more required fields."}), 400

    # processed_data = pd.DataFrame([data])

    # if processed_data.shape[0] != 1:
    #     return jsonify({"error": "Processed data should have one row."}), 400

    # try:
    #     prediction = model.predict(processed_data)
    #     return jsonify({'prediction': prediction.tolist()})
    # except Exception as e:
    #     return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    PORT = 5000
    print(f'Starting machine learning server on port: {PORT}')
    app.run(port=PORT, debug=True)