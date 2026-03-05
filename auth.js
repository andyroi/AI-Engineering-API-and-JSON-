// ── auth.js ─────────────────────────────────────────────────
// Handles Firebase Authentication (sign-up, log-in, log-out)
// and exposes the current user's ID token for API calls.
// ─────────────────────────────────────────────────────────────

// ── Firebase Config ──────────────────────────────────────────
// TODO: Replace these placeholder values with YOUR Firebase project config
// Found at: Firebase Console → Project Settings → General → Your apps → Web app → Config
const firebaseConfig = {
    apiKey:            "AIzaSyCo0zDwAPiwYkEuVIeth5724L2y20L1Zjc",
    authDomain:        "aj-bot-dce0b.firebaseapp.com",
    projectId:         "aj-bot-dce0b",
    storageBucket:     "aj-bot-dce0b.firebasestorage.app",
    messagingSenderId: "66828593867",
    appId:             "1:66828593867:web:710281486507214f36094e"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); // Firebase Auth instance

// ── DOM Elements ─────────────────────────────────────────────
const authScreen       = document.getElementById('auth-screen');
const chatContainer    = document.getElementById('chat-app');        // the whole chat UI
const chatBlur         = document.getElementById('chat-blur');       // chat backdrop blobs
const authForm         = document.getElementById('auth-form');
const authEmail        = document.getElementById('auth-email');
const authPassword     = document.getElementById('auth-password');
const authSubmitBtn    = document.getElementById('auth-submit');
const authToggleBtn    = document.getElementById('auth-toggle');
const authTitle        = document.getElementById('auth-title');
const authError        = document.getElementById('auth-error');
const logoutBtn        = document.getElementById('logout-btn');

let isSignUp = false;    // tracks whether the form is in Sign Up or Log In mode
let currentIdToken = null; // stores the Firebase ID token for API calls

// ── Toggle between Log In / Sign Up ─────────────────────────
authToggleBtn.addEventListener('click', () => {
    isSignUp = !isSignUp;
    authTitle.textContent       = isSignUp ? 'Create Account' : 'Welcome Back';
    authSubmitBtn.textContent   = isSignUp ? 'Sign Up' : 'Log In';
    authToggleBtn.textContent   = isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up";
    authError.textContent       = ''; // clear any previous error
});

// ── Submit handler (Log In or Sign Up) ──────────────────────
authForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // prevent page reload
    authError.textContent = '';

    const email    = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        authError.textContent = 'Please fill in both fields.';
        return;
    }

    try {
        if (isSignUp) {
            await auth.createUserWithEmailAndPassword(email, password);
        } else {
            await auth.signInWithEmailAndPassword(email, password);
        }
        // onAuthStateChanged below will handle the UI switch
    } catch (err) {
        // Show user-friendly Firebase error messages
        const messages = {
            'auth/email-already-in-use':  'That email is already registered.',
            'auth/invalid-email':         'Please enter a valid email address.',
            'auth/weak-password':         'Password must be at least 6 characters.',
            'auth/user-not-found':        'No account found with that email.',
            'auth/wrong-password':        'Incorrect password.',
            'auth/too-many-requests':     'Too many attempts. Try again later.',
            'auth/invalid-credential':    'Invalid email or password.'
        };
        authError.textContent = messages[err.code] || err.message;
    }
});

// ── Log Out ──────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// ── Auth State Listener ──────────────────────────────────────
// Fires whenever the user logs in or out (including on page load)
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // User is signed in — get their ID token for API calls
        currentIdToken = await user.getIdToken();

        // Refresh the token automatically every 55 minutes (tokens expire in 1 hour)
        setInterval(async () => {
            currentIdToken = await user.getIdToken(true); // force refresh
        }, 55 * 60 * 1000);

        // Show chat, hide auth screen
        authScreen.style.display   = 'none';
        chatContainer.style.display = 'flex';
        chatBlur.style.display      = 'block';

        // Load this user's conversation list from the backend
        await loadConversations();
    } else {
        // User is signed out
        currentIdToken = null;

        // Show auth screen, hide chat
        authScreen.style.display   = 'flex';
        chatContainer.style.display = 'none';
        chatBlur.style.display      = 'none';

        // Clear chat bubbles and sidebar for security
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = `
            <div class="welcome" id="welcome">
                <h2>Hello!</h2>
                <p>Ask me about finance, gaming, anime, or life advice.</p>
            </div>`;
        const convList = document.getElementById('conversation-list');
        if (convList) convList.innerHTML = '';
    }
});

// ── Helper: get fresh ID token for API requests ──────────────
// Called by chat.js before every fetch
function getAuthToken() {
    return currentIdToken;
}

// ── Load conversations is now in chat.js (loadConversations) ─
