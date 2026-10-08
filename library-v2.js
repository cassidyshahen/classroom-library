
function v2Render(){v2Reservations();v2Series();v2Browse()}
function v2Reservations(){
const el=document.getElementById("v2Reservations");if(!el)return;
if(!reservationsReady){el.textContent="Run migrations/library_v2.sql in Supabase to enable reservations.";return}
const groups=new Map();
reservations.filter(r=>r.status==="waiting").forEach(r=>{const id=String(r.book_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r)});
el.innerHTML='<div class="v2-controls"><select id="v2Book">'+books.map(b=>'<option value="'+b.id+'">'+escapeLibraryHtml(b.Title)+'</option>').join("")+'</select><select id="v2Class" onchange="v2Students()"><option>7S</option><option>7K</option></select><select id="v2Student"></select><button onclick="v2Reserve()">Add Reservation</button></div>'+([...groups].map(([id,queue])=>'<div class="v2-panel"><h3>'+escapeLibraryHtml(books.find(b=>String(b.id)===id)?.Title||"Unknown")+'</h3>'+queue.map((r,i)=>{const st=getStudent(r.student_id);return '<p>#'+(i+1)+' Student #'+(st?.student_number||"?")+' ('+escapeLibraryHtml(st?getClassName(st.class_id):"?")+') <button onclick="v2Status('+r.id+',&quot;fulfilled&quot;)">Fulfilled</button> <button onclick="v2Status('+r.id+',&quot;cancelled&quot;)">Remove</button></p>'}).join("")+'</div>').join("")||'<p>No reservations yet.</p>');
v2Students();
}
function v2Students(){const el=document.getElementById("v2Student");if(!el)return;el.innerHTML=students.filter(st=>getClassName(st.class_id)===document.getElementById("v2Class").value).map(st=>'<option value="'+st.id+'">Student #'+st.student_number+'</option>').join("")}
async function v2Reserve(){const book_id=Number(document.getElementById("v2Book").value),student_id=Number(document.getElementById("v2Student").value);if(!book_id||!student_id)return;const {error}=await supabaseClient.from("Reservations").insert({book_id,student_id});if(error){alert(error.message);return}await loadData()}
async function v2Status(id,status){const {error}=await supabaseClient.from("Reservations").update({status}).eq("id",id);if(error){alert(error.message);return}await loadData()}
function v2Series(){
const el=document.getElementById("v2Series");if(!el)return;
const names=[...new Set(books.map(b=>String(b.Series||"").trim()).filter(Boolean))].sort();
el.innerHTML=names.map(name=>{const group=books.filter(b=>b.Series===name),rec=seriesCovers.find(r=>r.Name===name),nums=new Set(group.map(b=>Number(b["Series #"])).filter(n=>Number.isInteger(n)&&n>0)),total=Math.max(Number(rec?.["Expected Books"]||0),0,...nums),missing=Array.from({length:total},(_,i)=>i+1).filter(n=>!nums.has(n)),pct=total?Math.round(100*(total-missing.length)/total):0;
return '<div class="v2-panel"><h3>'+escapeLibraryHtml(name)+'</h3><label>Number of books in series <input type="number" min="0" max="500" style="width:80px" value="'+(rec?.["Expected Books"]||"")+'" onchange="v2Target('+JSON.stringify(name).replace(/"/g,"&quot;")+',this.value)"></label><p>'+group.length+' owned · '+pct+'% of numbered books</p><div class="v2-bar"><div style="width:'+pct+'%"></div></div><p>Owned numbers: '+([...nums].sort((a,b)=>a-b).join(", ")||"None recorded")+'</p><p>Missing numbers: '+(missing.join(", ")||"None identified")+'</p></div>'}).join("");
}
async function v2Target(name,value){const rec=seriesCovers.find(r=>r.Name===name),n=value===""?null:Number(value);if(!rec||n!==null&&(!Number.isInteger(n)||n<0||n>500))return;const {error}=await supabaseClient.from("Series").update({"Expected Books":n}).eq("id",rec.id);if(error){alert(error.message);return}rec["Expected Books"]=n;v2Series()}
function v2Browse(){const el=document.getElementById("v2Browse");if(!el)return;const q=document.getElementById("v2Search").value.toLowerCase();el.innerHTML=books.filter(b=>[b.Title,b.Author,b.Series,...getBookGenres(b)].join(" ").toLowerCase().includes(q)).map(b=>'<button onclick="v2Detail('+Number(b.id)+')">'+detailsCover(b)+'<strong>'+escapeLibraryHtml(b.Title)+'</strong><small>'+escapeLibraryHtml(b.Author||"")+'</small><small>'+(getAvailableCopies(b)>0?'Available':'Checked out')+'</small></button>').join("")}
function v2Detail(id){const b=books.find(x=>String(x.id)===String(id));if(!b)return;const modal=document.getElementById("v2DetailsModal");document.getElementById("v2Details").innerHTML='<div class="details-hero">'+detailsCover(b)+'<div><h2>'+escapeLibraryHtml(b.Title)+'</h2><p>'+escapeLibraryHtml(b.Author||"")+'</p><p>'+escapeLibraryHtml(b.Description||"No description yet.")+'</p></div></div>';modal.classList.remove("hidden")}

const v2OriginalStats=renderStatistics;
renderStatistics=function(){
v2OriginalStats();
const el=document.getElementById("statisticsContent");if(!el)return;
const cls=document.getElementById("statsClass").value,from=document.getElementById("statsFrom").value,to=document.getElementById("statsTo").value;
const rows=checkouts.filter(c=>{const st=getStudent(c.student_id),d=String(c["Check Out Date"]||"").slice(0,10);return(cls==="all"||st&&getClassName(st.class_id)===cls)&&(!from||d>=from)&&(!to||d<=to)});
const authors=new Map(),classesCount=new Map(),durations=[];let overdue=0;
rows.forEach(c=>{const b=books.find(x=>String(x.id)===String(c.book_id));if(b?.Author)authors.set(b.Author,(authors.get(b.Author)||0)+1);const st=getStudent(c.student_id),name=st?getClassName(st.class_id):"Unknown";classesCount.set(name,(classesCount.get(name)||0)+1);if(c["Return Date"]){const d=(new Date(c["Return Date"])-new Date(c["Check Out Date"]))/86400000;if(Number.isFinite(d)&&d>=0)durations.push(d)}else if(checkoutDueDate(c)<getTodayEastern())overdue++});
const avg=durations.length?(durations.reduce((a,b)=>a+b,0)/durations.length).toFixed(1):"—";
el.insertAdjacentHTML("beforeend",'<div class="v2-stats"><div class="v2-panel"><h3>Popular Authors</h3>'+[...authors].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([a,n])=>'<p>'+escapeLibraryHtml(a)+': '+n+'</p>').join("")+'</div><div class="v2-panel"><h3>Checkout Health</h3><p>Average completed loan: '+avg+' days</p><p>Overdue: '+overdue+'</p></div><div class="v2-panel"><h3>Class Comparison</h3><p>7S: '+(classesCount.get("7S")||0)+' checkouts</p><p>7K: '+(classesCount.get("7K")||0)+' checkouts</p></div></div>');
};
