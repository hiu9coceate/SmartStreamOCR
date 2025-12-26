/* --- FILE MAIN.JS (THIN CLIENT VERSION) --- */
/* Toàn bộ xử lý AI và OCR đã chuyển về Server Java */

let ws, lastY=0, dc, pc, chunks=[], isSnip=false, isDraw=false, sX, sY, pAct, pPrompt, zoomLevel=100;
let panX=0, panY=0; // Pan offset
let lastTouchDistance=0; // Cho pinch zoom
let isZoomTouchActive = false; // Flag để khóa zoom khi bật Mouse
const sel=document.getElementById("selection-box"), bar=document.getElementById("action-bar");

console.log("🚀 Main.js Loaded - Server-Side AI Enabled");
const SERVER_URL = "wss://niblike-shery-dooly.ngrok-free.dev";

function connect(){
    const target = document.getElementById("targetId").value.trim();
    if(!target) return alert("Nhập ID!");
    document.getElementById("btnConnect").disabled = true;
    document.getElementById("btnConnect").innerText = "...";
    updateStatus("🟡 Connecting...", "orange");
    initWebSocket(SERVER_URL, target);
}

function initWebSocket(url, targetId) {
    ws = new WebSocket(url);
    ws.onopen = () => { 
        console.log("✅ WS Open");
        ws.send(JSON.stringify({ type: "LOGIN", id: "WEB_" + Math.floor(Math.random()*9999) })); 
        setTimeout(() => { ws.send(JSON.stringify({ type: "SIGNAL", target: targetId, data: JSON.stringify({ type: "HELLO" }) })); }, 500); 
    };
    ws.onmessage = (e) => { try { hSig(JSON.parse(e.data)); } catch(err){} };
    ws.onclose = () => { updateStatus("🔴 Closed", "red"); document.getElementById("btnConnect").disabled = false; };
}

function hSig(m){
    let d = (typeof m.data==='string')?JSON.parse(m.data):m.data;
    if(d.type==="offer"){
        pc=new RTCPeerConnection({iceServers: []});
        pc.onicecandidate=e=>{if(e.candidate)ws.send(JSON.stringify({type:"SIGNAL",target:m.target,data:JSON.stringify({type:"candidate",candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex})}))};
        pc.ondatachannel=e=>{ dc=e.channel; setupDC(); };
        pc.setRemoteDescription(d).then(()=>pc.createAnswer()).then(a=>pc.setLocalDescription(a)).then(()=>ws.send(JSON.stringify({type:"SIGNAL",target:m.target,data:JSON.stringify({type:"answer",sdp:pc.localDescription.sdp})})));
    } else if(d.type==="candidate"&&pc) pc.addIceCandidate(d);
}

function setupDC(){
    dc.onopen = () => { updateStatus("🟢 Streaming...", "#00ff00"); };
    dc.onmessage = e => {
        let raw = e.data;
        let isCommand = false, textCmd = "";

        if (typeof raw === "string") { isCommand = true; textCmd = raw; } 
        else if (raw instanceof ArrayBuffer) {
            try {
                const decoded = new TextDecoder("utf-8").decode(raw);
                if (decoded.startsWith("START:") || decoded.startsWith("AI_RESULT:") || decoded.startsWith("OCR_RESULT:") || decoded === "END") {
                    isCommand = true; textCmd = decoded;
                }
            } catch(err) {}
        }

        if (isCommand) {
            if (textCmd.startsWith("START:")) chunks = [];
            else if (textCmd === "END") {
                if (chunks.length > 0) {
                    const blob = new Blob(chunks, {type: "image/jpeg"});
                    const url = URL.createObjectURL(blob);
                    const img = document.getElementById("remote-screen");
                    img.src = url; img.style.display = "block";
                    document.getElementById("waitingMsg").style.display = "none";
                    img.onload = () => URL.revokeObjectURL(url);
                }
            } 
            // [UPDATE] NHẬN KẾT QUẢ TỪ SERVER
            else if (textCmd.startsWith("OCR_RESULT:")) {
                addMsg("📄 <b>OCR:</b> " + textCmd.substring(11), "msg-ai");
            } 
            else if (textCmd.startsWith("AI_RESULT:")) {
                addMsg("✨ <b>Gemini:</b> " + textCmd.substring(10), "msg-ai");
            }
        } else { chunks.push(raw); }
    };
}

