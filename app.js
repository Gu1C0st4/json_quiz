/* ============================================================
   1. Realce de sintaxe (JSON / XML / JS / Python) — leve
   ============================================================ */
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function hlJSON(raw){
  let s = esc(raw);
  // strings (keys vs values decided after)
  s = s.replace(/"(\\.|[^"\\])*"(\s*:)?/g, function(m){
    if(/:\s*$/.test(m)) return '<span class="tok-key">'+m.replace(/(\s*:)$/,'')+'</span><span class="tok-punc">$1</span>'.replace('$1', m.match(/(\s*:)$/)[1]);
    return '<span class="tok-str">'+m+'</span>';
  });
  s = s.replace(/\b(true|false)\b/g,'<span class="tok-bool">$1</span>');
  s = s.replace(/\bnull\b/g,'<span class="tok-null">null</span>');
  s = s.replace(/(:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,'$1<span class="tok-num">$2</span>');
  s = s.replace(/(^|\[|,|\s)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,\]\n])/g,'$1<span class="tok-num">$2</span>');
  return s;
}
function hlXML(raw){
  let s = esc(raw);
  s = s.replace(/(&lt;\/?)([\w:-]+)/g,'$1<span class="tok-tag">$2</span>');
  s = s.replace(/([\w:-]+)=(&quot;|")/g,'<span class="tok-attr">$1</span>=$2');
  s = s.replace(/(&quot;.*?&quot;|".*?")/g,'<span class="tok-str">$1</span>');
  return s;
}
function hlCode(raw,lang){
  let s = esc(raw);
  const kw = lang==='py'
    ? /\b(from|import|def|return|if|else|for|in|not|None|True|False)\b/g
    : /\b(const|let|var|function|return|if|else|throw|new|typeof|null|true|false)\b/g;
  s = s.replace(/(\/\/.*$|#.*$)/gm,'<span class="tok-com">$1</span>');
  s = s.replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g,'<span class="tok-str">$1</span>');
  s = s.replace(kw,'<span class="tok-kw">$1</span>');
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g,'<span class="tok-num">$1</span>');
  return s;
}
document.querySelectorAll('pre.code-body').forEach(function(pre){
  const lang = pre.getAttribute('data-lang');
  const raw = pre.textContent;
  if(lang==='json') pre.innerHTML = hlJSON(raw);
  else if(lang==='xml') pre.innerHTML = hlXML(raw);
  else pre.innerHTML = hlCode(raw,lang);
});

/* ============================================================
   2. Validador JSON Schema (subconjunto Draft 2020-12)
   ============================================================ */
function canon(v){
  if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(canon).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
}
function deepEq(a,b){return canon(a)===canon(b);}
function kindOf(v){
  if(v===null) return 'null';
  if(Array.isArray(v)) return 'array';
  if(typeof v==='number') return Number.isInteger(v)?'integer':'number';
  return typeof v; // string, boolean, object
}
function matchType(t,v){
  const k=kindOf(v);
  if(t==='number') return k==='number'||k==='integer';
  if(t==='integer') return k==='integer';
  return t===k;
}
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function checkFormat(fmt,val){
  if(fmt==='date-time') return RFC3339.test(val);
  if(fmt==='date') return /^\d{4}-\d{2}-\d{2}$/.test(val);
  if(fmt==='time') return /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(val);
  if(fmt==='email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val);
  return true; // formato desconhecido: anotação
}
function jsvalidate(rootSchema, rootData, opts){
  opts = opts||{};
  const errors=[];
  function resolve(ref){
    if(typeof ref!=='string'||ref[0]!=='#') return undefined;
    const parts=ref.slice(1).split('/').filter(Boolean).map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
    let cur=rootSchema;
    for(const p of parts){ if(cur==null) return undefined; cur=cur[p]; }
    return cur;
  }
  // valida sem registar erros (para anyOf/oneOf/contains/if)
  function ok(schema,data){
    const before=errors.length; const silent=[];
    walk(schema,data,'',silent,new Set());
    return silent.length===0;
  }
  function walk(schema,data,path,errs,evaluated){
    if(schema===true) return;
    if(schema===false){errs.push({path,kw:'false',msg:'nenhum valor é aceite aqui'});return;}
    if(typeof schema!=='object'||schema===null) return;

    if(schema.$ref!==undefined){
      const sub=resolve(schema.$ref);
      if(sub===undefined) errs.push({path,kw:'$ref',msg:'referência não resolvida: '+schema.$ref});
      else walk(sub,data,path,errs,evaluated);
    }
    if(schema.type!==undefined){
      const types=Array.isArray(schema.type)?schema.type:[schema.type];
      if(!types.some(t=>matchType(t,data)))
        errs.push({path,kw:'type',msg:'esperava '+types.join(' ou ')+', recebeu '+kindOf(data)});
    }
    if(schema.enum!==undefined && !schema.enum.some(e=>deepEq(e,data)))
      errs.push({path,kw:'enum',msg:'valor fora de enum ['+schema.enum.map(x=>JSON.stringify(x)).join(', ')+']'});
    if('const' in schema && !deepEq(schema.const,data))
      errs.push({path,kw:'const',msg:'esperava const '+JSON.stringify(schema.const)});

    if(typeof data==='string'){
      const len=[...data].length;
      if(schema.minLength!==undefined && len<schema.minLength) errs.push({path,kw:'minLength',msg:'minLength '+schema.minLength+'; comprimento '+len});
      if(schema.maxLength!==undefined && len>schema.maxLength) errs.push({path,kw:'maxLength',msg:'maxLength '+schema.maxLength+'; comprimento '+len});
      if(schema.pattern!==undefined){try{if(!new RegExp(schema.pattern).test(data)) errs.push({path,kw:'pattern',msg:'não corresponde a '+schema.pattern});}catch(e){}}
      if(schema.format!==undefined && opts.checkFormat && !checkFormat(schema.format,data)) errs.push({path,kw:'format',msg:'formato '+schema.format+' inválido'});
    }
    if(typeof data==='number'){
      if(schema.minimum!==undefined && data<schema.minimum) errs.push({path,kw:'minimum',msg:'minimum '+schema.minimum+'; valor '+data});
      if(schema.maximum!==undefined && data>schema.maximum) errs.push({path,kw:'maximum',msg:'maximum '+schema.maximum+'; valor '+data});
      if(schema.exclusiveMinimum!==undefined && data<=schema.exclusiveMinimum) errs.push({path,kw:'exclusiveMinimum',msg:'exclusiveMinimum '+schema.exclusiveMinimum+'; valor '+data});
      if(schema.exclusiveMaximum!==undefined && data>=schema.exclusiveMaximum) errs.push({path,kw:'exclusiveMaximum',msg:'exclusiveMaximum '+schema.exclusiveMaximum+'; valor '+data});
      if(schema.multipleOf!==undefined){const q=data/schema.multipleOf; if(Math.abs(q-Math.round(q))>1e-9) errs.push({path,kw:'multipleOf',msg:'não é múltiplo de '+schema.multipleOf});}
    }
    if(Array.isArray(data)){
      const start=Array.isArray(schema.prefixItems)?schema.prefixItems.length:0;
      if(Array.isArray(schema.prefixItems)) schema.prefixItems.forEach((s,i)=>{if(i<data.length) walk(s,data[i],path+'['+i+']',errs,evaluated);});
      if(schema.items!==undefined){
        if(schema.items===false){ if(data.length>start) errs.push({path,kw:'items',msg:'não são permitidos itens além da posição '+start}); }
        else for(let i=start;i<data.length;i++) walk(schema.items,data[i],path+'['+i+']',errs,evaluated);
      }
      if(schema.minItems!==undefined && data.length<schema.minItems) errs.push({path,kw:'minItems',msg:'minItems '+schema.minItems+'; tem '+data.length});
      if(schema.maxItems!==undefined && data.length>schema.maxItems) errs.push({path,kw:'maxItems',msg:'maxItems '+schema.maxItems+'; tem '+data.length});
      if(schema.uniqueItems){const seen=new Set(); let dup=false; for(const it of data){const c=canon(it); if(seen.has(c)){dup=true;break;} seen.add(c);} if(dup) errs.push({path,kw:'uniqueItems',msg:'há itens duplicados'});}
      if(schema.contains!==undefined){
        let cnt=0; data.forEach(it=>{if(ok(schema.contains,it)) cnt++;});
        const minC=schema.minContains!==undefined?schema.minContains:1;
        if(cnt<minC) errs.push({path,kw:'contains',msg:'precisa de pelo menos '+minC+' item(s) a cumprir contains; encontrou '+cnt});
        if(schema.maxContains!==undefined && cnt>schema.maxContains) errs.push({path,kw:'maxContains',msg:'no máximo '+schema.maxContains+' itens; encontrou '+cnt});
      }
    }
    if(data!==null && typeof data==='object' && !Array.isArray(data)){
      const keys=Object.keys(data);
      const declared=new Set();
      if(schema.properties){for(const k of Object.keys(schema.properties)){declared.add(k); if(k in data){walk(schema.properties[k],data[k],path?path+'.'+k:k,errs,evaluated); evaluated.add(k);}}}
      if(schema.patternProperties){for(const pat of Object.keys(schema.patternProperties)){let re; try{re=new RegExp(pat);}catch(e){continue;} for(const k of keys){if(re.test(k)){walk(schema.patternProperties[pat],data[k],path?path+'.'+k:k,errs,evaluated); evaluated.add(k); declared.add(k);}}}}
      if(Array.isArray(schema.required)) for(const r of schema.required) if(!(r in data)) errs.push({path,kw:'required',msg:'falta a propriedade obrigatória "'+r+'"'});
      if(schema.additionalProperties!==undefined){
        for(const k of keys) if(!declared.has(k)){
          if(schema.additionalProperties===false) errs.push({path,kw:'additionalProperties',msg:'propriedade não permitida "'+k+'"'});
          else {walk(schema.additionalProperties,data[k],path?path+'.'+k:k,errs,evaluated); evaluated.add(k);}
        }
      }
    }

    if(Array.isArray(schema.allOf)) schema.allOf.forEach(s=>walk(s,data,path,errs,evaluated));
    if(Array.isArray(schema.anyOf)){
      const pass=schema.anyOf.filter(s=>ok(s,data));
      if(pass.length===0) errs.push({path,kw:'anyOf',msg:'não satisfaz nenhuma alternativa de anyOf'});
      else pass.forEach(s=>walk(s,data,path,errs,evaluated));
    }
    if(Array.isArray(schema.oneOf)){
      const pass=schema.oneOf.filter(s=>ok(s,data));
      if(pass.length!==1) errs.push({path,kw:'oneOf',msg:'oneOf exige exatamente uma alternativa; cumpriu '+pass.length});
      else walk(pass[0],data,path,errs,evaluated);
    }
    if(schema.not!==undefined && ok(schema.not,data)) errs.push({path,kw:'not',msg:'o valor é aceite por "not" e por isso recusado'});

    if(schema.if!==undefined){
      if(ok(schema.if,data)){ if(schema.then!==undefined) walk(schema.then,data,path,errs,evaluated); }
      else { if(schema.else!==undefined) walk(schema.else,data,path,errs,evaluated); }
    }

    if(schema.unevaluatedProperties===false && data!==null && typeof data==='object' && !Array.isArray(data)){
      // melhor esforço: recolher avaliadas em allOf/anyOf/oneOf/if-then
      const ev=new Set(evaluated);
      function collect(s){
        if(!s||typeof s!=='object') return;
        if(s.properties) Object.keys(s.properties).forEach(k=>{if(k in data) ev.add(k);});
        if(Array.isArray(s.allOf)) s.allOf.forEach(collect);
        if(Array.isArray(s.anyOf)) s.anyOf.forEach(x=>{if(ok(x,data)) collect(x);});
        if(Array.isArray(s.oneOf)) s.oneOf.forEach(x=>{if(ok(x,data)) collect(x);});
        if(s.if && ok(s.if,data) && s.then) collect(s.then);
      }
      collect(schema);
      for(const k of Object.keys(data)) if(!ev.has(k)) errs.push({path,kw:'unevaluatedProperties',msg:'propriedade não avaliada "'+k+'"'});
    }
  }
  walk(rootSchema,rootData,'',errors,new Set());
  return errors;
}
/* ============================================================
   3. Exemplos do Sandbox
   ============================================================ */
var S = function(o){return JSON.stringify(o,null,2);};
var ENERGIA = {
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "type":"object",
  "properties":{
    "id":{"type":"string","pattern":"^EN-[0-9]{3}$"},
    "energiaKwh":{"type":"number","minimum":0},
    "instante":{"type":"string","format":"date-time"},
    "estado":{"enum":["ativo","inativo"]}
  },
  "required":["id","energiaKwh","instante"],
  "additionalProperties":false
};
var SENSOR = {
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "type":"object",
  "properties":{
    "id":{"type":"string","pattern":"^AR-[0-9]{3}$"},
    "pm25":{"type":"number","exclusiveMinimum":0,"maximum":100},
    "ativo":{"type":"boolean"},
    "zonas":{"type":"array","items":{"type":"string"},"uniqueItems":true}
  },
  "required":["id","pm25","ativo"],
  "additionalProperties":false
};
var ONEOF = {
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "oneOf":[
    {"type":"integer","minimum":0},
    {"type":"integer","multipleOf":2}
  ]
};
var EXAMPLES = [
  {name:"Contador EN-042", ok:true,
   doc:{id:"EN-042",energiaKwh:18.75,instante:"2026-10-01T09:30:00Z",estado:"ativo"}, schema:ENERGIA},
  {name:"Sensor AR-007", ok:true,
   doc:{id:"AR-007",pm25:12.4,ativo:true,zonas:["norte","sul"]}, schema:SENSOR},
  {name:"Tipo errado", ok:false,
   doc:{id:"EN-042",energiaKwh:"18.75",instante:"2026-10-01T09:30:00Z"}, schema:ENERGIA},
  {name:"Campo em falta", ok:false,
   doc:{energiaKwh:18.75,instante:"2026-10-01T09:30:00Z"}, schema:ENERGIA},
  {name:"Fora do intervalo", ok:false,
   doc:{id:"EN-042",energiaKwh:-1,instante:"2026-10-01T09:30:00Z"}, schema:ENERGIA},
  {name:"Propriedade extra", ok:false,
   doc:{id:"EN-042",energiaKwh:18.75,instante:"2026-10-01T09:30:00Z",debug:true}, schema:ENERGIA},
  {name:"oneOf: valor 4", ok:false, doc:4, schema:ONEOF}
];
var exWrap=document.getElementById('exBtns');
EXAMPLES.forEach(function(ex){
  var b=document.createElement('button');
  b.className='ex-btn '+(ex.ok?'valid':'invalid');
  b.textContent=(ex.ok?'✓ ':'✗ ')+ex.name;
  b.onclick=function(){ docIn.value=S(ex.doc); schemaIn.value=S(ex.schema); renderDoc(null); renderSch(null); runValidation(); document.getElementById('sandbox').scrollIntoView({behavior:'smooth'}); };
  exWrap.appendChild(b);
});

/* ============================================================
   4. Lógica do Sandbox
   ============================================================ */
var docIn=document.getElementById('docIn'),
    schemaIn=document.getElementById('schemaIn'),
    result=document.getElementById('result'),
    resultTitle=document.getElementById('resultTitle'),
    errlist=document.getElementById('errlist'),
    docCard=document.getElementById('docCard'),
    schCard=document.getElementById('schCard'),
    stepsEls=document.querySelectorAll('#steps .step');

/* --- editor com margem de números + marcação de linhas --- */
function attachEditor(taId,gutId){
  var ta=document.getElementById(taId), gut=document.getElementById(gutId);
  function sync(){ gut.style.transform='translateY('+(-ta.scrollTop)+'px)'; }
  function render(errLines){
    var n=ta.value.split('\n').length, h='';
    for(var i=1;i<=n;i++){ h+='<span class="gl'+((errLines&&errLines.has(i))?' err':'')+'">'+i+'</span>'; }
    gut.innerHTML=h; sync();
  }
  ta.addEventListener('scroll',sync);
  render(null);
  return render;
}
var renderDoc=attachEditor('docIn','docGut');
var renderSch=attachEditor('schemaIn','schGut');

/* --- localizar a linha de um erro --- */
function parseLine(text,msg){
  var m=/line (\d+)/i.exec(msg); if(m) return +m[1];
  m=/position (\d+)/i.exec(msg); if(m) return text.slice(0,+m[1]).split('\n').length;
  m=/column (\d+)/i.exec(msg); // alguns motores
  return null;
}
function findKeyLine(text,key){
  var lines=text.split('\n');
  for(var i=0;i<lines.length;i++){ if(lines[i].indexOf('"'+key+'"')>=0) return i+1; }
  return null;
}
function lastKey(path){ return (path||'').replace(/\[\d+\]/g,'').split('.').filter(Boolean).pop(); }
function collectErrLines(text,errs){
  var set=new Set();
  errs.forEach(function(e){
    if(e._line){ set.add(e._line); return; }
    var k=lastKey(e.path); var ln=k?findKeyLine(text,k):null;
    set.add(ln||1);
  });
  return set;
}

function setStep(n,state){
  var el=document.querySelector('#steps .step[data-step="'+n+'"]');
  el.classList.add('on'); el.classList.remove('pass','fail');
  var ic=el.querySelector('.ic');
  if(state==='pass'){el.classList.add('pass'); ic.textContent='✓';}
  else if(state==='fail'){el.classList.add('fail'); ic.textContent='✕';}
  else{ic.textContent=n;}
}
function resetSteps(){stepsEls.forEach(function(el){el.classList.remove('on','pass','fail'); el.querySelector('.ic').textContent=el.getAttribute('data-step');});}
function setLive(which,state,txt){
  var dot=document.getElementById(which+'Dot'), lab=document.getElementById(which+'Live');
  dot.className='live-dot'+(state?' '+state:''); lab.textContent=txt;
}
function showResult(ok,title,errs){
  result.className='result show '+(ok?'ok':'err');
  resultTitle.textContent=title;
  errlist.innerHTML='';
  (errs||[]).forEach(function(e){
    var li=document.createElement('li');
    var loc=e.path?e.path:'(raiz)';
    var ln=e._line?'<span class="ln">linha '+e._line+'</span> · ':'';
    li.innerHTML=ln+'<span class="path">'+esc(loc)+'</span> · <span class="kw">'+esc(e.kw)+'</span> — '+esc(e.msg);
    errlist.appendChild(li);
  });
}

function runValidation(){
  resetSteps();
  docCard.classList.remove('bad','good'); schCard.classList.remove('bad','good');
  var data, schema;
  // passo 1 — sintaxe do documento
  try{ data=JSON.parse(docIn.value); setStep(1,'pass'); renderDoc(null); setLive('doc','ok','bem formado'); docCard.classList.add('good'); }
  catch(err){ setStep(1,'fail'); var ln=parseLine(docIn.value,err.message);
    renderDoc(new Set([ln||1])); docCard.classList.add('bad'); setLive('doc','err','sintaxe'+(ln?' · linha '+ln:''));
    showResult(false,'Documento: JSON inválido'+(ln?' — linha '+ln:''),[{path:'',kw:'sintaxe',msg:err.message,_line:ln}]); return; }
  // passo 2 — esquema bem formado
  try{ schema=JSON.parse(schemaIn.value); if(typeof schema!=='object'||schema===null) throw new Error('o esquema deve ser um objeto'); setStep(2,'pass'); renderSch(null); setLive('sch','ok','bem formado'); schCard.classList.add('good'); }
  catch(err){ setStep(2,'fail'); var ln2=parseLine(schemaIn.value,err.message);
    renderSch(new Set([ln2||1])); schCard.classList.add('bad'); setLive('sch','err','sintaxe'+(ln2?' · linha '+ln2:''));
    showResult(false,'Esquema: JSON inválido'+(ln2?' — linha '+ln2:''),[{path:'',kw:'sintaxe',msg:err.message,_line:ln2}]); return; }
  // passo 3 — contrato
  var errs=jsvalidate(schema,data,{checkFormat:document.getElementById('fmtChk').checked});
  if(errs.length===0){ setStep(3,'pass'); renderDoc(null); setLive('doc','ok','válido ✓');
    showResult(true,'✓ Válido — o documento cumpre o contrato.',[]); }
  else{ setStep(3,'fail');
    errs.forEach(function(e){ var k=lastKey(e.path); e._line=k?findKeyLine(docIn.value,k):null; });
    renderDoc(collectErrLines(docIn.value,errs)); docCard.classList.remove('good'); docCard.classList.add('bad');
    setLive('doc','err',errs.length+' erro(s) de contrato');
    showResult(false,'✗ Inválido — '+errs.length+' violação(ões) do contrato:',errs); }
}

var debId; function liveRun(){ clearTimeout(debId); debId=setTimeout(runValidation,350); }
docIn.addEventListener('input',function(){ renderDoc(null); docCard.classList.remove('bad','good'); liveRun(); });
schemaIn.addEventListener('input',function(){ renderSch(null); schCard.classList.remove('bad','good'); liveRun(); });
document.getElementById('fmtChk').addEventListener('change',runValidation);
document.getElementById('runBtn').onclick=runValidation;
document.getElementById('clearBtn').onclick=function(){docIn.value=''; schemaIn.value=''; renderDoc(null); renderSch(null); resetSteps(); result.classList.remove('show'); docCard.classList.remove('bad','good'); schCard.classList.remove('bad','good'); setLive('doc','','—'); setLive('sch','','—');};

// carregar o primeiro exemplo e validar de imediato
docIn.value=S(EXAMPLES[0].doc); schemaIn.value=S(EXAMPLES[0].schema);
renderDoc(null); renderSch(null); runValidation();

/* ============================================================
   5. Quiz
   ============================================================ */
var QUIZ=[
 {q:'Porque é inválido escrever <code>007</code> como número JSON?',
  o:['Números JSON não podem ter zeros à esquerda; deve ser a string "007"','Porque é maior que 2^53','Porque falta a vírgula decimal','Porque null não é permitido'],a:0,
  fb:'JSON não aceita zeros à esquerda nos números. Um código como 007 representa-se como string.'},
 {q:'Quantos tipos de valores existem em JSON?',
  o:['4','6','8','Infinitos'],a:1,
  fb:'Seis: string, number, boolean, null, object e array.'},
 {q:'Qual destes NÃO pertence ao JSON estrito?',
  o:['Aspas duplas','Arrays','Vírgulas finais e comentários','Objetos aninhados'],a:2,
  fb:'Comentários e vírgulas finais pertencem a extensões, não ao JSON padrão.'},
 {q:'Com <code>properties</code> mas sem <code>required</code>, <code>{}</code> é aceite?',
  o:['Sim — properties só valida quando o campo está presente','Não — properties torna tudo obrigatório','Só se existir additionalProperties','Depende do $schema'],a:0,
  fb:'properties valida cada campo apenas quando ele aparece. Para exigir presença, usar required.'},
 {q:'Para recusar um <code>id</code> igual a <code>""</code>, além de <code>required</code>, falta…',
  o:['maximum','minLength','const','uniqueItems'],a:1,
  fb:'required garante presença, não valor útil. minLength rejeita a string vazia.'},
 {q:'<code>{"type": ["number","null"]}</code> com <code>required</code>: <code>{}</code> é aceite?',
  o:['Sim, null cobre a ausência','Não — falta a propriedade','Só com nullable','Só se additionalProperties for true'],a:1,
  fb:'Permitir null é diferente de permitir ausência. Sem a propriedade, falha em required.'},
 {q:'No <code>oneOf</code> com [inteiro ≥ 0] e [inteiro múltiplo de 2], o valor <code>4</code> é aceite?',
  o:['Sim','Não — cumpre as duas e oneOf exige exatamente uma','Só se minItems=1','Erro de esquema'],a:1,
  fb:'4 passa nas duas alternativas; oneOf exige exatamente uma, por isso é recusado. (anyOf aceitaria.)'},
 {q:'Na conversão XML→JSON, elementos repetidos tornam-se normalmente…',
  o:['objetos aninhados','strings','arrays','atributos'],a:2,
  fb:'Elementos repetidos passam a arrays — e mantém-se o array mesmo com um único elemento.'},
 {q:'Por omissão, <code>"format": "date-time"</code> no dialeto padrão é…',
  o:['uma validação sempre ativa','apenas anotação; é preciso ativar a verificação','um erro de sintaxe','equivalente a pattern'],a:1,
  fb:'format é anotação por omissão. É preciso ativar o verificador (ex.: FormatChecker).'},
 {q:'Para que servem <code>$defs</code> e <code>$ref</code>?',
  o:['Declarar o dialeto','Guardar e reutilizar esquemas, evitando repetição','Preencher valores por omissão','Validar datas'],a:1,
  fb:'$defs guarda esquemas reutilizáveis; $ref aplica-os onde for referenciado.'},
 {q:'<code>prefixItems</code> em Draft 2020-12 serve para…',
  o:['limitar o tamanho do array','descrever as posições de uma tupla','exigir itens únicos','validar objetos'],a:1,
  fb:'prefixItems descreve posição a posição (tupla); items:false recusa posições extra.'},
 {q:'Com <code>exclusiveMinimum: 0</code>, <code>maximum: 100</code>, <code>multipleOf: 0.5</code>, qual é aceite?',
  o:['0','-0.5','100','100.5'],a:2,
  fb:'0 é excluído, 100 é incluído (maximum) e é múltiplo de 0.5. 100.5 excede o máximo.'}
];
var qMount=document.getElementById('quizMount'),
    qProg=document.getElementById('quizProgress'),
    qScoreEl=document.getElementById('quizScore'),
    answered=0, correct=0, shown=0;
function renderBatch(start){
  qMount.innerHTML='';
  var slice=QUIZ.slice(start,start+3);
  slice.forEach(function(item,i){
    var idx=start+i;
    var q=document.createElement('div'); q.className='q';
    var opts=item.o.map(function(txt,oi){return '<button class="opt" data-i="'+oi+'">'+txt+'</button>';}).join('');
    q.innerHTML='<div class="qn">Pergunta '+(idx+1)+'</div><div class="qt">'+item.q+'</div><div class="opts">'+opts+'</div><div class="qfb"></div>';
    var fb=q.querySelector('.qfb');
    q.querySelectorAll('.opt').forEach(function(btn){
      btn.onclick=function(){
        if(q.dataset.done) return; q.dataset.done='1';
        var chosen=+btn.getAttribute('data-i');
        q.querySelectorAll('.opt').forEach(function(b){b.disabled=true; var bi=+b.getAttribute('data-i'); if(bi===item.a) b.classList.add('correct'); else if(bi===chosen) b.classList.add('wrong');});
        answered++; if(chosen===item.a) correct++;
        fb.innerHTML='<b>'+(chosen===item.a?'Certo. ':'Não exatamente. ')+'</b>'+item.fb; fb.classList.add('show');
        qScoreEl.textContent=correct+' / '+answered;
      };
    });
    qMount.appendChild(q);
  });
  qProg.textContent='Perguntas '+(start+1)+'–'+Math.min(start+3,QUIZ.length);
}
document.getElementById('quizMore').onclick=function(){ shown+=3; if(shown>=QUIZ.length) shown=0; renderBatch(shown); document.getElementById('quiz').scrollIntoView({behavior:'smooth'}); };
document.getElementById('quizRestart').onclick=function(){ answered=0; correct=0; shown=0; qScoreEl.textContent='0 / 0'; renderBatch(0); };
renderBatch(0);

/* ============================================================
   6. Exercícios interativos (converter / corrigir)
   ============================================================ */
function exFeedback(id){var fb=document.getElementById(id); return {
  ok:function(h){fb.className='ex-fb show ok'; fb.innerHTML=h;},
  err:function(h){fb.className='ex-fb show err'; fb.innerHTML=h;},
  hide:function(){fb.className='ex-fb';}
};}
function initEx(cfg){
  var ta=document.getElementById(cfg.ta);
  var render=attachEditor(cfg.ta,cfg.gut);
  var starter=ta.value;
  var fb=exFeedback(cfg.fb);
  ta.addEventListener('input',function(){render(null); fb.hide();});
  document.getElementById(cfg.rst).onclick=function(){ta.value=starter; render(null); fb.hide();};
  document.getElementById(cfg.btn).onclick=function(){cfg.run(ta.value,fb,render);};
  render(null);
}
function parseOr(fb,render,val){
  try{return {ok:true,data:JSON.parse(val)};}
  catch(e){var ln=parseLine(val,e.message); render(new Set([ln||1])); fb.err('<b>JSON inválido'+(ln?' — linha '+ln:'')+'.</b> '+esc(e.message)); return {ok:false};}
}
// ex1 — corrigir a sintaxe
initEx({ta:'ex1-ta',gut:'ex1-gut',btn:'ex1-btn',rst:'ex1-rst',fb:'ex1-fb',run:function(val,fb,render){
  var r=parseOr(fb,render,val); if(!r.ok) return; render(null);
  var exp={id:"AR-007",pm25:12.4,ativo:true,zonas:["norte","sul"]};
  if(canon(r.data)===canon(exp)) fb.ok('<b>Boa! JSON bem formado e com os valores certos.</b> Repara que a sintaxe correta não garante, por si só, que os dados servem à aplicação.');
  else fb.ok('<b>JSON bem formado ✓</b> O parser já consegue ler. Confirma só que mantiveste os valores: <code>id</code>, <code>pm25</code> = 12.4, <code>ativo</code> = true e <code>zonas</code> sem vírgula final.');
}});
// ex2 — XML → JSON
initEx({ta:'ex2-ta',gut:'ex2-gut',btn:'ex2-btn',rst:'ex2-rst',fb:'ex2-fb',run:function(val,fb,render){
  var r=parseOr(fb,render,val); if(!r.ok) return; render(null);
  var exp={sensor:"AR-007",leituras:[{pm25:12.4},{pm25:13.1}]};
  if(canon(r.data)===canon(exp)){fb.ok('<b>Correto!</b> Raiz com <code>sensor</code> e um array <code>leituras</code> de objetos, com <code>pm25</code> numérico.'); return;}
  var h=[], d=r.data||{};
  if(d.sensor!=="AR-007") h.push('<li><code>sensor</code> deve ser "AR-007" (vem do atributo XML)</li>');
  if(!Array.isArray(d.leituras)) h.push('<li><code>leituras</code> deve ser um array</li>');
  else{ if(d.leituras.length!==2) h.push('<li>o array deve ter 2 leituras</li>');
        if(d.leituras.some(function(x){return !x||typeof x.pm25!=='number';})) h.push('<li>cada leitura é um objeto com <code>pm25</code> numérico (sem aspas)</li>'); }
  fb.err('<b>Bem formado, mas ainda não coincide.</b><ul>'+(h.join('')||'<li>compara com a solução</li>')+'</ul>');
}});
// ex3 — JSON → XML (comparação normalizada)
initEx({ta:'ex3-ta',gut:'ex3-gut',btn:'ex3-btn',rst:'ex3-rst',fb:'ex3-fb',run:function(val,fb,render){
  render(null);
  if(!val.trim()){fb.err('<b>Escreve o XML primeiro.</b>'); return;}
  var norm=function(x){return x.replace(/>\s+</g,'><').replace(/\s+/g,' ').replace(/'/g,'"').trim();};
  var exp='<contador id="007"><energia unidade="kWh">18.75</energia></contador>';
  if(norm(val)===norm(exp)) fb.ok('<b>Correto!</b> Raiz &lt;contador&gt;, <code>id</code> e <code>unidade</code> como atributos, e 18.75 como texto de &lt;energia&gt;.');
  else fb.err('<b>Ainda não coincide.</b><ul><li>raiz &lt;contador id="007"&gt;</li><li>&lt;energia unidade="kWh"&gt;18.75&lt;/energia&gt; dentro</li><li>ponto decimal e aspas duplas</li></ul>');
}});
// ex4 — corrigir até passar o contrato (valida contra o esquema do sensor)
initEx({ta:'ex4-ta',gut:'ex4-gut',btn:'ex4-btn',rst:'ex4-rst',fb:'ex4-fb',run:function(val,fb,render){
  var r=parseOr(fb,render,val); if(!r.ok) return;
  var errs=jsvalidate(SENSOR,r.data,{checkFormat:true});
  if(errs.length===0){render(null); fb.ok('<b>✓ Passa o contrato!</b> Todas as regras do esquema do sensor foram cumpridas.'); return;}
  errs.forEach(function(e){var k=lastKey(e.path); e._line=k?findKeyLine(val,k):null;});
  render(collectErrLines(val,errs));
  var items=errs.map(function(e){return '<li>'+(e._line?'linha '+e._line+' · ':'')+esc(e.kw)+' — '+esc(e.msg)+'</li>';}).join('');
  fb.err('<b>✗ '+errs.length+' violação(ões) do contrato:</b><ul>'+items+'</ul>');
}});
/* ============================================================
   7. Descarregar os ficheiros do projeto (index.html, style.css, app.js)
   ============================================================ */
(function(){
  function dl(file){
    function fallback(){ var a=document.createElement('a'); a.href=file; a.download=file; document.body.appendChild(a); a.click(); a.remove(); }
    if(!window.fetch){ fallback(); return; }
    fetch(file).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(t){
      var type=file.slice(-4)==='.css'?'text/css':file.slice(-3)==='.js'?'text/javascript':'text/html';
      var url=URL.createObjectURL(new Blob([t],{type:type}));
      var a=document.createElement('a'); a.href=url; a.download=file; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1500);
    }).catch(fallback);
  }
  document.querySelectorAll('.dlbtn[data-file]').forEach(function(b){
    b.addEventListener('click',function(ev){ ev.preventDefault(); dl(b.getAttribute('data-file')); });
  });
})();

/* ============================================================
   8. Empacotar os 3 ficheiros num .zip (no browser, sem compressão)
   ============================================================ */
function crc32(bytes){
  var table=crc32.t;
  if(!table){ table=crc32.t=[]; for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++){ c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); } table[n]=c>>>0; } }
  var crc=0xFFFFFFFF;
  for(var i=0;i<bytes.length;i++){ crc=(crc>>>8)^table[(crc^bytes[i])&0xFF]; }
  return (crc^0xFFFFFFFF)>>>0;
}
function makeZip(files){
  var enc=new TextEncoder();
  function u16(v){return [v&0xFF,(v>>>8)&0xFF];}
  function u32(v){return [v&0xFF,(v>>>8)&0xFF,(v>>>16)&0xFF,(v>>>24)&0xFF];}
  var locals=[], centrals=[], offset=0;
  files.forEach(function(f){
    var name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(data);
    var lh=[].concat(u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0));
    var local=new Uint8Array(lh.length+name.length+data.length);
    local.set(lh,0); local.set(name,lh.length); local.set(data,lh.length+name.length);
    locals.push(local);
    var ch=[].concat(u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset));
    var cen=new Uint8Array(ch.length+name.length);
    cen.set(ch,0); cen.set(name,ch.length);
    centrals.push(cen);
    offset+=local.length;
  });
  var cdSize=centrals.reduce(function(a,b){return a+b.length;},0), cdOffset=offset;
  var end=new Uint8Array([].concat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cdSize),u32(cdOffset),u16(0)));
  var total=offset+cdSize+end.length, out=new Uint8Array(total), p=0;
  locals.forEach(function(c){out.set(c,p); p+=c.length;});
  centrals.forEach(function(c){out.set(c,p); p+=c.length;});
  out.set(end,p);
  return out;
}
(function(){
  var zbtn=document.getElementById('dlZip'); if(!zbtn) return;
  zbtn.addEventListener('click',function(ev){
    ev.preventDefault();
    var names=['index.html','style.css','app.js'];
    Promise.all(names.map(function(n){ return fetch(n).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(t){ return {name:n,text:t}; }); }))
      .then(function(files){
        var zip=makeZip(files);
        var url=URL.createObjectURL(new Blob([zip],{type:'application/zip'}));
        var a=document.createElement('a'); a.href=url; a.download='json-schema-aula.zip'; document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1500);
      })
      .catch(function(){ alert('Não consegui criar o .zip aqui. Usa os três botões de ficheiro individuais, por favor.'); });
  });
})();
