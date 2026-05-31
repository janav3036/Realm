from flask import Flask, jsonify
from flask_cors import CORS
from board_generator import generate_board

app = Flask(__name__)
CORS(app)

@app.route('/board')
def board():
    return jsonify(generate_board())

if __name__ == '__main__':
    app.run(debug=True, port=5050)