// UI Functions
function sendMouseMove(e){
    // Dành cho MOUSE PC - điều khiển chuột LUÔN
    if(!isSnip && dc && document.getElementById("chkControl").checked){
        let cX = e.clientX;
        let cY = e.clientY;
        let r=e.target.getBoundingClientRect(); 
        dc.send("MOUSE:"+((cX-r.left)/r.width)+","+((cY-r.top)/r.height));
    }
}

// [NEW] MOUSE WHEEL SCROLL - dành cho PC mouse
document.addEventListener("wheel", (e) => {
    // CHỈ hoạt động khi bật Mouse Mode
    if(!isSnip && dc && document.getElementById("chkControl").checked){
        // e.deltaY > 0 = lăn xuống, < 0 = lăn lên
        let scrollLines = Math.ceil(Math.abs(e.deltaY) / 30);
        dc.send("SCROLL:" + (e.deltaY > 0 ? scrollLines : -scrollLines));
        console.log("🖱️ MOUSE WHEEL: " + (e.deltaY > 0 ? "DOWN " : "UP ") + scrollLines + " lines");
        e.preventDefault();
    }
}, false);

function sendMove(e){
    // Dành cho TOUCH ĐIỆN THOẠI - lăn cuộn
    // CHỈ hoạt động khi bật Mouse Mode
    if(!isSnip && dc && document.getElementById("chkControl").checked){
        let cY = e.touches ? e.touches[0].clientY : e.clientY;
        
        if(lastY===0){ 
            lastY=cY; 
            return; 
        }
        
        let diff = lastY - cY;
        let absDiff = Math.abs(diff);
        
        // Nếu lăn dọc nhiều (>20px) → CUỘN
        if(absDiff > 20){ 
            let scrollLines = Math.ceil(absDiff / 25);
            dc.send("SCROLL:" + (diff > 0 ? scrollLines : -scrollLines));
            console.log("📜 SCROLL: " + (diff > 0 ? "DOWN " : "UP ") + scrollLines + " lines");
            lastY = cY; 
        } 
    }
}

// Reset lastY khi nhấc tay
document.addEventListener("touchend", ()=>{lastY=0;});
document.addEventListener("mouseup", ()=>{lastY=0;});

function sendClick(e){
    if(!isSnip && dc && document.getElementById("chkControl").checked){
        dc.send("CLICK");
        lastY=0; // Reset để lần di chuyển tiếp theo được tính từ đầu
    }
}
function updateStatus(t, c) { const el = document.getElementById("status"); el.innerText = t; el.style.color = c; }
function toggleChat(){ let b=document.getElementById("ai-chat-box"); b.style.display=b.style.display==="flex"?"none":"flex"; }
function addMsg(t,c){ let d=document.createElement("div"); d.className="chat-msg "+c; d.innerHTML=t.replace(/\n/g, "<br>"); document.getElementById("chat-content").appendChild(d); }

// [NEW] HÀM ZOOM
function zoomIn(){
    zoomLevel = Math.min(zoomLevel + 10, 300);
    applyZoom();
}
function zoomOut(){
    zoomLevel = Math.max(zoomLevel - 10, 50);
    applyZoom();
}
function applyZoom(){
    const img = document.getElementById("remote-screen");
    if(img) img.style.transform = "scale(" + (zoomLevel/100) + ") translate(" + panX + "px, " + panY + "px)";
}

