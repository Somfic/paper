(function(){"use strict";const K=new Set(["mr","mrs","ms","dr","st","prof","sr","jr","lt","col","capt","sgt","gen","rev","hon","vs","no","fig","etc","viz","messrs","mme","mlle","esq","inc","ltd"]),q=".!?…",Q=`"'”’)]»›`;function X(e,n){let a=n-1;for(;a>=0&&/[\p{L}]/u.test(e[a]);)a--;const s=e.slice(a+1,n);return s?s.length===1&&s===s.toUpperCase()?!0:K.has(s.toLowerCase()):!1}function*F(e){const n=e.length;let a=0;for(let s=0;s<n;s++){const t=e[s];if(t==="\u2029"){s>a&&(yield[a,s]),a=s+1;continue}if(!q.includes(t))continue;let o=s+1;for(;o<n&&q.includes(e[o]);)o++;for(;o<n&&Q.includes(e[o]);)o++;if(o<n&&!/\s/.test(e[o])){s=o-1;continue}if(t==="."&&X(e,s)){s=o-1;continue}for(o>a&&(yield[a,o]);o<n&&/\s/.test(e[o]);)o++;a=o,s=a-1}a<n&&(yield[a,n])}function Y(e){return e.replace(/\s+/g," ").trim()}const M=e=>new Set(e.split(/\s+/).filter(Boolean)),J=M(`a about above after again against all almost along already also although
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
	you-know aye nay lor blimey gawd hush hark
	majesty eminence highness excellency grace worship ladyship lordship
	mmm hmmm ahh ohh aah`),Z={nl:M(`
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
	`)},ee={en:`the and that with have this from they their which would about been what
		there could should her his him she said`.split(/\s+/).filter(Boolean),nl:`de het een van dat die niet zijn hij ze naar maar ook nog toen werd
		deze zich hebben worden`.split(/\s+/).filter(Boolean)},ne=new Set(["nl","af","de","da","sv","nb","nn","no"]),B=2e5,te=.05;function oe(e){let n="";for(const o of e)if(n+=o.text.slice(0,B-n.length),n.length>=B)break;const a=new Map;let s=0;C.lastIndex=0;for(let o=C.exec(n);o;o=C.exec(n))s++,L(a,y(o[0]));if(s<200)return[];const t=[];for(const[o,i]of Object.entries(ee)){let c=0;for(const l of i)c+=a.get(l)??0;c/s>=te&&t.push(o)}return t}function se(e,n){const a=oe(e),s=new Set(a),t=(n??"").toLowerCase().split(/[-_]/)[0];return t&&(!a.length||a.includes(t))&&s.add(t),s}const ae=M(`mr mrs ms miss master mistress madam madame monsieur dr doctor prof
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
	broeder zuster pater
	herr frau fraulein fräulein signor signora signorina senor señor senora
	señora senorita señorita don doña dona sahib effendi pasha bey khan`),P=new Set("of de du da di del della dos das van von der den ter le la y dan ibn bin al mac mc".split(" ")),re=new Set("in at into near across beyond outside inside around throughout upon onto within atop".split(" ")),ie=new Set(["the","a","an"]),le=M(`street st road lane avenue drive way square place park gardens green
	terrace court close row crescent quay wharf embankment
	house hall lodge cottage manor grange abbey priory castle keep tower
	farm mill inn tavern arms church chapel cathedral school college hospital
	prison asylum station harbour port docks
	bay cape point island isle lake river creek brook valley dale moor fell
	wood woods forest common heath marsh field fields hill hills mount mountain
	town city village borough county shire province parish district`),U={en:`said says say asked asks replied answered muttered murmured shouted
		snapped growled whispered added repeated agreed continued called cried
		demanded observed remarked hissed barked grunted sighed laughed nodded
		shrugged smiled frowned told tells`,nl:`zei zeg zegt zeggen zeiden gezegd vroeg vraag vraagt vroegen gevraagd
		antwoordde antwoordt antwoorden riep roept riepen schreeuwde fluisterde
		mompelde stamelde bromde gromde siste snauwde herhaalde vervolgde
		beaamde knikte zuchtte lachte glimlachte grinnikte hijgde vertelde`};function ce(e){const n=new Set;for(const a of["en",...e])for(const s of(U[a]??"").split(/\s+/))s&&n.add(s);return new RegExp(`^(?:${[...n].join("|")})$`,"i")}const de=new RegExp(`\\b(?:${U.en.split(/\s+/).filter(Boolean).join("|")})\\b`,"i"),he=/\b(was|were|is|are|had|has|looked|seemed|stood|sat|wore|felt|knew|became|remained|appeared|carried|held)\b/,ue=4,ge=140,fe=60,me=12,D=300,C=/[\p{L}][\p{L}\p{M}'’\-]*/gu,G=e=>new RegExp("^\\p{Lu}","u").test(e),pe=e=>e.length>1&&e===e.toLocaleUpperCase(),y=e=>e.toLocaleLowerCase().replace(/[’']/g,"'"),we=/['’](?:s|m|d|t|re|ve|ll)?$|[-'’]+$/i;function be(e,n,a){const s=[];C.lastIndex=n;for(let t=C.exec(e);t&&t.index<a;t=C.exec(e)){const o=t[0],i=we.exec(o),c=i?o.slice(0,i.index):o;c&&s.push({w:c,from:t.index,to:t.index+c.length,clipped:i?i[0]:""})}return s}const ke=new RegExp("^[^\\S\u2029]*$"),I=(e,n,a)=>ke.test(e.slice(n.to,a.from));function ve(e,n,a,s){const t=new Map,o=new Map,i=new Map,c=new Map,l=new Map,g=new Map,d=new Map;for(const _ of e){const{text:S,headings:O,index:f}=_;l.set(f,S);const b=[];let z=0;const E=w=>O.some(([k,v])=>w>=k&&w<v);for(const w of F(S)){b.push(w);const k=be(S,w[0],w[1]).filter(r=>!E(r.from));z+=k.length;for(const r of k)G(r.w)?(L(i,y(r.w)),c.has(y(r.w))||c.set(y(r.w),r.w)):L(o,y(r.w));let v=0;for(;v<k.length;){if(!A(k[v].w,a)){v++;continue}let r=v,h=v+1;for(;h<k.length&&r-v+1<ue;){const j=k[h];if(A(j.w,a)&&I(S,k[r],j)){r=h,h++;continue}const x=k[h+1];if(P.has(y(j.w))&&x&&A(x.w,a)&&I(S,k[r],j)&&I(S,j,x)){r=h+1,h+=2;continue}break}const p=k.slice(v,r+1),m=/^['’]s?$/.test(p[p.length-1].clipped);let u=0;for(;u<p.length&&ae.has(y(p[u].w));)u++;const R=u;if(R)for(;u<p.length&&P.has(y(p[u].w));)u++;if(u>=p.length){v=r+1;continue}const W=R?p.slice(0,R).map(j=>j.w).join(" "):void 0,$=p.slice(u).map(j=>j.w).join(" ");if(!ye($,n)){const j=k[v-1]?.w,x=k[r+1]?.w,H={i:f,o:p[u].from,end:p[p.length-1].to,last:p[p.length-1].from,initial:v===0,title:W,loc:!!j&&re.has(y(j)),article:!!j&&ie.has(y(j)),person:m||!!W||!!j&&s.test(j)||!!x&&s.test(x)},V=t.get($);V?V.push(H):t.set($,[H])}v=r+1}}g.set(f,b),d.set(f,z)}return{candidates:t,lower:o,caps:i,spelling:c,texts:l,spans:g,words:d}}const A=(e,n)=>e.length>=2&&G(e)&&!pe(e)&&!n.has(y(e)),ye=(e,n)=>e.split(" ").every(a=>n.has(y(a)));function L(e,n){e.set(n,(e.get(n)??0)+1)}function je(e,n,a,s){if(n.length<2||n.every(l=>l.initial)||n.every(l=>s.has(l.i)))return!1;const t=e.split(" ");if(t.length>1&&le.has(y(t[t.length-1])))return!1;if(t.length===1){const l=a.lower.get(y(e))??0;if(l>=3&&l>n.length*.5)return!1}if(n.filter(l=>l.article).length/n.length>=.85)return!1;const i=n.filter(l=>l.loc).length/n.length,c=n.filter(l=>l.person).length/n.length;return!(i>=.3&&c<.1)}function ze(e,n,a){const s=y(e.split(" ").pop()??"");return[s.endsWith("es")?s.slice(0,-2):"",s.endsWith("s")?s.slice(0,-1):""].some(o=>o.length>=3&&(a.caps.get(o)??0)>=2)?n.filter(o=>o.article).length/n.length>=.4:!1}function Se(e){const n=new Map,a=t=>{const o=y(t);if(o.length<4||!o.endsWith("s"))return null;const i=o.slice(0,-1),c=e.caps.get(i)??0;return c<2||c*2<(e.caps.get(o)??0)?null:e.spelling.get(i)??null},s=(t,o)=>{const i=e.candidates.get(t);i?i.push(o):e.candidates.set(t,[o])};for(const[t,o]of[...e.candidates]){const i=t.split(" "),c=a(i[i.length-1]);if(!c)continue;e.candidates.delete(t);const l=i.slice(0,-1).join(" ");for(const d of o)s(c,{...d,title:void 0,o:l?d.last:d.o,end:d.end-1,last:l?d.last:d.o,initial:l?!1:d.initial,loc:!1,article:!1,person:!0}),l&&s(l,{...d,end:d.last,last:d.o,person:!1});const g=n.get(c)??new Set;g.add(i[i.length-1]),n.set(c,g)}return n}class Ee{#e=new Map;find(n){const a=this.#e.get(n);if(a===void 0||a===n)return n;const s=this.find(a);return this.#e.set(n,s),s}join(n,a){const s=this.find(n),t=this.find(a);s!==t&&this.#e.set(s,t)}}function Re(e){const n=new Ee,a=[...e.keys()].filter(t=>t.includes(" "));for(const[t,o]of e){if(t.includes(" ")||o.length<2)continue;let i=null,c=0;for(const l of a){const g=l.split(" ");if(g[0]!==t&&g[g.length-1]!==t)continue;const d=e.get(l)?.length??0;d>c&&(i=l,c=d)}i&&n.join(t,i)}const s=new Map;for(const t of e.keys()){const o=n.find(t),i=s.get(o);i?i.push(t):s.set(o,[t])}return s}function Ce(e,n,a){const s=[...e].sort((g,d)=>d.count-g.count),t=s[0].name,o=s.filter(g=>g.name.includes(" ")&&g.count>=a*.15).sort((g,d)=>d.name.length-g.name.length)[0],i=[...n.entries()].sort((g,d)=>d[1]-g[1])[0];let c=t;o?c=o.name:i&&i[1]>=a*.3&&(c=`${i[0]} ${t}`);const l=new Set(e.map(g=>g.name));for(const[g,d]of n)if(d>=2)for(const _ of e)l.add(`${g} ${_.name}`);return l.add(c),{name:c,aliases:[...l].sort((g,d)=>d.length-g.length)}}function xe(e,n){let a=0,s=e.length-1;for(;a<=s;){const t=a+s>>1,[o,i]=e[t];if(n<o)s=t-1;else if(n>=i)a=t+1;else return e[t]}return null}function _e(e,n){const s=(n.split(" ").pop()??n).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");let t=0;const o=e.length;o>=60&&o<=240&&(t+=2),o<40&&(t-=3),o>320&&(t-=2),de.test(e)&&(t-=3),/^[“"'‘]/.test(e)&&(t-=1),new RegExp(`${s}\\s*,\\s*(the|a|an|who|once|formerly|his|her)\\b`).test(e)&&(t+=5),new RegExp(`${s}(?:['’]s)?\\s+${he.source}`).test(e)&&(t+=3);const i=e.match(new RegExp("(?<=[a-z,;:]\\s)\\p{Lu}\\p{Ll}+","gu"))?.length??0;return i>2&&(t-=i-2),t}const Me=e=>e.length<=D?e:`${e.slice(0,D-1).trimEnd()}…`;function Le(e,n={}){const a=new Set((n.exclude??[]).map(y)),s=se(e,n.language),t=new Set(J);for(const f of s)for(const b of Z[f]??[])t.add(b);const o=ve(e,a,t,ce(s)),i=[...s].some(f=>ne.has(f))?Se(o):new Map,c=new Set;for(const[f,b]of o.words)b<250&&c.add(f);const l=new Map;for(const[f,b]of o.candidates)je(f,b,o,c)&&!ze(f,b,o)&&l.set(f,b);const g=Re(l),d=[];for(const f of g.values()){const b=[],z=new Map,E=[];for(const m of f){const u=l.get(m)??[];E.push({name:m,count:u.length});for(const R of u)b.push(R),R.title&&L(z,R.title)}b.sort((m,u)=>m.i-u.i||m.o-u.o||u.end-m.end);const w=[];for(const m of b){const u=w[w.length-1];u&&u.i===m.i&&m.o<u.end||w.push(m)}const k=E.some(m=>m.name.includes(" ")),v=z.size>0;if(w.length<(k||v?2:3)||w.filter(m=>m.person).length<(w.length>=12?2:1))continue;const{name:h,aliases:p}=Ce(E,z,w.length);for(const m of f)for(const u of i.get(m)??[])p.push(u);d.push({name:h,aliases:[...new Set(p)].sort((m,u)=>u.length-m.length),occ:w})}d.sort((f,b)=>b.occ.length-f.occ.length);const _=d.slice(0,ge),S=new Set,O=[];for(const f of _){const b=f.aliases.filter(r=>{const h=r.replace(/\s+/g," ");return S.has(h)?!1:(S.add(h),!0)});if(!b.length)continue;const z=f.occ.map(r=>({i:r.i,o:r.o})),E=f.occ.map(r=>{const h=o.spans.get(r.i),p=o.texts.get(r.i);if(!h||!p)return null;const m=xe(h,r.o);if(!m)return null;const u=Me(Y(p.slice(m[0],m[1])));return{quote:u,score:_e(u,f.name)}}),w=new Set;for(let r=0;r<Math.min(me,E.length);r++)w.add(r);const k=E.map((r,h)=>({k:h,score:r?.score??-99})).sort((r,h)=>h.score-r.score);for(const{k:r,score:h}of k){if(w.size>=fe)break;h>=2&&w.add(r)}const v=new Set;for(const r of[...w].sort((h,p)=>h-p)){const h=E[r];!h||v.has(h.quote)||(v.add(h.quote),z[r].t=h.quote,z[r].q=h.score)}O.push({name:f.name,aliases:b,mentions:z})}return O}const T=self;let N=[];T.onmessage=e=>{const n=e.data;if(n.kind==="section"){N.push(n.section);return}try{const a=Le(N,{exclude:n.exclude,language:n.language}),s={version:4,built_at:new Date().toISOString(),labels:n.labels,entries:a};T.postMessage({kind:"done",index:s})}catch(a){T.postMessage({kind:"error",message:a instanceof Error?a.message:String(a)})}finally{N=[]}}})();
