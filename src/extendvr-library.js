"use strict";
const pixelsPerDegree =5; // number of pixels left or right of the camera that shows the light coming from one degree out from perpendicular from the lens
const trackerRadius = 0.02; // 5 cm (0.05m) radius of the ball
var rightHand;
var leftHand;
var socket;
var trackingImageWidth = 320;
var trackingImageHeight = 240;

AFRAME.registerComponent('extendvr-controller', {
    // this component goes on the oculus-touch controls controller, and 
    // handles all the position and smoothing of the co-ordinates figured out by the rig.
    schema: {
        target:{type:"vec3"}, // stores the xyz position the controller should be at
        // set externally by data from websocket.
    },
    init: function () {
        
    },
    update: function () {},
    tick: function () {
        this.el.object3D.x = this.el.object3D.x * 0.3 + this.data.target.x *0.7;
        this.el.object3D.y = this.el.object3D.y * 0.3 + this.data.target.y *0.7;
        this.el.object3D.z = this.el.object3D.z * 0.3 + this.data.target.z *0.7;
    },
    remove: function () {},
    pause: function () {},
    play: function () {}
});

window.onload = () =>{
    leftHand = new Controller("LeftHand");
    rightHand = new Controller("RightHand");
    var hands = document.querySelectorAll("[oculus-touch-controls]");
    
    hands.forEach((el) =>{
        console.log(el.getAttribute("oculus-touch-controls").hand)
        if (el.getAttribute("oculus-touch-controls").hand == "left"){
            leftHand.controllerEl = el;
        } else if (el.getAttribute("oculus-touch-controls").hand == "right"){
            rightHand.controllerEl = el;
        }
    })
    socket = new WebSocket("ws://192.168.1.5:8887");
    socket.onopen =  function(event) {console.log(event)};//idk
    socket.onclose = function(event) {console.log(event)};//idk
    socket.onerror = function(event) {console.log(event)};//idk
    socket.onmessage = onNewWebSocketData;
}

function onNewWebSocketData(event){
    var lines = event.data.split('\n');
    if (lines.length <= 1) return;
    // first line contains finger+rotation tracking data
    var controllerData = csvToArray(lines[0])
    rightHand.setRotation(controllerData[0],controllerData[1],controllerData[2],controllerData[3]);
    rightHand.setFingers(controllerData[4],controllerData[5],controllerData[6],controllerData[7],controllerData[8])
    // other lines contain vision tracking data
    rightHand.setPosition(csvToArray(lines[2]));
}

class Controller {
    controllerEl;
    camera;
    cameraRigAngle; // entity used to change the angle of the controller from the player
    cameraRigDistance; // entity used to change the distance of the controller from the player
    angleUp = new LinearDataSmoother(2);
    angleAcross = new LinearDataSmoother(2);
    distanceBack = new LinearStaticDataSmoother(3,0.03);
    // finger tracking variables
    thumb;
    indexFinger
    middleFinger;
    ringFinger;
    pinkieFinger;
    gripButtonDown = false;
    triggerButtonDown = false;
    constructor(rigId){
        // setup the camera rig for the controller
        this.camera = document.querySelector("a-camera");
        this.cameraRigAngle = document.createElement("a-entity");
        this.cameraRigAngle.setAttribute("position","0.1 0 0");
        this.cameraRigAngle.id = rigId + "Rig";
        this.cameraRigDistance = document.createElement("a-entity");
        this.cameraRigAngle.id = rigId + "DistanceBack";
        this.cameraRigAngle.appendChild(this.cameraRigDistance);
        this.camera.appendChild(this.cameraRigAngle);
    }
    setRotation(w,x,y,z){
        var rotation = new THREE.Quaternion();
        rotation.set(y*-1,z,x*-1,w);
        // now rotate by the amount we are supposed to
        this.controllerEl.object3D.setRotationFromQuaternion(rotation);
    }
    setFingers(t,i,m,r,p){
        this.thumb = t; 
        this.indexFinger = i; // each of these is a number between 1 and 100
        this.middleFinger = m;
        this.ringFinger = r;
        this.pinkieFinger = p;
        // emit events; see oculus-touch-controls aframe docs
        if(m > 60 && r > 60 && p > 60){
            // grip button pressed
            if(this.gripButtonDown == false){
                this.controllerEl.emit("gripdown")
                this.gripButtonDown = true;
            }
            if(i > 60){
                // trigger button also pressed
                if(this.triggerButtonDown == false){
                    this.controllerEl.emit("triggerdown")
                }
            }
        } else { // grip button not pressed
            if(this.gripButtonDown){
                this.controllerEl.emit("gripup")
                this.gripButtonDown = false;
            }
        }

    }
    setPosition(data){
        if (data.length<4) return;
        //UPDATING POSITION
        // update the tracking location only if valid value
        if(isNaN(data[0]) || data[0] == undefined) return;
        // update the position if we have a decently sized tracking target
        if(data[2]*data[3] > 25){
            // find distance based on the avg of width+height of the object - if its further away, its smaller
            if(data[2] > data[3])
                this.distanceBack.setValue( (trackerRadius)/Math.tan((data[2]/pixelsPerDegree)/2* Math.PI/180) );
            else
                this.distanceBack.setValue( (trackerRadius)/Math.tan((data[3]/pixelsPerDegree)/2* Math.PI/180) );
            this.cameraRigDistance.object3D.position.setZ(this.distanceBack.value)
        }
        /// caclulate controller angle based on degrees from center of ball to centre of camera view angle
        // center of ball at x + trackerwidth/2, centre of camera view angle at imagewidth/2
        // divide by pixelsperdegree to get the degrees from centre instead of pixels from centre.
        this.angleUp.setValue(THREE.Math.degToRad( (data[1] + 0.5*data[3] - 120) / pixelsPerDegree*-1))
        this.angleAcross.setValue(THREE.Math.degToRad( (data[0] + 0.5*data[2] - 160) / pixelsPerDegree))
        //set rotation
        this.cameraRigAngle.object3D.rotation.set(this.angleUp.value,this.angleAcross.value,0);
        // offset tracker rotation
        this.cameraRigAngle.object3D.rotation.x += Math.PI;
        // move the hand to wherever the ball is now
        this.cameraRigDistance.object3D.getWorldPosition(this.controllerEl.object3D.position);
    }
}

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