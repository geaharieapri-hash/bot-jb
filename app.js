/**
 * GeoPulse - Multi-User Live Location Engine (Serverless Polling Compatible)
 */

// Application State Variables
let map = null;
let userMarker = null;
let accuracyCircle = null;
let watchId = null;
let currentCoords = null;
let currentAddressData = null;
let isDarkLayer = true;
let tileLayer = null;

// Unique Visitor ID for this browser session
let visitorId = localStorage.getItem('geopulse_visitor_id');
if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    localStorage.setItem('geopulse_visitor_id', visitorId);
}

let visitorMarkers = {}; // Stores Leaflet markers for other users

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const btnGuestLogin = document.getElementById('btn-guest-login');
const btnTogglePass = document.getElementById('btn-toggle-pass');
const inputPassword = document.getElementById('input-password');

const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

const valLat = document.getElementById('val-lat');
const valLng = document.getElementById('val-lng');
const valAccuracy = document.getElementById('val-accuracy');
const valAltitude = document.getElementById('val-altitude');
const valSpeed = document.getElementById('val-speed');
const valHeading = document.getElementById('val-heading');
const valTime = document.getElementById('val-time');
const valSocketStatus = document.getElementById('val-socket-status');

const addressMain = document.getElementById('address-main');
const addressSub = document.getElementById('address-sub');
const activeCountText = document.getElementById('active-count-text');
const visitorsList = document.getElementById('visitors-list');

