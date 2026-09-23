'use strict';
// Client-side import for the presentation prototype. No row is written until
// every row and the header have passed validation (all-or-nothing).
const IMPORT_FIELDS = [
  'reference','vendor','date','lot','gross_kg','tare_kg',
  'pet_kg','pet_price_idr','hdpe_kg','hdpe_price_idr','residu_kg'
];
const IMPORT_HEADERS=[IMPORT_FIELDS,[...IMPORT_FIELDS,'image_base64'],[...IMPORT_FIELDS,...IMAGE_HEADERS]];
const IMPORT_LIMIT = 1000;
const IMPORT_FILE_LIMIT = 5 * 1024 * 1024;
const importEmpty = () => ({filename:'',parsed:null,analysis:null,loadError:'',busy:false,success:''});

function importSampleRows(withError=false,withImage=false,withBadImage=false){
 return [[...IMPORT_FIELDS,...IMAGE_HEADERS],
 ['VABC-IMP-001','PT Mitra Sampel','2026-09-23','LOT-IMP-001','18600','8200','6500','5000','3200','2500','700',
   withImage?'bukti-demo.png':'',withImage?'data:image/png;base64,'+IMAGE_DEMO_PNG:''],
 ['VABC-IMP-002','PT Mitra Sampel','2026-09-23','LOT-IMP-002','9000','4000','3000','5000','1800','2500',withError?'100':'200',withBadImage?'foto-rusak.png':'',withBadImage?'bukan-base64@@':'']];
}
function csvQuoted(value){return '"'+String(value).replaceAll('"','""')+'"'}
function downloadImportSample(withError=false,withImage=false,withBadImage=false){
 const rows=importSampleRows(withError,withImage,withBadImage);
 const content='\ufeff'+rows.map(row=>row.map(csvQuoted).join(',')).join('\r\n')+'\r\n';
 download(new Blob([content],{type:'text/csv;charset=utf-8'}),
 withError?'PWP-contoh-gagal.csv':withBadImage?'PWP-contoh-foto-rusak.csv':withImage?'PWP-contoh-foto-base64.csv':'PWP-template-import.csv');
}

function parseImportCsv(input){
  const value=String(input).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
  // Excel exports in Indonesian locale may use semicolons as separators.
  const firstLine=value.split('\n',1)[0];
  const separator=firstLine.split(';').length>firstLine.split(',').length?';':',';
  const rows=[];
  let cells=[],cell='',rowStart=1,line=1,inQuotes=false,afterQuote=false,started=false,issues=[];
  const finishCell=()=>{cells.push(cell.trim());cell='';started=false;afterQuote=false};
  const finishRow=()=>{
    finishCell();
    rows.push({line:rowStart,values:cells,structuralErrors:issues});
    cells=[];issues=[];rowStart=line+1;
  };
  for(let i=0;i<value.length;i++){
    const c=value[i];
    if(inQuotes){
      if(c==='"'){
        if(value[i+1]==='"'){cell+='"';i++}else{inQuotes=false;afterQuote=true}
      }else{cell+=c;if(c==='\n')line++}
    }else if(afterQuote){
      if(c===separator)finishCell();
      else if(c==='\n'){finishRow();line++}
      else if(c===' '||c==='\t'){} // optional whitespace after a quoted field
      else{issues.push('Karakter tidak valid setelah tanda kutip.');afterQuote=false;cell+=c}
    }else if(c===separator)finishCell();
    else if(c==='\n'){finishRow();line++}
    else if(c==='"'){
      if(!started){inQuotes=true;started=true}
      else issues.push('Tanda kutip tidak valid di tengah kolom.');
    }else{cell+=c;started=true}
  }
  if(inQuotes)issues.push('Tanda kutip pembuka tidak ditutup.');
  if(cells.length||cell.length||issues.length||afterQuote)finishRow();
  // Ignore only blank lines at the very end; interior empty lines fail as rows.
  while(rows.length && rows[rows.length-1].values.every(x=>x==='') && !rows[rows.length-1].structuralErrors.length)rows.pop();
  return {rows,format:'CSV'};
}

