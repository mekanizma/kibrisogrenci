// i18n message catalogue. Turkish is the reference/default locale.
// RU/FR/AR (+ RTL) are added in a later slice.
export const LOCALES = ["tr", "en"];
export const DEFAULT_LOCALE = "tr";

export const messages = {
  tr: {
    brand: "Kıbrıs Öğrenci",
    tagline: "KKTC'de güvenilir öğrenci konaklaması",
    nav: { search: "İlanlar", how: "Nasıl doğrularız", scam: "Dolandırıcılık rehberi", list: "İlan ver", signin: "Giriş yap", account: "Hesabım", signout: "Çıkış" },
    hero: {
      title: "Görmeden kiralarken içiniz rahat olsun",
      subtitle: "Kuzey Kıbrıs üniversitelerine yakın, doğrulanmış öğrenci konaklaması. Kampüse yürüme mesafesi, adil fiyat karşılaştırması ve doğrulanmış ilan sahipleri.",
      cta: "İlanları keşfet",
    },
    search: {
      university: "Üniversite", any_university: "Tüm üniversiteler", budget: "Bütçe (aylık)", movein: "Taşınma tarihi",
      button: "Ara", results: "sonuç", no_results: "Sonuç bulunamadı. Filtreleri gevşetmeyi deneyin.",
      filters: "Filtreler", city: "Şehir", any_city: "Tüm şehirler", price_range: "Fiyat aralığı", property_type: "Konut tipi",
      bedrooms: "Yatak odası", furnished: "Eşyalı", bills_included: "Faturalar dahil", available_from: "Uygunluk", gender: "Cinsiyet tercihi",
      amenities: "Özellikler", verified_only: "Sadece doğrulanmış", max_walk: "Kampüse en fazla yürüme (dk)",
      sort: "Sırala", sort_new: "En yeni", sort_price_asc: "Fiyat (artan)", sort_price_desc: "Fiyat (azalan)", sort_distance: "Kampüse yakın",
      clear: "Temizle", any: "Farketmez",
    },
    ptype: { apartment: "Daire", studio: "Stüdyo", room: "Oda", house: "Müstakil ev" },
    gender: { any: "Farketmez", male: "Erkek", female: "Kadın" },
    listing: {
      per_month: "/ay", from: "itibaren", deposit: "Depozito", bills: "Faturalar", agency_fee: "Komisyon",
      total_first_month: "Toplam ilk ay maliyeti", cost_breakdown: "Maliyet dökümü", rent: "Kira",
      walk_to: "kampüse yürüme", walk_estimate: "yürüme (tahmini)", min_stay: "Minimum kalış", months: "ay",
      furnished_yes: "Eşyalı", furnished_no: "Eşyasız", bedrooms_n: "yatak odası", bathrooms_n: "banyo", size: "Büyüklük",
      amenities: "Özellikler", description: "Açıklama", location: "Konum", approx_location: "Yaklaşık konum (~300m)",
      approx_note: "Kesin adres güvenlik için gizlenmiştir. İletişime geçtiğinizde ilan sahibi paylaşacaktır.",
      map_area: "Harita alanı", ref: "İlan no", published: "Yayınlanma", confirmed: "gün önce uygunluğu onaylandı",
      similar: "Benzer ilanlar", report: "İlanı bildir", back: "Geri", verified: "Doğrulanmış ilan sahibi", agency: "Emlak ofisi",
      view_original: "Orijinali göster", machine_translated: "Türkçe'den otomatik çevrildi",
      shared: "Ev paylaşımı", flatmates: "ev arkadaşı", private_room: "Özel oda",
    },
    priceindex: {
      title: "Adil fiyat göstergesi", below: "medyanın %{n} altında", above: "medyanın %{n} üstünde", at: "medyan seviyesinde",
      context: "{uni} yakınındaki {beds} {type} için", not_enough: "Bu tip için henüz yeterli veri yok",
      history: "Fiyat geçmişi",
    },
    contact: {
      title: "İletişim bilgileri", gated: "Telefon numarasını görmek için giriş yapın",
      gated_desc: "Öğrenciler ücretsiz üye olur ve asla ücret ödemez. Numarayı görmek için e-posta ile doğrulanmış bir öğrenci hesabı gerekir.",
      reveal: "Numarayı göster", signin_to_reveal: "Giriş yap ve göster", revealed: "İletişim açıldı",
      whatsapp: "WhatsApp ile yaz", call: "Ara", limit: "Günlük görüntüleme sınırına ulaştınız. Lütfen yarın tekrar deneyin.",
    },
    trust: {
      how_title: "Güveni nasıl inşa ederiz", verified_badge: "Doğrulanmış",
      how_items: [
        { t: "Kimlik doğrulama", d: "İlan sahiplerinin kimliğini kontrol eder, belgeyi onaydan sonra kalıcı olarak sileriz." },
        { t: "Adil fiyat göstergesi", d: "Her ilanı aynı bölgedeki benzer evlerin medyan fiyatıyla (GBP) karşılaştırırız." },
        { t: "Dolandırıcılık sinyalleri", d: "Şüpheli ilanları otomatik işaretler ve yayınlamadan önce elle inceleriz." },
        { t: "Güncel uygunluk", d: "İlan sahiplerinden 14 günde bir uygunluk onayı isteriz." },
      ],
    },
    scam: {
      banner_title: "Para göndermeden önce",
      banner: "Evi yerinde veya canlı görüntülü görmeden asla para göndermeyin. Görmediğiniz bir ev için depozito ödemeyin. Kıbrıs Öğrenci hiçbir ilan sahibi adına ödeme talep etmez.",
      guide_title: "Dolandırıcılıktan korunma rehberi",
    },
    universities: { title: "Üniversiteler", listings_count: "ilan", median_rent: "Medyan kira", explore: "İlanları gör", unverified_hidden: "" },
    footer: { about: "Kıbrıs Öğrenci, KKTC üniversite öğrencileri için bir ilan rehberi ve iletişim platformudur. Kira, depozito veya para tahsil etmeyiz.", rights: "Tüm hakları saklıdır." },
    auth: {
      title: "Giriş yap / Üye ol", email: "E-posta", password: "Şifre", signin: "Giriş yap", signup: "Üye ol",
      as_student: "Öğrenci olarak devam et (demo)", note: "Demo modu: gerçek Supabase kimlik doğrulaması bir sonraki adımda etkinleştirilecek.",
      welcome: "Hoş geldiniz", close: "Kapat",
    },
    report: { title: "İlanı bildir", reason: "Sebep", detail: "Detay (opsiyonel)", submit: "Gönder", thanks: "Bildiriminiz için teşekkürler. En kısa sürede inceleyeceğiz.",
      reasons: { scam: "Dolandırıcılık şüphesi", fake: "Sahte / yanıltıcı ilan", unavailable: "Artık uygun değil", offensive: "Uygunsuz içerik", other: "Diğer" } },
    common: { loading: "Yükleniyor...", approx: "yaklaşık", listed_as: "ilan fiyatı", verified_soon: "Yakında doğrulanacak" },
    demo_banner: "Demo — örnek verilerle çalışıyor. Ödeme yok, gerçek para tahsil edilmez.",
  },
  en: {
    brand: "Kıbrıs Öğrenci",
    tagline: "Trusted student housing in North Cyprus",
    nav: { search: "Listings", how: "How we verify", scam: "Scam guide", list: "List a property", signin: "Sign in", account: "My account", signout: "Sign out" },
    hero: {
      title: "Rent with confidence, even sight unseen",
      subtitle: "Verified student housing near North Cyprus universities. Walking distance to campus, a fair price comparison, and verified landlords.",
      cta: "Explore listings",
    },
    search: {
      university: "University", any_university: "All universities", budget: "Budget (monthly)", movein: "Move-in date",
      button: "Search", results: "results", no_results: "No results. Try relaxing your filters.",
      filters: "Filters", city: "City", any_city: "All cities", price_range: "Price range", property_type: "Property type",
      bedrooms: "Bedrooms", furnished: "Furnished", bills_included: "Bills included", available_from: "Availability", gender: "Gender preference",
      amenities: "Amenities", verified_only: "Verified landlords only", max_walk: "Max walk to campus (min)",
      sort: "Sort", sort_new: "Newest", sort_price_asc: "Price (low to high)", sort_price_desc: "Price (high to low)", sort_distance: "Closest to campus",
      clear: "Clear", any: "Any",
    },
    ptype: { apartment: "Apartment", studio: "Studio", room: "Room", house: "House" },
    gender: { any: "Any", male: "Male", female: "Female" },
    listing: {
      per_month: "/mo", from: "from", deposit: "Deposit", bills: "Bills", agency_fee: "Agency fee",
      total_first_month: "Total first-month cost", cost_breakdown: "Cost breakdown", rent: "Rent",
      walk_to: "walk to campus", walk_estimate: "walk (estimate)", min_stay: "Minimum stay", months: "months",
      furnished_yes: "Furnished", furnished_no: "Unfurnished", bedrooms_n: "bedrooms", bathrooms_n: "bathrooms", size: "Size",
      amenities: "Amenities", description: "Description", location: "Location", approx_location: "Approximate location (~300m)",
      approx_note: "The exact address is hidden for safety. The landlord shares it when you get in touch.",
      map_area: "Map area", ref: "Ref", published: "Published", confirmed: "days ago availability confirmed",
      similar: "Similar listings", report: "Report listing", back: "Back", verified: "Verified landlord", agency: "Agency",
      view_original: "Show original", machine_translated: "Automatically translated from Turkish",
      shared: "Shared flat", flatmates: "flatmates", private_room: "Private room",
    },
    priceindex: {
      title: "Fair price indicator", below: "{n}% below the median", above: "{n}% above the median", at: "at the median",
      context: "for {beds} {type} near {uni}", not_enough: "Not enough data yet for this type",
      history: "Price history",
    },
    contact: {
      title: "Contact details", gated: "Sign in to see the phone number",
      gated_desc: "Students join free and are never charged. You need an email-verified student account to reveal the number.",
      reveal: "Reveal number", signin_to_reveal: "Sign in to reveal", revealed: "Contact revealed",
      whatsapp: "Message on WhatsApp", call: "Call", limit: "You've reached today's reveal limit. Please try again tomorrow.",
    },
    trust: {
      how_title: "How we build trust", verified_badge: "Verified",
      how_items: [
        { t: "Identity verification", d: "We check landlords' identity and permanently delete the document after approval." },
        { t: "Fair price indicator", d: "We compare every listing to the median (in GBP) of similar homes in the same area." },
        { t: "Scam signals", d: "We auto-flag suspicious listings and review them manually before publishing." },
        { t: "Fresh availability", d: "We ask landlords to confirm availability every 14 days." },
      ],
    },
    scam: {
      banner_title: "Before you send any money",
      banner: "Never send money before viewing the property in person or by live video. Never pay a deposit for a property you have not seen. Kıbrıs Öğrenci never asks for payment on behalf of a landlord.",
      guide_title: "Scam-avoidance guide",
    },
    universities: { title: "Universities", listings_count: "listings", median_rent: "Median rent", explore: "View listings", unverified_hidden: "" },
    footer: { about: "Kıbrıs Öğrenci is a listing directory and contact platform for university students in North Cyprus. We never collect rent, deposits, or money.", rights: "All rights reserved." },
    auth: {
      title: "Sign in / Sign up", email: "Email", password: "Password", signin: "Sign in", signup: "Sign up",
      as_student: "Continue as a student (demo)", note: "Demo mode: real Supabase authentication is enabled in the next step.",
      welcome: "Welcome", close: "Close",
    },
    report: { title: "Report listing", reason: "Reason", detail: "Detail (optional)", submit: "Submit", thanks: "Thanks for your report. We'll review it shortly.",
      reasons: { scam: "Suspected scam", fake: "Fake / misleading listing", unavailable: "No longer available", offensive: "Inappropriate content", other: "Other" } },
    common: { loading: "Loading...", approx: "approx.", listed_as: "listed as", verified_soon: "Verification pending" },
    demo_banner: "Demo — running on sample data. No payments; no real money is ever collected.",
  },
};

export function tFor(locale) {
  const dict = messages[locale] || messages.tr;
  return function t(path, vars) {
    const val = path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
    let s = val == null ? path : val;
    if (typeof s === "string" && vars) {
      Object.keys(vars).forEach(k => { s = s.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]); });
    }
    return s;
  };
}
