const express = require("express");
const fs = require("fs");


const app = express();
const expressWS = require("express-ws")(app);


function getLeftmost(physicsObjects){
    var val = Infinity;
    var obj = undefined;
    physicsObjects.forEach((item, i) => {
        if (item.x < val){
            val = item.x;
            obj = item;
        }
    });
    return obj;
}

function getRightmost(physicsObjects){
    var val = -Infinity;
    var obj = undefined;
    physicsObjects.forEach((item, i) => {
        if (item.x + item.width > val){
            val = item.x + item.width;
            obj = item;
        }
    });
    return obj;
}

function getTopmost(physicsObjects){
    var val = Infinity;
    var obj = undefined;
    physicsObjects.forEach((item, i) => {
        if (item.y < val){
            val = item.y;
            obj = item;
        }
    });
    return obj;
}


function getBottommost(physicsObjects){
    var val = -Infinity;
    var obj = undefined;
    physicsObjects.forEach((item, i) => {
        if (item.y + item.height > val){
            val = item.y + item.height;
            obj = item;
        }
    });
    return obj;
}


class IndexableIOWrapper{
    constructor(data){
        this.indexable = data;
        this.index = 0;
    }
    read(){
        this.index ++;
        return this.indexable[this.index - 1];
    }
}


class PhysicsObject{
    constructor(game, x, y, width, height, physicsConfig){
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.isStatic = true;
        if (physicsConfig != undefined){
            this.initializePhysics(physicsConfig);
        }
    }

    initializePhysics(){
        this.isStatic = false;
        this.xv = 0;
        this.yv = 0;
        this.gravity = {
            x: 0,
            y: 1
        };
        this.friction = {
            x: 0.8,
            y: 1
        };
        this.touching = {
            left: false,
            right: false,
            top: false,
            bottom: false
        }
        this.stopWhenHit = {
            x: true,
            y: true
        }
        this.collisions = ["solid"];
        this.specialCollisions = [];
    }

    update(){
        if (!this.isStatic){
            this.xv += this.gravity.x;
            this.yv += this.gravity.y;
            this.xv *= this.friction.x;
            this.yv *= this.friction.y;
            this.move(this.xv, 0);
            this.touching.right = false;
            this.touching.left = false;
            var coll = this.doCollision(this.game.checkCollision(this));
            if (coll[0] > 0){
                if (this.xv == 0){
                    this.xv = 1; // Make it eject.
                }
                if (this.xv > 0){
                    this.touching.right = true;
                    var leftmost = getLeftmost(coll[1]);
                    this.x = leftmost.x - this.width;
                }
                else{
                    this.touching.left = true;
                    var rightmost = getRightmost(coll[1]);
                    this.x = rightmost.x + rightmost.width;
                }
                if (this.stopWhenHit.x){
                    this.xv = 0;
                }
                this.solidXCollision();
            }
            this.move(0, this.yv);
            this.touching.top = false;
            this.touching.bottom = false;
            coll = this.doCollision(this.game.checkCollision(this));
            if (coll[0] > 0){
                if (this.yv == 0){
                    this.yv = 1; // Ejectify! This helps solve my weird physics engine bugs.
                }
                /*while (coll[0] > 0){
                    this.move(0, -this.yv / Math.abs(this.yv));
                    coll = this.doCollision(this.game.checkCollision(this));
                }*/
                if (this.yv > 0){
                    this.touching.bottom = true;
                    var topmost = getTopmost(coll[1]);
                    this.y = topmost.y - this.height;
                }
                else{
                    this.touching.top = true;
                    var bottomMost = getBottommost(coll[1]);
                    this.y = bottomMost.y + bottomMost.height;
                }
                if (this.stopWhenHit.y){
                    this.yv = 0;
                }
                this.solidYCollision();
            }
        }
    }

    move(xm, ym){
        this.x += xm;
        this.y += ym;
    }

    doCollision(coll){
        var ret = [0, []];
        this.collisions.forEach((item, i) => {
            ret[0] += coll[item][0];
            ret[1].push(...coll[item][1]);
        });
        this.specialCollisions.forEach((item, i) => {
            if (coll[item][0] > 0){
                if (this.specialCollision(item, coll[item])){
                    ret[0] += coll[item][0];
                    ret[1].push(...coll[item][1]);
                }
            }
        });
        return ret;
    }

    specialCollision(thing){ // Override Me

    }

    solidXCollision(){ // Override Me

    }

    solidYCollision(){ // Override Me

    }
}


