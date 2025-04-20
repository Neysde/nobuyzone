// Harita başlatılıyor
const map = L.map('map');
const markersGroup = L.layerGroup().addTo(map);

// Türkiye sınırlarını kapsa
const turkeyBounds = [
    [35.0, 25.5],
    [43.0, 45.0]
];
map.fitBounds(turkeyBounds);

// OpenStreetMap katmanı
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Şehir sınırları çiziliyor
/*fetch('tr-cities.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            onEachFeature: function (feature, layer) {
                layer.bindTooltip(feature.properties.name);
            },
            style: {
                color: "#3388ff",
                weight: 1,
                fillOpacity: 0  // Dolgu kaldırıldı
            }

        }).addTo(map);
    });*/

let ilanlar = [];

// JSON'dan ilanlar yükleniyor
fetch('ilanlar.json')
    .then(res => res.json())
    .then(data => {
        ilanlar = data;
        filtreleVeGuncelle(); // İlk yüklemede çağrılır
    });

// ID'den şehir ismine çevir
function getCityNameById(id) {
    const select = document.getElementById("locationSelect");
    const option = [...select.options].find(opt => opt.value === id);
    return option ? option.textContent : "";
}


function ilanPopupHtml(ilan) {
    const offersHtml = ilan.offers?.map(item => `<li>${item}</li>`).join("") || "<li>Bilinmiyor</li>";
    return `
        <div class="ilan-karti">
            <img src="${ilan.image || 'default.jpg'}" alt="İlan görseli">
            <div class="ilan-detaylar">
                <div class="ilan-ust">
                    <span class="adres">${ilan.city}, ${ilan.district}</span>
                    <span class="tarih">${ilan.date || ''}</span>
                </div>
                <h3 class="ilan-baslik">${ilan.title}</h3>
                <p class="ilan-aciklama">${ilan.description}</p>
                <div class="karsilik">
                    <strong>Karşılığında verilebilecekler:</strong>
                    <ul>${offersHtml}</ul>
                    <a href="${ilan.url}" target="_blank" class="detaya-git-btn">Detaya Git</a>
                </div>
            </div>
        </div>
    `;
}

// Haritayı filtrelere göre günceller
function filtreleVeGuncelle() {
    markersGroup.clearLayers();

    const query = document.querySelector('input[name="query"]').value.toLowerCase();
    const category = document.querySelector('select[name="category"]').value;
    const cityId = document.querySelector('select[name="location"]').value;
    const district = document.querySelector('select[name="district"]').value;

    const filtered = ilanlar.filter(ilan => {
        // Artık yalnızca offers içinde arama yapılıyor
        const matchQuery = !query ||
            ilan.title.toLowerCase().includes(query) ||
            ilan.description.toLowerCase().includes(query) ||
            ilan.offers?.some(item => item.toLowerCase().includes(query));

        const matchCategory = !category || ilan.category === category;
        const matchCity = !cityId || ilan.city === getCityNameById(cityId);
        const matchDistrict = !district || ilan.district === district;
        return matchQuery && matchCategory && matchCity && matchDistrict;
    });

    if (filtered.length === 0) {
        map.fitBounds(turkeyBounds);
        return;
    }

    filtered.forEach(ilan => {
        const marker = L.marker([ilan.lat, ilan.lng]).addTo(markersGroup);
        marker.bindPopup(ilanPopupHtml(ilan));
    });

    // Harita sabit Türkiye sınırında kalacak
}


// Tüm filtre kontrollerine event ekleniyor
document.addEventListener("DOMContentLoaded", () => {
    const filterElements = document.querySelectorAll('input[name="query"], select[name="category"], select[name="location"], select[name="district"]');
    filterElements.forEach(el => {
        el.addEventListener("input", filtreleVeGuncelle);
        el.addEventListener("change", filtreleVeGuncelle);
    });
});
