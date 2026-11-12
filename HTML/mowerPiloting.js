
const CONNEXION_OFF = -1;
const CONNEXION_PENDING = 0;
const CONNEXION_ON = 1;
const CONNEXION_TEST = 2;


var connexionStatus = CONNEXION_OFF;
var mowerDirection = 0;
var mowerLastPosition = {};

// message imprimés à l'écran en bande déroulante au format HH:MM:SS - INFO|WARN|ERR - Message (taille limitée)
// Les messages restent un temps limité à l'écran
var messages = [];

/************************************************************************
 *   interface avec le serveur pour récupérer les données
 ************************************************************************/ 
function getXMLDocument (fname, data) {
	var xhttp = new XMLHttpRequest();
    try {
        if (data == null) {
            xhttp.open('GET', fname, false);
            xhttp.send(null);
        } else {
            xhttp.open('POST', fname, false);
            xhttp.send(JSON.stringify(data));
        }
    } catch (error) {
        writeMessage("ERR", "Connexion failure : "+error.message);
        connexionStatus = CONNEXION_OFF;
        return;
    }
        
    // Place the response in an XML document.
    var xmlDoc = xhttp.response;
    return JSON.parse(xmlDoc);
}

/** gestion des messages */
function writeMessage(type, msg) {
    // Ajoute un message à la liste des informations et supprime les vieux (+ 10sec)
    var tme = Date.now()/1000; // time en mode unix
    // Parcours la liste des messages
    var tab = messages.filter(u => u.time > tme-10);
    // Ajoute le message au tablleau
    tab.push({time:tme, type:type, message:msg.substring(0, 90)});
    messages = tab;
    console.log("MSG : "+msg+" "+tab.length);
    showMessages();
}
// Affiche la liste des messages
function showMessages() {
    // Ajoute un message à la liste des informations et supprime les vieux (+ 10sec)
    var tme = Date.now()/1000; // time en mode unix
    // Parcours la liste des messages
    var tab = messages.filter(u => u.time > tme-10);
    messages = tab;

    // uniquement les 3 derniers
    var msgs = "";
    var nb = 0;
    for (const e of messages.toReversed()) {
        if (nb < 3) {
            const date = new Date(e.time * 1000);
            var color = "balck;";
            if (e.type == "ERR") {
                color= "#F75;";
            }
            if (e.type == "WARN") {
                color= "yellow;";
            }
            var txt ="<span style=\"color: "+color+"\">"+date.toLocaleTimeString('fr-FR') + " "+ e.type+" "+e.message+"<br/></span>";
            msgs += txt;
            nb ++;
        }        
    }

    var msgDiv = document.getElementById("logArea");
    msgDiv.innerHTML = msgs;
}

/************************************************************************
 *   Chargement des données au démarrage
 ************************************************************************/ 
function loadFile() {
    showStatus();
    // affiche le status toutes les secondes
    setInterval(showStatus, 1000);
}

function showConnexion () {
    if (connexionStatus == CONNEXION_OFF) {
        var img = document.getElementById("connexion");
        img.src = "imgs/connexionOff.png";
    } else {
        if (connexionStatus == CONNEXION_ON) {
            var img = document.getElementById("connexion");
            img.src = "imgs/connexionOn.png";
        } else if (connexionStatus == CONNEXION_TEST) {
            var img = document.getElementById("connexion");
            img.src = "imgs/connexionTest.png";
        } else { // PENDING
            var img = document.getElementById("connexion");
            img.src = "imgs/connexionPending.png";
        }
    }
}


function showStatus () {
    // verifie le statut de connexion avec ARDUINO
    var cxn = getXMLDocument("/connexion", null);
    if (cxn == null) {  
        writeMessage("ERR", "failed to connect");
        connexionStatus = CONNEXION_OFF;
    }
    if (cxn.connexion == "Test") {
        connexionStatus = CONNEXION_TEST;
        showConnexion();
    } 
    if (cxn.connexion == "Ready") {
        connexionStatus = CONNEXION_ON;
        showConnexion();
    } 
    if (cxn.connexion == "Connecting") {
        writeMessage("ERR", "Connecting ongoing");
        connexionStatus = CONNEXION_PENDING;    //
        showConnexion();
        return;
    }
    if (cxn.connexion == "Not") {
        writeMessage("ERR", "Not connected");
        connexionStatus = CONNEXION_OFF;
        showConnexion();
        return;
    }
    // recherche la liste des position et affiche
    var odomTable = document.getElementById("odom");
    var nbRows = odomTable.rows.length-1;
    // get the last time in the table
    var lastTime =0;
    if (nbRows == 0) {
        lastTime = 0;
    } else {
        lastTime = odomTable.rows[nbRows].cells[0].innerHTML;
    }
    var odoms = getXMLDocument("/positions", {from : lastTime});
    if (odoms.length > 0) {
        for (var i = 0; i < odoms.length; i++) {
            var odom = odoms[i];
            var row = odomTable.insertRow(-1);
            var cell1 = row.insertCell(0);
            var cell2 = row.insertCell(1);
            var cell3 = row.insertCell(2);
        cell1.innerHTML = odom.time;
        cell2.innerHTML = odom.x;
        cell3.innerHTML = odom.y;
        }
    }
    // redessine la carte avec les positions
    console.log("Drawing map with " + odomTable.rows.length + " positions");
    drawMap(odomTable.rows);
    drawPosition();
}






