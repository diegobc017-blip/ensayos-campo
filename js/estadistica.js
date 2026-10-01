// estadistica.js — motor estadístico (port parcial de ensayos_calc.py). DBCA + Tukey.
const QTAB = {"dfs": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 80, 100, 120, 240], "q": {"2": [17.9693, 6.0849, 4.5007, 3.9265, 3.6354, 3.4605, 3.3441, 3.2612, 3.1992, 3.1511, 3.1127, 3.0813, 3.0552, 3.0332, 3.0143, 2.998, 2.9837, 2.9712, 2.96, 2.95, 2.941, 2.9329, 2.9255, 2.9188, 2.9126, 2.907, 2.9017, 2.8969, 2.8924, 2.8882, 2.8843, 2.8807, 2.8772, 2.874, 2.871, 2.8682, 2.8655, 2.8629, 2.8605, 2.8582, 2.8561, 2.854, 2.852, 2.8502, 2.8484, 2.8467, 2.845, 2.8435, 2.842, 2.8405, 2.8392, 2.8378, 2.8366, 2.8353, 2.8341, 2.833, 2.8319, 2.8309, 2.8298, 2.8288, 2.8144, 2.8058, 2.8, 2.7859], "3": [26.9755, 8.3308, 5.9096, 5.0402, 4.6017, 4.3392, 4.1649, 4.041, 3.9485, 3.8768, 3.8196, 3.7729, 3.7341, 3.7014, 3.6734, 3.6491, 3.628, 3.6093, 3.5927, 3.5779, 3.5646, 3.5526, 3.5417, 3.5317, 3.5226, 3.5142, 3.5064, 3.4993, 3.4926, 3.4864, 3.4806, 3.4752, 3.4702, 3.4654, 3.461, 3.4568, 3.4528, 3.449, 3.4455, 3.4421, 3.4389, 3.4358, 3.4329, 3.4301, 3.4275, 3.425, 3.4226, 3.4203, 3.418, 3.4159, 3.4139, 3.4119, 3.41, 3.4082, 3.4065, 3.4048, 3.4032, 3.4016, 3.4001, 3.3987, 3.3773, 3.3646, 3.3561, 3.3352], "4": [32.8187, 9.798, 6.8245, 5.7571, 5.2183, 4.8956, 4.6813, 4.5288, 4.4149, 4.3266, 4.2561, 4.1987, 4.1509, 4.1105, 4.076, 4.0461, 4.02, 3.997, 3.9766, 3.9583, 3.9419, 3.927, 3.9136, 3.9013, 3.89, 3.8796, 3.8701, 3.8612, 3.853, 3.8454, 3.8383, 3.8316, 3.8254, 3.8195, 3.814, 3.8088, 3.8039, 3.7992, 3.7949, 3.7907, 3.7867, 3.783, 3.7794, 3.776, 3.7727, 3.7696, 3.7666, 3.7637, 3.761, 3.7584, 3.7559, 3.7535, 3.7511, 3.7489, 3.7468, 3.7447, 3.7427, 3.7408, 3.7389, 3.7371, 3.7107, 3.695, 3.6846, 3.6587], "5": [37.0815, 10.8811, 7.5017, 6.287, 5.6731, 5.3049, 5.0601, 4.8858, 4.7554, 4.6543, 4.5736, 4.5077, 4.4529, 4.4066, 4.367, 4.3327, 4.3027, 4.2763, 4.2528, 4.2319, 4.213, 4.1959, 4.1805, 4.1663, 4.1534, 4.1415, 4.1305, 4.1203, 4.1109, 4.1021, 4.0939, 4.0862, 4.079, 4.0723, 4.0659, 4.06, 4.0543, 4.049, 4.0439, 4.0391, 4.0346, 4.0302, 4.0261, 4.0222, 4.0184, 4.0148, 4.0114, 4.0081, 4.005, 4.002, 3.9991, 3.9963, 3.9936, 3.991, 3.9885, 3.9862, 3.9839, 3.9816, 3.9795, 3.9774, 3.947, 3.9289, 3.9169, 3.8871], "6": [40.4076, 11.7343, 8.0371, 6.7064, 6.0329, 5.6284, 5.3591, 5.1672, 5.0235, 4.912, 4.823, 4.7502, 4.6897, 4.6385, 4.5947, 4.5568, 4.5237, 4.4944, 4.4685, 4.4452, 4.4244, 4.4055, 4.3883, 4.3727, 4.3583, 4.3451, 4.3329, 4.3217, 4.3112, 4.3015, 4.2924, 4.2839, 4.2759, 4.2684, 4.2614, 4.2548, 4.2485, 4.2426, 4.237, 4.2316, 4.2266, 4.2218, 4.2172, 4.2128, 4.2087, 4.2047, 4.2009, 4.1972, 4.1937, 4.1904, 4.1872, 4.1841, 4.1811, 4.1783, 4.1755, 4.1729, 4.1703, 4.1678, 4.1655, 4.1632, 4.1294, 4.1093, 4.096, 4.0629], "7": [43.1186, 12.4349, 8.4783, 7.0526, 6.3299, 5.8953, 5.6057, 5.3991, 5.2444, 5.1242, 5.0281, 4.9496, 4.8842, 4.829, 4.7816, 4.7406, 4.7048, 4.6731, 4.645, 4.6199, 4.5973, 4.5769, 4.5583, 4.5413, 4.5258, 4.5115, 4.4983, 4.4861, 4.4747, 4.4642, 4.4543, 4.4451, 4.4365, 4.4284, 4.4207, 4.4135, 4.4068, 4.4003, 4.3942, 4.3885, 4.383, 4.3778, 4.3728, 4.3681, 4.3635, 4.3592, 4.3551, 4.3511, 4.3473, 4.3437, 4.3402, 4.3369, 4.3336, 4.3305, 4.3276, 4.3247, 4.3219, 4.3192, 4.3166, 4.3141, 4.2775, 4.2557, 4.2412, 4.2052], "8": [45.3973, 13.0273, 8.8525, 7.3465, 6.5823, 6.1222, 5.8153, 5.5962, 5.4319, 5.3042, 5.2021, 5.1187, 5.0491, 4.9903, 4.9399, 4.8962, 4.858, 4.8243, 4.7944, 4.7676, 4.7435, 4.7217, 4.7018, 4.6838, 4.6672, 4.6519, 4.6378, 4.6248, 4.6127, 4.6014, 4.5909, 4.5811, 4.5718, 4.5632, 4.555, 4.5473, 4.5401, 4.5332, 4.5267, 4.5205, 4.5147, 4.5091, 4.5038, 4.4987, 4.4939, 4.4893, 4.4849, 4.4806, 4.4766, 4.4727, 4.469, 4.4654, 4.4619, 4.4586, 4.4554, 4.4523, 4.4494, 4.4465, 4.4437, 4.4411, 4.4019, 4.3785, 4.363, 4.3245], "9": [47.3566, 13.539, 9.1766, 7.6015, 6.8014, 6.3192, 5.9973, 5.7673, 5.5947, 5.4605, 5.3531, 5.2653, 5.1921, 5.1301, 5.077, 5.031, 4.9907, 4.9552, 4.9236, 4.8954, 4.8699, 4.8469, 4.826, 4.8069, 4.7894, 4.7733, 4.7584, 4.7446, 4.7318, 4.7199, 4.7088, 4.6984, 4.6887, 4.6795, 4.6709, 4.6628, 4.6551, 4.6479, 4.641, 4.6345, 4.6283, 4.6224, 4.6167, 4.6114, 4.6063, 4.6014, 4.5967, 4.5923, 4.588, 4.5839, 4.5799, 4.5761, 4.5725, 4.569, 4.5656, 4.5623, 4.5592, 4.5562, 4.5532, 4.5504, 4.5089, 4.4842, 4.4678, 4.427], "10": [49.071, 13.9885, 9.462, 7.8263, 6.9947, 6.4931, 6.1579, 5.9183, 5.7384, 5.5984, 5.4863, 5.3946, 5.3181, 5.2534, 5.1979, 5.1498, 5.1077, 5.0705, 5.0375, 5.0079, 4.9813, 4.9572, 4.9353, 4.9152, 4.8969, 4.88, 4.8644, 4.85, 4.8366, 4.8241, 4.8125, 4.8016, 4.7914, 4.7818, 4.7727, 4.7642, 4.7562, 4.7486, 4.7414, 4.7345, 4.728, 4.7218, 4.7159, 4.7103, 4.705, 4.6998, 4.6949, 4.6902, 4.6857, 4.6814, 4.6773, 4.6733, 4.6695, 4.6658, 4.6623, 4.6588, 4.6555, 4.6524, 4.6493, 4.6463, 4.6028, 4.5768, 4.5595, 4.5167], "11": [50.5922, 14.3886, 9.7166, 8.0271, 7.1674, 6.6485, 6.3016, 6.0533, 5.8669, 5.7217, 5.6054, 5.5102, 5.4308, 5.3636, 5.3059, 5.2559, 5.2121, 5.1735, 5.1391, 5.1083, 5.0806, 5.0555, 5.0327, 5.0119, 4.9928, 4.9753, 4.959, 4.944, 4.93, 4.917, 4.9049, 4.8936, 4.8829, 4.8729, 4.8635, 4.8546, 4.8462, 4.8383, 4.8308, 4.8236, 4.8169, 4.8104, 4.8043, 4.7984, 4.7928, 4.7875, 4.7824, 4.7775, 4.7728, 4.7683, 4.764, 4.7598, 4.7558, 4.752, 4.7483, 4.7447, 4.7413, 4.738, 4.7348, 4.7317, 4.6862, 4.6591, 4.6411, 4.5963], "12": [51.9574, 14.7487, 9.946, 8.2083, 7.3234, 6.789, 6.4314, 6.1753, 5.983, 5.8331, 5.713, 5.6146, 5.5326, 5.4631, 5.4034, 5.3517, 5.3064, 5.2664, 5.2308, 5.199, 5.1703, 5.1443, 5.1207, 5.0991, 5.0793, 5.0611, 5.0443, 5.0287, 5.0143, 5.0008, 4.9882, 4.9764, 4.9654, 4.955, 4.9453, 4.9361, 4.9274, 4.9191, 4.9113, 4.9039, 4.8969, 4.8902, 4.8838, 4.8778, 4.872, 4.8664, 4.8611, 4.856, 4.8512, 4.8465, 4.842, 4.8377, 4.8336, 4.8296, 4.8257, 4.822, 4.8185, 4.815, 4.8117, 4.8085, 4.7613, 4.7331, 4.7144, 4.6679]}};
function lnGamma(z){const g=7,c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
 if(z<0.5) return Math.log(Math.PI/Math.sin(Math.PI*z))-lnGamma(1-z); z-=1; let x=c[0]; for(let i=1;i<g+2;i++) x+=c[i]/(z+i); const t=z+g+0.5; return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);}