function importExcelValue(cell){
  const value=cell.value;
  if(value==null)return '';
  if(value instanceof Date){
    const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if(typeof value==='number'||typeof value==='string')return String(value);
  if(typeof value==='object' && value.text && value.hyperlink)return String(value.text);
  throw Error('Formula atau jenis sel Excel tidak didukung. Gunakan nilai biasa.');
}
async function parseImportExcel(file){
  if(typeof ExcelJS==='undefined')throw Error('Pembaca Excel belum tersedia. Coba CSV atau muat ulang halaman.');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet=workbook.worksheets[0];
  if(!sheet)throw Error('File Excel tidak memiliki worksheet.');
  if(sheet.rowCount>IMPORT_LIMIT+1)throw Error(`Maksimal ${IMPORT_LIMIT} baris data per berkas.`);
  const rows=[];
  const columns=Math.max(IMPORT_FIELDS.length,sheet.actualColumnCount);
  for(let index=1;index<=sheet.rowCount;index++){
    const row=sheet.getRow(index),values=[],structuralErrors=[];
    for(let c=1;c<=columns;c++){
      try{values.push(importExcelValue(row.getCell(c)).trim())}
      catch(e){values.push('');structuralErrors.push(`Kolom ${c}: ${e.message}`)}
    }
    if(index<sheet.rowCount || values.some(x=>x!=='') || structuralErrors.length)rows.push({line:index,values,structuralErrors});
  }
  return {rows,format:'XLSX'};
}

const importText = value => String(value??'').trim();
function validImportDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function strictImportNumber(raw,min,positive=false){
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))return null;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=min&&(!positive||n>0)?n:null;
}

// import validation section

function analyzeImport(parsed,existingTransactions){
  const rows=parsed.rows||[],header=rows[0],headerErrors=[];
  const got=header?.values.map(x=>importText(x).toLowerCase())||[];
  const activeFields=IMPORT_HEADERS.find(fields=>fields.length===got.length&&fields.every((x,i)=>x===got[i]))||IMPORT_FIELDS;
  if(!header)headerErrors.push('File tidak memiliki header dan baris data.');
  else{
    const got=header.values.map(x=>importText(x).toLowerCase());
    if(!IMPORT_HEADERS.some(fields=>fields.length===got.length&&fields.every((x,i)=>x===got[i])))
      headerErrors.push(`Header wajib dimulai: ${IMPORT_FIELDS.join(', ')}; foto opsional: image_filename,image_base64.`);
    headerErrors.push(...header.structuralErrors);
  }
  const existingRefs=new Set(existingTransactions.map(t=>importText(t.ref).toLowerCase()));
  const seenRefs=new Map(),results=[];
  if(rows.length>IMPORT_LIMIT+1)headerErrors.push(`Maksimal ${IMPORT_LIMIT} baris data per berkas.`);
  if(rows.length===1)headerErrors.push('File hanya berisi header; tambahkan minimal satu baris data.');
  rows.slice(1).forEach(record=>{
    const errors=[],fail=(field,message)=>errors.push({field,message});
    const data=Object.fromEntries(activeFields.map((key,i)=>[key,importText(record.values[i])]));
    record.structuralErrors.forEach(message=>fail('_row',message));
    if(record.values.length!==activeFields.length)fail('_row',`Jumlah kolom ${record.values.length}; wajib ${activeFields.length} sesuai header.`);
    for(const [key,limit] of [['reference',50],['vendor',80],['lot',60]]){
      if(!data[key])fail(key,`${key} wajib diisi.`);
      else if(data[key].length>limit)fail(key,`${key} maksimal ${limit} karakter.`);
    }
    if(!validImportDate(data.date))fail('date','Tanggal harus valid dengan format YYYY-MM-DD.');
    const ref=data.reference.toLowerCase();
    if(ref){
      if(existingRefs.has(ref))fail('reference','Referensi sudah ada pada daftar transaksi.');
      if(seenRefs.has(ref))fail('reference',`Referensi sama dengan baris ${seenRefs.get(ref)} di file ini.`);
      else seenRefs.set(ref,record.line);
    }
    const numeric={};
    for(const key of IMPORT_FIELDS.slice(4)){
      const positive=key!=='residu_kg',n=strictImportNumber(data[key],0,positive);
      if(n===null)fail(key,`${key} wajib berupa angka ${positive?'lebih besar dari 0':'tidak negatif'} (desimal memakai titik).`);
      else numeric[key]=n;
    }
    const net=Number.isFinite(numeric.gross_kg)&&Number.isFinite(numeric.tare_kg)?numeric.gross_kg-numeric.tare_kg:null;
    const sorted=['pet_kg','hdpe_kg','residu_kg'].every(key=>Number.isFinite(numeric[key]))?numeric.pet_kg+numeric.hdpe_kg+numeric.residu_kg:null;
    if(net!==null&&net<=0)fail('gross_kg','Gross harus lebih besar daripada tare agar net positif.');
    if(net!==null&&net>0&&sorted!==null&&Math.abs(net-sorted)>0.000001){
      const message=`Total sortir ${num(sorted)} kg tidak sama dengan net ${num(net)} kg (selisih ${num(sorted-net)} kg).`;
      ['pet_kg','hdpe_kg','residu_kg'].forEach(key=>fail(key,message));
    }
    let image=null;try{image=parseImportImage(data.image_filename,data.image_base64,data.reference)}
    catch(e){fail('image_base64',e.message)}
    results.push({line:record.line,raw:record.values,data,numeric,net,sorted,image,errors});
  });
  const invalidCount=results.filter(x=>x.errors.length).length;
  return {header,headerErrors,rows:results,invalidCount,validCount:results.length-invalidCount,canCommit:!headerErrors.length&&!invalidCount&&results.length>0&&results.length<=IMPORT_LIMIT};
}

