const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('express-flash');

const app = express();
const port = 3000;

// Asynchronous Database Connection Initialization
let connection;
(async function initializeDatabase() {
    try {
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'database'
        });
        console.log('Connected to MySQL server');
    } catch (err) {
        console.error('Error connecting to MySQL server:', err);
    }
})();

// Middleware Setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(flash());

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 } // 1 minute for demonstration purposes
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy
passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const [users] = await connection.execute('SELECT * FROM new_table WHERE username = ?', [username]);
        if (users.length > 0) {
            const user = users[0];
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (passwordMatch) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Invalid username or password' });
            }
        } else {
            return done(null, false, { message: 'Invalid username or password' });
        }
    } catch (error) {
        return done(error);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.username);
});

passport.deserializeUser(async (username, done) => {
    try {
        const [users] = await connection.execute('SELECT * FROM new_table WHERE username = ?', [username]);
        if (users.length > 0) {
            done(null, users[0]);
        } else {
            done(null, false);
        }
    } catch (error) {
        done(error);
    }
});

// Helper function to execute queries
async function executeQuery(sql, values) {
    try {
        const [results] = await connection.execute(sql, values);
        return results;
    } catch (error) {
        throw error;
    }
}

// Middleware to ensure authentication
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/cart', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'cart.html'));
});

app.get('/cart-data', (req, res) => {
    res.json({ cart: req.session.cart || [] });
});

app.post('/add-to-cart', (req, res) => {
    const { name, price, image } = req.body;

    if (!name || !price || !image) {
        return res.status(400).send('Invalid product data');
    }

    const product = { name, price, image, quantity: 1 };

    if (!req.session.cart) {
        req.session.cart = [];
    }

    const existingProduct = req.session.cart.find(item => item.name === name);
    if (existingProduct) {
        existingProduct.quantity += 1;
    } else {
        req.session.cart.push(product);
    }

    res.status(200).send('Product added to cart');
});

app.post('/remove-from-cart', (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).send('Invalid product data');
    }

    if (!req.session.cart) {
        return res.status(400).send('Cart is empty');
    }

    req.session.cart = req.session.cart.filter(item => item.name !== name);
    res.status(200).send('Product removed from cart');
});

app.post('/clear-cart', (req, res) => {
    req.session.cart = [];
    res.status(200).send('Cart cleared');
});

app.post('/signup', async (req, res) => {
    const { username, email_id, password } = req.body;

    if (!username || !email_id || !password) {
        return res.status(400).send('Invalid signup data');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await executeQuery('INSERT INTO new_table (username, email_id, password) VALUES (?, ?, ?)', [username, email_id, hashedPassword]);
        res.redirect('/login');
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).send('Failed to sign up');
    }
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
}));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
