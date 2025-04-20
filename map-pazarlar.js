// Harita başlat
// Harita başlat
const map = L.map('map').setView([39.0, 35.0], 6);

// OpenStreetMap katmanı
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap katkıcıları'
}).addTo(map);

// Marker grubu
const markerGroup = L.layerGroup().addTo(map);

// Yer ikonu (custom)
const pazarIkon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// JSON'dan takas pazarlarını yükle
fetch('pazarlar.js')
    .then(res => res.json())
    .then(pazarlar => {
        pazarlar.forEach(pazar => {
            const marker = L.marker([pazar.lat, pazar.lng], { icon: pazarIkon }).addTo(markerGroup);

            const popupContent = `
                <div class="pazar-popup">
                    <h3>${pazar.name}</h3>
                    <p><strong>Konum:</strong> ${pazar.city}, ${pazar.district}</p>
                    <p><strong>Saat:</strong> ${pazar.time}</p>
                    <a href="pazar-detay.html?pazarId=${pazar.id}" class="detaya-git-btn">Detaya Git</a>
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.bindTooltip(pazar.name);
        });
    })
    .catch(err => console.error("Pazar verisi yüklenemedi:", err));