function importRowCell(value,invalid=false){return `<td class="${invalid?'import-cell-error':''}">${escapeHtml(value==null?'—':String(value))}</td>`}
function pageImport(){
  const imp=state.import,a=imp.analysis;
  const summary=a?`<div class="import-summary ${a.canCommit?'import-ok':'import-blocked'}" role="status">
    <strong>${a.canCommit?'✓ Seluruh baris valid — siap diimpor':'⛔ Impor diblokir — tidak ada data yang akan dimasukkan'}</strong>
    <span>${a.rows.length} baris data · ${a.validCount} valid · ${a.invalidCount} bermasalah${a.headerErrors.length?' · header bermasalah':''}</span>
    <small>${a.canCommit?'Seluruh transaksi akan ditambahkan sekaligus ketika tombol Impor ditekan.':'Perbaiki setiap baris merah di file sumber, lalu pilih ulang file. Impor seluruh file gagal jika satu baris saja salah.'}</small>
  </div>`:'';
  const errors=a?.headerErrors.length?`<div class="import-header-error"><strong>Baris 1 · Header bermasalah</strong>${a.headerErrors.map(message=>`<div>${escapeHtml(message)}</div>`).join('')}</div>`:'';

function importPreviewRow(r){
  const invalid=r.errors.length>0;
  const bad=key=>r.errors.some(e=>e.field===key||e.field==='_row');
  const errorMessages=[...new Set(r.errors.map(e=>e.message))];
  const errors=invalid?'<ul class="import-errors">'+errorMessages.map(m=>'<li>'+escapeHtml(m)+'</li>').join('')+'</ul>':'';
  const status=invalid?'<span class="status failed">SALAH</span>':'<span class="status synced">VALID</span>';
  const dateLot=(r.data.date||'—')+' / '+(r.data.lot||'—');
  const netText=r.net===null?'—':num(r.net)+' kg';
  const sortText=r.sorted===null?'—':num(r.sorted)+' kg';
  const badSort=['pet_kg','hdpe_kg','residu_kg','pet_price_idr','hdpe_price_idr'].some(bad);
  const imageCell='<td class=\"'+(bad('image_base64')?'import-cell-error':'')+'\">'+
    (bad('image_base64')?'<strong>⚠ Foto salah</strong>':renderImportImage(r.image,true))+'</td>';
  return '<tr class="'+(invalid?'import-row-error':'import-row-valid')+'" aria-label="Baris '+r.line+': '+(invalid?'gagal validasi':'valid')+'"><td><strong>'+r.line+'</strong></td>'+
    importRowCell(r.data.reference,bad('reference'))+importRowCell(r.data.vendor,bad('vendor'))+
    importRowCell(dateLot,bad('date')||bad('lot'))+importRowCell(netText,bad('gross_kg')||bad('tare_kg'))+
    importRowCell(sortText,badSort)+imageCell+'<td>'+status+errors+'</td></tr>';
}

  const table=a?'<section class="card import-preview"><div class="card-header"><div><h3>Pratinjau baris & hasil validasi</h3><p>Baris salah berwarna merah. Nomor baris sesuai file asli.</p></div></div>'+
    '<div class="table-wrap"><table class="tbl import-table"><thead><tr><th>Baris</th><th>Referensi</th><th>Vendor</th><th>Tanggal / lot</th><th>Net</th><th>Sortir</th><th>Bukti gambar</th><th>Hasil</th></tr></thead><tbody>'+
    a.rows.map(importPreviewRow).join('')+'</tbody></table></div></section>':'';
  const actions='<div class="import-actions"><div><h3>Pilih berkas sumber</h3><p>1 baris = 1 transaksi. Maksimal '+IMPORT_LIMIT+' transaksi dan 5 MB. Semua diproses di browser (demo).</p></div>'+
    '<div class="actions"><button class="btn" onclick="downloadImportSample()">Unduh template CSV</button><button class="btn flat" onclick="downloadImportSample(true)">Contoh berkas salah</button><button class="btn" onclick="downloadImportSample(false,true)">Contoh CSV + foto Base64</button><button class="btn flat" onclick="downloadImportSample(false,true,true)">Contoh foto rusak</button></div></div>';
  const drop='<label class="import-drop" id="importDrop" for="importFile" ondragover="handleImportDragOver(event)" ondragleave="handleImportDragLeave(event)" ondrop="handleImportDrop(event)">'+
    '<span class="import-upload-symbol">⇧</span><strong>'+(imp.busy?'Membaca berkas...':'Klik untuk memilih berkas atau tarik ke sini')+'</strong>'+
    '<small>CSV (UTF-8, koma/titik koma) atau XLSX (worksheet pertama). Foto opsional Base64 PNG/JPG/WebP maks. 2 MB.</small>'+
    '<input id="importFile" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="handleImportFile(event)"'+(imp.busy?' disabled':'')+'></label>';
  const filename=imp.filename?'<p class="import-file">File: <strong>'+escapeHtml(imp.filename)+'</strong></p>':'';
  const loadError=imp.loadError?'<div class="import-header-error" role="alert">'+escapeHtml(imp.loadError)+'</div>':'';
  const commit=a?'<div class="import-commit"><span>'+(a.canCommit?'Tidak ada baris salah. Semua baris akan masuk bersama.':'Impor nonaktif sampai setiap baris valid.')+'</span>'+
    '<button class="btn primary" onclick="commitImport()"'+(a.canCommit?'':' disabled')+'>Impor '+a.rows.length+' transaksi sekaligus</button></div>':'';
  return heading('BATCH / ATOMIC IMPORT','Import data penimbangan','Unggah CSV atau Excel. Jika satu baris salah, seluruh impor diblokir dan baris penyebab ditandai merah.')+
    '<section class="card import-panel">'+actions+drop+filename+loadError+summary+errors+commit+'</section>'+table+
    '<p class="footnote">Aturan simulasi: referensi unik, data lengkap, tanggal valid, angka positif, gross lebih besar dari tare, dan total sortir sama dengan net. Toleransi aktual harus disepakati bersama PWP.</p>';
}

