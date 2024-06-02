const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session');
const { register, collectDefaultMetrics, Counter } = require('prom-client');
const winston = require('winston');
const LokiTransport = require('winston-loki');

// Initialize Prometheus default metrics collection
collectDefaultMetrics();

// Configure the Loki logger
const logger = winston.createLogger({
    transports: [
        new LokiTransport({
            host: 'http://3.108.60.240:3100', // Replace with your Loki host and port
            labels: { app: 'nodejs-app' },
            json: true,
            format: winston.format.json(),
        })
    ]
});

// Additional logger for errors
const errorLogger = winston.createLogger({
    transports: [
        new LokiTransport({
            host: 'http://3.108.60.240:3100', // Replace with your Loki host and port
            labels: { app: 'nodejs-app', type: 'error' }, // Additional label to distinguish error logs
            json: true,
            format: winston.format.json(),
        })
    ]
});

const app = express();
const port = 8000;

const connection = mysql.createConnection({
    host: 'zoeencloud-rds.cn2m8c6mk6nl.ap-south-1.rds.amazonaws.com', //rds endpoint
    user: 'admin',
    password: 'Admin123123',
    database: 'bd'
});

connection.connect((err) => {
    if (err) {
        logger.error('Error connecting to MySQL server', { error: err });
        return;
    }
    logger.info('Connected to MySQL server');

    // Check if the table exists and create it if it doesn't
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS login_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            email_id VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    connection.query(createTableQuery, (err, result) => {
        if (err) {
            logger.error('Error creating table', { error: err });
            return;
        }
        logger.info('Table exists or created successfully');
    });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// Custom Prometheus metrics
const httpRequestCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

app.use((req, res, next) => {
    res.on('finish', () => {
        httpRequestCounter.inc({
            method: req.method,
            route: req.route ? req.route.path : 'unknown',
            status_code: res.statusCode
        });
    });
    next();
});

// Expose Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/cart', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }
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

    try {
        await executeQuery('INSERT INTO login_details (username, email_id, password) VALUES (?, ?, ?)', [username, email_id, password]);
        res.redirect('/login');
        logger.info('User signed up', { username, email_id });
    } catch (error) {
        res.status(500).send('Failed to sign up');
        errorLogger.error('Signup failed', { error });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const users = await executeQuery('SELECT * FROM login_details WHERE username = ? AND password = ?', [username, password]);

        if (users.length > 0) {
            req.session.username = username;
            res.redirect('/dashboard');
            logger.info('User logged in', { username });
        } else {
            res.status(401).send('Invalid username or password');
            errorLogger.warn('Invalid login attempt', { username });
        }
    } catch (error) {
        res.status(500).send('Failed to login');
        errorLogger.error('Login failed', { error });
    }
});

app.listen(port, () => {
    logger.info(Server running on port ${port});
});
