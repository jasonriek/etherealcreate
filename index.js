const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const betterSqlite = require('better-sqlite3');
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 55555;

// SQLite Database Setup
const db = new betterSqlite('ec.db');
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    role TEXT
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    content TEXT,
    user_id INTEGER,
    username TEXT, -- Add this column to store the username
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Express Middlewares
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Session Middleware
app.use(session({
    store: new SQLiteStore({
        db: 'ec.db', // Change this to your database file
    }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
}));

app.use((req, res, next) => {
    console.log('Session ID:', req.sessionID);
    console.log('User ID in session:', req.session.userId);
    if (req.session.userId) {
      res.locals.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    } else {
      res.locals.user = null;
    }
    next();
});

// Authentication middleware
const authenticate = (req, res, next) => {
    // Check if the user is authenticated
    if (!req.session.userId) {
        console.log('User not authenticated. Redirecting to /login');
        // Redirect unauthenticated users to the login page
        return res.redirect('/login');
    }

    // Continue with authentication
    res.locals.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    console.log('User authenticated:', res.locals.user);
    next();
};

// Routes
app.get('/', (req, res) => {
    console.log('User Object:', res.locals.user);
    const posts = db.prepare('SELECT * FROM posts').all();
    res.render('index', { posts });
});
  
app.post('/post', [check('title').notEmpty().withMessage('Title cannot be empty'), check('content').notEmpty().withMessage('Content cannot be empty'),], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const { title, content } = req.body;
    const userId = res.locals.user ? res.locals.user.id : null;
    let sanitizedContent = content;

    // Extract and save embedded images (Base64 data)
    const matches = content.match(/src="data:image\/[^;]+;base64[^"]+"/g);
    if (matches) {
      const images = matches.map((match) => {
          // Extract Base64 data
          const base64Data = match.replace(/^src="data:image\/[^;]+;base64,/, '');

          // Generate a unique filename
          const filename = `image_${Date.now()}.png`;
          // Save image to the 'uploads' folder
          fs.writeFileSync(path.join(__dirname, 'public', 'uploads', filename), base64Data, 'base64');

          // Return the filename or path if needed
          return filename;
      });
      // Replace image sources with filenames in the content
      sanitizedContent = content;
      images.forEach((image, index) => {
      sanitizedContent = sanitizedContent.replace(matches[index], `src="/uploads/${image}"`)
      });
    }
  
    // Check if the user is allowed to create a post
    const userRole = req.session.userRole;
    if (userRole !== 'admin') {
      return res.status(403).json({ errors: [{ msg: 'Permission denied' }] });
    }
  
    // Continue with the post creation logic
    db.prepare('INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)').run(title, sanitizedContent, userId);
    res.redirect('/');
});
  
app.get('/post/:id', (req, res) => {
    const postId = req.params.id;
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    const comments = db.prepare('SELECT * FROM comments WHERE post_id = ?').all(postId);
    res.render('post', { post, comments });
});
  
app.post('/comment', [check('content').notEmpty().withMessage('Comment cannot be empty'),], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { postId, content } = req.body;
    const userId = res.locals.user ? res.locals.user.id : null;
    const userRole = res.locals.user ? res.locals.user.role : null;
    const username = res.locals.user.username;
    let sanitizedContent = content;

    // Check if the user has the required role to create a comment
    if (userRole !== 'user' && userRole !== 'admin') {
      return res.status(403).json({ errors: [{ msg: 'Permission denied' }] });
    }

    // Extract and save embedded images (Base64 data)
    const matches = content.match(/src="data:image\/[^;]+;base64[^"]+"/g);

    if (matches) {
        const images = matches.map((match) => {
            // Extract Base64 data
            const base64Data = match.replace(/^src="data:image\/[^;]+;base64,/, '');

            // Generate a unique filename
            const filename = `image_${Date.now()}.png`;
            // Save image to the 'uploads' folder
            fs.writeFileSync(path.join(__dirname, 'public', 'uploads', filename), base64Data, 'base64');

            // Return the filename or path if needed
            return filename;
        });

      // Replace image sources with filenames in the content
      sanitizedContent = content;
      images.forEach((image, index) => {
      sanitizedContent = sanitizedContent.replace(matches[index], `src="/uploads/${image}"`)
      });

      // Your processing logic for embedded images here
      console.log(images);
    }

    // Continue with the comment creation logic
    db.prepare('INSERT INTO comments (post_id, content, user_id, username) VALUES (?, ?, ?, ?)').run(postId, sanitizedContent, userId, username);
    res.redirect(`/post/${postId}`);
});
  
  // Registration and Login Routes
  /*
  app.get('/register', (req, res) => {
    const errors = [{ msg: 'Your error message' }]; // Replace this with your actual error handling logic
    res.render('register', { errors });
  });
  
app.post('/register', [
    check('username').notEmpty().withMessage('Username cannot be empty'),
    check('password').notEmpty().withMessage('Password cannot be empty'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('register', { errors: errors.array() });
    }
  
    const { username, password } = req.body;
  
    // Check if the username is already taken
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.render('register', { errors: [{ msg: 'Username is already taken' }] });
    }
  
    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 10);
  
    // Default role is 'user'
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, 'user');
    req.session.userId = result.lastInsertRowid;
    res.redirect('/');
});
*/
  
  app.get('/login', (req, res) => {
    const errors = null; //[{ msg: null }]; // Replace this with your actual error handling logic
    res.render('login', { errors });
  });
  
  app.post('/login', [
    check('username').notEmpty().withMessage('Username cannot be empty'),
    check('password').notEmpty().withMessage('Password cannot be empty'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('login', { errors: errors.array() });
    }
  
    const { username, password } = req.body;
    console.log(req.body);
  
    // Check if the username exists
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.render('login', { errors: [{ msg: 'Invalid username or password' }] });
    }
  
    // Check if the password is correct
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('login', { errors: [{ msg: 'Invalid username or password' }] });
    }
  
    // Store user ID and role in session
    req.session.userId = user.id;
    req.session.userRole = user.role;

    console.log('User ID and Role set in session:', req.session.userId, req.session.userRole);
  
    res.redirect('/');
  });
  
  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
  

  // Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});