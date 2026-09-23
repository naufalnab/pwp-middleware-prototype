'use strict';
// All audit entries in this static prototype live only in browser memory.
// Each import attempt is ONE top-level operation; per-row details are nested.
function auditPoSnapshot(r,txId=null,disposition='valid'){
  return {kind:'po',row:r.line,ref:r.data.reference||'(tanpa referensi)',txId,
    vendor:r.data.vendor,date:r.data.date,lot:r.data.lot,
    gross:r.numeric.gross_kg??null,tare:r.numeric.tare_kg??null,
    lines:[
      {product:'PET',qty:r.numeric.pet_kg??null,unitPrice:r.numeric.pet_price_idr??null,po:true},
      {product:'HDPE',qty:r.numeric.hdpe_kg??null,unitPrice:r.numeric.hdpe_price_idr??null,po:true},
      {product:'Residu',qty:r.numeric.residu_kg??null,unitPrice:0,po:false}
    ],disposition,errors:[...new Set(r.errors.map(e=>e.message))]};
}
function auditImportEntry(filename,analysis,success=false,transactionIds=[]){
  const total=analysis.rows.length,invalid=analysis.invalidCount;
  return {kind:'po_import',title:'Import PO',source:filename,at:new Date().toISOString(),
    outcome:success?'success':'failed',total,
    success:success?total:0,failed:success?0:invalid,blocked:success?0:total-invalid,
    issues:[...analysis.headerErrors],message:success
      ?'Semua baris lolos validasi dan diterima ke middleware. PO Odoo belum dibuat.'
      :'Impor ditolak seluruhnya. Tidak ada satu pun transaksi disimpan.',
    items:analysis.rows.map((r,i)=>auditPoSnapshot(r,success?transactionIds[i]:null,
      success?'received':r.errors.length?'invalid':'blocked'))};
}
function auditFileError(filename,message){
  return {kind:'po_import',title:'Import PO',source:filename,at:new Date().toISOString(),
    outcome:'failed',total:0,success:0,failed:0,blocked:0,items:[],
    issues:[message],message:'Berkas gagal dibaca; tidak ada transaksi disimpan.'};
}
function auditSeedEntries(){
  const products=[
    {kind:'product',code:'PET-001',name:'PET Clear',uom:'kg',odoo:'product.product / PET-001',disposition:'synced'},
    {kind:'product',code:'HDPE-001',name:'HDPE Mixed',uom:'kg',odoo:'product.product / HDPE-001',disposition:'synced'},
    {kind:'product',code:'PET-002',name:'PET Blue',uom:'kg',odoo:'product.product / PET-002',disposition:'synced'},
    {kind:'product',code:'RES-001',name:'Residu sortir',uom:'kg',odoo:'product.product / RES-001',disposition:'synced'},
    {kind:'product',code:'UNK-005',name:'Unknown Material',uom:'kg',odoo:'',disposition:'failed',errors:['Kode kategori tidak ada pada mapping Odoo (simulasi).']}
  ];
  return [
    {id:'LOG-DEMO-002',kind:'product_sync',title:'Integrasi Master Product',source:'Vendor ABC → Odoo (demo)',
     at:'2026-09-23T08:20:00+07:00',outcome:'partial',total:5,success:4,failed:1,blocked:0,
     message:'Contoh sinkronisasi produk dengan hasil campuran.',issues:[],items:products},
    {id:'LOG-DEMO-001',kind:'po_sync',title:'Integrasi PO',source:'Middleware → Odoo (demo)',
     at:'2026-09-23T09:11:00+07:00',outcome:'success',total:1,success:1,failed:0,blocked:0,
     message:'Contoh PO berhasil dibuat oleh simulator Odoo.',issues:[],items:[{
       kind:'po',ref:'VABC-260923-001',txId:'TRX-001',date:'2026-09-23',vendor:'PT Contoh Material',
       lot:'LOT-260923',gross:18600,tare:8200,lines:sampleLines(),disposition:'synced',
       po:'PO-DEMO-0042',errors:[]}]}
  ];
}
function auditInitialState(){return {entries:auditSeedEntries(),selected:null,itemIndex:null,next:1}}
function recordAudit(entry){
  const audit=state.audit;
  const item={...entry,id:entry.id||'LOG-'+String(audit.next++).padStart(4,'0')};
  audit.entries.unshift(item);
  return item;
}
function auditCurrent(){return state.audit.entries.find(x=>x.id===state.audit.selected)}
function auditSafeId(id){return "'"+String(id).replace(/[^A-Za-z0-9-]/g,'')+"'"}
function auditDate(at){return new Date(at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}
function auditStatus(entry){
  return entry.outcome==='success'?'<span class="audit-state success">✓ Berhasil</span>':
    entry.outcome==='partial'?'<span class="audit-state partial">! Sebagian gagal</span>':
    '<span class="audit-state failed">✕ Gagal</span>';
}
function auditKind(entry){return entry.kind==='product_sync'?'Master Product':entry.kind==='po_import'?'Import PO':'Integrasi PO'}
function pageAudit(){
  const a=state.audit;
  if(a.selected){const entry=auditCurrent();if(!entry){a.selected=null;a.itemIndex=null}else
    return a.itemIndex===null?pageAuditBatch(entry):pageAuditItem(entry,a.itemIndex)}
  const entries=a.entries,totals={success:entries.filter(x=>x.outcome==='success').length,
    partial:entries.filter(x=>x.outcome==='partial').length,failed:entries.filter(x=>x.outcome==='failed').length};
  return heading('OPERATIONS / TRACEABILITY','Audit Log',
    'Satu baris untuk setiap operasi import atau integrasi. Klik log untuk melihat seluruh PO atau master product, lalu klik item untuk melihat detailnya.',
    '<button class="btn" onclick="exportLogs()">'+icon('file')+' Ekspor audit (CSV)</button>')+
    '<div class="audit-stats"><div class="card audit-stat"><span>Total operasi</span><strong>'+entries.length+'</strong></div>'+
    '<div class="card audit-stat"><span>Berhasil</span><strong>'+totals.success+'</strong></div>'+
    '<div class="card audit-stat"><span>Sebagian gagal</span><strong>'+totals.partial+'</strong></div>'+
    '<div class="card audit-stat"><span>Gagal</span><strong>'+totals.failed+'</strong></div></div>'+
    '<section class="card"><div class="card-header"><div><h3>Aktivitas integrasi & import</h3>'+
    '<p>Jumlah berhasil/gagal adalah jumlah item; jika import PO gagal, item lain dalam batch juga tertahan.</p></div><span class="pill light">'+entries.length+' operasi</span></div>'+
    '<div class="table-wrap"><table class="tbl audit-table"><thead><tr><th>Waktu</th><th>Operasi / ID</th><th>Sumber</th><th>Total</th><th>Berhasil</th><th>Gagal</th><th>Tertahan</th><th>Status</th><th>Detail</th></tr></thead><tbody>'+
    entries.map(e=>'<tr class="audit-clickable" tabindex="0" role="button" onclick="openAudit('+auditSafeId(e.id)+')" onkeydown="if(event.keyCode===13||event.keyCode===32){event.preventDefault();openAudit('+auditSafeId(e.id)+')}"><td>'+escapeHtml(auditDate(e.at))+'</td><td><b>'+escapeHtml(e.title)+'</b><small>'+escapeHtml(e.id)+'</small></td>'+
      '<td>'+escapeHtml(e.source)+'</td><td>'+num(e.total)+'</td><td class="audit-good">'+num(e.success)+'</td>'+
      '<td class="audit-bad">'+num(e.failed)+'</td><td>'+num(e.blocked)+'</td><td>'+auditStatus(e)+'</td>'+
      '<td><button class="btn small" onclick="event.stopPropagation();openAudit('+auditSafeId(e.id)+')" aria-label="Buka detail '+escapeHtml(e.id)+'">Lihat detail →</button></td></tr>').join('')+
    '</tbody></table></div></section><p class="footnote">Semua entri di sini adalah demo di memori browser, termasuk contoh awal Master Product dan PO. Log persisten serta identitas operator yang terverifikasi memerlukan backend produksi.</p>';
}
function openAudit(id){state.audit.selected=id;state.audit.itemIndex=null;goto('audit')}
function openAuditItem(index){const entry=auditCurrent();if(!entry||!entry.items[index])return;state.audit.itemIndex=index;goto('audit')}
function backAudit(){if(state.audit.itemIndex!==null){state.audit.itemIndex=null}else{state.audit.selected=null}render()}
function auditItemStatus(item){
  if(item.disposition==='invalid'||item.disposition==='failed')return '<span class="audit-state failed">Gagal</span>';
  if(item.disposition==='blocked')return '<span class="audit-state blocked">Tertahan</span>';
  if(item.disposition==='synced')return '<span class="audit-state success">Berhasil</span>';
  return '<span class="audit-state received">Diterima</span>';
}
function pageAuditBatch(e){
  const po=e.kind!=='product_sync';
  const title=e.title+' · '+e.id;
  const items=e.items||[];
  const row=po?(item,i)=>'<tr class="audit-clickable '+(item.disposition==='invalid'?'audit-invalid-row':'')+'" tabindex="0" role="button" onclick="openAuditItem('+i+')" onkeydown="if(event.keyCode===13||event.keyCode===32){event.preventDefault();openAuditItem('+i+')}"><td>'+escapeHtml(item.row??'—')+'</td><td><b>'+escapeHtml(item.ref)+'</b></td>'+
    '<td>'+escapeHtml(item.vendor??'—')+'</td><td>'+escapeHtml(item.po||state.transactions.find(t=>t.id===item.txId)?.po||'Belum dibuat')+'</td>'+
    '<td>'+auditItemStatus(item)+'</td><td>'+escapeHtml(item.errors?.join('; ')|| (item.disposition==='blocked'?'Tidak disimpan: ada baris lain bermasalah':'—'))+'</td>'+
    '<td><button class="btn small" onclick="event.stopPropagation();openAuditItem('+i+')">Detail PO →</button></td></tr>':
    (item,i)=>'<tr class="audit-clickable '+(item.disposition==='failed'?'audit-invalid-row':'')+'" tabindex="0" role="button" onclick="openAuditItem('+i+')" onkeydown="if(event.keyCode===13||event.keyCode===32){event.preventDefault();openAuditItem('+i+')}"><td>'+escapeHtml(item.code)+'</td><td>'+escapeHtml(item.name)+'</td><td>'+escapeHtml(item.uom)+'</td>'+
    '<td>'+escapeHtml(item.odoo||'Tidak dipetakan')+'</td><td>'+auditItemStatus(item)+'</td>'+
    '<td>'+escapeHtml(item.errors?.join('; ')||'—')+'</td><td><button class="btn small" onclick="event.stopPropagation();openAuditItem('+i+')">Detail produk →</button></td></tr>';
  return '<button class="btn small audit-back" onclick="backAudit()">← Kembali ke Audit Log</button>'+
    heading('OPERATION DETAIL',title,'Satu operasi berisi '+e.total+' item. Pilih baris di bawah untuk memeriksa data dan status tiap '+(po?'PO.':'produk.'))+
    '<div class="card audit-summary"><div><span>Waktu</span><strong>'+escapeHtml(auditDate(e.at))+'</strong></div>'+
    '<div><span>Sumber</span><strong>'+escapeHtml(e.source)+'</strong></div><div><span>Status</span>'+auditStatus(e)+'</div>'+
    '<div><span>Total</span><strong>'+num(e.total)+'</strong></div><div><span>Berhasil</span><strong class="audit-good">'+num(e.success)+'</strong></div>'+
    '<div><span>Gagal</span><strong class="audit-bad">'+num(e.failed)+'</strong></div><div><span>Tertahan</span><strong>'+num(e.blocked)+'</strong></div></div>'+
    '<div class="callout '+(e.outcome==='failed'?'error':e.outcome==='partial'?'warn':'')+'" style="margin:18px 0">'+escapeHtml(e.message)+'</div>'+
    (e.issues?.length?'<div class="callout error" style="margin-bottom:16px"><strong>Masalah file / header:</strong><ul>'+e.issues.map(v=>'<li>'+escapeHtml(v)+'</li>').join('')+'</ul></div>':'')+
    '<section class="card"><div class="card-header"><div><h3>Rincian '+(po?'PO':'Master Product')+'</h3><p>Klik salah satu item untuk melihat detailnya.</p></div><span class="pill light">'+items.length+' item</span></div>'+
    '<div class="table-wrap"><table class="tbl audit-table"><thead><tr>'+
    (po?'<th>Baris</th><th>Referensi PO</th><th>Vendor</th><th>Nomor PO Odoo</th>':'<th>Kode</th><th>Nama produk</th><th>Satuan</th><th>Mapping Odoo</th>')+
    '<th>Status</th><th>Catatan</th><th>Detail</th></tr></thead><tbody>'+items.map(row).join('')+
    (!items.length?'<tr><td colspan="7">Tidak ada item terbaca pada berkas ini.</td></tr>':'')+'</tbody></table></div></section>';
}
function pageAuditItem(e,index){
  const item=e.items[index];
  if(!item)return '<div class="callout error">Item audit tidak ditemukan.</div>';
  const product=item.kind==='product';
  const live=item.txId?state.transactions.find(t=>t.id===item.txId):null;
  const reference=item.ref||item.code;
  const fields=product?[
    ['Kode produk',item.code],['Nama produk',item.name],['Satuan',item.uom],
    ['Mapping Odoo',item.odoo||'Belum terpetakan']
  ]:[['Referensi eksternal',item.ref],['Nomor PO Odoo (demo)',live?.po||item.po||'Belum dibuat'],
    ['Vendor',item.vendor||'—'],['Tanggal',item.date||'—'],['Lot Number',item.lot||'—'],
    ['Gross',item.gross==null?'—':num(item.gross)+' kg'],
    ['Tare',item.tare==null?'—':num(item.tare)+' kg'],
    ['Net',item.gross==null||item.tare==null?'—':num(item.gross-item.tare)+' kg'],
    ['Status saat ini',live?(labelStatus[live.status]||live.status):'Tidak disimpan ke middleware']];
  const lineTable=!product&&item.lines?'<section class="card"><div class="card-header"><h3>Rincian item PO</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Produk</th><th>Kuantitas</th><th>Harga satuan</th><th>Masuk PO?</th></tr></thead><tbody>'+
    item.lines.map(l=>'<tr><td>'+escapeHtml(l.product)+'</td><td>'+(l.qty==null?'—':num(l.qty)+' kg')+'</td><td>'+(l.unitPrice==null?'—':money(l.unitPrice))+'</td><td>'+(l.po?'Ya':'Tidak (asumsi demo)')+'</td></tr>').join('')+
    '</tbody></table></div></section>':'';
  return '<button class="btn small audit-back" onclick="backAudit()">← Kembali ke daftar '+(product?'produk':'PO')+'</button>'+
    heading('ITEM DETAIL',(product?'Master Product · ':'Rincian PO · ')+escapeHtml(reference),
      'Detail item dalam operasi '+escapeHtml(e.id)+' ('+escapeHtml(auditDate(e.at))+').')+
    '<div class="card section-pad"><div class="detail-head"><div><div class="eyebrow">'+escapeHtml(auditKind(e))+' / '+escapeHtml(e.source)+'</div>'+
    '<h2>'+escapeHtml(reference)+'</h2><p>Nomor baris sumber: '+escapeHtml(item.row??'—')+'</p></div>'+auditItemStatus(item)+'</div><hr class="divider"/>'+
    '<dl class="info-grid">'+fields.map(([name,value])=>'<div class="info"><dt>'+escapeHtml(name)+'</dt><dd>'+escapeHtml(value??'—')+'</dd></div>').join('')+'</dl></div>'+
    (item.errors?.length?'<div class="callout error" style="margin:16px 0"><strong>Masalah pada item ini:</strong><ul>'+item.errors.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></div>':'')+
    (item.disposition==='blocked'?'<div class="callout warn" style="margin:16px 0">Baris ini valid, tetapi seluruh batch ditolak karena ada baris lain yang salah.</div>':'')+
    '<div style="margin-top:16px">'+lineTable+'</div>'+
    (live?'<div class="actions" style="margin-top:16px"><button class="btn primary" onclick="state.selected='+JSON.stringify(live.id).replaceAll('"','&quot;')+';goto(\'validation\')">Buka transaksi saat ini →</button></div>':'');
}

function simulateMasterProductSync(){
  const models=auditSeedEntries()[0].items.map(item=>({...item,errors:item.errors?.slice()||[]}));
  const event=recordAudit({kind:'product_sync',title:'Integrasi Master Product',source:'Vendor ABC → Odoo (demo)',
    at:new Date().toISOString(),outcome:'partial',total:models.length,success:4,failed:1,blocked:0,
    issues:[],message:'Simulasi batch master product: empat produk dipetakan; satu ditolak karena mapping tidak ada.',items:models});
  state.audit.selected=event.id;state.audit.itemIndex=null;goto('audit');
  toast('Audit Log: integrasi Master Product simulasi dicatat (4 berhasil, 1 gagal).');
}
function auditSyncPO(t,successful,message){
  const snapshot={kind:'po',ref:t.ref,txId:t.id,vendor:t.vendor,date:t.date,lot:t.lot,
    gross:t.gross,tare:t.tare,lines:t.lines.map(line=>({...line})),po:t.po||null,
    disposition:successful?'synced':'failed',errors:successful?[]:[message]};
  recordAudit({kind:'po_sync',title:'Integrasi PO',source:'Middleware → Odoo (demo)',
    at:new Date().toISOString(),outcome:successful?'success':'failed',total:1,
    success:successful?1:0,failed:successful?0:1,blocked:0,
    message,issues:[],items:[snapshot]});
}