class Brick extends PhysicsObject{
    constructor(id, renderClass, type, x, y, width, height, game, physics){
        super(game, x, y, width, height, physics);
        this.id = id;
        this.renderClass = renderClass;
        this.type = type;
        this.game = game;
        this.needsRenderUpdate = true;
    }

    apply(){
        if (this.needsRenderUpdate){
            this.game.sendToAll("BU " + this.id + " " + this.x + " " + this.y + " " + this.width + " " + this.height);
            this.needsRenderUpdate = false;
        }
    }

    reload(){ // All bricks should reload upon new player logins.
        this.game.sendToAll("NB " + this.id + " " + this.renderClass + " " + this.type); // Clients should detect double-NewBrick commands and ignore them
        this.needsRenderUpdate = true;
        this.apply();
    }

    remove(){
        this.game.sendToAll("RB " + this.id);
    }

    move(xm, ym){
        super.move(xm, ym);
        this.needsRenderUpdate = true;
    }
}


class Player extends PhysicsObject{
    constructor(id, x, y, width, height, socket, game){
        super()
        this.socket = socket;
        this.id = id;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.game = game;
        this.needsRenderUpdate = true;
        this.initialized = false;
        this.keysDown = {};
        this.xv = 0;
        this.yv = 0;
        this._score = 0;
        this.jumpthrough = false;
        this.initializePhysics(); // No physics config yet
        this.specialCollisions.push("tencoin");
        this.specialCollisions.push("fiftycoin");
        this.specialCollisions.push("jumpthrough");
        this.monkeyFrames = 0;
    }

    get score(){
        return this._score;
    }

    set score(val){
        this._score = val;
        this.game.sendToAll("SC " + this.id + " " + this._score);
    }

    onmessage(data){
        var tokens = new IndexableIOWrapper(data.split(" "));
        var tok = tokens.read();
        if (tok == "KD"){
            var key = tokens.read();
            this.keysDown [key] = true;
            this.keyDown(key);
        }
        else if (tok == "KU"){
            var key = tokens.read();
            this.keysDown [key] = false;
            this.keyUp(key);
            if (key == "67"){
                this.x = this.game.spawnPoint.x;
                this.y = this.game.spawnPoint.y;
                this.game.sendToAll("NB -1 " + this.x + " " + this.y + " 1 1")
            }
        }
        else if (tok == "CH"){
        }
    }

    send(message){
        this.socket.send(message);
    }

    specialCollision(type, object){
        if (type == "tencoin"){
            object[1].forEach((item, i) => {
                this.game.deleteBrick(item);
            });
            this.score += object[0] * 10;
        }
        else if (type == "fiftycoin"){
            object[1].forEach((item, i) => {
                this.game.deleteBrick(item);
            });
            this.score += object[0] * 50;
        }
        else if (type == "jumpthrough"){
            console.log("Yessss");
            return true;
        }
    }

    update(){
        super.update();
        if (this.keysDown["37"] || this.keysDown["65"]){ // Left
            this.xv -= 3;
        }
        if (this.keysDown["39"] || this.keysDown["68"]){ // Right
            this.xv += 3;
        }
        if (this.touching.bottom){
            this.monkeyFrames = 10;
        }
        if ((this.keysDown["38"] || this.keysDown["87"]) && (this.touching.bottom || this.monkeyFrames > 0)){ // Jump
            this.yv = -20;
            this.monkeyFrames = -1;
        }
        this.monkeyFrames --;
    }

    die(){
        this.game.kill(this);
    }

    keyDown(key){
        if (key == "83"){
            this.game.specials.forEach((item, i) => {
                item.call(this);
            });
        }
    }

    keyUp(key){

    }

    _renderUpdate(){
        this.game.sendToAll("PU " + this.id + " " + this.x + " " + this.y + " " + this.width + " " + this.height);
    }

    _newPlayer(){
        this.game.sendToAll("NP " + this.id);
    }

    apply(){
        if (!this.initialized){
            this.initialized = true;
            this.send("RP " + this.id);
        }
        if (this.needsRenderUpdate){
            this._renderUpdate();
            this.needsRenderUpdate = false;
        }
    }

    reload(){
        this._newPlayer();
        this._renderUpdate();
        this.needsRenderUpdate = false;
    }

    move(xm, ym){
        this.x += xm;
        this.y += ym;
        this.needsRenderUpdate = true;
    }

    remove(){
        this.game.sendToAll("KP " + this.id);
        this.socket._events = {};
        //this.socket.close();
        delete this.socket;
    }
}


