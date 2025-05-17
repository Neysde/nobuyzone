// map.js
const map = L.map('map').setView([39.0, 35.0], 6); // Türkiye merkezli

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// GeoJSON'u yükle
fetch('tr-cities.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            onEachFeature: function (feature, layer) {
                layer.on('click', () => {
                    alert(`${feature.properties.name} tıklandı!`);
                });
                layer.bindTooltip(feature.properties.name);
            },
            style: {
                color: "#3388ff",
                weight: 1,
                fillColor: "#66ccff",
                fillOpacity: 0.3
            }
        }).addTo(map);
    });
