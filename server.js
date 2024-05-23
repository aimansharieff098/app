const express = require('express');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// Connection URI and Database Name
const uri = 'mongodb://localhost:27017/mongouser';

// Function to connect to MongoDB
async function connectToDB() {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        return client.db();
    } catch (error) {
        console.error('Failed to connect to the database:', error);
        throw error;
    }
}

// Redirect root route to login page
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Serve login page
app.get('/login', (req, res) => {
    console.log(`[${new Date().toISOString()}] Serving login page`);
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve signup page
app.get('/signup', (req, res) => {
    console.log(`[${new Date().toISOString()}] Serving signup page`);
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Test database connection endpoint
app.get('/test-db', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Testing database connection`);
    try {
        const testResult = await executeQuery('SELECT 1');
        console.log(`[${new Date().toISOString()}] Database connection successful`);
        res.status(200).send('Database connection successful');
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error connecting to database: ${error}`);
        res.status(500).send('Failed to connect to database');
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check if the user exists in the database
        const user = await executeQuery('SELECT * FROM login_details WHERE username = ?', [username]);

        // If user not found or password is incorrect, redirect back to login page
        if (user.length === 0 || !await bcrypt.compare(password, user[0].password)) {
            console.error(`[${new Date().toISOString()}] Invalid login attempt for user ${username}`);
            return res.redirect('/login');
        }

        // Set the username in the session to indicate user is logged in
        req.session.username = username;

        // Redirect to the dashboard after successful login
        console.log(`[${new Date().toISOString()}] User ${username} logged in successfully`);
        res.redirect('/dashboard');
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during login: ${error}`);
        res.status(500).send('Failed to login');
    }
});

// Logout endpoint
app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error logging out: ${err}`);
            return res.status(500).send('Error logging out');
        }
        console.log(`[${new Date().toISOString()}] User logged out successfully`);
        // Redirect to the login page after logout
        res.redirect('/login');
    });
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
    // Check if user is authenticated (session exists)
    if (!req.session.username) {
        console.log(`[${new Date().toISOString()}] User not authenticated, redirecting to login page`);
        return res.redirect('/login');
    }
    // User is authenticated, render the dashboard
    console.log(`[${new Date().toISOString()}] User authenticated, rendering dashboard`);
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
