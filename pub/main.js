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


class RemoteBrick{
    constructor (id, renderType, type, game){
        this.bid = id;
        this.element = document.createElement("div");
        game.gameEl.appendChild(this.element);
        this.game = game;
        this.element.classList.add(renderType);
        this.element.classList.add(type);
        this.x = -1;
        this.y = -1;
        this.width = -1;
        this.height = -1;
        console.log("My brick type: " + type);
        if (type == "tencoin"){
            this.element.innerHTML = "<span>10</span>";
        }
        else if (type == "fiftycoin"){
            this.element.innerHTML = "<span>50</span>";
        }
        this.lastFrame = -1;
    }

    update(x, y, width, height){
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    _draw(){
        this.element.style.left = this.game.renderXZero - this.game.xPos + parseInt(this.x) + "px";
        this.element.style.top = this.game.renderYZero - this.game.yPos + parseInt(this.y) + "px";
        this.element.style.width = this.width + "px";
        this.element.style.height = this.height + "px";
    }

    remove(){
        this.element.parentNode.removeChild(this.element);
    }
}


class RemotePlayer{
    constructor(pid, game){
        this.id = pid;
        this.score = 0;
        this.game = game;
        this.width = -1;
        this.height = -1;
        this.x = -1;
        this.y = -1;
        this.element = document.createElement("div");
        this.game.gameEl.appendChild(this.element);
        this.element.classList.add("player");
        var colors = ["green", "red", "yellow", "orange", "blue", "purple"];
        this.element.style.backgroundColor = colors[(parseInt(this.id) - 1) % colors.length]; // -1 for zero-index.
    }

    update(x, y, width, height){
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    _draw(){
        this.element.style.left = (parseInt(this.x) + this.game.renderXZero - this.game.xPos) + "px";
        this.element.style.top = (parseInt(this.y) + this.game.renderYZero - this.game.yPos) + "px";
        this.element.style.width = this.width + "px";
        this.element.style.height = this.height + "px";
    }

    remove(){
        this.element.parentNode.removeChild(this.element);
    }

    scoreChange(score){
        this.element.innerHTML = score;
        this.score = parseInt(score);
    }

    clear(){
        this.socket = null;
        delete this.socket;
    }
}


class Game{
    constructor(gm, url="ws://" + location.host + "/game", gameEl = document.getElementById("game")){
        console.log("Connecting to game at: " + url);
        this.gameEl = gameEl;
        this.socket = new WebSocket(url);
        this.socket.onmessage = (data) => {
            this.onmessage(data);
        }
        this.socket.onclose = () => {
            gm.end();
        }
        this.pid = -1;
        this.world = {
            players: {},
            bricks: {}
        }
        this.renderXZero = -1;
        this.renderYZero = -1;
        this.xPos = 0;
        this.yPos = 0;
        document.onkeydown = (event) => {
            this.socket.send("KD " + event.keyCode);
        };
        document.onkeyup = (event) => {
            this.socket.send("KU " + event.keyCode);
        };
    }

    onmessage(data){
        var tokens = new IndexableIOWrapper(data.data.split(" "));
        var tok = tokens.read();
        if (tok == "NP"){ // New Player
            var id = tokens.read();
            if (this.world.players[id] == undefined){
                this.world.players [id] = new RemotePlayer(id, this);
            }
        }
        else if (tok == "PU"){ // Player Update
            var id = tokens.read();
            this.world.players [id].update(tokens.read(), tokens.read(), tokens.read(), tokens.read());
            if (this.pid == id){
                this.setZeroes();
            }
        }
        else if (tok == "RP"){
            this.pid = tokens.read();
            this.setZeroes();
        }
        else if (tok == "NB"){ // New Blocktokens.read()
            var id = tokens.read();
            if (this.world.bricks[id] == undefined){
                this.world.bricks [id] = new RemoteBrick(id, tokens.read(), tokens.read(), this);
            }
        }
        else if (tok == "BU"){ // Block Update
            var id = tokens.read();
            this.world.bricks [id].update(tokens.read(), tokens.read(), tokens.read(), tokens.read());
        }
        else if (tok == "KP"){
            var killID = tokens.read();
            if (killID == this.pid){
                this.socket.close();
                delete this.socket;
                this.gameEl.innerHTML = ""; // Erase the entire thing.
                alert("Score: " + this.world.players[this.pid].score);
            }
            else{
                this.world.players[killID].remove();
            }
            delete this.world.players[killID];
        }
        else if (tok == "RB"){ // Remove Block
            var rmID = tokens.read();
            this.world.bricks[rmID].remove();
            delete this.world.bricks[rmID];
            console.log(tokens);
        }
        else if (tok == "SC"){ // Score Change
            var scoreChangeId = tokens.read();
            this.world.players[scoreChangeId].scoreChange(tokens.read());
        }
        if (tok == "PU" || tok == "BU"){
            window.requestAnimationFrame(() => {
                this.draw();
            });
        }
    }

    draw(){
        Object.keys(this.world.players).forEach((item, i) => {
            this.world.players[item]._draw();
        });
        Object.keys(this.world.bricks).forEach((item, i) => {
            this.world.bricks[item]._draw();
        });
    }

    setZeroes(){
        this.renderXZero = (window.innerWidth / 2) - (this.world.players[this.pid].width / 2);
        this.renderYZero = (window.innerHeight / 2) - (this.world.players[this.pid].height / 2);
        this.xPos = parseInt(this.world.players[this.pid].x);
        this.yPos = parseInt(this.world.players[this.pid].y);
    }

    clear(){
        this.players.forEach((item, i) => {
            item.clear();
            this.players.splice(0, 1);
        });
    }
}


class GameManager{
    constructor(){
        this.game = undefined;
    }

    start(){
        this.game = new Game(this);
        document.getElementById("startmenu").style.display="none";
    }

    end(){
        document.getElementById("startmenu").style.display="";
        this.game.clear();
        this.game = null;
        delete this.game;
    }
}

gm = new GameManager();
