'use strict';
// Read-only views over master datasets received from the Odoo simulator.
function selectMasterTab(tab){
  if(!['products','warehouses'].includes(tab))return;
  state.master.activeTab=tab;render();
}
function pageMasters(){
  const m=state.master,products=m.activeTab==='products',kind=products?'product':'warehouse';
  const items=products?m.products:m.warehouses;
  const cols=products?'<th>ID Odoo</th><th>Kode</th><th>Produk</th><th>Satuan</th><th>Status Odoo</th><th>Terakhir diubah (Odoo)</th>':
    '<th>ID Odoo</th><th>Kode</th><th>Warehouse</th><th>Perusahaan</th><th>Status Odoo</th><th>Terakhir diubah (Odoo)</th>';
  const rows=items.map(x=>'<tr><td>'+escapeHtml(x.id)+'</td><td><strong>'+escapeHtml(x.code)+'</strong></td>'+
    '<td>'+escapeHtml(x.name)+'</td><td>'+escapeHtml(products?x.uom:x.company)+'</td>'+
    '<td><span class="audit-state '+(x.active?'success':'blocked')+'">'+(x.active?'Aktif':'Diarsipkan di Odoo')+'</span></td>'+
    '<td>'+escapeHtml(auditDate(x.writeDate))+'</td></tr>').join('');
  return heading('ODOO 16 / SOURCE OF TRUTH','Master Data Odoo',
      'Master Product dan Master Warehouse hanya berasal dari Odoo. Middleware menyimpan salinan baca-saja untuk validasi transaksi; tidak menyediakan tambah, ubah, atau hapus master.')+
    '<div class="master-rule card"><div><div class="eyebrow">ARAH INTEGRASI MASTER</div><h2>Odoo 16 → Middleware</h2>'+
    '<p>Master dibuat dan dikelola di Odoo. Saat ada produk atau warehouse baru/perubahan di Odoo, middleware menerima update dan memperbarui mirror untuk dipakai oleh transaksi.</p></div>'+
    '<span class="audit-state success">Read-only mirror</span></div>'+
    '<div class="audit-stats"><div class="card audit-stat"><span>Master Product (mirror)</span><strong>'+m.products.length+'</strong></div>'+
    '<div class="card audit-stat"><span>Master Warehouse (mirror)</span><strong>'+m.warehouses.length+'</strong></div>'+
    '<div class="card audit-stat"><span>Pemilik master</span><strong class="master-owner">Odoo 16</strong></div>'+
    '<div class="card audit-stat"><span>Update terakhir (demo)</span><strong class="master-updated">'+escapeHtml(auditDate(m.lastReceived))+'</strong></div></div>'+
    '<section class="card"><div class="card-header"><div><h3>Data master yang diterima dari Odoo</h3>'+
    '<p>Simulasi event hanya meniru Odoo mengirim perubahan ke middleware, bukan middleware mengubah Odoo.</p></div></div>'+
    '<div class="master-toolbar"><div class="master-tabs" role="tablist" aria-label="Jenis master">'+
    '<button role="tab" class="master-tab '+(products?'selected':'')+'" aria-selected="'+products+'" onclick="selectMasterTab(\'products\')">Master Product</button>'+
    '<button role="tab" class="master-tab '+(!products?'selected':'')+'" aria-selected="'+!products+'" onclick="selectMasterTab(\'warehouses\')">Master Warehouse</button></div>'+
    '<button class="btn primary" onclick="simulateOdooMasterUpdate(\''+kind+'\')">↓ Terima update '+(products?'produk':'warehouse')+' dari Odoo (demo)</button></div>'+
    '<div class="table-wrap"><table class="tbl master-table"><thead><tr>'+cols+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="master-note"><strong>Kontrol satu arah:</strong> Master tidak dapat ditambah, diubah, atau dihapus dari middleware. Tombol demo mensimulasikan event dari Odoo, menolak record tidak valid, dan mencatat hasil per item di Audit Log. Untuk produksi, koneksi Odoo, autentikasi, dan mekanisme event atau polling harus disiapkan.</div></section>';
}
