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

# ── Firestore Helpers (multi-conversation) ─────────────────────
def get_conversations(uid):
    """
    Returns a list of all conversations for a user, sorted newest-first.
    Each item: {"id": "...", "title": "...", "created_at": ...}
    """
    convs_ref = db.collection('users').document(uid).collection('conversations')
    docs = convs_ref.order_by('created_at', direction=firestore.Query.DESCENDING).stream()
    result = []
    for doc in docs:
        d = doc.to_dict()
        result.append({
            "id": doc.id,
            "title": d.get("title", "New Chat"),
            "created_at": str(d.get("created_at", ""))
        })
    return result

def create_conversation(uid, title="New Chat"):
    """Creates a new conversation document and returns its ID."""
    convs_ref = db.collection('users').document(uid).collection('conversations')
    doc_ref = convs_ref.add({
        'title': title,
        'created_at': firestore.SERVER_TIMESTAMP
    })
    return doc_ref[1].id  # .add() returns (timestamp, doc_ref)

def get_conversation_history(uid, conv_id):
    """
    Fetches all messages for a specific conversation, ordered by timestamp.
    Returns a list of dicts: [{"role": "user"|"model", "text": "..."}, ...]
    """
    messages_ref = (db.collection('users').document(uid)
                      .collection('conversations').document(conv_id)
                      .collection('messages'))
    docs = messages_ref.order_by('timestamp').stream()
    return [doc.to_dict() for doc in docs]

def save_message(uid, conv_id, role, text):
    """
    Saves a single message to a specific conversation in Firestore.
    """
    messages_ref = (db.collection('users').document(uid)
                      .collection('conversations').document(conv_id)
                      .collection('messages'))
    messages_ref.add({
        'role': role,
        'text': text,
        'timestamp': firestore.SERVER_TIMESTAMP
    })

def update_conversation_title(uid, conv_id, title):
    """Updates the title of a conversation (e.g., from the first user message)."""
    doc_ref = (db.collection('users').document(uid)
                 .collection('conversations').document(conv_id))
    doc_ref.update({'title': title})

# ── /chat endpoint ───────────────────────────────────────────
@app.route("/chat", methods=["POST"])
def chat():
    # Step 1: Verify the user is logged in
    uid, error = verify_token(request)
    if error:
        return error
    
    data = request.json
    user_message = data.get('message', '')
    conv_id = data.get('conversationId', '')

    if not user_message:
        return jsonify({"error": "No message provided"}), 400
    if not conv_id:
        return jsonify({"error": "No conversationId provided"}), 400
    
    # Step 2: Save the user's message to Firestore
    save_message(uid, conv_id, 'user', user_message)

    # Step 3: Check if this is the first message — auto-set conversation title
    history_docs = get_conversation_history(uid, conv_id)
    if len(history_docs) == 1:  # only the message we just saved
        # Use the first 40 chars of the user message as the conversation title
        title = user_message[:40] + ('…' if len(user_message) > 40 else '')
        update_conversation_title(uid, conv_id, title)

    # Step 4: Build the full conversation history for Gemini
    conversation = []
    for msg in history_docs:
        role = msg['role']
        conversation.append(
            types.Content(role=role, parts=[types.Part.from_text(text=msg['text'])])
        )

    try:
        # Step 5: Call Gemini with conversation history + system prompt
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=conversation,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT
            )
        )

        ai_text = response.text

        # Step 6: Save the AI's reply to Firestore
        save_message(uid, conv_id, 'model', ai_text)

        # Return AI reply + possibly updated title (so frontend can update the tab)
        title = None
        if len(history_docs) == 1:
            title = user_message[:40] + ('…' if len(user_message) > 40 else '')

        result = {"response": ai_text}
        if title:
            result["title"] = title

        print(f"[{uid[:8]}...] {ai_text[:80]}...")
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── /conversations endpoint (list & create) ──────────────────
@app.route("/conversations", methods=["GET"])
def list_conversations():
    """Return all conversations for the authenticated user."""
    uid, error = verify_token(request)
    if error:
        return error
    convs = get_conversations(uid)
    return jsonify({"conversations": convs})

@app.route("/conversations", methods=["POST"])
def new_conversation():
    """Create a new conversation and return its ID."""
    uid, error = verify_token(request)
    if error:
        return error
    conv_id = create_conversation(uid)
    return jsonify({"id": conv_id, "title": "New Chat"})

# ── /conversations/<id>/history endpoint ──────────────────────
@app.route("/conversations/<conv_id>/history", methods=["GET"])
def conversation_history(conv_id):
    """Return messages for a specific conversation."""
    uid, error = verify_token(request)
    if error:
        return error
    history_docs = get_conversation_history(uid, conv_id)
    clean = [{"role": msg['role'], "text": msg['text']} for msg in history_docs]
    return jsonify({"history": clean})

# ── /conversations/<id> DELETE endpoint ───────────────────────
@app.route("/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    """Delete a conversation and all its messages."""
    uid, error = verify_token(request)
    if error:
        return error

    # Delete all messages in the conversation
    messages_ref = (db.collection('users').document(uid)
                      .collection('conversations').document(conv_id)
                      .collection('messages'))
    docs = messages_ref.stream()
    for doc in docs:
        doc.reference.delete()

    # Delete the conversation document itself
    db.collection('users').document(uid).collection('conversations').document(conv_id).delete()

    return jsonify({"status": "Conversation deleted"})
    
if __name__ == "__main__": #only run when excute "API.py" directly, not when imported as a module
    app.run(debug=True, port = 5000) #start the flask server in debug mode (auto restarts when code changes and provides error messages in the browser)
    # port = 5000 server will run at http://localhost:5000