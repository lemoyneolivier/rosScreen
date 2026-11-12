const http = require("http");
const fs = require("fs");
const path = require("path");
// gestion de la connexion avec ROS - utile uniquement dans un environnement avec ROS2 installé et sourcé
var rclnodejs;
/*********************************************************** 
// 2 Node ROS de gestion de la tondeuse
//  - listener d'odometrie
//  - writer de 
************************************************************/
var listenerOdomMower;
var publisherCmdvelMower;
var publisherNode;
var publisherCmdvelMower;

// angle d'avancement en radius 
var mowerPosition = {
  x : 0,
  y : 0, 
  speed : 0,
  direction : 0
}

//dirname = "c:/Users/a025237/Code/";
/*****************************
 * Liste des positions /odom
******************************/
const mowerPositions = [];

/******************************
 * Liste des ordres envoyés au robot
 ******************************/
const mowerOrders = [];

/******************************
 *  connexion status 
 * ****************************/
var isConnected = false;  


const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

/** récupere les données du fichier de configuration passé en paramètre */
var config = {};
if (process.argv.length > 2) {
  if (fs.existsSync(process.argv[2])) {
    let rawdata = fs.readFileSync(process.argv[2]);
    config = JSON.parse(rawdata);
  } else { 
    console.log("Defined config file not found !\n"+process.argv[2]);
    return 1;
  }
} else  {
  if (fs.existsSync("./config.json")) {
    let rawdata = fs.readFileSync("./config.json");
    config = JSON.parse(rawdata);
  } else {
    console.log("Default config file not found !");
    return 1;
  }
}

/**** reading the configuration  ******/
//const publicDir = path.resolve(__dirname)+'/HTML';
const publicDir = path.resolve(config.serverPath);
const logfile = config.logfile;
const testMode = config.testMode;
const logLevelFilter = config.logfileFilter;
const stepFilter = config.stepFilter;
console.log("Logfile set to "+logfile);

var logLevel = 0; // no filter - log
if (logLevelFilter == "W") {
  logLevel = 1;
} 
if (logLevelFilter == "E") {
  logLevel = 2;
} 


// chargement de la librairie de communication
if (!testMode) {
  rclnodejs = require ('rclnodejs');
  rclnodejs.init();

  // Create the listener to odom
  var listenerNode = new rclnodejs.Node('mower_odom_listener_node');
  
  listenerOdomMower = listenerNode.createSubscription ('nav_msgs/msg/Odometry', '/diff_cont/odom', (msg) => {
    // execution of the odometry
    const timestamp =msg.header.stamp.sec;//Math.floor(new Date().getTime() / 1000);
    // Extraction de la position (X, Y, Z)
    const position = msg.pose.pose.position;
    mowerPosition.x = parseFloat(position.x.toFixed(2));
    mowerPosition.y = parseFloat(position.y.toFixed(2));
    // ajouter la vitesse et la direction
    const dir = msg.pose.pose.orientation;
    mowerPosition.direction = Math.atan2(2*dir.w*dir.z, 1-2*Math.pow(dir.z, 2));
    const spd = msg.twist.twist.linear;
    mowerPosition.speed = Math.hypot(spd.x, spd.y);
    
    // Add the position
    addPosition(timestamp, mowerPosition.x, mowerPosition.y, mowerPosition.speed, mowerPosition.direction);
  });
  listenerNode.spin();

  publisherNode = new rclnodejs.Node('mower_cmdvel_publisher_node');
  publisherCmdvelMower = publisherNode.createPublisher('geometry_msgs/msg/TwistStamped', '/diff_cont/cmd_vel');
}


/** récupération des données depuis le dernier lancement */
retrieveStatus();

/*************************************************************
 * Récupération de la sauvegarde du statut du server 
 * Si le fichier de récupération existe, on le lit et 
 * initialise les données avec 
 *************************************************************/
function retrieveStatus () {
}

/************************************************************************
 * Sauvegarde du statut du server 
 * faire régulièrement pour pouvoir redémarrer avec les données en cours
 * les données sont stockées dans un objet JSON d'un fichier TraceFile
 ************************************************************************/
function saveStatus () {
}

const logModule = {
  logfile,
  logLevel,
  /*** function de log  */
  log : function(level, msg) {
    if (level >= logLevel ) {
      var letter = ["L", "W", "E"].at(level);
      var txt = letter+" "+Date.now()+" "+msg+"\n";

      if (this.logfile != "") {
          console.log(txt);
          fs.appendFileSync(logfile, txt);
      } else {
          console.log(txt);
      }
      return txt;
    }
    return "";
  }
}