const btnRecenter = document.getElementById('btn-recenter');
const btnLiveTrack = document.getElementById('btn-live-track');
const btnCopy = document.getElementById('btn-copy');
const btnGmaps = document.getElementById('btn-gmaps');
const btnShare = document.getElementById('btn-share');
const toggleLayerBtn = document.getElementById('toggle-layer-btn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize Leaflet Map
function initMap(lat = -6.2088, lng = 106.8456, zoom = 15) {
    if (map) return;
    map = L.map('map', {
        center: [lat, lng],
        zoom: zoom,
        zoomControl: false
    });

    const darkTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayer = L.tileLayer(darkTileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

// Custom Marker Icons
function createUserIcon() {
    return L.divIcon({
        className: 'user-location-marker',
        html: `<div class="pulse-ring"></div><div class="center-dot"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

function createVisitorIcon() {
    return L.divIcon({
        className: 'visitor-location-marker',
        html: `<div class="visitor-pulse-ring"></div><div class="visitor-center-dot"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// Send My Location to Server via HTTP Post
async function postLocationToServer(lat, lng, accuracy, mainAddr, subAddr) {
    try {
        const payload = {
            id: visitorId,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            address: mainAddr,
            subAddress: subAddr,
            device: navigator.userAgent.includes('Mobile') ? 'Smartphone' : 'Desktop/Laptop'
        };

        const res = await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            if (valSocketStatus) {
                valSocketStatus.textContent = "Aktif (Vercel Cloud)";
                valSocketStatus.className = "detail-val accent";
            }
        }
    } catch (err) {
        console.warn("Post location notice:", err);
    }
}

// Poll Active Visitors List from Server
async function fetchActiveVisitors() {
    try {
        const res = await fetch('/api/visitors');
        if (res.ok) {
            const data = await res.json();
            const users = data.users || [];

            if (activeCountText) activeCountText.textContent = `${users.length} Orang`;
            renderVisitorsList(users);
            updateVisitorMarkersOnMap(users);
        }
    } catch (err) {
        console.warn("Fetch visitors error:", err);
    }
}

// Start Periodic Polling for Active Visitors (Every 3 seconds)
setInterval(fetchActiveVisitors, 3000);

// Render Visitors UI List
function renderVisitorsList(users) {
    if (!visitorsList) return;
    visitorsList.innerHTML = '';

    if (!users || users.length === 0) {
        visitorsList.innerHTML = '<div class="empty-visitor">Belum ada pengunjung terhubung...</div>';
        return;
    }

    users.forEach((u, index) => {
        const isMe = u.id === visitorId;
        const item = document.createElement('div');
        item.className = `visitor-item ${isMe ? 'is-me' : ''}`;
        
        item.innerHTML = `
            <div class="visitor-info">
                <div class="visitor-avatar ${isMe ? 'me' : ''}">V${index + 1}</div>
                <div class="visitor-details">
                    <div class="v-name">${isMe ? 'Anda (Perangkat Ini)' : 'Pengunjung #' + u.id.substring(2, 7)}</div>
                    <div class="v-addr">${u.address ? u.address.split(',')[0] : 'Lokasi terdeteksi'} (${u.updatedAt})</div>
                </div>
            </div>
            <div class="visitor-action">
                <i class="fa-solid fa-location-arrow"></i> Focus
            </div>
        `;

        item.addEventListener('click', () => {
            if (map && u.lat && u.lng) {
                map.setView([u.lat, u.lng], 18, { animate: true });
                showToast(`Focus ke ${isMe ? 'Posisi Anda' : 'Pengunjung #' + u.id.substring(2, 7)}`);
            }
        });

        visitorsList.appendChild(item);
    });
}

// Render Visitor Markers on Leaflet Map
function updateVisitorMarkersOnMap(users) {
    if (!users || !map) return;

    const activeIds = users.map(u => u.id);
    Object.keys(visitorMarkers).forEach(id => {
        if (!activeIds.includes(id)) {
            map.removeLayer(visitorMarkers[id]);
            delete visitorMarkers[id];
        }
    });

    users.forEach((u) => {
        if (u.id === visitorId) return;

        if (visitorMarkers[u.id]) {
            visitorMarkers[u.id].setLatLng([u.lat, u.lng]);
        } else {
            const marker = L.marker([u.lat, u.lng], { icon: createVisitorIcon() }).addTo(map);
            marker.bindPopup(`<b>Pengunjung #${u.id.substring(2, 7)}</b><br>${u.address}<br><small>Akurasi: ±${Math.round(u.accuracy)}m</small>`);
            visitorMarkers[u.id] = marker;
        }
    });
}

// Request Location from Geolocation API
function fetchAccurateLocation() {
    updateStatus('standby', 'Mencari GPS...');

    if (!navigator.geolocation) {
        showToast('Browser Anda tidak mendukung Geolocation API', true);
        updateStatus('error', 'GPS Tidak Ditemukan');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        onLocationError,
        options
    );
}

// Location Success Callback
function onLocationSuccess(position) {
    const coords = position.coords;
    currentCoords = coords;

    const lat = coords.latitude;
    const lng = coords.longitude;
    const accuracy = coords.accuracy;

    if (valLat) valLat.textContent = lat.toFixed(6);
    if (valLng) valLng.textContent = lng.toFixed(6);
    if (valAccuracy) valAccuracy.textContent = `± ${Math.round(accuracy)} m`;
    if (valAltitude) valAltitude.textContent = coords.altitude ? `${Math.round(coords.altitude)} m` : 'N/A';
    if (valSpeed) valSpeed.textContent = coords.speed ? `${(coords.speed * 3.6).toFixed(1)} km/j` : '0 km/j';
    if (valHeading) valHeading.textContent = coords.heading ? `${Math.round(coords.heading)}°` : 'N/A';
    
    const now = new Date();
    if (valTime) valTime.textContent = now.toLocaleTimeString('id-ID');

    updateStatus('active', `GPS Aktif (±${Math.round(accuracy)}m)`);
    updateMapLocation(lat, lng, accuracy);

    // Reverse Geocoding & Post Location to Server
    reverseGeocodeAndBroadcast(lat, lng, accuracy);
}

// Location Error Callback
function onLocationError(error) {
    let msg = 'Gagal mendeteksi lokasi';
    switch (error.code) {
        case error.PERMISSION_DENIED:
            msg = 'Izin akses lokasi ditolak oleh pengguna.';
            if (addressMain) addressMain.textContent = 'Akses Lokasi Ditolak';
            if (addressSub) addressSub.textContent = 'Aktifkan izin lokasi di pengaturan browser Anda.';
            break;
        case error.POSITION_UNAVAILABLE:
            msg = 'Sinyal GPS / Posisi tidak tersedia.';
            break;
        case error.TIMEOUT:
            msg = 'Waktu permintaan lokasi habis (Timeout).';
            break;
    }
    showToast(msg, true);
    updateStatus('standby', 'Gagal Deteksi');
}

// Update Map Position for Self
function updateMapLocation(lat, lng, accuracy) {
    if (!map) return;

    map.setView([lat, lng], 17, { animate: true });

    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.marker([lat, lng], { icon: createUserIcon() }).addTo(map);
    }

    if (accuracyCircle) {
        accuracyCircle.setLatLng([lat, lng]);
        accuracyCircle.setRadius(accuracy);
    } else {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#00f2fe',
            fillColor: '#00f2fe',
            fillOpacity: 0.15,
            weight: 1.5
        }).addTo(map);
    }
}

// Reverse Geocoding & Post Location
async function reverseGeocodeAndBroadcast(lat, lng, accuracy) {
    if (addressMain) addressMain.textContent = "Mengambil data alamat...";
    if (addressSub) addressSub.textContent = "Menghubungkan ke layanan peta...";

    let mainAddr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    let subAddr = "Lokasi terdeteksi";

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id`);
        if (response.ok) {
            const data = await response.json();
            currentAddressData = data;

            if (data && data.address) {
                const addr = data.address;
                const road = addr.road || addr.pedestrian || addr.suburb || 'Jalan Tanpa Nama';
                const area = addr.village || addr.subdistrict || addr.district || addr.city_district || '';
                const city = addr.city || addr.regency || addr.town || '';
                const state = addr.state || '';
                const postcode = addr.postcode || '';

                mainAddr = data.display_name.split(',')[0] || road;
                subAddr = `${area}, ${city}, ${state} ${postcode}`.replace(/^,\s*/, '');
            }
        }
    } catch (err) {
        console.warn("Reverse Geocoding error:", err);
    }

    if (addressMain) addressMain.textContent = mainAddr;
    if (addressSub) addressSub.textContent = subAddr;

    // Send location to Vercel Serverless HTTP API
    postLocationToServer(lat, lng, accuracy, mainAddr, subAddr);
}

// Update Status Badge UI
function updateStatus(type, text) {
    if (statusBadge) statusBadge.className = `status-badge ${type}`;
    if (statusText) statusText.textContent = text;
}

// Live Location Tracking Toggle
function toggleLiveTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (btnLiveTrack) {
            btnLiveTrack.classList.remove('tracking-active');
            btnLiveTrack.innerHTML = `<i class="fa-solid fa-satellite"></i> Broadcast GPS: OFF`;
        }
        showToast("Broadcast GPS Dimatikan");
    } else {
        if (!navigator.geolocation) return;

        if (btnLiveTrack) {
            btnLiveTrack.classList.add('tracking-active');
            btnLiveTrack.innerHTML = `<i class="fa-solid fa-satellite-dish fa-spin"></i> Broadcast GPS: ON`;
        }

        watchId = navigator.geolocation.watchPosition(
            onLocationSuccess,
            onLocationError,
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    }
}

// Enter Main Application Dashboard (Dismiss Login)
function enterDashboard(userEmail = 'Guest') {
    if (loginOverlay) {
        loginOverlay.classList.add('hidden');
    }
    showToast(`Selamat Datang, ${userEmail}!`);

    initMap();
    fetchAccurateLocation();
    toggleLiveTracking();
    fetchActiveVisitors();
}

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
    // ALWAYS start background location fetching for visitors even before login overlay dismissal
    fetchAccurateLocation();
    toggleLiveTracking();
    fetchActiveVisitors();

    const savedUser = localStorage.getItem('geopulse_user');
    if (savedUser) {
        enterDashboard(savedUser);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('input-email');
            const userVal = emailInput ? emailInput.value : 'User';
            
            if (document.getElementById('remember-me')?.checked) {
                localStorage.setItem('geopulse_user', userVal);
            }

            enterDashboard(userVal);
        });
    }

    if (btnGuestLogin) {
        btnGuestLogin.addEventListener('click', () => {
            enterDashboard('Pengunjung');
        });
    }

    if (btnTogglePass && inputPassword) {
        btnTogglePass.addEventListener('click', () => {
            const isPass = inputPassword.type === 'password';
            inputPassword.type = isPass ? 'text' : 'password';
            btnTogglePass.className = `fa-solid ${isPass ? 'fa-eye-slash' : 'fa-eye'} toggle-pass-icon`;
        });
    }

    if (btnRecenter) btnRecenter.addEventListener('click', fetchAccurateLocation);
    if (btnLiveTrack) btnLiveTrack.addEventListener('click', toggleLiveTracking);
    if (btnCopy) btnCopy.addEventListener('click', copyLocationData);
    if (btnGmaps) btnGmaps.addEventListener('click', openGoogleMaps);
    if (btnShare) btnShare.addEventListener('click', shareLocation);
    if (toggleLayerBtn) toggleLayerBtn.addEventListener('click', toggleMapLayer);
});

function copyLocationData() {
    if (!currentCoords) {
        showToast("Lokasi belum terdeteksi", true);
        return;
    }

    const textToCopy = `📍 GeoPulse - Multi-User Location Tracker\n` +
        `Latitude: ${currentCoords.latitude}\n` +
        `Longitude: ${currentCoords.longitude}\n` +
        `Akurasi: ±${Math.round(currentCoords.accuracy)} meter\n` +
        `Alamat: ${addressMain ? addressMain.textContent : ''} (${addressSub ? addressSub.textContent : ''})\n` +
        `Google Maps: https://www.google.com/maps?q=${currentCoords.latitude},${currentCoords.longitude}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast("Data lokasi berhasil disalin!");
    }).catch(() => {
        showToast("Gagal menyalin data", true);
    });
}

