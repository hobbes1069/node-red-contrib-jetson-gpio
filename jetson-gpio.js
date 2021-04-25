
module.exports = function(RED) {
    "use strict";
    var execSync = require('child_process').execSync;
    var exec = require('child_process').exec;
    var spawn = require('child_process').spawn;

    var testCommand = 'gpiodetect'
    var gpioGetCmd  = 'gpioget';
    var gpioSetCmd  = 'gpioset';
    var gpioMonCmd  = 'gpiomon';
    var gpioInfoCmd = 'gpioinfo';
    var gpiochip    = 'tegra-gpio';
    var gpiomode    = '--mode=signal';
    var allOK = true;

    try {
        execSync(testCommand);
    } catch(err) {
        allOK = false;
        RED.log.warn("jetson-gpio : "+RED._("jetson-gpio.errors.ignorenode"));
    }

    var pinsInUse = {};
    var pinTypes = {"out":RED._("jetson-gpio.types.digout"), "tri":RED._("jetson-gpio.types.input"), "up":RED._("jetson-gpio.types.pullup"), "down":RED._("jetson-gpio.types.pulldown"), "pwm":RED._("jetson-gpio.types.pwmout")};

    const pin2bcm = {"3":2, "5":3, "7":4, "8":14, "10":15, "11":17, "12":18, "13":27,
	"15":22, "16":23, "18":24, "19":10, "21":9, "22":25, "23":11, "24":8, "26":7,
        "29":5, "31":6, "32":12, "33":13, "35":19, "36":16, "37":26, "38":20, "40":21
    }

    function GPIOInNode(n) {
        RED.nodes.createNode(this,n);
        this.buttonState = -1;
        this.pin = n.pin;
        this.bcm = pin2bcm[n.pin];
        this.intype = n.intype;
        this.read = n.read || false;
        this.debounce = Number(n.debounce || 25);
        if (this.read) { this.buttonState = -2; }
        var node = this;
        if (!pinsInUse.hasOwnProperty(this.pin)) {
            pinsInUse[this.pin] = this.intype;
        }
        else {
            if ((pinsInUse[this.pin] !== this.intype)||(pinsInUse[this.pin] === "pwm")) {
                node.warn(RED._("jetson-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
            }
        }

        if (allOK === true) {
            if (node.bcm !== undefined) {
                node.child = spawn(gpioMonCmd, [gpiochip, node.bcm]);
                node.running = true;
                node.status({fill:"yellow",shape:"dot",text:"jetson-gpio.status.ok"});

                node.child.stdout.on('data', function (data) {
                    var d = data.toString().trim().split("\n");
                    for (var i = 0; i < d.length; i++) {
                        if (d[i] === '') { return; }
                        if (node.running && node.buttonState !== -1 && !isNaN(Number(d[i])) && node.buttonState !== d[i]) {
                            node.send({ topic:"jetson/"+node.pin, payload:Number(d[i]) });
                        }
                        node.buttonState = d[i];
                        node.status({fill:"green",shape:"dot",text:d[i]});
                        if (RED.settings.verbose) { node.log("out: "+d[i]+" :"); }
                    }
                });

                node.child.stderr.on('data', function (data) {
                    if (RED.settings.verbose) { node.log("err: "+data+" :"); }
                });

                node.child.on('close', function (code) {
                    node.running = false;
                    node.child = null;
                    if (RED.settings.verbose) { node.log(RED._("jetson-gpio.status.closed")); }
                    if (node.finished) {
                        node.status({fill:"grey",shape:"ring",text:"jetson-gpio.status.closed"});
                        node.finished();
                    }
                    else { node.status({fill:"red",shape:"ring",text:"jetson-gpio.status.stopped"}); }
                });

                node.child.on('error', function (err) {
                    if (err.errno === "ENOENT") { node.error(RED._("jetson-gpio.errors.commandnotfound")); }
                    else if (err.errno === "EACCES") { node.error(RED._("jetson-gpio.errors.commandnotexecutable")); }
                    else { node.error(RED._("jetson-gpio.errors.error",{error:err.errno})) }
                });

            }
            else {
                node.warn(RED._("jetson-gpio.errors.invalidpin")+": "+node.pin);
            }
        }
        else {
            node.status({fill:"grey",shape:"dot",text:"jetson-gpio.status.not-available"});
            if (node.read === true) {
                var val;
                if (node.intype == "up") { val = 1; }
                if (node.intype == "down") { val = 0; }
                setTimeout(function() {
                    node.send({ topic:"jetson/"+node.pin, payload:val });
                    node.status({fill:"grey",shape:"dot",text:RED._("jetson-gpio.status.na",{value:val})});
                },250);
            }
        }

        node.on("close", function(done) {
            node.status({fill:"grey",shape:"ring",text:"jetson-gpio.status.closed"});
            delete pinsInUse[node.pin];
            if (node.child != null) {
                node.finished = done;
                node.child.stdin.write("close "+node.pin);
                node.child.kill('SIGKILL');
            }
            else { done(); }
        });
    }
    RED.nodes.registerType("jetson-gpio in",GPIOInNode);

    function GPIOOutNode(n) {
        RED.nodes.createNode(this,n);
        this.pin = n.pin;
        this.bcm = pin2bcm[n.pin];
        this.set = n.set || false;
        this.level = n.level || 0;
        this.freq = n.freq || 100;
        this.out = n.out || "out";
        var node = this;
        if (!pinsInUse.hasOwnProperty(this.pin)) {
            pinsInUse[this.pin] = this.out;
        }
        else {
            if ((pinsInUse[this.pin] !== this.out)||(pinsInUse[this.pin] === "pwm")) {
                node.warn(RED._("jetson-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
            }
        }

	function gpioset(level) {
	    if (node.child) { node.child.kill('SIGTERM') }
            if (node.out === "out") {
                node.child = spawn(gpioSetCmd, [gpiomode, gpiochip, node.bcm+"="+level]);
                node.status({fill:"green",shape:"dot",text:level});
            } else {
                node.status({fill:"yellow",shape:"dot",text:"jetson-gpio.status.ok"});
		node.time = (1 / node.freq) / 2;
		while (true) {
		    node.child = spawn(gpioSetCmd, ["--mode=time", "--sec="+node.time, gpiochip, node.bcm+"=1"]);
		    node.child = spawn(gpioSetCmd, ["--mode=time", "--sec="+node.time, gpiochip, node.bcm+"=0"]);
                }
            }
	}
	    
        function inputlistener(msg, send, done) {
            if (msg.payload === "true") { msg.payload = true; }
            if (msg.payload === "false") { msg.payload = false; }
            var out = Number(msg.payload);
            var limit = 1;
            if (node.out === "pwm") { limit = 100; }
            if ((out >= 0) && (out <= limit)) {
                if (RED.settings.verbose) { node.log("out: "+out); }
                gpioset(out);
                node.status({fill:"green",shape:"dot",text:msg.payload.toString()});
                }
            else { node.warn(RED._("jetson-gpio.errors.invalidinput")+": "+out); }
        }

        if (allOK === true) {
            if (node.pin !== undefined) {
		gpioset(node.level);

		node.on("input", inputlistener);

                node.child.stdout.on('data', function (data) {
                    if (RED.settings.verbose) { node.log("out: "+data); }
                });

                node.child.stderr.on('data', function (data) {
                    if (RED.settings.verbose) { node.log("err: "+data); }
                });

                node.child.on('close', function (code) {
                    if (RED.settings.verbose) { node.log(RED._("jetson-gpio.status.closed")); }
                    if (node.finished) {
                        node.status({fill:"grey",shape:"ring",text:"jetson-gpio.status.closed"});
                        node.finished();
                    }
                    else if (code == 0) { 
			node.status({fill:"green",shape:"dot",text:"jetson-gpio.status.running"}); }
		    else { node.status({fill:"red",shape:"ring",text:"jetson-gpio.status.stopped"}); }
                });

                node.child.on('error', function (err) {
                    if (err.errno === "ENOENT") { node.error(RED._("jetson-gpio.errors.commandnotfound")); }
                    else if (err.errno === "EACCES") { node.error(RED._("jetson-gpio.errors.commandnotexecutable")); }
                    else { node.error(RED._("jetson-gpio.errors.error")+': ' + err.errno); }
                });

            }
            else {
                node.warn(RED._("jetson-gpio.errors.invalidpin")+": "+node.pin);
            }
        }
        else {
            node.status({fill:"grey",shape:"dot",text:"jetson-gpio.status.not.available"});
            node.on("input", function(msg) {
                node.status({fill:"grey",shape:"dot",text:RED._("jetson-gpio.status.na",{value:msg.payload.toString()})});
            });
        }

        node.on("close", function(done) {
            node.status({fill:"grey",shape:"ring",text:"jetson-gpio.status.closed"});
            delete pinsInUse[node.pin];
            if (node.child != null) {
                node.finished = done;
                node.child.kill('SIGTERM');
            }
            else { done(); }
        });

    }
    RED.nodes.registerType("jetson-gpio out",GPIOOutNode);

    var pitype = { type:"" };
    if (allOK === true) {
        exec(gpioInfoCmd+" info", function(err,stdout,stderr) {
            if (err) {
                RED.log.info(RED._("jetson-gpio.errors.version"));
            }
            else {
                try {
                    var info = JSON.parse( stdout.trim().replace(/\'/g,"\"") );
                    pitype.type = info["TYPE"];
                }
                catch(e) {
                    RED.log.info(RED._("jetson-gpio.errors.sawpitype"),stdout.trim());
                }
            }
        });
    }

    RED.httpAdmin.get('/jetson-gpio/:id', RED.auth.needsPermission('jetson-gpio.read'), function(req,res) {
        res.json(pitype);
    });

    RED.httpAdmin.get('/jetson-pins/:id', RED.auth.needsPermission('jetson-gpio.read'), function(req,res) {
        res.json(pinsInUse);
    });
}