class GoombaEnemy extends Brick{
    constructor(id, renderClass, type, x, y, width, height, game, config){
        console.log("my x: " + x);
        super(id, renderClass, type, x, y, width, height, game);
        this.initializePhysics();
        this.xv = config.xSpeed || 5;
        this.followPlayer = config.followPlayer || false;
        this.followerFriction = config.followerFriction || 0.9;
        this.followerSpeed = config.followerSpeed || 1;
        if (!this.followPlayer){
            this.friction.x = 1;
            this.stopWhenHit.x = false;
        }
        this.specialCollisions.push("player");
        this.collisions.push("player"); // Bounce off players AND do a callback.
        this.specialCollisions.push("tencoin");
        this.specialCollisions.push("fiftycoin");
    }

    update(){
        super.update();
        if (this.followPlayer){
            var nearest = this.game.getNearestPlayer(this, true, false); // X-axis, Y-axis.
            if (nearest[0] != undefined){
                var dif = nearest[0].x - this.x;
                this.xv += this.followerSpeed * Math.abs(dif)/dif;
                this.xv *= this.followerFriction;
            }
        }
    }

    solidXCollision(){
        this.xv *= -1;
    }

    specialCollision(type, objects){
        if (type == "player"){
            objects[1].forEach((item, i) => {
                item.die();
            });
        }
        else if (type == "tencoin" || type == "fiftycoin"){
            objects[1].forEach((item, i) => {
                this.game.deleteBrick(item);
            });
        }
    }

    call(){
        // nothin' for now
    }
}


class FlyerEnemy{
    constructor(game, brick, config){
        this.game = game;
        this.brick = brick;
        this.yv = 0;
        this.xv = 0;
        this.friction = config.friction || 0.8;
        this.speed = config.speed || 5;
        this.freezeFrame = 0;
    }

    update(){
        var nearest = this.game.getNearestPlayer(this.brick, true, true);
        if (nearest[0] != undefined){
            this.freezeFrame ++;
            if (this.freezeFrame > 100){
                this.freezeFrame = 0;
            }
            if (this.freezeFrame < Infinity){
                if (nearest[0].x > this.brick.x){
                    this.xv ++;
                }
                else{
                    this.xv --;
                }
                if (nearest[0].y > this.brick.y){
                    this.yv += this.speed;
                }
                else {
                    this.yv -= this.speed;
                }
                this.yv *= this.friction;
                this.xv *= this.friction;
                this.brick.move(this.xv, 0);
                if (this.game.checkCollision(this.brick, true)["solid"] > 0){
                    while (this.game.checkCollision(this.brick, true)["solid"] > 0){
                        this.brick.move(-Math.abs(this.xv)/this.xv, 0);
                    }
                    this.xv = 0;
                }
                this.brick.move(0, this.yv);
                if (this.game.checkCollision(this.brick, true)["solid"] > 0){
                    while (this.game.checkCollision(this.brick, true)["solid"] > 0){
                        this.brick.move(0, -Math.abs(this.yv)/this.yv);
                    }
                    this.yv = 0;
                }
            }
        }
        else {
            this.brick.move(0, -10); // It's gonna be absolutely evil. Randomly resets itself then drops on players after decimating them.
        }
    }

    call(){
        // nothin' for now
    }
}


class SwooperEnemy extends Brick{
    constructor(id, renderClass, type, x, y, width, height, game, config = {}){
        super(id, renderClass, type, x, y, width, height, game);
        this.initializePhysics();
        this.game = game;
        this.yv = config.yv || 0;
        this.xv = 0;
        var realFriction = config.friction || 0.9;
        this.friction.x = realFriction;
        this.friction.y = realFriction;
        this.gravity.x = 0;
        this.gravity.y = 0;
        this.speed = config.speed || 0.65;
        this.specialCollisions.push("player");
    }

    update(){
        super.update();
        var nearest = this.game.getNearestPlayer(this, true, true);
        if (nearest[0] != undefined){
            var distX = Math.abs((nearest[0].x + nearest[0].width/2) - (this.x + this.width/2));
            if (nearest[0].x > this.x){
                this.xv += this.speed * 2 * (distX/100);
            }
            else{
                this.xv -= this.speed * 2 * (distX/100);
            }
            if (distX != 0){
                var distY = nearest[0].y - this.y;
                this.yv += (100 - distX) / (50 / this.speed) * Math.abs(distY)/distY;
            }
        }
        else {
            //this.yv = -4;
        }
    }

