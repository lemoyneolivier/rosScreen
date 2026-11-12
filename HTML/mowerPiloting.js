
const CONNEXION_OFF = "Not";
const CONNEXION_PENDING = "Connecting";
const CONNEXION_ON = "Ready";
const CONNEXION_TEST = "Test";


var connexionStatus = CONNEXION_OFF;
var mowerLastPosition = {x:0.0, y:0.0, direction:0.0, speed:0.0, totalDistance: 0.0};
var minDist = 0.01;
var mowerPositions = []; // liste des positions enregistrées
var waypoints = [];
var mapDetails = {xMin:-1, yMin:-1, xMax:1, yMax:1, zoom:215.0};

var canvasMap = document.getElementById("dessin");

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
    mowerPositions[0] = mowerLastPosition;
    drawMap(true);
    drawPosition();
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
            img.src = "imgs/connexionWait.png";
        }
    }
}

function addWaypoint() {
    waypoints.push(mowerLastPosition);
    // ajoute une ligne dans le tableau des waypoints
    var points = document.getElementById("odom");
    var row = points.insertRow(-1);
    var cell1 = row.insertCell(0);
    var cell2 = row.insertCell(1);
    var cell3 = row.insertCell(2);
    cell1.innerHTML = mowerLastPosition.time;
    cell2.innerHTML = mowerLastPosition.x;
    cell3.innerHTML = mowerLastPosition.y;
    drawMap (true);
}


// détermine s'il faut garder la position
function addPosition(position) {

    const precision = 3;
    position.x = parseFloat(position.x.toFixed(precision));
    position.y = parseFloat(position.y.toFixed(precision)); 
    const distance = Math.hypot(position.x - mowerLastPosition.x, position.y - mowerLastPosition.y);

    if (distance < 0.001) { // seuil un millimetre
        console.log("Under the distance "+position.direction);
        if (position.direction != mowerLastPosition.direction) {
            mowerLastPosition.direction = position.direction;
            drawPosition();
        }
        return false;
    } else {
        mowerPositions.push(position);
        var dist = mowerLastPosition.totalDistance + distance;
        mowerLastPosition = position;
        mowerLastPosition.totalDistance = dist;

        drawPosition();
        return true;
    }
}


function showStatus () {
    // verifie le statut de connexion avec ARDUINO
    var cxn = getXMLDocument("/update", null);
    if (cxn == null) {  
        writeMessage("ERR", "failed to connect");
        connexionStatus = CONNEXION_OFF;
        showConnexion();

    } else {
        if (connexionStatus != cxn.connexion) {
            connexionStatus = cxn.connexion;
            showConnexion();
        }
    }
    // recupère la dernière position
    if (cxn.position != null) {
        if (addPosition(cxn.position)) {
            // affiche la carte mise à jour
            drawMap(false);
        }
    } else {
        console.log("No position defined");
    }
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
    writeMessage("WARN", "Order executed successfully - ")
}

/*** suppress orders and positions */
function clearData() {
    mowerPositions = [];
    mowerWaypoints = [];
    var odomTable = document.getElementById("odom");
    while( odomTable.rows.length > 1) odomTable.rows[1].remove();
}

// retourne la position de X dans la map
function getX(y) {
    return (y - mapDetails.yMin) * mapDetails.zoom;
}

// retourne la position de X dans la map
function getY(x) {
    return canvasMap.height - (x - mapDetails.xMin) * mapDetails.zoom;
}

/********************************************************
 *   Dessine la zone de tonte et le chemin de la tondeuse
 * Attention, la position de la carte est de bas en haut
 ********************************************************/
function drawMap (force){
    var ctx = canvasMap.getContext('2d');

    //vérifie si la zone de zoon est changée 
    var isChanged = force;
    if (mowerLastPosition.x > mapDetails.xMax) {isChanged = true; mapDetails.xMax = mowerLastPosition.x;}
    if (mowerLastPosition.x < mapDetails.xMin) {isChanged = true; mapDetails.xMin = mowerLastPosition.x;}
    if (mowerLastPosition.y > mapDetails.yMax) {isChanged = true; mapDetails.yMax = mowerLastPosition.y;}
    if (mowerLastPosition.y < mapDetails.yMin) {isChanged = true; mapDetails.yMin = mowerLastPosition.y;}

    if ( isChanged ) {
        var height = mapDetails.xMax - mapDetails.xMin;
        var width = mapDetails.yMax - mapDetails.yMin;
        var zoomX = canvasMap.width / width;
        var zoomY = canvasMap.height / height; 
        mapDetails.zoom = Math.min(zoomX, zoomY);
        console.log("reload the map "+JSON.stringify(mapDetails));

        ctx.clearRect(0, 0, canvasMap.width, canvasMap.height);
        ctx.fillStyle = 'rgb(136, 227, 144)';
        ctx.fillRect(0, 0, canvasMap.width, canvasMap.height);

        ctx.beginPath();
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        ctx.moveTo(getX(-1), getY(0));
        ctx.lineTo(getX(1), getY(0));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(getX(0), getY(-1));
        ctx.lineTo(getX(0), getY(1));
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = 'rgb("#030303")';
    ctx.moveTo(getX(mowerPositions[0].y), getY(mowerPositions[0].x));
    for (var i = 1; i < mowerPositions.length; i++) {
        ctx.lineTo(getX(mowerPositions[i].y), getY(mowerPositions[i].x));
    }
    ctx.stroke();

    // affiche les waypoints comme des cercles
    for (var i = 0; i < waypoints.length; i++) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgb("#FF0000")';
        ctx.arc(getX(waypoints[i].y), getY(waypoints[i].x), 5, 0, 2* Math.PI);
        ctx.stroke();
    }

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
    ctx.rotate(mowerLastPosition.direction+3.14);
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
