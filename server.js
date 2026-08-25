const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve Static Files
app.use(express.static(__dirname));

// Explicit Routes for Static Assets on Vercel
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.js'));
});

// Explicit Root Route for Vercel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store Active Users Location Data
const activeUsers = {};

io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

    // Receive Location Update from Client
    socket.on('send-location', (data) => {
        activeUsers[socket.id] = {
            id: socket.id,
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy,
            address: data.address || 'Mendeteksi alamat...',
            subAddress: data.subAddress || '',
            device: data.device || 'Browser',
            updatedAt: new Date().toLocaleTimeString('id-ID')
        };

        // Broadcast updated active users list to ALL connected clients
        io.emit('update-users', Object.values(activeUsers));
    });

    // Handle User Disconnect
    socket.on('disconnect', () => {
        console.log(`[-] User disconnected: ${socket.id}`);
        delete activeUsers[socket.id];
        // Broadcast remaining users to everyone
        io.emit('update-users', Object.values(activeUsers));
        io.emit('user-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 GeoPulse Real-Time Tracking Server active on:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`====================================================`);
});

module.exports = app;
