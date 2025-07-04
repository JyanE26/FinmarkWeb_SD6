const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'users.json');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'finmark_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Demo users
const USERS = [
    {
        username: 'user',
        password: 'password',
        fullName: 'John Doe',
        email: 'user@example.com',
        role: 'User',
        lastLogin: null
    },
    {
        username: 'admin',
        password: 'admin123',
        fullName: 'Jane Admin',
        email: 'admin@example.com',
        role: 'Admin',
        lastLogin: null
    }
];

function loadUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- Demo Data ---
function getDemoUsernames() {
    // Read usernames and fullNames from users.json
    try {
        const users = loadUsers();
        return {
            usernames: users.map(u => u.username),
            fullNames: users.map(u => u.fullName)
        };
    } catch {
        return { usernames: ['Smith', 'user1'], fullNames: ['Jane Smith', 'Test User'] };
    }
}

const {usernames: DEMO_USERNAMES, fullNames: DEMO_FULLNAMES} = getDemoUsernames();

const DEMO_REPORTS = Array.from({length: 50}, (_, i) => ({
    id: i+1,
    title: `Report #${i+1}`,
    type: i%2===0 ? 'Financial' : 'Operational',
    user: DEMO_FULLNAMES[i % DEMO_FULLNAMES.length],
    date: new Date(Date.now() - i*86400000).toISOString().slice(0,10)
}));
const DEMO_UPLOADS = Array.from({length: 30}, (_, i) => ({
    id: i+1,
    filename: `file${i+1}.pdf`,
    type: i%2===0 ? 'Invoice' : 'Contract',
    user: DEMO_FULLNAMES[i % DEMO_FULLNAMES.length],
    date: new Date(Date.now() - i*43200000).toISOString().slice(0,10)
}));
const DEMO_LOGS = Array.from({length: 80}, (_, i) => ({
    id: i+1,
    action: i%2===0 ? 'Login' : 'Upload',
    user: DEMO_FULLNAMES[i % DEMO_FULLNAMES.length],
    date: new Date(Date.now() - i*21600000).toISOString().slice(0,10)
}));

function paginate(arr, page=1, limit=10) {
    const start = (page-1)*limit;
    return {
        total: arr.length,
        results: arr.slice(start, start+limit)
    };
}

function filterData(arr, {search, type, user, dateFrom, dateTo}) {
    return arr.filter(item => {
        let ok = true;
        if (search) ok = ok && Object.values(item).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
        if (type) ok = ok && item.type === type;
        if (user) ok = ok && item.user === user;
        if (dateFrom) ok = ok && item.date >= dateFrom;
        if (dateTo) ok = ok && item.date <= dateTo;
        return ok;
    });
}

// Middleware to protect private routes
function requireLogin(req, res, next) {
    if (!req.session.loggedIn || !req.session.user) {
        return res.redirect('/');
    }
    next();
}

