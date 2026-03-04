from flask import Flask, request, jsonify #flask used to build a web server in Python
from flask_cors import CORS # lets frontend and backend communicate with each other
import os # for environment variables
from google import genai # import the google genai library to talk to google's gemini models
from google.genai import types # import types for structured content (roles, parts)
import firebase_admin # Firebase Admin SDK for verifying auth tokens
from firebase_admin import credentials, auth as fb_auth, firestore # credentials for service account, auth for token verification, firestore for database

app = Flask(__name__) # create the flask app (my server)

CORS(app) # turn on CORS so other apps (Like React) can call this server - now HTML/JS file can send requests to http://localhost:5000

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY")) # create a client to talk to google's gemini models, using the API key stored in the environment variable GOOGLE_API_KEY 

# ── Load system prompt from CLAUDE.md ────────────────────────
# Reads the AJ Bot personality / instructions file once at startup
prompt_path = os.path.join(os.path.dirname(__file__), "CLAUDE.md")
with open(prompt_path, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

# ── Firebase Admin SDK Setup ─────────────────────────────────
# Initialize Firebase Admin with a service account key file
# TODO: Set the FIREBASE_CREDENTIALS env var to the path of your service account JSON file
#       Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
cred_path = os.getenv("FIREBASE_CREDENTIALS", "serviceAccountKey.json")
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)

# Firestore database client — used to store per-user chat history
db = firestore.client()

# ── Auth Helper: verify Firebase ID token ────────────────────
def verify_token(req):
    """
    Extracts and verifies the Firebase ID token from the Authorization header.
    Returns the user's UID if valid, or (None, error_response) if not.
    """
    auth_header = req.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, (jsonify({"error": "Missing or invalid Authorization header"}), 401)
    
    token = auth_header.split('Bearer ')[1]
    try:
        decoded = fb_auth.verify_id_token(token) # verifies signature, expiry, and issuer
        return decoded['uid'], None # return the user's unique Firebase UID
    except Exception as e:
        return None, (jsonify({"error": f"Invalid token: {str(e)}"}), 401)

# ── Firestore Helper: get user's chat history ─────────────────
def get_user_history(uid):
    """
    Fetches all messages for a user from Firestore, ordered by timestamp.
    Returns a list of dicts: [{"role": "user"|"model", "text": "..."}, ...]
    """
    messages_ref = db.collection('users').document(uid).collection('messages')
    docs = messages_ref.order_by('timestamp').stream() # get all messages sorted by time
    return [doc.to_dict() for doc in docs]

def save_message(uid, role, text):
    """
    Saves a single message (user or model) to Firestore under the user's collection.
    """
    messages_ref = db.collection('users').document(uid).collection('messages')
    messages_ref.add({
        'role': role,         # "user" or "model"
        'text': text,         # the message content
        'timestamp': firestore.SERVER_TIMESTAMP # Firestore sets this to the server's current time
    })

# ── /chat endpoint ───────────────────────────────────────────
@app.route("/chat", methods=["POST"]) # creates a route/endpoint that'll handle POST requests to /chat 
def chat(): #will run everytime someone calls https://localhost:5000/chat with a POST request
    # Step 1: Verify the user is logged in
    uid, error = verify_token(request)
    if error:
        return error
    
    data = request.json #automatically converts JSON data into python dictionary
    user_message = data.get('message', '') #get the message from the user that was sent in the POST request

    if not user_message: #if empty
        return jsonify({"error": "No message provided"}), 400 #if no message was sent, return an error response and 400 HTTP status code for bad request
    
    # Step 2: Save the user's message to Firestore
    save_message(uid, 'user', user_message)

    # Step 3: Build the full conversation history from Firestore
    # This ensures the AI has context of ALL previous messages for this specific user
    history_docs = get_user_history(uid)
    conversation = []
    for msg in history_docs:
        role = msg['role'] # "user" or "model"
        conversation.append(
            types.Content(role=role, parts=[types.Part.from_text(text=msg['text'])])
        )

    try:
        # Step 4: Call Gemini with the full user-specific conversation + system prompt
        response = client.models.generate_content(
            model="gemini-2.5-flash", #which model to use
            contents=conversation, #send the FULL conversation so the AI has context of previous messages
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT # the AJ Bot personality & rules from CLAUDE.md
            )
        )

        ai_text = response.text

        # Step 5: Save the AI's reply to Firestore so it's part of the history next time
        save_message(uid, 'model', ai_text)

        print(f"[{uid[:8]}...] {ai_text[:80]}...")
        return jsonify({"response": ai_text}) #take the response from the model and send it back to the frontend as JSON  
    except Exception as e:
        return jsonify({"error": str(e)}), 500 #if something goes wrong with the API call, return an error response with the error message and a 500 HTTP status code for server error

# ── /history endpoint ────────────────────────────────────────
@app.route("/history", methods=["GET"]) # GET request to load a user's chat history on page load
def history():
    uid, error = verify_token(request)
    if error:
        return error

    history_docs = get_user_history(uid)
    # Return messages without the Firestore timestamp (frontend doesn't need it)
    clean_history = [{"role": msg['role'], "text": msg['text']} for msg in history_docs]
    return jsonify({"history": clean_history})

# ── /reset endpoint ──────────────────────────────────────────
@app.route("/reset", methods=["POST"]) # endpoint to clear conversation history and start fresh
def reset():
    uid, error = verify_token(request)
    if error:
        return error

    # Delete all messages in this user's Firestore collection
    messages_ref = db.collection('users').document(uid).collection('messages')
    docs = messages_ref.stream()
    for doc in docs:
        doc.reference.delete()

    return jsonify({"status": "Conversation history cleared"})
    
if __name__ == "__main__": #only run when excute "API.py" directly, not when imported as a module
    app.run(debug=True, port = 5000) #start the flask server in debug mode (auto restarts when code changes and provides error messages in the browser)
    # port = 5000 server will run at http://localhost:5000