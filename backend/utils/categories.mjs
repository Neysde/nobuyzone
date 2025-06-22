export const allCategories = [
  { value: 'elektronik', display: 'Elektronik' },
  { value: 'ev-dekorasyonu', display: 'Ev Dekorasyonu' },
  { value: 'evcil-hayvan-urunleri', display: 'Evcil Hayvan Ürünleri' },
  { value: 'gida', display: 'Gıda' },
  { value: 'giyim', display: 'Giyim' },
  { value: 'hediyelik-esya', display: 'Hediyelik Eşya' },
  { value: 'kitap-kirtasiye', display: 'Kitap & Kırtasiye' },
  { value: 'kozmetik-kisisel-bakim', display: 'Kozmetik & Kişisel Bakım' },
  { value: 'mobilya', display: 'Mobilya' },
  { value: 'oto-aksesuar-yedek-parca', display: 'Oto Aksesuar & Yedek Parça' },
  { value: 'saglik-medikal', display: 'Sağlık & Medikal' },
  { value: 'spor-outdoor', display: 'Spor & Outdoor' },
  { value: 'teknoloji', display: 'Teknoloji' },
  { value: 'diger', display: 'Diğer' }
];

export const categoryMap = allCategories.reduce((acc, cat) => {
    acc[cat.value] = cat.display;
    return acc;
}, {});
