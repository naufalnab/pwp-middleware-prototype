'use strict';
// Optional per-transaction photo, carried in CSV/XLSX as base64, not a URL.
const IMAGE_HEADERS=['image_filename','image_base64'];
const IMAGE_MAX_BYTES=2*1024*1024;
const IMAGE_DEMO_PNG='iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAACH0lEQVR42u3bvUrDYBgF4N6B4ODmIghu7gV378HRO/BKnL2Bzk66uXoDLv7NtZNbViMFCW0akto3+b70gTO24bznoVAKnbzOi4gcTG+CnjxI8j1nYhHAgAEDBgwYMGDAgAE7BzBgwIABAwYMGDBgwIABAwZsEcCAAQMGDLhX4Ld5EZFykaAnD5J8zwEMGDBgwIABDwX8VUTkd5GYJw+SfM8BDBgwYMCAAQMGDBgwYOf0BTyyAF4FPr6ajSaAAQMGDBgwYMCAAVeB37+KiIwPOGio6AAGDBgwYMDZA5/cP+w8gAEDBgwYMODOwHef31sEMOCdAy+KiABuBRwzfjWAAQMGDBgwYMCAAQMGnNUvWYABAwbcCPyxKCICuE2Cxq8GMGDAgIOAD08vsgYu+wOud11PRsC1/fca+Ohs+pfadZapvqxMCsArlVr231/ghnXWjRMEbtl/JMDts2md29lTg3HP//CvPbNZd1P/Hlz7AG7/4vWBymmqqQXuc6auwM39AQMeHXDDOpuMkwLu1N8n2Cd4XMDLtByoz3U6nZNm/0SBG76FZgGcTv+EgGs3SkG3/TkJ9p+cX15HpFxkuzc2rBNUdbfnpNY/OeBNGw2o2/WcpPqnCFxdaljXf56TQv+kgdNJvudMHp9fIlIuEvTkQZLvOYABAwYMGDBgwIABAwbsHMCAAQMGDBgwYMCAAQMGDBiwRQADBgwYMGDAgHeXH9Exj7gnp+4HAAAAAElFTkSuQmCC';
function parseImportImage(filenameInput,base64Input,reference){
  let filename=String(filenameInput||'').trim(),value=String(base64Input||'').trim();
  if(!value){if(filename)throw Error('Ada nama foto, tetapi image_base64 kosong.');return null;}
  let declaredMime=null;
  if(value.toLowerCase().startsWith('data:')){
    const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
    if(!m)throw Error('Format Data URL harus data:image/png|jpeg|webp;base64,...');
    declaredMime=m[1].toLowerCase();value=m[2];
  }
  if(value.length>Math.ceil(IMAGE_MAX_BYTES*4/3)+8)throw Error('Foto melebihi 2 MB.');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0)
    throw Error('image_base64 bukan Base64 valid.');
  let bytes;
  try{bytes=atob(value)}catch(_){throw Error('image_base64 gagal didekode.');}
  if(bytes.length>IMAGE_MAX_BYTES)throw Error('Foto melebihi 2 MB.');
  const head=(...sig)=>bytes.length>=sig.length&&sig.every((n,i)=>bytes.charCodeAt(i)===n);
  let mimeType,extension;
  if(head(137,80,78,71,13,10,26,10)){mimeType='image/png';extension='png';}
  else if(head(255,216,255)&&bytes.length>=5&&bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217){mimeType='image/jpeg';extension='jpg';}
  else if(bytes.length>=12&&bytes.slice(0,4)==='RIFF'&&bytes.slice(8,12)==='WEBP'){mimeType='image/webp';extension='webp';}
  else throw Error('Isi Base64 bukan gambar PNG/JPG/WebP yang dikenal.');
  if(declaredMime&&declaredMime!==mimeType)throw Error('MIME Data URL tidak cocok dengan isi gambar.');
  if(filename){
    if(filename.length>120||/[\\/:*?"<>|\x00-\x1f]/.test(filename)||!/\.(png|jpe?g|webp)$/i.test(filename))
      throw Error('Nama foto wajib .png, .jpg, .jpeg, atau .webp; tanpa path.');
    const ext=filename.split('.').pop().toLowerCase(),expected=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';
    if(expected!==mimeType)throw Error('Ekstensi nama foto berbeda dari isi Base64.');
  }else filename='bukti-'+String(reference||'transaksi').replace(/[^a-z0-9_-]/gi,'-').slice(0,50)+'.'+extension;
  return {filename,mimeType,base64:value,size:bytes.length};
}
function renderImportImage(image,compact=false){
  if(!image)return '—';
  // MIME and content were validated against file signatures; only allow these data URLs.
  const src='data:'+image.mimeType+';base64,'+image.base64;
  return '<div class="import-image-wrap'+(compact?' compact':'')+'"><img loading="lazy" src="'+src+'" alt="Foto bukti '+escapeHtml(image.filename)+'">'+
    '<span>'+escapeHtml(image.filename)+'<small>'+(image.size/1024).toFixed(1)+' KB · '+escapeHtml(image.mimeType)+'</small></span></div>';
}