function handleImportDragOver(event){event.preventDefault();event.dataTransfer.dropEffect='copy';document.getElementById('importDrop')?.classList.add('drag-over')}
function handleImportDragLeave(event){event.preventDefault();document.getElementById('importDrop')?.classList.remove('drag-over')}
function handleImportDrop(event){
  event.preventDefault();
  document.getElementById('importDrop')?.classList.remove('drag-over');
  if(event.dataTransfer?.files?.length)readImportFile(event.dataTransfer.files[0]);
}
function handleImportFile(event){
  const file=event.target.files?.[0];
  if(file)readImportFile(file);
  // Re-selecting the same file after correcting it must re-run validation.
  event.target.value='';
}
async function readImportFile(file){
  if(state.import.busy)return;
  state.import={...importEmpty(),filename:file.name,busy:true};
  if(state.page==='import')render();
  try{
    const extension=file.name.split('.').pop().toLowerCase();
    if(!['csv','xlsx'].includes(extension))throw Error('Format tidak didukung. Gunakan CSV atau XLSX.');
    if(file.size>IMPORT_FILE_LIMIT)throw Error('Ukuran berkas maksimal 5 MB.');
    if(!file.size)throw Error('Berkas kosong.');
    const parsed=extension==='csv'?parseImportCsv(await file.text()):await parseImportExcel(file);
    const analysis=analyzeImport(parsed,state.transactions);
    state.import={...importEmpty(),filename:file.name,parsed,analysis};
    if(!analysis.canCommit)recordAudit(auditImportEntry(file.name,analysis,false));
  }catch(error){
    state.import={...importEmpty(),filename:file.name,loadError:error.message||'Gagal membaca berkas.'};
    recordAudit(auditFileError(file.name,state.import.loadError));
  }
  if(state.page==='import')render();
}