/** moving the rover to the required direction
 * function that moves are returning the number of points and the position
*/
function executeOrder(dir, speed) {
    var step = {};
    var order = {
        direction : dir,
        speed : speed
    }
    step = getXMLDocument("/executeOrder", order);
    if (step != null) {
        console.log(JSON.stringify(step));
        mowerDirection = step.direction;
    }
    writeMessage("WARN", "Order executed successfully - "+mowerDirection)
}

/*** suppress orders and positions */
function clearData() {
    var step = {};
    step = getXMLDocument("/positions/clean", null);

    var orderTable = document.getElementById("orders");
    while( orderTable.rows.length > 1) orderTable.rows[1].remove();
    var odomTable = document.getElementById("odom");
    while( odomTable.rows.length > 1) odomTable.rows[1].remove();
}

/********************************************************
 *   Dessine la zone de tonte et le chemin de la tondeuse
 * Attention, la position de la carte est de bas en haut
 ********************************************************/
function drawMap (odoms){
    canvas = document.getElementById("dessin");
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgb(136, 227, 144)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cadre le dessin - definir la zone et le zoom
    // parcourir le tableau des positions et calculer les min et max de x et y
    var minX = -1;
    var maxX = 2;
    var minY = -1;
    var maxY = 2;
    var odomData = [];
    var totalDistance = 0;
    var lastOdom = {x:0, y:0};
    if (odoms.length > 0) {
        for (var i = 1; i < odoms.length; i++) {
            var odom = odoms[i]; // row de la table
            var x = parseFloat(odom.cells[1].innerHTML);
            var y = parseFloat(odom.cells[2].innerHTML);
            odomData.push({x: x, y: y});
            if (x < minX) { minX = x;}
            if (x > maxX) { maxX = x;}
            if (y < minY) { minY = y;}
            if (y > maxY) { maxY = y;}
            totalDistance += Math.hypot((x-lastOdom.x),(y-lastOdom.y));
            lastOdom ={x: x, y: y};
        }
    }


    var height = maxX - minX;
    var width = maxY - minY;
    var zoomX = canvas.width / width;
    var zoomY = canvas.height / height; 
    var zoom = Math.min(zoomX, zoomY);
    // Parcourir le tableau des positions et dessiner les points sur le canvas
    // print axis
    ctx.beginPath();
    ctx.strokeStyle = 'rgb(0, 0, 0)';
    ctx.moveTo((-1 - minY) * zoom, canvas.height- (0 - minX) * zoom);
    ctx.lineTo((1 - minY) * zoom, canvas.height- (0 - minX) * zoom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((0 - minY) * zoom, canvas.height- (-1 - minX) * zoom);
    ctx.lineTo((0 - minY) * zoom, canvas.height- (1 - minX) * zoom);
    ctx.stroke();

    if (odomData.length == 0) {
        writeMessage("ERR", "No odom data to draw");
        return;
    }
    // print the path
    ctx.beginPath();
    ctx.moveTo((odomData[0].y - minY) * zoom, canvas.height- (odomData[0].x - minX) * zoom);
    for (var i = 1; i < odomData.length; i++) {
        var odom = odomData[i];
        var x = (odom.y - minY) * zoom;
        var y = canvas.height- (odom.x - minX) * zoom;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    mowerLastPosition = odomData[odomData.length-1];
    mowerLastPosition.distance = totalDistance;
}



function drawPosition (){
    canvas = document.getElementById("cadranDirection");
    var ctx = canvas.getContext('2d');
    // 2. Charger l'image source (locale ou URL)
    const image = new Image;
    image.src = 'imgs/direction.png';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // dessine la flèche dans la direction
    // Affiche une fleche dans la direction
    ctx.save();
    const centerX = canvas.width / 2+2;
    const centerY = canvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(mowerDirection+3.14);
    ctx.beginPath();
    ctx.fillStyle = 'rgb(255, 0, 0)';
    ctx.moveTo(0, 60);
    ctx.lineTo(10, 30);
    ctx.lineTo(-10, 30);
    ctx.lineTo(0, 60);
    ctx.fill();
    ctx.restore();

    if (mowerLastPosition != undefined) {
        var posX = document.getElementById("xPosition");
        posX.innerHTML = mowerLastPosition.x;
        var posY = document.getElementById("yPosition");
        posY.innerHTML = mowerLastPosition.y;
        var dist = document.getElementById ("totalDistance");
        dist.innerHTML = Math.round(mowerLastPosition.distance*100)/100;
    }

}