function betacf(a,b,x){let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap; if(Math.abs(d)<1e-30)d=1e-30; d=1/d; let h=d;
 for(let m=1;m<=300;m++){const m2=2*m; let aa=m*(b-m)*x/((qam+m2)*(a+m2)); d=1+aa*d; if(Math.abs(d)<1e-30)d=1e-30; c=1+aa/c; if(Math.abs(c)<1e-30)c=1e-30; d=1/d; h*=d*c;
  aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2)); d=1+aa*d; if(Math.abs(d)<1e-30)d=1e-30; c=1+aa/c; if(Math.abs(c)<1e-30)c=1e-30; d=1/d; const del=d*c; h*=del; if(Math.abs(del-1)<3e-14) break;} return h;}
function betai(a,b,x){if(x<=0)return 0; if(x>=1)return 1; const bt=Math.exp(lnGamma(a+b)-lnGamma(a)-lnGamma(b)+a*Math.log(x)+b*Math.log(1-x));
 return x<(a+1)/(a+b+2)? bt*betacf(a,b,x)/a : 1-bt*betacf(b,a,1-x)/b;}
export function pF(F,d1,d2){ if(!(F>0)) return 1; return betai(d2/2,d1/2,d2/(d2+d1*F)); }
export function qTukey(t,df){ const row=QTAB.q[String(Math.min(t,12))]; const dfs=QTAB.dfs; if(df>=dfs[dfs.length-1]) return row[row.length-1];
 for(let i=0;i<dfs.length;i++){ if(dfs[i]===df) return row[i]; if(dfs[i]>df){ const a=dfs[i-1],b=dfs[i]; const w=(1/df-1/b)/(1/a-1/b); return row[i]+(row[i-1]-row[i])*w; } } return row[row.length-1]; }
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function anovaDBCA(datos){ // datos: [{y, trat, bloque}]
 const ys=datos.map(d=>d.y), gm=mean(ys);
 const by=(k)=>{const m=new Map(); for(const d of datos){const key=String(d[k]); if(!m.has(key)) m.set(key,[]); m.get(key).push(d.y);} return m;};
 const T=by('trat'), B=by('bloque'); const t=T.size, b=B.size, n=datos.length;
 const sct=ys.reduce((s,v)=>s+(v-gm)**2,0);
 const ss=m=>[...m.values()].reduce((s,v)=>s+v.length*(mean(v)-gm)**2,0);
 const sctr=ss(T), scb=ss(B), sce=sct-sctr-scb; const gle=(t-1)*(b-1), cme=sce/gle;
 const Ftr=(sctr/(t-1))/cme, Fb=(scb/(b-1))/cme;
 const medias={}; for(const [k,v] of T) medias[k]=mean(v);
 return { tabla:[
   {fuente:'Bloques',gl:b-1,sc:scb,cm:scb/(b-1),F:Fb,p:pF(Fb,b-1,gle)},
   {fuente:'Tratamientos',gl:t-1,sc:sctr,cm:sctr/(t-1),F:Ftr,p:pF(Ftr,t-1,gle)},
   {fuente:'Error',gl:gle,sc:sce,cm:cme},{fuente:'Total',gl:n-1,sc:sct}],
   cme, gle, media:gm, cv:Math.sqrt(cme)/gm*100, medias, r:b, t };
}
export function letras(medias,noDif){ const nombres=Object.keys(medias).sort((a,b)=>medias[b]-medias[a]); const n=nombres.length, grupos=[];
 for(let i=0;i<n;i++){ let j=i; while(j+1<n && [...Array(j-i+1).keys()].every(k=>noDif(i+k,j+1))) j++; if(!grupos.some(g=>g[0]<=i&&j<=g[1])) grupos.push([i,j]); }
 const out={}; nombres.forEach(k=>out[k]=''); grupos.forEach((g,idx)=>{for(let p=g[0];p<=g[1];p++) out[nombres[p]]+='abcdefghijklmnopqrstuvwxyz'[idx%26];});
 const ord={}; nombres.forEach(k=>ord[k]=out[k]); return ord; }
