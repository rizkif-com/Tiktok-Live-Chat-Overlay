<div align="center">

# 🎬 TikTok Live Overlay

**Overlay komentar TikTok LIVE yang ringan, transparan, dan selalu tampil di atas aplikasi lain.**

![Version](https://img.shields.io/badge/version-2.1.1-fe2c55?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows)
![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron)

Dibuat oleh **Rizki Fadhillah**

</div>

---

## Tentang aplikasi

TikTok Live Overlay membantu streamer membaca aktivitas TikTok LIVE tanpa harus terus membuka jendela TikTok. Overlay dapat ditempatkan di atas game, OBS, browser, atau aplikasi lain dan ukurannya bisa disesuaikan.

Aplikasi membaca aktivitas dari LIVE publik secara real-time dan tidak memerlukan password akun TikTok.

## ✨ Fitur

- 💬 Menampilkan komentar LIVE secara real-time
- 👁️ Menampilkan jumlah penonton aktif saat ini
- 🏆 Menampilkan top viewers dari snapshot TikTok
- ❤️ Menampilkan total like
- 🎁 Notifikasi gift dan jumlah combo
- 🔗 Notifikasi saat LIVE dibagikan
- ➕ Notifikasi saat seseorang mengikuti host
- 👋 Ticker user yang baru bergabung tanpa memenuhi daftar chat
- 📌 Mode selalu di atas aplikasi lain
- 🪟 Overlay transparan dengan opasitas yang bisa diatur
- 🖱️ Mode klik-tembus untuk penggunaan di atas game
- 📐 Ukuran jendela kecil, sedang, besar, dan resize manual
- 🔤 Ukuran teks dapat disesuaikan

## 📸 Tampilan

![TikTok Live Overlay](docs/screenshot.png)`

## 🚀 Cara paling mudah

1. Buka folder `dist`.
2. Jalankan **TikTok Live Overlay 2.1.1.exe**.
3. Masukkan username host, contohnya `username`, atau tempel URL TikTok LIVE.
4. Klik **Hubungkan**.
5. Pastikan akun tujuan sedang LIVE dan siarannya bersifat publik.

EXE bersifat portable sehingga tidak membutuhkan proses instalasi.

## 🎮 Kontrol overlay

| Kontrol | Fungsi |
|---|---|
| Tarik title bar | Memindahkan overlay |
| Tarik tepi jendela | Mengubah ukuran secara manual |
| Preset Kecil / Sedang / Besar | Mengubah ukuran dengan cepat |
| Selalu di atas | Menjaga overlay di atas aplikasi lain |
| Klik tembus | Membuat klik diteruskan ke aplikasi di belakangnya |
| `Ctrl` + `Shift` + `X` | Mengaktifkan atau mematikan klik-tembus dari aplikasi mana pun |

> **Penting:** Jika overlay tidak bisa diklik karena mode klik-tembus aktif, tekan **Ctrl + Shift + X** untuk mengembalikannya.

## 🛠️ Menjalankan dari source code

### Persyaratan

- Windows 10 atau Windows 11
- [Node.js](https://nodejs.org/) versi 20 atau lebih baru
- npm

### Instalasi

```powershell
git clone https://github.com/rizkif-com/Tiktok-Live-Chat-Overlay.git
cd tiktok-live-overlay
npm install
npm start
```

Di Windows, kamu juga bisa menjalankan `Jalankan.cmd`. Script tersebut akan memasang dependensi secara otomatis jika folder `node_modules` belum tersedia.

## 📦 Membuat EXE portable

```powershell
npm install
npm run pack
```

Hasil build tersedia di:

```text
dist/TikTok Live Overlay 2.1.1.exe
```

## 📁 Struktur proyek

```text
tiktok-live-overlay/
├── src/
│   ├── main.js         # Window Electron dan koneksi TikTok LIVE
│   ├── preload.cjs     # Jembatan IPC yang aman
│   ├── renderer.js     # Logika antarmuka overlay
│   ├── index.html      # Struktur tampilan
│   ├── styles.css      # Tampilan utama
│   └── controls.css    # Pengaturan dan kontrol ukuran
├── Jalankan.cmd        # Menjalankan aplikasi di Windows
├── package.json
└── README.md
```

## ❓ Pemecahan masalah

### Komentar tidak muncul

- Pastikan username sudah benar.
- Pastikan akun sedang LIVE.
- LIVE harus dapat diakses secara publik.
- Tunggu beberapa detik setelah status berubah menjadi terhubung.
- Putuskan koneksi lalu hubungkan kembali jika jaringan sempat terputus.

### Jumlah penonton masih `—`

Angka penonton diperbarui ketika TikTok mengirim event statistik `ROOM_USER`. Snapshot pertama dapat membutuhkan beberapa detik setelah koneksi berhasil.

### Overlay tidak bisa diklik

Mode klik-tembus sedang aktif. Tekan `Ctrl + Shift + X` untuk mematikannya.

### Windows menampilkan peringatan keamanan

Build lokal mungkin belum memiliki sertifikat code-signing publik. Periksa source code dan build sendiri apabila kamu ingin memastikan isi aplikasinya.

## ⚠️ Catatan dan disclaimer

Proyek ini menggunakan [`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector), sebuah library tidak resmi yang membaca event webcast TikTok LIVE publik.

Proyek ini:

- tidak berafiliasi, disponsori, atau didukung oleh TikTok maupun ByteDance;
- tidak meminta password TikTok;
- hanya ditujukan untuk membaca aktivitas LIVE yang dapat diakses publik;
- dapat berhenti bekerja apabila TikTok mengubah endpoint, format event, atau kebijakan aksesnya.

Gunakan aplikasi secara bertanggung jawab dan patuhi ketentuan platform yang berlaku.

## 🤝 Kontribusi

Kontribusi sangat terbuka. Kamu dapat:

1. Fork repository ini.
2. Buat branch fitur baru.
3. Commit perubahanmu.
4. Buka Pull Request dengan penjelasan yang jelas.

Untuk laporan bug, sertakan versi aplikasi, versi Windows, pesan error, dan langkah untuk mereproduksi masalah.

## 👤 Author

**Rizki Fadhillah**

Jika proyek ini membantu, jangan lupa beri ⭐ pada repository.

---

<div align="center">

Made with ❤️ for TikTok LIVE creators

</div>
