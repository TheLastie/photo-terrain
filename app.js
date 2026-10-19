(() => {
  const canvas = document.querySelector('#terrainCanvas'), ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id), W = 72, H = 56;
  const state = { preset: 'cirque', mode: 'terrain', palette: 'earth', exaggeration: 1.8, levels: 10, yaw: -.42, tilt: .55, zoom: 1, dragging: false, source: 'preset' };
  let heights = makePreset('cirque'), renderTimer = 0;
  const colors = {
    earth: [[0,'#31585a'],[.24,'#55776c'],[.47,'#819178'],[.68,'#aaa27e'],[.84,'#c5b68e'],[1,'#e0d7bd']],
    slate: [[0,'#304653'],[.22,'#496779'],[.45,'#718b95'],[.67,'#a1b2b0'],[.84,'#c2c9be'],[1,'#e4dfce']],
    mono: [[0,'#313634'],[.24,'#555d58'],[.48,'#80857a'],[.7,'#a7a99c'],[.86,'#c9c6b5'],[1,'#eee7d5']]
  };
  function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7 + 17.3) * 43758.5453; return n - Math.floor(n); }
  function clamp(n, lo=0, hi=1) { return Math.max(lo, Math.min(hi, n)); }
  function smooth(a, b, x) { const t=clamp((x-a)/(b-a));return t*t*(3-2*t); }
  function makePreset(name) {
    const map = Array.from({length:H}, (_, y) => Array.from({length:W}, (_, x) => {
      const u=x/(W-1)*2-1, v=y/(H-1)*2-1, n=(hash(x,y)-.5)*.1+(hash(x*.5,y*.5)-.5)*.12;
      if (name==='ridge') { const spine=Math.exp(-Math.pow((u+.1+.16*Math.sin(v*3.4))/.24,2));const spur=.2*Math.abs(Math.sin(u*8+v*2))*Math.exp(-Math.abs(v)*.7);return clamp(.26+spine*.57+spur+Math.sin(v*4+u)*.08+n); }
      if (name==='coast') { const edge=.08*Math.sin(u*7)+.045*Math.sin(u*17);const land=smooth(-.12+edge,.58+edge,v);const terrace=Math.exp(-Math.pow((v-.28-edge)/.12,2))*.18;const dune=(.06*Math.sin(u*11+v*2)+.04*Math.cos(u*17))*land;return clamp(.12+land*.5+terrace+dune+n); }
      const r=Math.sqrt(Math.pow((u+.13)*.9,2)+Math.pow((v-.02)*1.05,2));const rim=Math.exp(-Math.pow((r-.58)/.13,2))*.58;const bowl=Math.exp(-Math.pow(r/.39,2))*.29;const spur=.08*Math.sin(u*8+v*3)*Math.exp(-r*.7);return clamp(.34+rim-bowl+spur+n);
    }));
    return smoothGrid(map, 2);
  }
  function smoothGrid(map, passes=1) {
    let a=map;
    for(let p=0;p<passes;p++) { const b=Array.from({length:H},()=>Array(W).fill(0));for(let y=0;y<H;y++)for(let x=0;x<W;x++){let sum=a[y][x]*4,w=4;for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])if(a[y+dy]?.[x+dx]!==undefined){sum+=a[y+dy][x+dx];w++;}b[y][x]=sum/w;}a=b; }
    return a;
  }
  function fitCanvas() { const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(!r.width||!r.height)return;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw(); }
  function project(x,y,z,w,h,scale) {
    const c=Math.cos(state.yaw),s=Math.sin(state.yaw),rx=x*c-y*s,ry=x*s+y*c;
    return {x:w/2+rx*scale,y:h*.56+(ry*Math.sin(state.tilt)-z*Math.cos(state.tilt))*scale,depth:ry*Math.cos(state.tilt)+z*Math.sin(state.tilt)};
  }
  function lerpColor(a,b,t) { const c=s=>s.startsWith('#')?[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)]:s.match(/[\d.]+/g).slice(0,3).map(Number);const A=c(a),B=c(b);return `rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`; }
  function ramp(v) { const stops=colors[state.palette],t=clamp(v);for(let i=1;i<stops.length;i++)if(t<=stops[i][0])return lerpColor(stops[i-1][1],stops[i][1],(t-stops[i-1][0])/(stops[i][0]-stops[i-1][0]));return stops.at(-1)[1]; }
  function slopeAt(x,y) { const left=heights[y][Math.max(0,x-1)],right=heights[y][Math.min(W-1,x+1)],up=heights[Math.max(0,y-1)][x],down=heights[Math.min(H-1,y+1)][x];return Math.hypot((right-left)*state.exaggeration*3,(down-up)*state.exaggeration*3); }
  function faceColor(h,x,y) {
    const slope=slopeAt(x,y),base=ramp(h);
    if(state.mode==='elevation')return base;
    if(state.mode==='slope')return ramp(clamp(slope*.62));
    const light=clamp(.75-slope*.14+(x/W)*.12-(y/H)*.08,.48,.92);return lerpColor('#101a1b',base,light);
  }
  function draw() {
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;ctx.clearRect(0,0,w,h);
    const scale=Math.min(w*.365,h*.60)*state.zoom, vertices=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>project(x/(W-1)*2-1,y/(H-1)*2-1,(heights[y][x]-.42)*state.exaggeration*.7,w,h,scale)));
    const triangles=[];
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const a=vertices[y][x],b=vertices[y][x+1],c=vertices[y+1][x],d=vertices[y+1][x+1];
      triangles.push({v:[a,b,c],depth:(a.depth+b.depth+c.depth)/3,height:(heights[y][x]+heights[y][x+1]+heights[y+1][x])/3,x,y});
      triangles.push({v:[b,d,c],depth:(b.depth+d.depth+c.depth)/3,height:(heights[y][x+1]+heights[y+1][x]+heights[y+1][x+1])/3,x,y});
    }
    triangles.sort((a,b)=>a.depth-b.depth);
    for(const tri of triangles){ctx.beginPath();ctx.moveTo(tri.v[0].x,tri.v[0].y);ctx.lineTo(tri.v[1].x,tri.v[1].y);ctx.lineTo(tri.v[2].x,tri.v[2].y);ctx.closePath();ctx.fillStyle=faceColor(tri.height,tri.x,tri.y);ctx.fill();if(state.mode!=='slope'){ctx.strokeStyle='rgba(14,27,28,.15)';ctx.lineWidth=.4;ctx.stroke();}}
    drawContours(vertices,w,h);
    updateReadouts();
  }
  function drawContours(vtx,w,h) {
    const count=state.levels;
    ctx.save();ctx.strokeStyle=state.palette==='mono'?'rgba(241,231,210,.55)':'rgba(239,211,143,.62)';ctx.lineWidth=1;ctx.beginPath();
    for(let level=1;level<count;level++){const z=level/count;for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const vals=[heights[y][x],heights[y][x+1],heights[y+1][x+1],heights[y+1][x]],pts=[vtx[y][x],vtx[y][x+1],vtx[y+1][x+1],vtx[y+1][x]],cross=[];
      for(let e=0;e<4;e++){const n=(e+1)%4,a=vals[e],b=vals[n];if((a<z&&b>=z)||(b<z&&a>=z)){const t=(z-a)/(b-a);cross.push({x:pts[e].x+(pts[n].x-pts[e].x)*t,y:pts[e].y+(pts[n].y-pts[e].y)*t});}}
      for(let i=0;i+1<cross.length;i+=2){ctx.moveTo(cross[i].x,cross[i].y);ctx.lineTo(cross[i+1].x,cross[i+1].y);}
    }}ctx.stroke();ctx.restore();
  }
  function updateReadouts() {
    let min=1,max=0,totalSlope=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){min=Math.min(min,heights[y][x]);max=Math.max(max,heights[y][x]);totalSlope+=Math.atan(slopeAt(x,y))*180/Math.PI;}
    $('peakValue').innerHTML=`${Math.round(max*100)} <small>%</small>`;$('reliefValue').innerHTML=`${Math.round((max-min)*100)} <small>%</small>`;$('slopeValue').innerHTML=`${Math.round(totalSlope/(W*H))} <small>°</small>`;
    $('heightOutput').textContent=`${state.exaggeration.toFixed(1)}×`;$('contourOutput').textContent=`${state.levels} уровней`;$('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
  }
  function updateAlgorithm() {
    const labels=state.source==='photo'?{
      terrain:'Карта яркости → 3D-поверхность',elevation:'Яркость → относительная высота',slope:'Соседние пиксели → уклон'
    }:{
      terrain:'Профиль ландшафта → 3D-поверхность',elevation:'Относительная высота → цветовая шкала',slope:'Соседние высоты → карта уклонов'
    };
    $('algorithmLabel').textContent=labels[state.mode];
  }
  function queueDraw(){cancelAnimationFrame(renderTimer);renderTimer=requestAnimationFrame(draw);}
  function setMode(button){state.mode=button.dataset.mode;document.querySelectorAll('.mode-button').forEach(b=>{const on=b===button;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});updateAlgorithm();queueDraw();}
  function selectPreset(button){state.preset=button.dataset.preset;state.source='preset';heights=makePreset(state.preset);document.querySelectorAll('.preset').forEach(b=>{const on=b===button;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});const names={cirque:'ЛЕДНИКОВЫЙ ЦИРК',ridge:'БАЗАЛЬТОВЫЙ ХРЕБЕТ',coast:'ПРИБРЕЖНАЯ ТЕРРАСА'};$('terrainLabel').textContent=`ОБРАЗЕЦ · ${names[state.preset]}`;$('sourceName').textContent='Загрузить фотографию';updateAlgorithm();queueDraw();}
  async function loadPhoto(file){if(!file||!file.type.startsWith('image/'))return;try{const bitmap=await createImageBitmap(file),off=document.createElement('canvas');off.width=W;off.height=H;const c=off.getContext('2d',{willReadFrequently:true});c.fillStyle='#777';c.fillRect(0,0,W,H);c.drawImage(bitmap,0,0,W,H);bitmap.close?.();const data=c.getImageData(0,0,W,H).data,values=[];for(let i=0;i<W*H;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];values.push((r*.299+g*.587+b*.114)/255);}const sorted=[...values].sort((a,b)=>a-b),lo=sorted[Math.floor(values.length*.03)],hi=sorted[Math.floor(values.length*.97)];heights=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>clamp((values[y*W+x]-lo)/Math.max(.04,hi-lo))));heights=smoothGrid(heights,2);state.source='photo';$('sourceName').textContent=file.name.length>22?file.name.slice(0,19)+'…':file.name;$('terrainLabel').textContent='ФОТОГРАФИЯ · КАРТА ЯРКОСТИ';updateAlgorithm();document.querySelectorAll('.preset').forEach(b=>{b.classList.remove('is-active');b.setAttribute('aria-pressed','false');});queueDraw();}catch(error){$('sourceName').textContent='Не удалось прочитать изображение';}}
  function pointerDown(e){state.dragging=true;canvas.setPointerCapture(e.pointerId);state.lastX=e.clientX;state.lastY=e.clientY;}
  function pointerMove(e){if(!state.dragging)return;const dx=e.clientX-state.lastX,dy=e.clientY-state.lastY;state.lastX=e.clientX;state.lastY=e.clientY;state.yaw-=dx*.008;state.tilt=clamp(state.tilt+dy*.004,.2,1.05);queueDraw();}
  function pointerUp(){state.dragging=false;}
  function exportImage(){const a=document.createElement('a');a.download='terra-forma-relief.png';a.href=canvas.toDataURL('image/png');a.click();}
  function exportMesh(){
    const lines=['# Terra Forma relative heightfield','o terra_forma_surface','# Grid: 72 x 56 vertices.','# Open surface, not a closed printable solid.','# Horizontal span: 100 arbitrary units.','# Elevations are relative and inferred from image brightness.'];
    const width=100,depth=width*(H-1)/(W-1),heightScale=30*state.exaggeration/1.8;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const px=(x/(W-1)-.5)*width,py=(.5-y/(H-1))*depth,pz=(heights[y][x]-.42)*state.exaggeration*.7*heightScale;
      lines.push(`v ${px.toFixed(4)} ${py.toFixed(4)} ${pz.toFixed(4)}`);
    }
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const a=y*W+x+1,b=a+1,c=a+W,d=c+1;
      lines.push(`f ${a} ${b} ${c}`,`f ${b} ${d} ${c}`);
    }
    const blob=new Blob([lines.join('\n')+'\n'],{type:'text/plain'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='terra-forma-heightfield.obj';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportHeightMap(){
    const map=document.createElement('canvas');map.width=W;map.height=H;
    const mapCtx=map.getContext('2d'),image=mapCtx.createImageData(W,H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4,value=Math.round(clamp(heights[y][x])*255);
      image.data[i]=image.data[i+1]=image.data[i+2]=value;image.data[i+3]=255;
    }
    mapCtx.putImageData(image,0,0);
    map.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='terra-forma-heightmap-72x56.png';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },'image/png');
  }
  document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>selectPreset(b)));
  document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>setMode(b)));
  document.querySelectorAll('.palette-button').forEach(b=>b.addEventListener('click',()=>{state.palette=b.dataset.palette;document.querySelectorAll('.palette-button').forEach(x=>{const on=x===b;x.classList.toggle('is-active',on);x.setAttribute('aria-pressed',String(on));});queueDraw();}));
  $('heightInput').addEventListener('input',e=>{state.exaggeration=Number(e.target.value)/10;e.target.style.setProperty('--fill',`${(e.target.value-e.target.min)/(e.target.max-e.target.min)*100}%`);queueDraw();});
  $('contourInput').addEventListener('input',e=>{state.levels=Number(e.target.value);e.target.style.setProperty('--fill',`${(e.target.value-e.target.min)/(e.target.max-e.target.min)*100}%`);queueDraw();});
  $('photoInput').addEventListener('change',e=>loadPhoto(e.target.files[0]));
  $('resetView').addEventListener('click',()=>{state.yaw=-.42;state.tilt=.55;state.zoom=1;queueDraw();});
  $('exportButton').addEventListener('click',exportImage);
  $('exportMeshButton').addEventListener('click',exportMesh);
  $('exportHeightButton').addEventListener('click',exportHeightMap);
  $('methodToggle').addEventListener('click',()=>{const panel=$('methodDetails'),open=panel.hidden;panel.hidden=!open;$('methodToggle').setAttribute('aria-expanded',String(open));$('methodToggle').innerHTML=open?'Как устроено <span>−</span>':'Как устроено <span>＋</span>';});
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=clamp(state.zoom+(e.deltaY<0?.08:-.08),.72,1.5);queueDraw();},{passive:false});
  if('ResizeObserver'in window)new ResizeObserver(fitCanvas).observe(canvas.parentElement);else addEventListener('resize',fitCanvas,{passive:true});
  for(const id of ['heightInput','contourInput'])$(id).dispatchEvent(new Event('input'));
  updateAlgorithm();
  fitCanvas();
})();
