(() => {
const canvas = document.getElementById('wheelCanvas'); const ctx=canvas.getContext('2d');
const spinBtn=document.getElementById('spinBtn'), resetBtn=document.getElementById('resetBtn');
let data=null, rotation=0, busy=false; const TAU=Math.PI*2;
const el=id=>document.getElementById(id);
function paint(numbers, angle=rotation){
  const size=canvas.width, c=size/2, r=c-24;ctx.clearRect(0,0,size,size);
  if(!numbers.length){ctx.beginPath();ctx.arc(c,c,r,0,TAU);ctx.fillStyle='#e9edf5';ctx.fill();ctx.fillStyle='#17294e';ctx.font='bold 26px Arial';ctx.textAlign='center';ctx.fillText('Tidak ada nomor tersedia',c,c);return;}
  const count=numbers.length, segment=TAU/count;
  for(let i=0;i<count;i++){
    const start=angle+i*segment-Math.PI/2, end=start+segment;
    ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,r,start,end);ctx.closePath();ctx.fillStyle=['#142a58','#c9a15f','#f2e5cf','#a72c3d'][i%4];ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=count>120?.3:1.5;ctx.stroke();
    if(count<=90){ctx.save();ctx.translate(c,c);ctx.rotate(start+segment/2);ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle=i%4===2?'#152950':'#fff';ctx.font=`bold ${count>45?12:count>25?16:count>12?20:26}px Arial`;ctx.fillText(String(numbers[i].number).padStart(3,'0'),r-16,0);ctx.restore();}
  }
  ctx.beginPath();ctx.arc(c,c,count>90?48:35,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#d1a15d';ctx.lineWidth=6;ctx.stroke();ctx.fillStyle='#142a58';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 18px Arial';ctx.fillText('AY',c,c);
}
function render(){if(!data)return;el('registered').textContent=data.registered;el('remaining').textContent=data.remaining;el('drawn').textContent=data.winners.length;el('round').textContent=data.round;
  el('history').replaceChildren();if(!data.winners.length)el('history').textContent='Belum ada pemenang.';
  for(const w of data.winners){const item=document.createElement('div');item.className='wheel-history-item';const n=document.createElement('strong');n.textContent=String(w.number).padStart(3,'0');const name=document.createElement('span');name.textContent=w.name;item.append(n,name);el('history').append(item);}
  spinBtn.disabled=busy||data.remaining===0;resetBtn.disabled=busy||data.winners.length===0;paint(data.eligible);
}
async function request(url,opts){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});let body;try{body=await r.json()}catch{throw new Error('Server tidak memberikan respons JSON. Periksa konfigurasi Vercel.')};if(r.status===401){throw new Error('Silakan login di /admin dahulu, lalu buka /wheel kembali.')};if(!r.ok)throw new Error(body.error||'Terjadi kesalahan');return body}
async function refresh(){data=await request('/api/admin/wheel');render()}
const post=(url,body)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function animateTo(winner, numbers){return new Promise(resolve=>{const i=numbers.findIndex(n=>n.number===winner.number);if(i<0){resolve();return}const step=TAU/numbers.length;const target=-i*step-step/2;const current=rotation;const cycles=TAU*6;const extra=((target-current)%TAU+TAU)%TAU;const finish=current+cycles+extra;const duration=5200;const start=performance.now();function frame(now){const t=Math.min(1,(now-start)/duration), eased=1-Math.pow(1-t,4);paint(numbers,current+(finish-current)*eased);if(t<1)requestAnimationFrame(frame);else{rotation=finish%TAU;resolve()}}requestAnimationFrame(frame)})}
spinBtn.addEventListener('click',async()=>{if(busy||!data?.remaining)return;busy=true;spinBtn.disabled=true;resetBtn.disabled=true;el('message').textContent='Mengundi...';const old=data.eligible.slice();try{const winner=await post('/api/admin/wheel/spin',{});await animateTo(winner,old);el('winnerNumber').textContent=String(winner.number).padStart(3,'0');el('winnerName').textContent=winner.name;el('message').textContent='Pemenang berhasil dicatat.';await refresh()}catch(e){el('message').textContent=e.message;try{await refresh()}catch{}}finally{busy=false;render()}});
resetBtn.addEventListener('click',async()=>{if(busy)return;if(!confirm('Reset putaran? Semua peserta yang masih terdaftar akan dapat diundi lagi. Data registrasi tidak dihapus.'))return;busy=true;spinBtn.disabled=true;resetBtn.disabled=true;try{await post('/api/admin/wheel/reset',{confirmation:'RESET PUTARAN'});rotation=0;el('winnerNumber').textContent='---';el('winnerName').textContent='Klik PUTAR untuk memilih pemenang';el('message').textContent='Putaran berhasil direset.';await refresh()}catch(e){el('message').textContent=e.message}finally{busy=false;render()}});
refresh().catch(e=>{el('message').textContent=e.message;paint([])});
})();