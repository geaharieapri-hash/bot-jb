const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Upstash Redis configuration using REST API environment variables if available
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Memory fallback store (works within same lambda lifecycle)
let memoryVisitors = {};

// Helper function to talk to Redis REST API
async function redisCommand(command, args = []) {
    if (!REDIS_URL || !REDIS_TOKEN) return null;
    try {
        const res = await fetch(`${REDIS_URL}/${command}/${args.join('/')}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
        });
        if (res.ok) {
            const data = await res.json();
            return data.result;
        }
    } catch (e) {
        console.warn("Redis error:", e);
    }
    return null;
}

// API Endpoint to receive location from visitors
app.post('/api/location', async (req, res) => {
    const { id, lat, lng, accuracy, address, subAddress, device } = req.body;
    
    if (!id || !lat || !lng) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const visitorData = {
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

    // Update in-memory fallback
    memoryVisitors[id] = visitorData;

    // Try saving to Upstash Redis with 180s TTL if env vars present
    if (REDIS_URL && REDIS_TOKEN) {
        try {
            await fetch(`${REDIS_URL}/set/visitor:${id}?EX=180`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${REDIS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(visitorData)
            });
        } catch (err) {
            console.warn("Redis set error:", err);
        }
    }

    return res.status(200).json({ success: true, id: id });
});

// API Endpoint for Admin Dashboard to fetch active visitors
app.get('/api/visitors', async (req, res) => {
    let users = [];

    if (REDIS_URL && REDIS_TOKEN) {
        try {
            // Get all visitor keys
            const keysRes = await fetch(`${REDIS_URL}/keys/visitor:*`, {
                headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
            });
            if (keysRes.ok) {
                const keysData = await keysRes.json();
                const keys = keysData.result || [];
                
                if (keys.length > 0) {
                    // MGET all visitor values
                    const mgetRes = await fetch(`${REDIS_URL}/mget/${keys.join('/')}`, {
                        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
                    });
                    if (mgetRes.ok) {
                        const mgetData = await mgetRes.json();
                        users = (mgetData.result || []).map(item => {
                            try { return typeof item === 'string' ? JSON.parse(item) : item; } catch(e) { return null; }
                        }).filter(Boolean);
                    }
                }
            }
        } catch (err) {
            console.warn("Redis get error:", err);
        }
    }

    // Fallback to in-memory if Redis not set or empty
    if (users.length === 0) {
        const now = Date.now();
        Object.keys(memoryVisitors).forEach(id => {
            if (now - memoryVisitors[id].timestamp > 180000) {
                delete memoryVisitors[id];
            }
        });
        users = Object.values(memoryVisitors);
    }

    return res.status(200).json({ users });
});

app.all('*', (req, res) => {
    res.status(200).json({ status: "GeoPulse HTTP Tracker API Online" });
});

module.exports = app;