// Routes
app.get('/', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:');
    console.log('  username (raw):', req.body.username);
    console.log('  password (raw):', req.body.password);
    const users = loadUsers();
    console.log('Loaded users:', users);
    const user = users.find(u => u.username === username);
    if (user) {
        console.log('Found user:', user.username);
        if (user.password === password) {
            console.log('Password match!');
            user.lastLogin = new Date().toLocaleString();
            saveUsers(users);
            req.session.loggedIn = true;
            req.session.user = {
                username: user.username,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin
            };
            return res.redirect('/dashboard');
        } else {
            console.log('Password mismatch!');
        }
    } else {
        console.log('No user found for username:', username);
    }
    res.redirect('/?error=1');
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// API endpoint for user info
app.get('/api/user', requireLogin, (req, res) => {
    const users = loadUsers();
    const user = users.find(u => u.username === req.session.user.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

app.get('/api/reports', requireLogin, (req, res) => {
    const {search, type, user, dateFrom, dateTo, page=1, limit=10} = req.query;
    let data = filterData(getDemoReports(), {search, type, user, dateFrom, dateTo});
    res.json(paginate(data, Number(page), Number(limit)));
});

app.get('/api/uploads', requireLogin, (req, res) => {
    const {search, type, user, dateFrom, dateTo, page=1, limit=10} = req.query;
    let data = filterData(getDemoUploads(), {search, type, user, dateFrom, dateTo});
    res.json(paginate(data, Number(page), Number(limit)));
});

app.get('/api/logs', requireLogin, (req, res) => {
    const {search, action, user, dateFrom, dateTo, page=1, limit=10} = req.query;
    let data = filterData(getDemoLogs(), {search, type: action, user, dateFrom, dateTo});
    res.json(paginate(data, Number(page), Number(limit)));
});

// Profile view/edit API
app.get('/api/profile', requireLogin, (req, res) => {
    const users = loadUsers();
    const user = users.find(u => u.username === req.session.user.username);
    if (!user) return res.status(404).json({error: 'User not found'});
    res.json(user);
});
app.post('/api/profile', requireLogin, (req, res) => {
    const { fullName, email, role } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username === req.session.user.username);
    if (!user) return res.status(404).json({error: 'User not found'});
    user.fullName = fullName;
    user.email = email;
    user.role = role;
    saveUsers(users);
    req.session.user.fullName = fullName;
    req.session.user.email = email;
    req.session.user.role = role;
    res.json({success: true, user}); // Return updated user object
});

// --- User Management API (Admin only) ---
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'Admin') return next();
    return res.status(403).json({ error: 'Forbidden' });
};

// Get all users
app.get('/api/users', requireLogin, isAdmin, (req, res) => {
    const users = loadUsers();
    res.json(users);
});

// Add new user
app.post('/api/users', requireLogin, isAdmin, (req, res) => {
    const { username, password, fullName, email, role } = req.body;
    if (!username || !password || !fullName || !email || !role) {
        return res.status(400).json({ error: 'All fields required' });
    }
    const users = loadUsers();
    if (users.find(u => u.username === username)) {
        return res.status(409).json({ error: 'Username already exists' });
    }
    users.push({ username, password, fullName, email, role, lastLogin: null });
    saveUsers(users);
    res.json({ success: true });
});

// Edit user
app.put('/api/users/:username', requireLogin, isAdmin, (req, res) => {
    const { username } = req.params;
    const { password, fullName, email, role } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (password) user.password = password;
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (role) user.role = role;
    saveUsers(users);
    res.json({ success: true });
});

// Delete user
app.delete('/api/users/:username', requireLogin, isAdmin, (req, res) => {
    const { username } = req.params;
    let users = loadUsers();
    if (!users.find(u => u.username === username)) {
        return res.status(404).json({ error: 'User not found' });
    }
    users = users.filter(u => u.username !== username);
    saveUsers(users);
    res.json({ success: true });
});

// --- DEMO DATA GENERATION/RESET ENDPOINTS ---
app.post('/api/demo/generate', requireLogin, (req, res) => {
    const { count } = req.body;
    const users = loadUsers();
    const fullNames = users.map(u => u.fullName);
    global.DEMO_REPORTS = Array.from({length: count || 50}, (_, i) => ({
        id: i+1,
        title: `Report #${i+1}`,
        type: i%2===0 ? 'Financial' : 'Operational',
        user: fullNames[i % fullNames.length],
        date: new Date(Date.now() - i*86400000).toISOString().slice(0,10)
    }));
    global.DEMO_UPLOADS = Array.from({length: Math.floor((count||50)*0.6)}, (_, i) => ({
        id: i+1,
        filename: `file${i+1}.pdf`,
        type: i%2===0 ? 'Invoice' : 'Contract',
        user: fullNames[i % fullNames.length],
        date: new Date(Date.now() - i*43200000).toISOString().slice(0,10)
    }));
    global.DEMO_LOGS = Array.from({length: (count||50)*2}, (_, i) => ({
        id: i+1,
        action: i%2===0 ? 'Login' : 'Upload',
        user: fullNames[i % fullNames.length],
        date: new Date(Date.now() - i*21600000).toISOString().slice(0,10)
    }));
    res.json({success:true});
});
app.post('/api/demo/clear', requireLogin, (req, res) => {
    global.DEMO_REPORTS = [];
    global.DEMO_UPLOADS = [];
    global.DEMO_LOGS = [];
    res.json({success:true});
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