logModule.logfile = this.logfile;
logModule.logLevel = this.logLevel;

function log(level, msg) {
  logModule.log(level, msg);
}  


executeOrder = function (direction, speed) {
  log(0, "Executing order: "+direction+" at speed "+speed);
  if (testMode) {
    // update of the position - mowerPosition 
    log(0, "Test mode: order not sent to robot");
    if (direction == "Forward") {
      mowerPosition.speed = parseFloat(speed);
    }
    if (direction == "Backward") {
      mowerPosition.speed = -parseFloat(speed);
    }
    if (direction == "Left") {
      mowerPosition.direction -= 0.1;
    }
    if (direction == "Right") {
      mowerPosition.direction += 0.1;
    }
    log(0, "Order "+JSON.stringify(mowerPosition));
  } else {

    // send the order to the robot via the node
    const now = publisherNode.getClock().now();
    var order = {};
    const angle = Math.PI/6.0;
    if (direction == "Forward") {
      order = {
        linear: { x: 0.5, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: 0.0 }
      }
    }
    if (direction == "Backward") {
      order = {
        linear: { x: -0.5, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: 0.0 }
      }
    }
    if (direction == "Left") {
      order = {
        linear: { x: 0.5, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: -angle }
      }
    }
    if (direction == "Right") {
      order = {
        linear: { x: 0.5, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0, z: angle }
      }
    }
    const twistStampedMsg = {
      header: {
        stamp: now.toMsg(),       // Convertit le temps au format {sec, nanosec} attendu par ROS
        frame_id: 'base_link'    // Le repère d'origine du robot
      },
      twist: order
    };
    publisherCmdvelMower.publish(twistStampedMsg);
  }

  return {direction: mowerPosition.direction, speed: speed, time: Math.floor(new Date().getTime() / 1000)};
}


/*************************************************************
 * Ajoute une position au tableau des positions du robot
 * si les positions sont trop proches, on ne les ajoute pas
 *************************************************************/
addPosition = function (timestamp, x, y, s, d) {
  isConnected = true;
  // Vérifie si la position est trop proche d'une position existante
  if (mowerPositions.length > 0) {
    const lastPos = mowerPositions[mowerPositions.length - 1];
    const distance = Math.hypot(x - lastPos.x, y - lastPos.y);

    const precision = config.roundingPrecision || 3;
    x = parseFloat(x.toFixed(precision));
    y = parseFloat(y.toFixed(precision)); 

    if (distance < stepFilter) { // seuil
      return;
    } else {
      mowerPositions.push({time: timestamp, x: x, y: y, speed: s, direction:d});
    }
  } else {
    const precision = config.roundingPrecision || 3;
    if (typeof x === 'string') {
      mowerPositions.push({time: timestamp, x: parseFloat(x), y: parseFloat(y)});
    } else {
      x = parseFloat(x.toFixed(precision));
      y = parseFloat(y.toFixed(precision)); 
      mowerPositions.push({time: timestamp, x: x, y: y, speed: s, direction:d});
    } 
  }
}

/** Gestion de l'odom en mode test */
addRandomPosition = function () {
  log(0, "Random ");
  if (mowerPosition.speed == 0) {
    log(0, "No speed ");
    return;
  } 
  
  const timestamp =Math.floor(new Date().getTime() / 1000);
  const x = Math.random()/10*Math.cos(mowerPosition.direction)*mowerPosition.speed/100;
  const y = Math.random()/10*Math.sin(mowerPosition.direction)*mowerPosition.speed/100;
  log(0, "New speed step "+x+" "+y);

  if (mowerPosition.speed> 0 ) {
      mowerPosition.speed -=10;
      if (mowerPosition.speed < 0) {mowerPosition.speed = 0;} 
  }
  if (mowerPosition.speed< 0 ) {
      mowerPosition.speed +=10;
      if (mowerPosition.speed > 0) {mowerPosition.speed = 0;} 
  }
  mowerPosition.x += x;
  mowerPosition.y += y;
  // Add the position
  log(0, "New position of the mower : "+mowerPosition.x+", "+mowerPosition.y);
  addPosition(timestamp, mowerPosition.x, mowerPosition.y, mowerPosition.speed, mowerPosition.direction);
}

if (testMode) {
      // affiche le status toutes les secondes
    setInterval(addRandomPosition, 1000);
}


/*************************************************************
 * Supprime toutes les positions
 *************************************************************/
cleanPositions = function () {
  mowerPositions.splice(0, mowerPositions.length);
}


