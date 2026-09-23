const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={num:n=>String(n),toast:()=>{},console,atob};
const source=fs.readFileSync(path.join(__dirname,'../import-image.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../import.js'),'utf8');
const api=vm.runInNewContext(source+';({parseImportCsv,analyzeImport,importSampleRows,commitImport,importEmpty,parseImportImage})',context);
const toCsv=rows=>rows.map(cols=>cols.join(',')).join('\r\n');
const validCsv=()=>toCsv(api.importSampleRows());
const analysis=(csv,existing=[])=>api.analyzeImport(api.parseImportCsv(csv),existing);
test('template CSV has two valid transactions and physical row numbers',()=>{
 const a=analysis(validCsv());
 assert.equal(a.canCommit,true);
 assert.equal(a.validCount,2);
 assert.equal(a.rows[1].line,3);
});
test('one incorrect weight blocks entire batch and points to red-eligible row',()=>{
 const rows=api.importSampleRows();
 rows[2][10]='100';
 const a=analysis(toCsv(rows));
 assert.equal(a.canCommit,false);
 assert.equal(a.validCount,1);
 assert.equal(a.invalidCount,1);
 assert.equal(a.rows[1].line,3);
 assert.ok(a.rows[1].errors.some(e=>e.message.includes('Total sortir')));
});
test('duplicates in file or existing transactions block entire batch',()=>{
 const rows=api.importSampleRows();
 rows[2][0]=rows[1][0];
 let a=analysis(toCsv(rows));
 assert.equal(a.canCommit,false);
 assert.equal(a.invalidCount,1);
 assert.ok(a.rows[1].errors.some(e=>e.message.includes('baris 2')));
 a=analysis(validCsv(),[{ref:'VABC-IMP-002'}]);
 assert.equal(a.canCommit,false);
 assert.equal(a.rows[1].line,3);
});
test('header error blocks all rows and highlights header line',()=>{
 const csv=validCsv().replace('gross_kg','gross');
 const a=analysis(csv);
 assert.equal(a.canCommit,false);
 assert.ok(a.headerErrors.length);
});
test('CSV supports quoted delimiters, escaped quotes, BOM and semicolons',()=>{
 const rows=api.importSampleRows();
 rows[1][1]='PT Mitra, "Sampel"';
 const csv='\ufeff'+rows.map(row=>row.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(';')).join('\r\n');
 const a=analysis(csv);
 assert.equal(a.canCommit,true);
 assert.equal(a.rows[0].data.vendor,'PT Mitra, "Sampel"');
});
test('missing columns, bad calendar dates, negative prices and unclosed quotes fail',()=>{
 const rows=api.importSampleRows();
 rows[1][2]='2026-02-30';
 rows[2][7]='-1';
 let a=analysis(toCsv(rows));
 assert.equal(a.invalidCount,2);
 rows[1].pop();
 a=analysis(toCsv(rows));
 assert.equal(a.canCommit,false);
 assert.ok(a.rows[0].errors.some(e=>e.message.includes('Jumlah kolom')));
 a=analysis(validCsv()+'\r\n"unclosed');
 assert.equal(a.canCommit,false);
 assert.equal(a.rows[2].line,4);
});
test('failed commit is atomic: count, sequence and audit do not change',()=>{
 const csv=validCsv().replace('VABC-IMP-002','VABC-IMP-001');
 const parsed=api.parseImportCsv(csv);
 const seed=[{ref:'seed'}],logs=[{tx:'seed'}];
 context.state={
   transactions:seed,logs,seq:5,import:{...api.importEmpty(),filename:'bad.csv',parsed,analysis:api.analyzeImport(parsed,seed)}
 };
 api.commitImport();
 assert.equal(context.state.transactions,seed);
 assert.equal(context.state.logs,logs);
 assert.equal(context.state.seq,5);
});
const asQuotedCsv=rows=>rows.map(cols=>cols.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
test('CSV supports optional PNG/JPEG/WebP Base64 images and older no-photo columns',()=>{
 const rows=api.importSampleRows(false,true);
 let a=analysis(asQuotedCsv(rows));
 assert.equal(a.canCommit,true);
 assert.equal(a.rows[0].image.mimeType,'image/png');
 assert.equal(a.rows[0].image.filename,'bukti-demo.png');
 assert.ok(a.rows[0].image.size>20);
 const legacy=rows.map(r=>r.slice(0,11));
 a=analysis(asQuotedCsv(legacy));
 assert.equal(a.canCommit,true);
 assert.equal(a.rows[0].image,null);
 const only=rows.map((r,i)=>[...r.slice(0,11),i===0?'image_base64':r[12]]);
 a=analysis(asQuotedCsv(only));
 assert.equal(a.canCommit,true);
 assert.equal(a.rows[0].image.filename.startsWith('bukti-VABC-IMP-001'),true);
});
test('one bad Base64 blocks entire batch and marks physical row 3 red',()=>{
 const rows=api.importSampleRows(false,true);
 rows[2][11]='truck.png';rows[2][12]='not-base64@@@';
 const a=analysis(asQuotedCsv(rows));
 assert.equal(a.canCommit,false);
 assert.equal(a.validCount,1);
 assert.equal(a.invalidCount,1);
 assert.equal(a.rows[1].line,3);
 assert.ok(a.rows[1].errors.some(e=>e.field==='image_base64'));
});
test('reject spoofed MIME, wrong extension, non-image bytes, filename with path and oversized image',()=>{
 const base=api.importSampleRows(false,true)[1][12];
 assert.throws(()=>api.parseImportImage('photo.jpg',base,'REF'),/Ekstensi/);
 assert.throws(()=>api.parseImportImage('photo.png',base.replace('data:image/png','data:image/jpeg'),'REF'),/MIME/);
 assert.throws(()=>api.parseImportImage('photo.png',btoa('text that is not a photo'),'REF'),/bukan gambar/);
 assert.throws(()=>api.parseImportImage('../photo.png',base,'REF'),/Nama foto/);
 const huge=btoa('\x89PNG\r\n\x1a\n'+'0'.repeat(2*1024*1024+1));
 assert.throws(()=>api.parseImportImage('photo.png',huge,'REF'),/2 MB/);
});
