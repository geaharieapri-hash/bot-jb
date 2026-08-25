/**
 * GeoPulse - Multi-User Live Location Engine & Socket Controller
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

// Socket.io Connection
const socket = io();
let visitorMarkers = {}; // Stores Leaflet markers for other users

// DOM Elements
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

// Custom Marker HTML Icons
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

// Socket.io Real-Time Listeners
socket.on('connect', () => {
    valSocketStatus.textContent = "Terhubung ke Server";
    valSocketStatus.className = "detail-val accent";
    showToast("Terhubung ke Server Tracker Multi-User");
});

socket.on('disconnect', () => {
    valSocketStatus.textContent = "Terputus";
    valSocketStatus.className = "detail-val warning";
});

// Receive updated visitors list from Server
socket.on('update-users', (users) => {
    activeCountText.textContent = `${users.length} Orang`;

    // Render Visitors List Sidebar
    renderVisitorsList(users);

    // Render Markers on Leaflet Map
    updateVisitorMarkersOnMap(users);
});

// Remove disconnected user marker
socket.on('user-disconnected', (userId) => {
    if (visitorMarkers[userId]) {
        map.removeLayer(visitorMarkers[userId]);
        delete visitorMarkers[userId];
    }
});

// Render Visitors UI List
function renderVisitorsList(users) {
    visitorsList.innerHTML = '';

    if (users.length === 0) {
        visitorsList.innerHTML = '<div class="empty-visitor">Belum ada pengunjung terhubung...</div>';
        return;
    }

    users.forEach((u, index) => {
        const isMe = u.id === socket.id;
        const item = document.createElement('div');
        item.className = `visitor-item ${isMe ? 'is-me' : ''}`;
        
        item.innerHTML = `
            <div class="visitor-info">
                <div class="visitor-avatar ${isMe ? 'me' : ''}">V${index + 1}</div>
                <div class="visitor-details">
                    <div class="v-name">${isMe ? 'Anda (Perangkat Ini)' : 'Pengunjung #' + u.id.substring(0, 5)}</div>
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
                showToast(`Focus ke ${isMe ? 'Posisi Anda' : 'Pengunjung #' + u.id.substring(0, 5)}`);
            }
        });

        visitorsList.appendChild(item);
    });
}

// Render Visitor Markers on Leaflet Map
function updateVisitorMarkersOnMap(users) {
    users.forEach((u) => {
        if (u.id === socket.id) return; // Skip drawing visitor marker for self (handled by userMarker)

        if (visitorMarkers[u.id]) {
            visitorMarkers[u.id].setLatLng([u.lat, u.lng]);
        } else {
            const marker = L.marker([u.lat, u.lng], { icon: createVisitorIcon() }).addTo(map);
            marker.bindPopup(`<b>Pengunjung #${u.id.substring(0, 5)}</b><br>${u.address}<br><small>Akurasi: ±${Math.round(u.accuracy)}m</small>`);
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

    valLat.textContent = lat.toFixed(6);
    valLng.textContent = lng.toFixed(6);
    valAccuracy.textContent = `± ${Math.round(accuracy)} m`;
    valAltitude.textContent = coords.altitude ? `${Math.round(coords.altitude)} m` : 'N/A';
    valSpeed.textContent = coords.speed ? `${(coords.speed * 3.6).toFixed(1)} km/j` : '0 km/j';
    valHeading.textContent = coords.heading ? `${Math.round(coords.heading)}°` : 'N/A';
    
    const now = new Date();
    valTime.textContent = now.toLocaleTimeString('id-ID');

    updateStatus('active', `GPS Aktif (±${Math.round(accuracy)}m)`);
    updateMapLocation(lat, lng, accuracy);

    // Reverse Geocoding & Broadcast via Socket.io
    reverseGeocodeAndBroadcast(lat, lng, accuracy);
}

// Location Error Callback
function onLocationError(error) {
    let msg = 'Gagal mendeteksi lokasi';
    switch (error.code) {
        case error.PERMISSION_DENIED:
            msg = 'Izin akses lokasi ditolak oleh pengguna.';
            addressMain.textContent = 'Akses Lokasi Ditolak';
            addressSub.textContent = 'Aktifkan izin lokasi di pengaturan browser Anda.';
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

// Reverse Geocoding & Emit Data to Socket Server
async function reverseGeocodeAndBroadcast(lat, lng, accuracy) {
    addressMain.textContent = "Mengambil data alamat...";
    addressSub.textContent = "Menghubungkan ke layanan peta...";

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

    addressMain.textContent = mainAddr;
    addressSub.textContent = subAddr;

    // Send location to server via Socket.io for tracking
    socket.emit('send-location', {
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        address: mainAddr,
        subAddress: subAddr,
        device: navigator.userAgent.includes('Mobile') ? 'Smartphone' : 'Desktop/Laptop'
    });
}

// Update Status Badge UI
function updateStatus(type, text) {
    statusBadge.className = `status-badge ${type}`;
    statusText.textContent = text;
}

// Live Location Tracking Toggle
function toggleLiveTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        btnLiveTrack.classList.remove('tracking-active');
        btnLiveTrack.innerHTML = `<i class="fa-solid fa-satellite"></i> Broadcast GPS: OFF`;
        showToast("Broadcast GPS Matikan");
    } else {
        if (!navigator.geolocation) return;

        btnLiveTrack.classList.add('tracking-active');
        btnLiveTrack.innerHTML = `<i class="fa-solid fa-satellite-dish fa-spin"></i> Broadcast GPS: ON`;
        showToast("Broadcast Real-time GPS Aktif");

        watchId = navigator.geolocation.watchPosition(
            onLocationSuccess,
            onLocationError,
            { enableHighAccuracy: true, maximumAge: 0 }
        );
    }
}

// Copy Location Info to Clipboard
function copyLocationData() {
    if (!currentCoords) {
        showToast("Lokasi belum terdeteksi", true);
        return;
    }

    const textToCopy = `📍 GeoPulse - Multi-User Location Tracker\n` +
        `Latitude: ${currentCoords.latitude}\n` +
        `Longitude: ${currentCoords.longitude}\n` +
        `Akurasi: ±${Math.round(currentCoords.accuracy)} meter\n` +
        `Alamat: ${addressMain.textContent} (${addressSub.textContent})\n` +
        `Google Maps: https://www.google.com/maps?q=${currentCoords.latitude},${currentCoords.longitude}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast("Data lokasi berhasil disalin!");
    }).catch(() => {
        showToast("Gagal menyalin data", true);
    });
}

// Open Google Maps
function openGoogleMaps() {
    if (!currentCoords) {
        showToast("Lokasi belum terdeteksi", true);
        return;
    }
    const url = `https://www.google.com/maps?q=${currentCoords.latitude},${currentCoords.longitude}`;
    window.open(url, '_blank');
}

// Share Web Link
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

// Toggle Map Layer
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

// Toast Helper
function showToast(message, isError = false) {
    toastMessage.textContent = message;
    const icon = toast.querySelector('.toast-icon');
    if (isError) {
        icon.className = 'fa-solid fa-circle-exclamation toast-icon';
        toast.style.borderColor = 'var(--danger)';
    } else {
        icon.className = 'fa-solid fa-circle-check toast-icon';
        toast.style.borderColor = 'var(--success)';
    }

    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchAccurateLocation();

    // Start auto live tracking watch by default
    toggleLiveTracking();

    btnRecenter.addEventListener('click', fetchAccurateLocation);
    btnLiveTrack.addEventListener('click', toggleLiveTracking);
    btnCopy.addEventListener('click', copyLocationData);
    btnGmaps.addEventListener('click', openGoogleMaps);
    btnShare.addEventListener('click', shareLocation);
    toggleLayerBtn.addEventListener('click', toggleMapLayer);
});
