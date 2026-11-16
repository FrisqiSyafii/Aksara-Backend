# AKSARA Backend

**AKSARA (Aplikasi Kehadiran Siswa dan Rekapitulasi Absensi)** merupakan aplikasi pengelolaan kehadiran siswa berbasis web yang dikembangkan untuk membantu proses pencatatan, pemantauan, dan rekapitulasi absensi siswa di SMKS Al-Kirom Seputih Mataram.

Repository ini merupakan bagian backend dari aplikasi AKSARA yang bertugas mengelola API, autentikasi pengguna, pemrosesan data, serta komunikasi dengan database dan layanan Face Recognition.

## 🚀 Teknologi yang Digunakan

- **Node.js** – Runtime JavaScript.
- **Express.js** – Framework backend untuk membangun REST API.
- **MySQL** – Database relasional.
- **JWT (JSON Web Token)** – Autentikasi dan otorisasi pengguna.
- **Bcrypt.js** – Enkripsi password.
- **Axios** – HTTP client untuk komunikasi antarlayanan.
- **CORS** – Pengaturan akses komunikasi antar-origin.
- **Dotenv** – Pengelolaan konfigurasi environment.

## 📁 Struktur Project

```text
absensi-siswa-backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## ✨ Fitur Backend

- Autentikasi dan manajemen pengguna.
- Pengelolaan data siswa.
- Pengelolaan data guru.
- Pengelolaan data kelas.
- Pengelolaan mata pelajaran.
- Pengelolaan jadwal dan relasi guru dengan mata pelajaran.
- Pengelolaan data kehadiran siswa.
- Pemrosesan dan rekapitulasi absensi.
- Pengelolaan dokumen dan verifikasi dokumen.
- Integrasi dengan layanan Face Recognition.
- Pengaturan hak akses berdasarkan peran pengguna.

## 👥 Hak Akses Pengguna

| Role | Hak Akses |
|---|---|
| Admin | Mengelola data dan konfigurasi sistem |
| Guru | Mengelola dan memantau data kehadiran siswa |
| Yayasan | Memantau dashboard dan laporan rekapitulasi |

## ⚙️ Instalasi dan Konfigurasi

### 1. Clone Repository

```bash
git clone https://github.com/FrisqiSyafii/Aksara-Backend.git
```

### 2. Masuk ke Direktori Project

```bash
cd Aksara-Backend
```

### 3. Instal Dependencies

```bash
npm install
```

### 4. Konfigurasi Environment

Buat file `.env` berdasarkan `.env.example`, kemudian sesuaikan konfigurasi berikut dengan lingkungan lokal:

```env
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=absensi_siswa

JWT_SECRET=isi_dengan_secret_yang_aman
```

Sesuaikan nama variabel environment dengan konfigurasi yang digunakan pada source code backend.

### 5. Jalankan Server

Mode development:

```bash
npm run start:dev
```

Server akan berjalan menggunakan port yang telah ditentukan pada konfigurasi environment.

## 🔗 Integrasi Sistem

Backend AKSARA berfungsi sebagai penghubung antara frontend, database MySQL, dan layanan Face Recognition.

- **Frontend:** React.js dan Vite.
- **Backend:** Node.js dan Express.js.
- **Database:** MySQL.
- **Face Recognition Service:** Python dan FastAPI.

## 🔐 Keamanan

Beberapa aspek keamanan yang diterapkan:

- Autentikasi menggunakan JSON Web Token (JWT).
- Password pengguna diproses menggunakan bcrypt.
- Pembatasan akses berdasarkan role pengguna.
- Konfigurasi sensitif disimpan melalui environment variables.
- Validasi permintaan API.

## 🎓 Informasi Pengembangan

Project ini dikembangkan sebagai bagian dari tugas akhir untuk mendukung digitalisasi sistem administrasi kehadiran siswa di lingkungan SMKS Al-Kirom Seputih Mataram.

**Nama Aplikasi:** AKSARA  
**Kepanjangan:** Aplikasi Kehadiran Siswa dan Rekapitulasi Absensi  
**Platform:** Web Application  
**Repository:** Aksara-Backend

---

© 2026 AKSARA. All Rights Reserved.
