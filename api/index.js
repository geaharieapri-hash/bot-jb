const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const activeUsers = {};

io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

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

        io.emit('update-users', Object.values(activeUsers));
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('update-users', Object.values(activeUsers));
        io.emit('user-disconnected', socket.id);
    });
});

app.all('*', (req, res) => {
    res.status(200).json({ status: "GeoPulse API Online" });
});

module.exports = app;
