# PWP Integration Control Center — Prototype interaktif

Prototype **frontend statis** untuk presentasi konsep integrasi penimbangan Vendor ABC → middleware → Odoo 16.

## Cara menjalankan

1. Buka `index.html` langsung di Chrome / Safari; **tidak ada instalasi atau server yang diperlukan**.
   Tampilan awal menggunakan **dark mode**; gunakan tombol **☀ Mode terang / ☾ Mode gelap** di header untuk berganti tema. Pilihan tema disimpan di browser jika penyimpanan lokal tersedia.
2. Klik **Simulasi transaksi** lalu pilih salah satu skenario: Normal, Duplikat, Selisih Berat, atau Odoo Unavailable.
3. Klik **Kirim ke Middleware** → **Jalankan validasi** → konfirmasi **Vendor ABC** dan **PWP** → **Integrasi Odoo** → **Kirim ke Odoo (demo)**.
4. Skenario **Odoo unavailable**: klik **Retry** setelah pengiriman gagal; hasil simulasi akan pulih.
5. Periksa **Audit Log**, ekspor CSV, atau lihat **Data Mapping** dan daftar pertanyaan workshop.

## Import batch CSV / Excel (semua atau tidak sama sekali)

Buka menu **Import CSV / Excel**, lalu pilih file `.csv` (UTF-8, pemisah koma atau titik koma) atau `.xlsx` (worksheet pertama). Maksimal **1.000 baris data / 5 MB**. Template valid maupun contoh file salah tersedia melalui tombol unduh di halaman Import dan di folder `examples/`.

Header wajib urut persis seperti berikut (satu baris = satu transaksi lengkap):

```csv
reference,vendor,date,lot,gross_kg,tare_kg,pet_kg,pet_price_idr,hdpe_kg,hdpe_price_idr,residu_kg
```

`date` memakai `YYYY-MM-DD`, bilangan harus memakai titik untuk desimal, dan harga memakai IDR. PET dan HDPE merupakan mapping contoh demo (bukan skema final dari Vendor ABC).

**Foto di CSV / Excel (opsional):** tambahkan kolom `image_filename,image_base64` **setelah** `residu_kg`. CSV 11 kolom lama tetap didukung, termasuk varian 12 kolom yang hanya menambahkan `image_base64` (nama foto dibentuk otomatis). Isikan `image_base64` dengan **Base64 murni** atau `data:image/jpeg;base64,...` / `data:image/png;base64,...` / `data:image/webp;base64,...`. Jika memakai Data URL, **bungkus seluruh isinya dalam tanda kutip ganda di CSV** karena ada koma setelah `base64`. Nama foto, jika disertakan, harus berakhiran `.png`, `.jpg`, `.jpeg`, atau `.webp` tanpa path. Satu bukti gambar per PO, maks. **2 MB per gambar** dan **5 MB per berkas**.

Coba `examples/import-with-image.csv` atau `examples/import-with-image.xlsx` untuk satu baris dengan gambar ilustrasi truk (`examples/bukti-timbang-ilustrasi.png`), `examples/import-with-image-invalid.csv` untuk kasus selisih timbang, serta `examples/import-bad-photo.csv` untuk kasus **gambar Base64 rusak**. Masing-masing kasus gagal menolak **seluruh** batch. Tombol unduh contoh dengan foto juga tersedia di layar Import. Preview gambar tampil di tabel import serta detail transaksi/Audit Log; payload JSON demo menyertakan `attachments: [{filename,mime_type,content_base64}]`. Nama field lampiran Odoo yang sebenarnya **belum ditetapkan** dan perlu disesuaikan dengan kontrak API klien.


**Aturan all-or-nothing:** file hanya dapat diimpor jika setiap baris valid: header dan jumlah kolom benar, referensi unik baik di file maupun terhadap transaksi yang sudah ada, identitas/tanggal lengkap dan valid, semua angka sesuai batas, Gross > Tare, serta total sortir tepat sama dengan Net (aturan ilustrasi). Jika satu saja gagal, **tidak ada satu pun transaksi ditambahkan**; baris dan sel bermasalah muncul **merah**, disertai nomor baris fisik dan alasan kesalahan. Header bermasalah juga ditandai merah. Perbaiki file sumber lalu unggah ulang. Jika semuanya valid, seluruh transaksi masuk sekaligus dalam satu batch dan menghasilkan **satu entri Audit Log** dengan daftar semua transaksi di dalamnya.

Excel dibaca **lokal di browser** memakai bundel ExcelJS 4.4.0 yang disertakan di `vendor/` (lisensi MIT); tidak memakai CDN. Formula Excel tidak diterima dalam berkas impor, gunakan nilai biasa. Bila berkas memiliki baris kosong di tengah, baris tersebut gagal validasi; baris kosong di akhir diabaikan.

Jalankan tes parser/validasi dan pencatatan Audit Log dengan `node --test tests/*.test.cjs`. Fitur ini **hanya simulasi frontend**: transaksi hilang saat reload, belum ada penyimpanan atau rollback database. Implementasi produksi harus memakai transaksi database dan pengamanan server-side untuk menjamin sifat atomik tersebut.

