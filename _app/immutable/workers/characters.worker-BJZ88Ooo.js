(function(){"use strict";const W=new Set(["mr","mrs","ms","dr","st","prof","sr","jr","lt","col","capt","sgt","gen","rev","hon","vs","no","fig","etc","viz","messrs","mme","mlle","esq","inc","ltd"]),q=".!?…",G=`"'”’)]»›`;function Q(e,n){let a=n-1;for(;a>=0&&/[\p{L}]/u.test(e[a]);)a--;const s=e.slice(a+1,n);return s?s.length===1&&s===s.toUpperCase()?!0:W.has(s.toLowerCase()):!1}function*X(e){const n=e.length;let a=0;for(let s=0;s<n;s++){const o=e[s];if(o==="\u2029"){s>a&&(yield[a,s]),a=s+1;continue}if(!q.includes(o))continue;let t=s+1;for(;t<n&&q.includes(e[t]);)t++;for(;t<n&&G.includes(e[t]);)t++;if(t<n&&!/\s/.test(e[t])){s=t-1;continue}if(o==="."&&Q(e,s)){s=t-1;continue}for(t>a&&(yield[a,t]);t<n&&/\s/.test(e[t]);)t++;a=t,s=a-1}a<n&&(yield[a,n])}function F(e){return e.replace(/\s+/g," ").trim()}const _=e=>new Set(e.split(/\s+/).filter(Boolean)),Y=_(`a about above after again against all almost along already also although
	always am among an and another any anyone anything are around as at away back
	be because been before behind being below beneath beside besides best better
	between beyond both but by came can cannot come could course dear did do does
	doing done down each either else enough even ever every everybody everyone
	everything except far few finally first for forward from get give go going
	gone good got great had half has have having he hell her here hers herself him
	himself his how however i if in indeed inside instead into is it its itself
	just keep last late later least left less let like little long look many may
	maybe me might mine more most much must my myself near neither never
	nevertheless new next no nobody none nor not nothing now of off often oh ok on
	once one only or other others otherwise ought our ours out outside over own
	part perhaps please plenty put quite rather really right said same say see
	seem several shall she should since so some somebody someone something
	sometimes somewhere soon still such sure take than that the their theirs them
	themselves then there therefore these they thing think this those though
	three thus till time to together too took toward towards true try turn two
	under unless until up upon us very want was way we well were what whatever
	when where whether which while who whoever whole whom whose why will with
	within without would yes yet you your yours yourself
	chapter chapters part parts book books prologue epilogue interlude appendix
	acknowledgements acknowledgments contents copyright dedication epigraph
	foreword glossary index introduction preface prologue volume section page
	pages end ends title author about also praise reviews also-by
	monday tuesday wednesday thursday friday saturday sunday january february
	march april may june july august september october november december
	god gods christ jesus lord-god damn damned devil hell heaven
	ah aha alas anyway besides bloody christ eh er ha hey hm hmm huh mm no oh
	okay oops ow please sorry thanks thank true ugh uh um well what why yeah yes
	you-know
	majesty eminence highness excellency grace worship ladyship lordship
	mmm hmmm ahh ohh aah`),J={nl:_(`
		de het een en van dat die dit deze der den des te in op aan met voor door
		over onder tussen naar uit bij om als dan toen nu nog al ook maar want dus
		of niet geen wel zo zeer heel erg meer meest minder weinig veel alle alles
		allemaal iets niets iemand niemand elk elke ieder iedere iedereen zelf
		zelfde hetzelfde dezelfde ander andere anders beide beiden samen
		ik jij je jou u hij zij ze wij we jullie mij me hem haar hen hun ons onze
		mijn jouw uw zich zichzelf elkaar men
		ben bent is zijn was waren geweest word wordt worden werd werden geworden
		heb hebt heeft hebben had hadden gehad kan kun kunt kunnen kon konden
		zal zult zullen zou zouden mag mag magen mogen mocht mochten moet moeten
		moest moesten wil wilt willen wilde wilden wou doe doet doen deed deden
		gedaan ga gaat gaan ging gingen gegaan kom komt komen kwam kwamen gekomen
		zei zegt zeggen zeiden gezegd vroeg vraagt vragen keek kijkt kijken staat
		staan stond stonden zit zitten zat zaten liep lopen dacht denken wist
		weten werd blijft blijven bleef
		wat wie waar wanneer waarom hoe welke welk hoeveel waarheen waarvan
		ja nee jawel nou goed oke okee hoor ach och oh hm hmm haha zeg kijk
		luister alsjeblieft alstublieft dank dankje bedankt sorry helaas
		natuurlijk misschien echt eigenlijk gewoon even nooit altijd soms vaak
		weer opnieuw eerst laatst later eerder straks meteen ineens plotseling
		vandaag gisteren morgen avond ochtend nacht middag jaar week maand uur
		papa mama pap mam vader moeder ouders opa oma pa ma oom tante broer zus
		zusje broertje jongen meisje man vrouw kind kinderen mens mensen meneer
		mevrouw mijnheer juffrouw
		hoofdstuk deel proloog epiloog inhoud voorwoord nawoord bijlage register
		titel auteur uitgeverij uitgave druk bladzijde einde
		maandag dinsdag woensdag donderdag vrijdag zaterdag zondag januari
		februari maart april mei juni juli augustus september oktober november
		december
		god heer here hemel hel duivel jezus christus lieve verdomme
	`)},Z={en:`the and that with have this from they their which would about been what
		there could should her his him she said`.split(/\s+/).filter(Boolean),nl:`de het een van dat die niet zijn hij ze naar maar ook nog toen werd
		deze zich hebben worden`.split(/\s+/).filter(Boolean)},ee=new Set(["nl","af","de","da","sv","nb","nn","no"]),B=2e5,ne=.05;function te(e){let n="";for(const t of e)if(n+=t.text.slice(0,B-n.length),n.length>=B)break;const a=new Map;let s=0;C.lastIndex=0;for(let t=C.exec(n);t;t=C.exec(n))s++,x(a,v(t[0]));if(s<200)return[];const o=[];for(const[t,r]of Object.entries(Z)){let i=0;for(const w of r)i+=a.get(w)??0;i/s>=ne&&o.push(t)}return o}function oe(e,n){const a=te(e),s=new Set(a),o=(n??"").toLowerCase().split(/[-_]/)[0];return o&&(!a.length||a.includes(o))&&s.add(o),s}const se=_(`mr mrs ms miss master mistress madam madame monsieur dr doctor prof
	professor sir dame lord lady king queen prince princess duke duchess count
	countess baron baroness emperor empress earl marquis viscount
	captain major colonel corporal sergeant sarge general commander admiral
	lieutenant marshal ensign private brigadier
	inquisitor superior practical arch lector magus mage magister crown chancellor
	brother sister father mother uncle aunt cousin grandfather grandmother
	saint st chief president governor judge sheriff reverend rabbi imam pope
	cardinal bishop abbot prior squire knight nurse officer detective agent
	sergeant-major lord-marshal high
	meneer mevrouw mijnheer mevr dhr juffrouw juf dokter dominee pastoor
	koning koningin prins prinses graaf gravin hertog hertogin ridder
	kapitein luitenant kolonel sergeant generaal agent rechercheur meester
	broeder zuster pater`),P=new Set("of de du da di del della dos das van von der den ter le la y dan ibn bin al mac mc".split(" ")),ae=new Set("in at into near across beyond outside inside around throughout upon onto within atop".split(" ")),re=new Set(["the","a","an"]),I=/\b(said|says|asked|replied|answered|muttered|murmured|shouted|snapped|growled|whispered|added|repeated|agreed|continued|called|cried|demanded|observed|remarked|hissed|barked|grunted|sighed|laughed|nodded|shrugged|smiled|frowned)\b/i,ie=/\b(was|were|is|are|had|has|looked|seemed|stood|sat|wore|felt|knew|became|remained|appeared|carried|held)\b/,le=4,ce=140,de=60,he=12,U=300,C=/[\p{L}][\p{L}\p{M}'’\-]*/gu,D=e=>new RegExp("^\\p{Lu}","u").test(e),ue=e=>e.length>1&&e===e.toLocaleUpperCase(),v=e=>e.toLocaleLowerCase().replace(/[’']/g,"'"),ge=/['’](?:s|m|d|t|re|ve|ll)?$|[-'’]+$/i;function fe(e,n,a){const s=[];C.lastIndex=n;for(let o=C.exec(e);o&&o.index<a;o=C.exec(e)){const t=o[0],r=ge.exec(t),i=r?t.slice(0,r.index):t;i&&s.push({w:i,from:o.index,to:o.index+i.length,clipped:r?r[0]:""})}return s}const me=new RegExp("^[^\\S\u2029]*$"),L=(e,n,a)=>me.test(e.slice(n.to,a.from));function we(e,n,a){const s=new Map,o=new Map,t=new Map,r=new Map,i=new Map,w=new Map,u=new Map;for(const d of e){const{text:S,headings:O,index:R}=d;i.set(R,S);const p=[];let b=0;const z=j=>O.some(([g,k])=>j>=g&&j<k);for(const j of X(S)){p.push(j);const g=fe(S,j[0],j[1]).filter(f=>!z(f.from));b+=g.length;for(const f of g)D(f.w)?(x(t,v(f.w)),r.has(v(f.w))||r.set(v(f.w),f.w)):x(o,v(f.w));let k=0;for(;k<g.length;){if(!T(g[k].w,a)){k++;continue}let f=k,c=k+1;for(;c<g.length&&f-k+1<le;){const y=g[c];if(T(y.w,a)&&L(S,g[f],y)){f=c,c++;continue}const M=g[c+1];if(P.has(v(y.w))&&M&&T(M.w,a)&&L(S,g[f],y)&&L(S,y,M)){f=c+1,c+=2;continue}break}const l=g.slice(k,f+1),m=/^['’]s?$/.test(l[l.length-1].clipped);let h=0;for(;h<l.length&&se.has(v(l[h].w));)h++;const E=h;for(;h<l.length&&P.has(v(l[h].w));)h++;if(h>=l.length){k=f+1;continue}const H=E?l.slice(0,E).map(y=>y.w).join(" "):void 0,$=l.slice(h).map(y=>y.w).join(" ");if(!pe($,n)){const y=g[k-1]?.w,M=g[f+1]?.w,K={i:R,o:l[h].from,end:l[l.length-1].to,last:l[l.length-1].from,initial:k===0,title:H,loc:!!y&&ae.has(v(y)),article:!!y&&re.has(v(y)),person:m||!!H||!!y&&I.test(y)||!!M&&I.test(M)},V=s.get($);V?V.push(K):s.set($,[K])}k=f+1}}w.set(R,p),u.set(R,b)}return{candidates:s,lower:o,caps:t,spelling:r,texts:i,spans:w,words:u}}const T=(e,n)=>e.length>=2&&D(e)&&!ue(e)&&!n.has(v(e)),pe=(e,n)=>e.split(" ").every(a=>n.has(v(a)));function x(e,n){e.set(n,(e.get(n)??0)+1)}function be(e,n,a,s){if(n.length<2||n.every(i=>i.initial)||n.every(i=>s.has(i.i)))return!1;if(!e.includes(" ")){const i=a.lower.get(v(e))??0;if(i>=3&&i>n.length*.5)return!1}if(n.filter(i=>i.article).length/n.length>=.85)return!1;const t=n.filter(i=>i.loc).length/n.length,r=n.filter(i=>i.person).length/n.length;return!(t>=.3&&r<.1)}function ke(e){const n=new Map,a=o=>{const t=v(o);if(t.length<4||!t.endsWith("s"))return null;const r=t.slice(0,-1),i=e.caps.get(r)??0;return i<2||i*2<(e.caps.get(t)??0)?null:e.spelling.get(r)??null},s=(o,t)=>{const r=e.candidates.get(o);r?r.push(t):e.candidates.set(o,[t])};for(const[o,t]of[...e.candidates]){const r=o.split(" "),i=a(r[r.length-1]);if(!i)continue;e.candidates.delete(o);const w=r.slice(0,-1).join(" ");for(const d of t)s(i,{...d,title:void 0,o:w?d.last:d.o,end:d.end-1,last:w?d.last:d.o,initial:w?!1:d.initial,loc:!1,article:!1,person:!0}),w&&s(w,{...d,end:d.last,last:d.o,person:!1});const u=n.get(i)??new Set;u.add(r[r.length-1]),n.set(i,u)}return n}class ye{#e=new Map;find(n){const a=this.#e.get(n);if(a===void 0||a===n)return n;const s=this.find(a);return this.#e.set(n,s),s}join(n,a){const s=this.find(n),o=this.find(a);s!==o&&this.#e.set(s,o)}}function ve(e){const n=new ye,a=[...e.keys()].filter(o=>o.includes(" "));for(const[o,t]of e){if(o.includes(" ")||t.length<2)continue;let r=null,i=0;for(const w of a){const u=w.split(" ");if(u[0]!==o&&u[u.length-1]!==o)continue;const d=e.get(w)?.length??0;d>i&&(r=w,i=d)}r&&n.join(o,r)}const s=new Map;for(const o of e.keys()){const t=n.find(o),r=s.get(t);r?r.push(o):s.set(t,[o])}return s}function je(e,n,a){const s=[...e].sort((u,d)=>d.count-u.count),o=s[0].name,t=s.filter(u=>u.name.includes(" ")&&u.count>=a*.15).sort((u,d)=>d.name.length-u.name.length)[0],r=[...n.entries()].sort((u,d)=>d[1]-u[1])[0];let i=o;t?i=t.name:r&&r[1]>=a*.3&&(i=`${r[0]} ${o}`);const w=new Set(e.map(u=>u.name));for(const[u,d]of n)if(d>=2)for(const S of e)w.add(`${u} ${S.name}`);return w.add(i),{name:i,aliases:[...w].sort((u,d)=>d.length-u.length)}}function Se(e,n){let a=0,s=e.length-1;for(;a<=s;){const o=a+s>>1,[t,r]=e[o];if(n<t)s=o-1;else if(n>=r)a=o+1;else return e[o]}return null}function ze(e,n){const s=(n.split(" ").pop()??n).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");let o=0;const t=e.length;t>=60&&t<=240&&(o+=2),t<40&&(o-=3),t>320&&(o-=2),I.test(e)&&(o-=3),/^[“"'‘]/.test(e)&&(o-=1),new RegExp(`${s}\\s*,\\s*(the|a|an|who|once|formerly|his|her)\\b`).test(e)&&(o+=5),new RegExp(`${s}(?:['’]s)?\\s+${ie.source}`).test(e)&&(o+=3);const r=e.match(new RegExp("(?<=[a-z,;:]\\s)\\p{Lu}\\p{Ll}+","gu"))?.length??0;return r>2&&(o-=r-2),o}const Ee=e=>e.length<=U?e:`${e.slice(0,U-1).trimEnd()}…`;function Re(e,n={}){const a=new Set((n.exclude??[]).map(v)),s=oe(e,n.language),o=new Set(Y);for(const p of s)for(const b of J[p]??[])o.add(b);const t=we(e,a,o),r=[...s].some(p=>ee.has(p))?ke(t):new Map,i=new Set;for(const[p,b]of t.words)b<250&&i.add(p);const w=new Map;for(const[p,b]of t.candidates)be(p,b,t,i)&&w.set(p,b);const u=ve(w),d=[];for(const p of u.values()){const b=[],z=new Map,j=[];for(const m of p){const h=w.get(m)??[];j.push({name:m,count:h.length});for(const E of h)b.push(E),E.title&&x(z,E.title)}b.sort((m,h)=>m.i-h.i||m.o-h.o||h.end-m.end);const g=[];for(const m of b){const h=g[g.length-1];h&&h.i===m.i&&m.o<h.end||g.push(m)}const k=j.some(m=>m.name.includes(" ")),f=z.size>0;if(g.length<(k||f?2:3))continue;const{name:c,aliases:l}=je(j,z,g.length);for(const m of p)for(const h of r.get(m)??[])l.push(h);d.push({name:c,aliases:[...new Set(l)].sort((m,h)=>h.length-m.length),occ:g})}d.sort((p,b)=>b.occ.length-p.occ.length);const S=d.slice(0,ce),O=new Set,R=[];for(const p of S){const b=p.aliases.filter(c=>{const l=c.replace(/\s+/g," ");return O.has(l)?!1:(O.add(l),!0)});if(!b.length)continue;const z=p.occ.map(c=>({i:c.i,o:c.o})),j=p.occ.map(c=>{const l=t.spans.get(c.i),m=t.texts.get(c.i);if(!l||!m)return null;const h=Se(l,c.o);if(!h)return null;const E=Ee(F(m.slice(h[0],h[1])));return{quote:E,score:ze(E,p.name)}}),g=new Set;for(let c=0;c<Math.min(he,j.length);c++)g.add(c);const k=j.map((c,l)=>({k:l,score:c?.score??-99})).sort((c,l)=>l.score-c.score);for(const{k:c,score:l}of k){if(g.size>=de)break;l>=2&&g.add(c)}const f=new Set;for(const c of[...g].sort((l,m)=>l-m)){const l=j[c];!l||f.has(l.quote)||(f.add(l.quote),z[c].t=l.quote,z[c].q=l.score)}R.push({name:p.name,aliases:b,mentions:z})}return R}const N=self;let A=[];N.onmessage=e=>{const n=e.data;if(n.kind==="section"){A.push(n.section);return}try{const a=Re(A,{exclude:n.exclude,language:n.language}),s={version:3,built_at:new Date().toISOString(),labels:n.labels,entries:a};N.postMessage({kind:"done",index:s})}catch(a){N.postMessage({kind:"error",message:a instanceof Error?a.message:String(a)})}finally{A=[]}}})();