    specialCollision(type, objects){
        if (type == "player"){
            objects[1].forEach((item, i) => {
                item.die();
            });
        }
    }

    call(player){
        /*this.brick.x = player.x + player.width/2;
        this.brick.y = player.y - 50;
        this.xv = 0;
        this.yv = -5;*/ // Trigger some bugs! YAAAAYYYYY!
        var brick = this.game.create(player.x/50, player.y/50 - 1, 0.5, 0.5, "lava", "killu");
        brick.reload();
        this.game.special(new SwooperEnemy(this.game, brick, {yv: -5}));
    }
}


class Bomb extends Brick{
    constructor(game, brick, config = {}){
        this.brick = brick;
        this.game = game;
        this.ticksLeft = config.time || 100;
        this.explosionSize = config.explosionSize || 400;
    }

    update(){
        this.ticksLeft --;
        if (this.ticksLeft == 2){
            this.brick.width = this.explosionSize;
            this.brick.x -= this.explosionSize / 2;
            this.brick.y -= this.explosionSize / 2;
            this.brick.height = this.explosionSize;
            this.brick.needsRenderUpdate = true;
        }
        if (this.ticksLeft == 0){
            var coll = this.game.checkCollision(this.brick);
            this.game.deleteBrick(this);
        }
    }
}


class FirstLevel{
    constructor(game){
        game.createNormal(-2, 0, 1, 4);
        game.createNormal(-2, 4, 16, 1);
        //game.createNormal(7, 2, 1, 2);
        //game.create(0, -1, 1, 1, "coin", "tencoin");
        //game.create(1, -1, 1, 1, "coin", "fiftycoin");
        //game.create(14, -1, 1, 1, "coin", "fiftycoin");
        game.createNormal(13, 2, 1, 1);
        game.createNormal(-1, 2, 1, 1);
        game.createNormal(12, -3, 4, 1);
        game.createNormal(2, -3, 1, 3);
        game.createNormal(4, -4, 1, 3);
        //game.createNormal(2, 3,  1, 1);
        /*game.createSpecial(3, 1, 1, 1, "lava", "killu", GoombaEnemy, {
            xSpeed: 10
        });*/
        //game.createSpecial(12, -5, 0.5, 0.5, "lava", "killu", SwooperEnemy, {speed: 0.65, friction: 0.9})
        //game.special(new Bomb(game, game.create(5, -5, 1, 1, "bomb", "bomb"), {time: 500}));
        game.createNormal(14, 0, 1, 5);
        //game.create(0, -2, 2, 1, "jumpthrough", "jumpthrough");
        game.setSpawnPoint(-2, -4);
    }

    run(game){
        if (Math.random() > 0.9){
            var x = Math.floor(Math.random() * (game.box.x2 - game.box.x1 - 1)) + game.box.x1;
            var y = Math.floor(Math.random() * (game.box.y2 - game.box.y1 - 1)) + game.box.y1;
            var b = game.create(x, y, 1, 1, "coin", Math.random() > 0.1 ? "tencoin" : "fiftycoin");
            if (game.checkCollision(b)["all"][0] > 0){
                //b.remove();
                game.tileset.splice(game.tileset.indexOf(b), 1);
            }
            else{
                b.reload();
            }
        }
    }
}


class GameServer{ // Simulating multiple levels would be awful for a server, so I'm just gonna simulate a single one at all time.
    constructor(blockwidth, blockheight){
        this.box = { // Eventually use for max extent purposes.
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 1
        }
        this.frame = 0;
        this.blockwidth = blockwidth;
        this.blockheight = blockheight;
        this.tileset = [];
        this.players = [];
        this.specials = [];
        this.levels = [];
        this.topPlayerID = 0;
        this.topBrickID = 0;
        this.spawnPoint = {
            x: 0,
            y: 0
        }
        app.ws('/game', (data) => {
            this.connection(data);
        });
        console.log("Starting a server");
        this.activeLevel = new FirstLevel(this);
    }

    _create_raw(x, y, width, height, renderClass, type) {
        this.topBrickID ++;
        var thing = new Brick(this.topBrickID, renderClass, type, x, y, width, height, this);
        this.tileset.push(thing);
        return thing;
    }