function commitImport(){
  const imp=state.import;
  if(!imp.parsed||!imp.analysis?.canCommit){toast('Tidak bisa mengimpor: perbaiki semua baris merah terlebih dahulu.');return}
  // Re-check against live state immediately before committing (no partial writes).
  const checked=analyzeImport(imp.parsed,state.transactions);
  imp.analysis=checked;
  if(!checked.canCommit){recordAudit(auditImportEntry(imp.filename,checked,false));render();toast('Impor dibatalkan karena ada baris yang tidak valid.');return}
  const batch='BATCH-IMP-'+Date.now();
  const inserted=checked.rows.map((r,index)=>{
    const n=r.numeric;
    return makeTx('TRX-'+String(state.seq+index).padStart(3,'0'),r.data.reference,'received',{
      vendor:r.data.vendor,date:r.data.date,lot:r.data.lot,gross:n.gross_kg,tare:n.tare_kg,
      lines:[
        {product:'PET',qty:n.pet_kg,unitPrice:n.pet_price_idr,po:true},
        {product:'HDPE',qty:n.hdpe_kg,unitPrice:n.hdpe_price_idr,po:true},
        {product:'Residu',qty:n.residu_kg,unitPrice:0,po:false}
      ],
      source:'Import '+imp.parsed.format+' (simulasi)',batch,events:[],evidenceImage:r.image?{...r.image}:null
    });
  });
  // Single commit point: no data/log/sequence change is made before validation.
  state.transactions=[...inserted,...state.transactions];
  state.seq+=inserted.length;
  // Exactly one top-level audit log entry for the entire successful PO batch.
  recordAudit(auditImportEntry(imp.filename,checked,true,inserted.map(t=>t.id)));
  inserted.forEach((t,i)=>addLog(t,'Diimpor bersama dalam batch '+batch+' dari baris '+checked.rows[i].line+' ('+imp.filename+'; simulasi)','Operator import'));
  state.selected=inserted[0].id;
  state.import=importEmpty();
  state.search='';state.filter='all';
  goto('transactions');
  toast('Berhasil: '+inserted.length+' transaksi dalam satu batch. Tidak ada impor parsial.');
}
