const chatBox = document.getElementById('chat-box'); //document.get find the HTML element with id="chat-box"
const inputBox = document.getElementById('input-box'); //document.get find the HTML element with id="input-box"
const sendBtn = document.getElementById('send-btn'); //document.get find the HTML element with id="send-btn"
const typingIndicator = document.getElementById('typing'); // typing dots indicator
const welcome = document.getElementById('welcome'); // welcome splash

// Helper: create a chat bubble and append it
// For AI messages we parse markdown → HTML so bold, lists, headers etc. render properly
function addMessage(text, type) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', type);

    if (type === 'ai') {
        // Parse markdown into formatted HTML (bold, bullets, headers, etc.)
        bubble.innerHTML = marked.parse(text);
    } else {
        // User & error messages stay as plain text (safe, no injection)
        bubble.textContent = text;
    }

    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() { //main function sends message to backend and display response
//async means function can wait for things like API responses without freezing page

    //USER RESPONSE
    const message = inputBox.value.trim(); //grabbing user value from whatever text is in input field
    if (!message) return; //if empty do nothing and exit function

    // Hide welcome screen on first message
    if (welcome) welcome.style.display = 'none';

    addMessage(message, 'user'); //display the user's message as a bubble
    inputBox.value = ''; //clear so user can type a new message

    // Show typing indicator
    typingIndicator.classList.add('visible');
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        // Get the Firebase auth token (set by auth.js)
        const token = getAuthToken();
        if (!token) {
            addMessage('You must be logged in to chat.', 'error');
            typingIndicator.classList.remove('visible');
            return;
        }

        //AI RESPONSE
        const response = await fetch('http://localhost:5000/chat', { //'await' - pause til server reponse, 'fetch' - makes http request to make backend, localhost is URL of flask /chat endpoint
            method: 'POST', //POST means sending data TO the server
            headers: {
                'Content-Type': 'application/json', //headers tell the server what kind of data we're sending and 'application/json' sending via JSON format
                'Authorization': `Bearer ${token}` // send Firebase ID token so backend knows who we are
            },
            body: JSON.stringify({message}) //body is what we're sending, JSON.stringify - convert JavaScript object to JSON format
        }); //should contain the server's reply in 'response'

        const data = await response.json(); // convert the server's JSON response into javascript obj, await - waits for conversion to finish
        // 'data' is now javascript obj like {response: "AI's answer"}

        // Hide typing indicator
        typingIndicator.classList.remove('visible');

        if (data.error) {
            addMessage(data.error, 'error'); //specific error
            return;
        }
        if (data.response) {
            addMessage(data.response, 'ai'); //AI response bubble
        } else {
            addMessage('No response from server', 'error');
        }
    } catch (err) {
        // Hide typing indicator on network errors too
        typingIndicator.classList.remove('visible');
        addMessage('Could not reach the server. Is it running?', 'error');
    }
}

//button or enter region
sendBtn.addEventListener('click', sendMessage); //addeventListener waits for the event like click to happen and when even fires the "sendMessage" function will occur
inputBox.addEventListener('keypress', (e) => { //checks if the user presses "Enter" then calls the sendMessage function
    if (e.key === 'Enter') sendMessage();
});

// ── Dark / Light Mode Toggle ──────────────────────────
const themeSwitch = document.getElementById('theme-switch'); // checkbox toggle in the header

// On load: check if user previously chose dark mode (saved in localStorage)
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    themeSwitch.checked = true;
}

// When the toggle changes, flip the class and remember the choice
themeSwitch.addEventListener('change', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
