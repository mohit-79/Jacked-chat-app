# HomeNexus — Developer & Architecture Guide 📖🏡

Welcome! If you are new to software development, this guide is designed to explain exactly how **HomeNexus** works under the hood. We will use simple analogies, avoid complex jargon, and explain what happens when you run commands or use the app.

---

## 1. The Two Halves of the Application

Think of HomeNexus as a modern restaurant. It is divided into two main parts:

```
[ Frontend: The Dining Room ] <════> [ Backend: The Kitchen ] <════> [ Database: The Pantry ]
```

### 🖥️ The Frontend (The Dining Room)
* **What it is**: The parts of the app you see and click on in your browser.
* **Technology**: **React** (JavaScript) and **CSS** (styles).
* **Analogy**: The dining room. It has tables (layouts), menus (buttons), and waitstaff (functions) that take your orders and display the food (messages). It doesn't cook the food; it just shows it to you.

### ⚙️ The Backend (The Kitchen)
* **What it is**: A program running in the background on a computer (server) that does the heavy lifting.
* **Technology**: **Node.js** (the engine) and **Express.js** (the route planner).
* **Analogy**: The kitchen. When you type a message and press send, the frontend sends an order to the kitchen. The kitchen cooks it (saves it, verifies you are logged in) and passes it back.

### 🗄️ The Database (The Pantry)
* **What it is**: An organized filing system where the backend stores permanent records (Users, Messages, Files).
* **Technology**: **MongoDB** (specifically MongoDB Atlas, which hosts it in the cloud).
* **Analogy**: The pantry. The kitchen retrieves ingredients (old messages) or stores new items (new chat threads) here so they aren't lost when the kitchen closes.

---

## 2. The Key Systems & Analogies

To make HomeNexus feel alive, fast, and secure, we use four specialized services. Here is what they do:

### 1. Clerk 🔑 (The Security Guard)
* **Analogy**: A security guard standing at the restaurant door.
* **How it works**: Instead of writing complex, risky code to save passwords and hash them, we let Clerk handle it. 
  * When you visit the app, the guard (Clerk) checks if you are allowed in.
  * If you log in successfully, Clerk gives you a **wristband (a Token)**. 
  * Every time the frontend asks the backend for chats or messages, it shows this wristband. If the wristband is valid, the backend serves the data. If not, it rejects the request with a `401 Unauthorized` error.

### 2. Socket.IO 📞 (The Switchboard Operator)
* **Analogy**: An old-fashioned telephone switchboard operator connecting rooms.
* **How it works**: Standard web requests are "one-way" (the browser asks, the server answers). For chat, we need a "two-way" connection so you receive messages instantly without refreshing.
  * When you log in, Socket.IO opens a direct telephone line between your browser and the server.
  * The server puts you in a private room named after your ID.
  * When someone sends you a message, the server forwards it directly down your telephone line.

### 3. WebRTC 🚀 (The Direct Walkie-Talkie)
* **Analogy**: A physical tube connecting two neighbors' windows directly.
* **How it works**: Normally, sending a file means uploading it to a server (slow) and having the friend download it (slow). 
  * If you and your peer are on the same local network (like the same home WiFi), HomeNexus uses **WebRTC**.
  * The Socket.IO server helps both browsers find each other's local addresses (called "signaling").
  * Once they find each other, they establish a direct, browser-to-browser connection.
  * Files are broken into 256KB chunks and beamed straight across the local network at gigabit speed, completely bypassing the server and MongoDB!

### 4. Multer & Local Storage 📦 (The Backup Mailbox)
* **Analogy**: A physical package locker at the restaurant.
* **How it works**: If you are trying to send a file to someone who is *not* on your WiFi, or if WebRTC fails to establish a direct connection, the app switches to **Cloud Fallback**.
  * The frontend sends the file to the backend Express server.
  * **Multer** (a file-handling tool) catches the file stream and writes it to a folder called `backend-node/uploads/` on the server's hard drive.
  * The backend generates a link so the recipient can download it from the server anytime.

---

## 3. How Data Flows: Step-by-Step

### Scenario: You send a text message to a friend

```
[You: Frontend] 
     │
     ▼
 1. Type "Hello!" and press Send.
 2. Frontend calls POST /api/chats/:chatId/messages.
     │
     ▼
[Express Backend]
     │
     ├─► 3. Verifies your Clerk wristband (Token).
     ├─► 4. Checks if your profile exists in the MongoDB pantry.
     ├─► 5. Writes the message document to MongoDB.
     │
     ▼
[Socket.IO Switchboard]
     │
     └─► 6. Instantly forwards "Hello!" to your friend's active phone line.
     │
     ▼
[Friend: Frontend]
     │
     └─► 7. Receives socket packet and renders the text on their screen.
```

---

## 4. Understanding NPM & Terminal Commands

When working with Node.js applications, you run commands in your terminal. Here is exactly what those commands do:

### 1. `npm install` (Getting the Tools)
* **What it does**: Reads the `package.json` file in your folder, looks at the list of "dependencies" (libraries written by other developers, like `express`, `mongoose`, or `socket.io`), and downloads them from the internet.
* **Where they go**: They are saved in a large folder called `node_modules`. 
* **Analogy**: Ordering a box of specialized kitchen tools (knives, mixers, pots) before you open the restaurant.

### 2. `npm run dev` (Starting the Live Workshop)
* **What it does**: Starts the application in **Development Mode**.
  * **On the Backend**: It runs **Nodemon** (`nodemon server.js`). Nodemon starts your server and watches your files. If you change a line of code and save the file, Nodemon automatically restarts the server so you don't have to do it manually.
  * **On the Frontend**: It runs **Craco** (`craco start`), which compiles your React code, opens a local website on `http://localhost:3000`, and automatically refreshes the web browser whenever you save frontend code.
* **Analogy**: Opening the restaurant for kitchen tests. Any changes you make in the recipe are applied instantly.

### 3. `npm run build` (Packaging for Shipping)
* **What it does**: React code is written in a neat, modular way (many separate files, JSX tags, imports). Browsers cannot read this format directly. `npm run build` takes all these files, merges them, removes comments, and optimizes them into a few small, raw HTML, CSS, and JS files inside a `build` folder.
* **Analogy**: Packing your cooked food into clean, frozen take-out boxes, ready to be shipped and eaten anywhere.

### 4. `npm run start` (Production Run)
* **What it does**: Runs the backend server normally (`node server.js`) without watching files or reloading on changes. This is used in production (e.g. when hosting the website live on Render or AWS) because it is faster and uses less computer memory than development mode.
* **Analogy**: The restaurant is fully open for customers. No recipe changes are allowed while serving.

---

## 5. Troubleshooting Checkpoints

If you run the app and things aren't working, here is what to check:

1. **Port Conflicts**:
   * The backend runs on port `8001`. If another app is running there, the backend won't start.
   * The frontend runs on port `3000`. If you get a prompt asking *"Would you like to run the app on another port?"*, it means a React app is already running in another terminal.
2. **Database Offline**:
   * If Mongoose logs a connection error, verify your `MONGO_URL` in [backend-node/.env](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/backend-node/.env) is correct.
3. **Clerk Not Authenticated**:
   * If REST requests return `401` or `500`, double-check that you copied the correct publishable and secret keys from `dashboard.clerk.com` into both `.env` files and restarted the terminals.