export function tukey(medias,cme,gle,r){ const t=Object.keys(medias).length, q=qTukey(t,gle), hsd=q*Math.sqrt(cme/r);
 const v=Object.keys(medias).sort((a,b)=>medias[b]-medias[a]).map(k=>medias[k]);
 return {q,hsd,letras:letras(medias,(i,j)=>Math.abs(v[i]-v[j])<hsd)}; }
export function interpretarCV(cv){ return cv<10?'variabilidad baja, precisión alta':cv<20?'variabilidad media, precisión aceptable':cv<30?'variabilidad alta, precisión baja':'variabilidad muy alta, revisar datos'; }
// Análisis combinado de una red de ensayos (DBCA repetido en varios lugares, balanceado).
// datos: [{y, trat, bloque, sitio}]. Lugares aleatorios: los tratamientos se prueban contra la interacción T×L.
export function anovaCombinado(datos){
 const ys=datos.map(d=>d.y), gm=mean(ys), n=datos.length;
 const grp=f=>{const m=new Map(); for(const d of datos){const k=f(d); if(!m.has(k)) m.set(k,[]); m.get(k).push(d.y);} return m;};
 const L=grp(d=>String(d.sitio)), T=grp(d=>String(d.trat)), LB=grp(d=>d.sitio+'|'+d.bloque), LT=grp(d=>d.sitio+'|'+d.trat);
 const a=L.size, t=T.size, r=n/(a*t);
 const mL=new Map([...L].map(([k,v])=>[k,mean(v)])), mT=new Map([...T].map(([k,v])=>[k,mean(v)]));
 const sct=ys.reduce((s,v)=>s+(v-gm)**2,0);
 const scl=[...L.values()].reduce((s,v)=>s+v.length*(mean(v)-gm)**2,0);
 const scb=[...LB].reduce((s,[k,v])=>s+v.length*(mean(v)-mL.get(k.split('|')[0]))**2,0);
 const sctr=[...T.values()].reduce((s,v)=>s+v.length*(mean(v)-gm)**2,0);
 const sclt=[...LT].reduce((s,[k,v])=>{const [l,tr]=k.split('|'); return s+v.length*(mean(v)-mL.get(l)-mT.get(tr)+gm)**2;},0);
 const sce=sct-scl-scb-sctr-sclt;
 const gl={l:a-1,b:a*(r-1),t:t-1,lt:(a-1)*(t-1),e:a*(t-1)*(r-1)};
 const cm={l:scl/gl.l,b:scb/gl.b,t:sctr/gl.t,lt:sclt/gl.lt,e:sce/gl.e};
 const F={l:cm.l/cm.b,t:cm.t/cm.lt,lt:cm.lt/cm.e,tE:cm.t/cm.e};
 const medias={}; for(const [k,v] of mT) medias[k]=v;
 const porSitio={}; for(const [k,v] of LT){const [l,tr]=k.split('|'); (porSitio[l]=porSitio[l]||{})[tr]=mean(v);}
 const cmeSitio={}; for(const l of L.keys()){ const R=anovaDBCA(datos.filter(d=>String(d.sitio)===l)); cmeSitio[l]=R.cme; }
 const ce=Object.values(cmeSitio), fmax=Math.max(...ce)/Math.min(...ce);
 return { tabla:[
   {fuente:'Lugares',gl:gl.l,sc:scl,cm:cm.l,F:F.l,p:pF(F.l,gl.l,gl.b)},
   {fuente:'Bloques dentro de lugares',gl:gl.b,sc:scb,cm:cm.b},
   {fuente:'Tratamientos',gl:gl.t,sc:sctr,cm:cm.t,F:F.t,p:pF(F.t,gl.t,gl.lt)},
   {fuente:'Tratamientos × lugares',gl:gl.lt,sc:sclt,cm:cm.lt,F:F.lt,p:pF(F.lt,gl.lt,gl.e)},
   {fuente:'Error',gl:gl.e,sc:sce,cm:cm.e},{fuente:'Total',gl:n-1,sc:sct}],
   media:gm, cv:Math.sqrt(cm.e)/gm*100, medias, porSitio, cmeSitio, fmax, a, t, r, cmLT:cm.lt, glLT:gl.lt, cme:cm.e, gle:gl.e,
   pT:pF(F.t,gl.t,gl.lt), pLT:pF(F.lt,gl.lt,gl.e), mediasSitio:Object.fromEntries(mL) };
}