/**************************************************************************************************************** 
 * Reading the robot position from ros /odom topic
 *  the position is also added to the mowerPositions array
 ****************************************************************************************************************/
if (!testMode) {
} 



/****************************************************************************************************************
 * MAIN SERVER LISTENER to serve the HTML pages and the API for the mower
 *   functions : 
 *     execute and order
 *     clean positions
 *     clean orders
 *     add an order
 *     list orders
 *     list positions
 ****************************************************************************************************************/
const requestListener = (req, res) => {


    /** execute une sauvargarde des points de position
     *     construit un fichier de sauvegarde des positions du robot
     *     le fichier est nommé avec la date et l'heure du moment de la sauvegarde
     *     le fichier est stocké dans le répertoire de sauvegarde défini dans le fichier de configuration
     *     le fichier est au format CSV avec les colonnes : time, x, y
     *  */
  if (req.url === '/savePositions') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `positions_${timestamp}.csv`;
    const filepath = path.join(config.savePath, filename);
    const csvData = mowerPositions.map(pos => `${pos.time},${pos.x},${pos.y}`).join('\n');
    fs.writeFileSync(filepath, csvData);
    log(0, `Saved ${mowerPositions.length} positions to ${filepath}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `Saved ${mowerPositions.length} positions to ${filepath}` }));
    return;
  }

  /** execute an order
   *    direction : forward, backward, left, right
   *    speed : 0-100
   */  
  if (req.url === '/executeOrder') {
      let body = "";
      req.on("data", data => {
        body += data.toString(); 
      });
      // traitement de la data
      req.on("end", () => {
        var ask = JSON.parse(body);
        // check if the data is well formed
        if (!ask.direction || ask.speed === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: "Invalid request body" }));
          return;
        } 
        // execute the order
        var rep = executeOrder(ask.direction, ask.speed);
        log(0, "Return "+JSON.stringify(rep));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rep));
        return;
      });
      return;
  }

  /***************************************
   *  check the connexion status of the robot
   *   depending on the reciving of /odom topic
   * ***************************************/ 
  if (req.url== '/connexion') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (testMode) {
        res.end(JSON.stringify({connexion:"Test"}));
        return;
      }
      if (isConnected) {
        res.end(JSON.stringify({connexion:"Ready"}));
      } else {
        res.end(JSON.stringify({connexion:"Not"}));
      }
      return;
  }

  /***
   * returns the list of positions of the robot
   */
  if (req.url== '/positions') {
      let body = "";
      req.on("data", data => {
        body += data.toString(); 
      });
      // traitement de la data
      req.on("end", () => {
        var ask = JSON.parse(body);
        // check if the data is well formed
        if (!ask.from === undefined) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mowerPositions));
          return;
        } else {
          var resPosition = mowerPositions.filter(pos => pos.time > ask.from);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resPosition));
        }
      });
      return
  }


    /***
   * returns the list of positions of the robot
   */
  if (req.url== '/positions/clean') {
      cleanPositions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify("ok"));
      return;
  }

  // Normalize the request path
  let reqPath = req.url === '/' ? '/mowerSteering.html' : req.url;
  
  // Strip query string - ?id=123 shouldn't affect file path
  reqPath = reqPath.split('?')[0];
  
  // Resolve path and check it stays within publicDir
  // The '.' prefix prevents absolute paths from being resolved incorrectly
  const safePath = path.resolve(publicDir, '.' + reqPath);
  
  // Critical security check: ensure resolved path is within publicDir
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403, { 'X-Content-Type-Options': 'nosniff' });
    res.end('Forbidden '+reqPath);
    return;
  }
  
  // Check if file exists and is actually a file (not a directory)
  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'X-Content-Type-Options': 'nosniff' });
      res.end('File not found '+safePath);
      return;
    }
    
    // Determine MIME type from file extension
    const ext = path.extname(safePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff"); // Prevents MIME sniffing attacks
    res.writeHead(200);
    
    // Stream file instead of loading into memory
    // Critical for large files - won't consume all memory
    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
    
    stream.on('error', () => {
      // File might be deleted between stat() and createReadStream()
      res.writeHead(500, { 'X-Content-Type-Options': 'nosniff' });
      res.end('Server error');
    });
  });
}



/****Start of the server */
const port = config.serverPort;
const server = http.createServer(requestListener);
server.listen(port, config.serverAddress, () => {
  log(0, `Server is running on ${config.serverAddress}:${port}`);
  log(0, `Serving static files from: ${publicDir}`);
});
