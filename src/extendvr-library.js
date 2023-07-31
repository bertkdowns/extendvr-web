"use strict";
// this file is for the extendvr code that can be used across scripts
// it is meant to support apps without changing anything except adding this script to the page,
// as well as allowing apps with specific support for my controller to do hand tracking.
const pixelsPerDegree =5; // number of pixels left or right of the camera that shows the light coming from one degree out from perpendicular from the lens
const trackerRadius = 0.02; // 5 cm (0.05m) radius of the ball
var rightHand;
var leftHand;
var socket;
var trackingImageWidth = 320;
var trackingImageHeight = 240;
var websocketDebug = true;

AFRAME.utils.device.checkHeadsetConnected = () =>{ return true;}
AFRAME.utils.device.isMobile = () =>{ return false;}


window.onload = () =>{
    console.log("window.onload")
    document.querySelector("a-scene").addEventListener("loaded",init)
    
}
function init(){                            // initalise the hands and hand tracking
    console.log("initalising....")
    leftHand = new Controller("LeftHand");
    rightHand = new Controller("RightHand");
    var hands = document.querySelectorAll("[oculus-touch-controls]");
    if(hands.length != 2){
        console.error(hands.length)
    }
    hands.forEach((el) =>{
        if (el.innerHTML.includes("left")){ // find if left or right hand from innerHTML, as oculus-touch-controls.hand is not always set
            leftHand.controller = el;
        } else if (el.innerHTML.includes("right")){
            rightHand.controller = el;
        }
    })
    socket = new WebSocket("ws://192.168.1.5:8887");
    socket.onopen =  function(event) {console.log(event)};//idk
    socket.onclose = function(event) {console.log(event)};//idk
    socket.onerror = function(event) {console.log(event)};//idk
    socket.onmessage = onNewWebSocketData;
}

function onNewWebSocketData(event){            // process new tracking data
    var lines = event.data.split('\n');
    if (websocketDebug == true){
        websocketDebug = false;
        console.log(event.data)
    }
    if (lines.length <= 1) return;
    // first line contains finger+rotation tracking data
    var controllerData = csvToArray(lines[0])
    rightHand.setFingers(controllerData[4],controllerData[5],controllerData[6],controllerData[7],controllerData[8])
    // other lines contain vision tracking data
    rightHand.setPosition(csvToArray(lines[2]),controllerData[0],controllerData[1],controllerData[2],controllerData[3]);
}


///////////////////////////////////////////////// controller class /////////////////////////////////

