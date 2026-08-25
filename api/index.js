const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// In-Memory Global Store (Live Visitors within server instance)
let activeVisitors = {};

// Cleanup visitors older than 2 minutes (120000 ms)
function cleanupOldVisitors() {
    const now = Date.now();
    Object.keys(activeVisitors).forEach(id => {
        if (now - activeVisitors[id].timestamp > 120000) {
            delete activeVisitors[id];
        }
    });
}

// API Endpoint to receive location from visitors
app.post('/api/location', (req, res) => {
    cleanupOldVisitors();
    const { id, lat, lng, accuracy, address, subAddress, device } = req.body;
    
    if (!id || !lat || !lng) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    activeVisitors[id] = {
        id,
        lat,
        lng,
        accuracy: accuracy || 0,
        address: address || 'Mendeteksi alamat...',
        subAddress: subAddress || '',
        device: device || 'Browser',
        updatedAt: new Date().toLocaleTimeString('id-ID'),
        timestamp: Date.now()
    };

    return res.status(200).json({ success: true, activeCount: Object.keys(activeVisitors).length });
});

// API Endpoint for Admin Dashboard to fetch active visitors
app.get('/api/visitors', (req, res) => {
    cleanupOldVisitors();
    return res.status(200).json({
        users: Object.values(activeVisitors)
    });
});

app.all('*', (req, res) => {
    res.status(200).json({ status: "GeoPulse HTTP Tracker API Online" });
});

module.exports = app;
