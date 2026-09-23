# PWP Integration Control Center — Prototype interaktif

Prototype **frontend statis** untuk presentasi konsep integrasi penimbangan Vendor ABC → middleware → Odoo 16.

## Cara menjalankan

1. Buka `index.html` langsung di Chrome / Safari; **tidak ada instalasi atau server yang diperlukan**.
   Tampilan awal menggunakan **dark mode**; gunakan tombol **☀ Mode terang / ☾ Mode gelap** di header untuk berganti tema. Pilihan tema disimpan di browser jika penyimpanan lokal tersedia.
2. Klik **Simulasi transaksi** lalu pilih salah satu skenario: Normal, Duplikat, Selisih Berat, atau Odoo Unavailable.
3. Klik **Kirim ke Middleware** → **Jalankan validasi** → konfirmasi **Vendor ABC** dan **PWP** → **Integrasi Odoo** → **Kirim ke Odoo (demo)**.
4. Skenario **Odoo unavailable**: klik **Retry** setelah pengiriman gagal; hasil simulasi akan pulih.
5. Periksa **Audit Trail**, ekspor CSV, atau lihat **Data Mapping** dan daftar pertanyaan workshop.

## Hosting di Vercel

Deploy direktori ini sebagai proyek **static / Other**, tanpa build command dan tanpa environment variables. Alternatif: unggah direktori ke GitHub lalu impor ke Vercel. Root entry adalah `index.html`.

## Asal kebutuhan

- `260923_Middleware Proj PWP.xlsx`: jembatan timbang (gross, berat truk, net), sortir digital berdasarkan produk/lot/vendor, field middleware/Odoo, audit trail, konfirmasi data final kedua pihak, batch number/token, mirroring real-time/same-day, estimasi jadwal.
- `Design.pdf`: validasi, pemetaan data, pemeriksaan duplikasi, sistem persetujuan, JSON API HTTPS dan opsi CSV, alur pengembangan empat tahap.

## Batasan penting

**DEMO / BUKAN SISTEM PRODUKSI.** Data vendor, massa, harga, material PET/HDPE/residu, nominal transaksi, nomor PO, respons API, dan konfirmasi pengguna adalah ilustrasi. Tidak ada koneksi langsung ke Odoo, Vendor ABC, database, atau autentikasi nyata. Data hanya disimpan di memori browser dan akan hilang saat halaman dimuat ulang. Ekspor audit log CSV tersedia.

Perlu dikonfirmasi saat workshop: asal qty PO (net jembatan timbang atau total per produk setelah sortir), perlakuan residu, toleransi selisih, apakah PO dimulai sebagai RFQ, arti `qty reserved` dalam proses klien, referensi kontrak API vendor, model persetujuan/token, master data, dan akses Odoo staging. Aturan demo **mewajibkan selisih 0 kg**; tidak boleh dianggap sebagai persyaratan PWP yang telah disetujui. Penggunaan `PO-DEMO-...` tidak membuat dokumen di sistem ERP mana pun.