    create(x, y, width, height, renderClass, type) {
        if (x < this.box.x1){
            this.box.x1 = x;
        }
        if (y < this.box.y1){
            this.box.y1 = y;
        }
        if (x + width > this.box.x2){
            this.box.x2 = x + width;
        }
        if (y + height > this.box.y2){
            this.box.y2 = y + height;
        }
        return this._create_raw(x * this.blockwidth, y * this.blockheight, width * this.blockwidth, height * this.blockheight, renderClass, type);
    }

    createNormal(x, y, width, height){
        return this.create(x, y, width, height, "normal", "solid");
    }

    createSpecial(x, y, width, height, renderClass, type, specialType, specialConfig){
        this.topBrickID ++;
        var thing = new specialType(this.topBrickID, renderClass, type, x * this.blockwidth, y * this.blockheight, width * this.blockwidth, height * this.blockheight, this, specialConfig);
        this.tileset.push(thing);
        return thing;
    }

    getNearestPlayer(brick, xaxis, yaxis){
        var nearestDist = Infinity;
        var nearest = undefined;
        this.players.forEach((item, i) => {
            var itemDist = 0;
            var xDist = Math.abs(brick.x - item.x);
            var yDist = Math.abs(brick.y - item.y);
            if (xaxis && yaxis){
                itemDist = Math.sqrt(xDist * xDist + yDist * yDist);
            }
            else if (xaxis){
                itemDist = xDist;
            }
            else if (yaxis){
                itemDist = yDist;
            }
            if (itemDist < nearestDist){
                nearestDist = itemDist;
                nearest = item;
            }
        });
        return [nearest, nearestDist];
    }

    setSpawnPoint(x, y){
        this.spawnPoint.x = x * this.blockwidth;
        this.spawnPoint.y = y * this.blockheight;
    }

    get blockWidth(){
        console.log("You tried to access blockWidth with a capital W, instead of blockwidth with a lowercase w.");
        return 3.1415 * 100;
    }

    get blockHeight(){
        console.log("You tried to access blockHeight with a capital H, instead of blockheight with a lowercase h.");
        return 700;
    }

    connection(socket, req) {
        console.log("New player!");
        this.topPlayerID ++;
        var player = new Player(this.topPlayerID, this.spawnPoint.x, this.spawnPoint.y, this.blockwidth, this.blockheight * 2, socket, this);
        socket.on('message', (data) => {
            player.onmessage(data);
        });
        socket.on('close', (event) => {
            player.remove();
            this.players.splice(this.players.indexOf(player), 1);
        });
        this.players.push(player);
        this.players.forEach((item, i) => {
            item.reload();
        });
        this.tileset.forEach((item, i) => {
            item.reload();
        });
    }

    sendToAll(msg){
        this.players.forEach((item, i) => {
            item.send(msg);
        });
    }

    update(){
        this.frame ++;
        this.players.forEach((item, i) => {
            item.update();
        });
        this.tileset.forEach((item, i) => {
            item.update();
        });
        this.players.forEach((item, i) => {
            item.apply();
        });
        this.tileset.forEach((item, i) => {
            item.apply();
        });
        this.activeLevel.run(this);
    }

    checkCollision(object){
        var collisionSet = {
            "solid": [0, []],
            "killu": [0, []],
            "tencoin": [0, []],
            "fiftycoin": [0, []],
            "jumpthrough": [0, []],
            "player": [0, []],
            "all": [0, []]
        };

        this.tileset.forEach((item, i) => {
            if (item.x + item.width > object.x &&
                item.x < object.x + object.width &&
                item.y + item.height > object.y &&
                item.y < object.y + object.height &&
                item != object){
                    collisionSet[item.type][0] ++;
                    collisionSet[item.type][1].push(item);
                    collisionSet["all"][0] ++;
                    collisionSet["all"][1].push(item);
                }
        });

        this.players.forEach((item, i) => {
            if (item.x + item.width > object.x &&
                item.x < object.x + object.width &&
                item.y + item.height > object.y &&
                item.y < object.y + object.height){
                    collisionSet["player"][0] ++;
                    collisionSet["player"][1].push(item);
                    collisionSet["all"][0] ++;
                    collisionSet["all"][1].push(item);
                }
        });

        return collisionSet;
    }

    deleteBrick(brick){
        brick.remove();
        this.tileset.splice(this.tileset.indexOf(brick), 1);
    }

    kill(player){
        player.remove();
        this.players.splice(this.players.indexOf(player), 1);
    }
}


app.use(express.static("pub"));


app.listen(8000, () => {
    console.log("Multiplatformer gameserver running");
});

game = new GameServer(50, 50);
function main(){
    game.update();
}
setInterval(main, 20);