function setHomeQuat(){
    rightHand.homeQuaternion.copy(rightHand.inputQuaternion).inverse();
}
function next(){
    i++;
    return perms[i]
}
class Controller {
    controller;
    camera;
    angleUp = new LinearDataSmoother(2);
    angleAcross = new LinearDataSmoother(2);
    distanceFromCamera = new LinearStaticDataSmoother(3,0.03);
    // finger tracking variables
    thumb;
    indexFinger
    middleFinger;
    ringFinger;
    pinkieFinger;
    gripButtonDown = false;
    triggerButtonDown = false;
    // variables for the "rotate calibrate" gesture
    RTstartTime; // holds the time gesture recognition started
    RTgestureStarted = false; // true while pinkie + ring finger up
    RTendTime; // holds time you stopped holding your pinkie + ring finger up
    homeQuaternion = new THREE.Quaternion();
    inputQuaternion = new THREE.Quaternion();
    constructor(rigId){
        // setup the camera rig for the controller
        this.camera = document.querySelector("[camera]");
    }
    setFingers(t,i,m,r,p){
        if(t.isNaN || i.isNaN || m.isNaN || r.isNaN || p.isNaN){
            console.log("something's not a number")
            return;
        }
        this.thumb = t; 
        this.indexFinger = i; // each of these is a number between 1 and 100
        this.middleFinger = m;
        this.ringFinger = r;
        this.pinkieFinger = p;
        // emit events; see oculus-touch-controls aframe docs
        if(m > 60 && r > 60 && p > 60){
            // grip button pressed
            if(this.gripButtonDown == false){
                this.controller.emit("gripdown")
                this.gripButtonDown = true;
            }
            if(i > 60){
                // trigger button also pressed
                if(this.triggerButtonDown == false){
                    this.controller.emit("triggerdown")
                }
            }
        } else { // grip button not pressed
            if(this.gripButtonDown){
                this.controller.emit("gripup")
                this.gripButtonDown = false;
            }
        }
        // default rotation gesture processing
        if(i > 70 && m > 70 && r < 20 && p < 20){
            if(this.RTgestureStarted == false){
                this.RTstartTime = new Date().getTime();
                this.RTgestureStarted = true;
            }
        } else if(this.RTgestureStarted){
            this.RTgestureStarted = false;
            this.RTendTime = new Date().getTime();
            if(this.RTendTime - this.RTstartTime < 500){
                // too fast, probably a incorrect reading
                this.RTendTime = 0;
            }
        } else if(this.RTendTime != 0 && m > 60 && r > 60 && p > 60 && i > 60){
            if(new Date().getTime() - this.RTendTime < 1000 ){
                // gesture completed, set offset rotation
                this.homeQuaternion.copy(this.inputQuaternion).inverse();
            } else{
                this.RTendTime = 0;
            }
        }
        this.controller.emit('onFingerData', { 
            thumb:this.thumb,
            index:this.indexFinger,
            middle:this.middleFinger,
            ring:this.ringFinger,
            pinkie:this.pinkieFinger
        })
    }
    setPosition(data,x,y,z,w){ // sets the position and rotation of the controllers
        this.inputQuaternion = new THREE.Quaternion(-z,-x,-y,w);
        if (data.length<4 || isNaN(data[0]) || data[0] == undefined) {
            // if no position tracking data just update rotation
            this.controller.object3D.quaternion.multiplyQuaternions(this.inputQuaternion, this.homeQuaternion);
            return;
        }
        
        
        //CALCULATIONS
        // update the position if we have a decently sized tracking target
        if(data[2]*data[3] > 25){
            // find distance based on the width/height of the ball - smaller = further away. largest width/height reading is more accurate, as unlikely you'll read a value that's too big, but likely you'll read one that's too small.
            if(data[2] > data[3])
                this.distanceFromCamera.setValue( (trackerRadius)/Math.tan((data[2]/pixelsPerDegree)/2* Math.PI/180) );
            else
                this.distanceFromCamera.setValue( (trackerRadius)/Math.tan((data[3]/pixelsPerDegree)/2* Math.PI/180) );
        }
        /// caclulate controller angle based on degrees from center of ball to centre of camera view angle
        // center of ball at x + trackerwidth/2, centre of camera view angle at imagewidth/2
        // divide by pixelsperdegree to get the degrees from centre instead of pixels from centre.
        this.angleUp.setValue(THREE.Math.degToRad( (data[1] + 0.5*data[3] - 120) / pixelsPerDegree))
        this.angleAcross.setValue(THREE.Math.degToRad( (data[0] + 0.5*data[2] - 160) / pixelsPerDegree))
        
        // TRANSLATIONS
        // translate the controller to it's new position
        this.controller.object3D.position.copy(this.camera.object3D.position); // give the controller the same position and rotation of the camera
        this.controller.object3D.setRotationFromQuaternion(this.camera.object3D.quaternion);

        this.controller.object3D.translateX(0.1) // translate 10cm along x axis to account for the fact that the camera on the phone is not at the same place as the viewport camera
        // rotate to point in the direction that the camera has found the ball in
        this.controller.object3D.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.angleUp.value,this.angleAcross.value,0)))
        // move the specified distance in that direction, as found from the size of the ball
        this.controller.object3D.translateZ(this.distanceFromCamera.value *-1);
        // now rotate the controller to the desired rotation based on the arduino data
        
        this.controller.object3D.quaternion.multiplyQuaternions(this.inputQuaternion, this.homeQuaternion);
        // now account for the fact that the tracker ball isn't at the origin of the model, by moving it to compensate
        //this.controller.object3D.translateX(-0.1)

    }
}

/////////////////////////////////////// FUNCTIONS / HELPER CLASSES ///////////////////////////////

function csvToArray(csvData){
    var array = [];
    csvData.split(",").forEach(val =>{
        array.push(parseFloat(val));
    })
    return array;
}

class LinearDataSmoother { // smooths data based on average of latest values
    latestValues = [];
    value = 0;
    constructor(length){
        for(let i = 0; i < length;i++) this.latestValues.push(0);
    }
    setValue(value){
        // update the latestValues array
        this.latestValues.shift();
        this.latestValues.push(value);
        // update the value variable to new average
        this.value = 0;
        this.latestValues.forEach((i)=>{
            this.value+= i;
        }) 
        this.value = this.value/this.latestValues.length;
        return this.value;
    }
}

class StaticDataSmoother { // only responds to large changes in value, not small ones
    staticAmount = 0;
    value = 0;
    constructor(staticAmount){
        this.staticAmount = staticAmount;
    }
    setValue(value){
        if(value > this.value + this.staticAmount){
            //then we have to move it to the minimum amount required to be "close enough"
            this.value = value - this.staticAmount
        } else if(value < this.value - this.staticAmount){
            this.value = value + this.staticAmount
        }
    }
}
class LinearStaticDataSmoother{
    latestValues = [];
    staticAmount = 0;
    value = 0;
    constructor(length,staticAmount){
        this.staticAmount = staticAmount;
        for(let i = 0; i < length;i++) this.latestValues.push(0);
    }
    setValue(value){
        // ensures this is not just static, then runs _setValue on new value if it isnt static
        if(value > this.value + this.staticAmount){
            //then we have to move it to the minimum amount required to be "close enough"
            this._setValue(value - this.staticAmount)
        } else if(value < this.value - this.staticAmount){
            this._setValue(value + this.staticAmount)
        }
    }
    _setValue(value){
        // sets value by using average of latest values
        // update the latestValues array
        this.latestValues.shift();
        this.latestValues.push(value);
        // update the value variable to new average
        this.value = 0;
        this.latestValues.forEach((i)=>{
            this.value+= i;
        }) 
        this.value = this.value/this.latestValues.length;
        return this.value;
    }
}