## Audit Log: detail batch → item

Menu **Audit Log** mencatat **satu entri per operasi** berikut (semuanya simulasi frontend):

- **Impor CSV/Excel berhasil:** satu log berstatus Berhasil dengan total jumlah PO/transaksi yang masuk. Klik **Lihat detail** untuk melihat seluruh daftar PO dalam batch; klik **Detail PO** untuk melihat vendor, lot, tanggal, gross/tare/net, material, harga, dan status PO Odoo (jika sudah dibuat dalam simulator).
- **Impor gagal:** satu log berstatus Gagal; menampilkan jumlah baris salah serta baris valid yang **tertahan**, pesan error, dan daftar baris yang bisa diperiksa satu per satu. Tidak ada transaksi yang ditambahkan ke middleware, termasuk baris yang valid.
- **Pembaruan Master Product dan Master Warehouse:** contoh awal memperlihatkan master yang **diterima dari Odoo 16**. Gunakan menu **Master Data Odoo → Terima update dari Odoo (demo)** untuk memperbarui mirror baca-saja dan mencatat hasil berhasil/gagal per item di Audit Log.
- **Integrasi PO:** setiap percobaan kirim ke simulator Odoo dicatat sebagai operasi berhasil/gagal. Detailnya terhubung dengan transaksi terkait, sementara **timeline transaksi** tetap memuat kejadian individual.

Ekspor CSV Audit Log menghasilkan **satu baris per operasi**, berisi waktu, jenis, sumber, status, jumlah total, berhasil, gagal, dan tertahan. Data dan audit di prototype tetap hanya berada di memori browser: **refresh akan menghapus aktivitas baru**, sedangkan entri contoh awal dimuat ulang. Sistem produksi nantinya memerlukan audit terpusat persisten, izin pengguna, dan transaksi database atomik.

## Kepemilikan Master Data: hanya Odoo 16

**Satu arah: Odoo 16 → Middleware.** Master Product (`product.product`) dan Master Warehouse (`stock.warehouse`) dibuat, diedit, diarsipkan, atau dihapus hanya melalui Odoo. Middleware **tidak** menyediakan fitur tambah, ubah, atau hapus master. Halaman **Master Data Odoo** menampilkan salinan baca-saja, dan tombol **Terima update dari Odoo (demo)** mensimulasikan event inbound (record baru, perubahan record, dan contoh record rusak). Audit Log mencatat hasil sinkronisasi beserta referensi Odoo untuk setiap item. Transaksi penimbangan tetap diarahkan **Vendor ABC → Middleware → PO Odoo** dan produk transaksi divalidasi terhadap mirror master dari Odoo.

Prototype statis ini **belum terkoneksi** ke API, webhook, atau polling Odoo produksi; update yang terlihat adalah data simulasi. Autentikasi origin, idempotensi webhook, penanganan record yang diarsipkan/dihapus, serta penyimpanan mirror dan audit persisten memerlukan implementasi backend.

## Hosting di Vercel

Deploy direktori ini sebagai proyek **static / Other**, tanpa build command dan tanpa environment variables. Alternatif: unggah direktori ke GitHub lalu impor ke Vercel. Root entry adalah `index.html`.

## Asal kebutuhan

- `260923_Middleware Proj PWP.xlsx`: jembatan timbang (gross, berat truk, net), sortir digital berdasarkan produk/lot/vendor, field middleware/Odoo, audit trail, konfirmasi data final kedua pihak, batch number/token, mirroring real-time/same-day, estimasi jadwal.
- `Design.pdf`: validasi, pemetaan data, pemeriksaan duplikasi, sistem persetujuan, JSON API HTTPS dan opsi CSV, alur pengembangan empat tahap.

## Batasan penting

**DEMO / BUKAN SISTEM PRODUKSI.** Data vendor, massa, harga, material PET/HDPE/residu, nominal transaksi, nomor PO, respons API, dan konfirmasi pengguna adalah ilustrasi. Tidak ada koneksi langsung ke Odoo, Vendor ABC, database, atau autentikasi nyata. Data termasuk Base64 foto hanya disimpan di memori browser dan akan hilang saat halaman dimuat ulang. Untuk produksi, simpan gambar secara privat, validasi ulang di backend, dan jangan menyimpan Base64 mentah dalam Audit Log. Ekspor audit log CSV tersedia.

Perlu dikonfirmasi saat workshop: asal qty PO (net jembatan timbang atau total per produk setelah sortir), perlakuan residu, toleransi selisih, apakah PO dimulai sebagai RFQ, arti `qty reserved` dalam proses klien, referensi kontrak API vendor, model persetujuan/token, master data, dan akses Odoo staging. Aturan demo **mewajibkan selisih 0 kg**; tidak boleh dianggap sebagai persyaratan PWP yang telah disetujui. Penggunaan `PO-DEMO-...` tidak membuat dokumen di sistem ERP mana pun.