function openGoogleMaps() {
    if (!currentCoords) {
        showToast("Lokasi belum terdeteksi", true);
        return;
    }
    const url = `https://www.google.com/maps?q=${currentCoords.latitude},${currentCoords.longitude}`;
    window.open(url, '_blank');
}

function shareLocation() {
    const shareData = {
        title: 'GeoPulse Multi-User GPS Tracker',
        text: 'Masuk ke web ini untuk terhubung dan berbagi lokasi presisi secara real-time!',
        url: window.location.href
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(window.location.href);
        showToast("Link web berhasil disalin!");
    }
}

function toggleMapLayer() {
    if (!map || !tileLayer) return;

    map.removeLayer(tileLayer);
    isDarkLayer = !isDarkLayer;

    const tileUrl = isDarkLayer 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    tileLayer = L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);
    showToast(`Mode Peta: ${isDarkLayer ? 'Dark Mode' : 'Light Mode'}`);
}

function showToast(message, isError = false) {
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    const icon = toast.querySelector('.toast-icon');
    if (isError) {
        if (icon) icon.className = 'fa-solid fa-circle-exclamation toast-icon';
        toast.style.borderColor = 'var(--danger)';
    } else {
        if (icon) icon.className = 'fa-solid fa-circle-check toast-icon';
        toast.style.borderColor = 'var(--success)';
    }

    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}