// [NEW] PINCH ZOOM HANDLING
function getDistance(touch1, touch2) {
    let dx = touch1.clientX - touch2.clientX;
    let dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

const container = document.getElementById("screen-container");

container.addEventListener("touchstart", (e) => {
    // Khóa zoom/pan khi đã bật Mouse Mode
    if (document.getElementById("chkControl").checked) {
        isZoomTouchActive = false;
        console.log("🚫 Mouse Mode ON - Zoom/Pan LOCKED");
        return;
    }
    
    isZoomTouchActive = true;
    
    if (e.touches.length === 2) {
        lastTouchDistance = getDistance(e.touches[0], e.touches[1]);
        console.log("📍 Pinch start, distance: " + lastTouchDistance);
        e.preventDefault();
    }
}, false);

container.addEventListener("touchmove", (e) => {
    // Khóa zoom/pan khi đã bật Mouse Mode
    if (!isZoomTouchActive || document.getElementById("chkControl").checked) {
        return;
    }
    
    if (e.touches.length === 2) {
        let currentDistance = getDistance(e.touches[0], e.touches[1]);
        let scale = currentDistance / lastTouchDistance;
        
        // Zoom in/out based on pinch
        let newZoom = zoomLevel * scale;
        if (newZoom >= 50 && newZoom <= 300) {
            zoomLevel = newZoom;
            console.log("🔍 Zoom: " + Math.round(zoomLevel) + "%");
        }
        
        lastTouchDistance = currentDistance;
        applyZoom();
        e.preventDefault();
    }
    // Single touch - pan khi đã zoom
    else if (e.touches.length === 1 && zoomLevel > 100) {
        let touch = e.touches[0];
        if (!window.lastPanX) window.lastPanX = touch.clientX;
        if (!window.lastPanY) window.lastPanY = touch.clientY;
        
        let dx = touch.clientX - window.lastPanX;
        let dy = touch.clientY - window.lastPanY;
        
        panX = Math.max(-300, Math.min(300, panX + dx));
        panY = Math.max(-300, Math.min(300, panY + dy));
        
        window.lastPanX = touch.clientX;
        window.lastPanY = touch.clientY;
        
        console.log("↔️ Pan X:" + panX + " Y:" + panY);
        applyZoom();
        e.preventDefault();
    }
}, false);

container.addEventListener("touchend", (e) => {
    lastTouchDistance = 0;
    window.lastPanX = null;
    window.lastPanY = null;
    isZoomTouchActive = false;
    console.log("✋ Touch end");
}, false);

// [NEW] RESET ZOOM & PAN
function resetZoom(){
    zoomLevel = 100;
    panX = 0;
    panY = 0;
    applyZoom();
    console.log("↺ Zoom reset to 100%");
}

// [OLD] HÀM ZOOM (chỉ dùng cho PC)
function zoomIn(){
    zoomLevel = Math.min(zoomLevel + 10, 300);
    applyZoom();
}
function zoomOut(){
    zoomLevel = Math.max(zoomLevel - 10, 50);
    applyZoom();
}

function startSnippingMode(){ 
    if (!document.getElementById("remote-screen").src) return alert("Chưa có ảnh!");
    toggleChat(); isSnip=true; 
    document.getElementById("snipping-overlay").style.display="block"; 
    sel.style.display="none"; bar.style.display="none"; 
}
function getPos(e){ return e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY}; }
function startDrag(e){ if(e.target.tagName==="BUTTON")return; isDraw=true; let p=getPos(e); sX=p.x; sY=p.y; sel.style.left=sX+"px"; sel.style.top=sY+"px"; sel.style.width="0"; sel.style.height="0"; sel.style.display="block"; bar.style.display="none"; if(e.type==="mousedown") document.getElementById("snipping-overlay").addEventListener("mousemove",doDrag); }
function doDrag(e){ if(!isDraw)return; let p=getPos(e); sel.style.width=Math.abs(p.x-sX)+"px"; sel.style.height=Math.abs(p.y-sY)+"px"; sel.style.left=Math.min(p.x,sX)+"px"; sel.style.top=Math.min(p.y,sY)+"px"; }
function endDrag(e){ isDraw=false; if(e.type==="mouseup") document.getElementById("snipping-overlay").removeEventListener("mousemove",doDrag); let r=sel.getBoundingClientRect(); if(r.width>20){bar.style.display="flex"; bar.style.left=r.left+"px"; bar.style.top=(r.bottom+10)+"px";} }

// [UPDATE] HÀM GỬI YÊU CẦU ĐƠN GIẢN
function requestHighResImage(act){
    let pPrompt = "";
    if(act==="AI"){ 
        pPrompt=prompt("Hỏi AI gì?"); 
        if(!pPrompt)return; 
        addMsg("👤 <b>Hỏi:</b> " + pPrompt, "msg-user"); 
    }
    
    let img=document.getElementById("remote-screen"), r=sel.getBoundingClientRect(), ir=img.getBoundingClientRect();
    // Tạo chuỗi tọa độ: x,y,w,h
    const coords = ((r.left-ir.left)/ir.width).toFixed(4)+","+((r.top-ir.top)/ir.height).toFixed(4)+","+(r.width/ir.width).toFixed(4)+","+(r.height/ir.height).toFixed(4);
    
    document.getElementById("snipping-overlay").style.display="none"; isSnip=false; toggleChat(); 
    
    if (act === "OCR") {
        addMsg("⏳ Đang OCR (Server)...", "msg-ai");
        dc.send("OCR_REQ:" + coords);
    } else {
        addMsg("⏳ Đang gửi tới Gemini Server...", "msg-ai");
        // Gửi lệnh AI_REQ: Tọa độ | Câu hỏi
        dc.send("AI_REQ:" + coords + "|" + pPrompt);
    }
}





