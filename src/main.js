const pixelsPerDegree =5; // number of pixels left or right of the camera that shows the light coming from one degree out from perpendicular from the lens
const trackerRadius = 0.02; // 5 cm (0.05m) radius of the ball
var terminal;
var indexFingerJoints;
var middleFingerJoints;
var ringFingerJoints;
var pinkieFingerJoints;
var thumbJoints;
var controller;
var controllerAngle;
var controllerLocation;
var scene;
var objectLocation;

// finger data: with latest couple readings as well, so that we can compare
// to see if this is just static or not
var idata = [0,0,0,0,0];
var mdata = [0,0,0,0,0];
var rdata = [0,0,0,0,0];
var pdata = [0,0,0,0,0];
var iavg = 0;
var mavg = 0;
var ravg = 0;
var pavg = 0;
var tavg = 0;
var latestUpdated = 0;
var distanceBack = 0.5;

var xdata
var ydata
var zdata

// movable object for demo
var movableObject;
var moving = false;

function rotateFingerJoints(objects,amount){
	if(objects.length == 3){
        // fingers do this
        objects[0].object3D.rotation.x = -THREE.Math.degToRad(amount*0.8);
        objects[1].object3D.rotation.x = -THREE.Math.degToRad(amount);
        objects[2].object3D.rotation.x = -THREE.Math.degToRad(amount*0.8);
	} else if(objects.length == 2){
        // thumb does this
        objects[0].object3D.rotation.x = -THREE.Math.degToRad(amount*1.3);
        objects[1].object3D.rotation.x = -THREE.Math.degToRad(amount*0.7);
	}

}

window.onload = () =>{
    indexFingerJoints = document.querySelectorAll(".index-finger.joint")
    middleFingerJoints = document.querySelectorAll(".middle-finger.joint")
    ringFingerJoints = document.querySelectorAll(".ring-finger.joint")
    pinkieFingerJoints = document.querySelectorAll(".pinkie-finger.joint")
    thumbJoints = document.querySelectorAll(".thumb.joint")
    controller = document.querySelector(".hand");
    controllerAngle = document.querySelector("#controller-angle");
    controllerLocation = document.querySelector("#controller-location")
    objectLocation = document.querySelector("#object-location")
    scene = document.querySelector("a-scene")
    movableObject = document.querySelector("#movable")
}
//--------------------------------------------------------------------------
//                        WebSocket setup
//--------------------------------------------------------------------------
var socket = new WebSocket("ws://192.168.1.4:8887");
socket.onopen =  function(event) {console.log(event)};//idk
socket.onclose = function(event) {console.log(event)};//idk
socket.onerror = function(event) {console.log(event)};//idk
socket.onmessage = function(event){
    var lines = event.data.split('\n');
    if (lines.length > 1){
        // first line contains finger+rotation tracking data
        controllerTrack(lines[0])
        // other lines contain vision tracking data
        positionTrack(lines.slice(2));
    }

}


//---------------------------------------------------------------------------
//                     Finger + rotation tracking
//---------------------------------------------------------------------------

function controllerTrack(data) {
    let vals = data.split(",");
    if(vals.length != 9) return;
    idata[latestUpdated] = parseInt(vals[5],10);
    mdata[latestUpdated] = parseInt(vals[6],10);
    rdata[latestUpdated] = parseInt(vals[7],10);
    pdata[latestUpdated] = parseInt(vals[8],10);

    iavg = mode(idata)*0.4+iavg*0.6
    mavg = mode(mdata)*0.4+mavg*0.6
    ravg = mode(rdata)*0.4+ravg*0.6
    pavg = mode(pdata)*0.4+pavg*0.6

    // thumb (if 2, thumb down)
    if(parseInt(vals[4],10) == 2){
        tavg = tavg*0.7 + 2*0.3 // so tavg will be between 0 and 2
    } else {
        tavg = tavg*0.7 + 0*0.3
    }
    // change the fingers by the appropriate amounts so they grip
    rotateFingerJoints(indexFingerJoints,iavg *12)
    rotateFingerJoints(middleFingerJoints,mavg *12)
    rotateFingerJoints(ringFingerJoints,ravg *12)
    rotateFingerJoints(pinkieFingerJoints,pavg *12)
    rotateFingerJoints(thumbJoints,tavg*30)
    // change which is now going to be the lastest updated
    latestUpdated = (latestUpdated + 1) % idata.length // to cycle between 0 and 7


    // rotate the object the amount that it should
    var rotation = new THREE.Quaternion();
    rotation.set(
        parseFloat(vals[2])*-1,
        parseFloat(vals[3]),
        parseFloat(vals[1]) * -1,
        parseFloat(vals[0]),
    )
    // now rotate by the amount we are supposed to
    controller.object3D.setRotationFromQuaternion(rotation);


    // movableObject:
    if(iavg > 4 && mavg >4 && ravg >4 && pavg >3 && tavg >1.5){
        // hand in fist, grab the object if not grabbed
        if(!moving){
                moving = true;
                console.log("moving");
        }
    } else{
        if(moving){
            moving = false;
        }
    }
}

var wo = 1;
var xo = 1;
var yo = 1;
var zo = 1;



function mode(numbers) {
    // as result can be bimodal or multi-modal,
    // the returned result is provided as an array
    // mode of [3, 5, 4, 4, 1, 1, 2, 3] = [1, 3, 4]
    var modes = [], count = [], i, number, maxIndex = 0;

    for (i = 0; i < numbers.length; i += 1) {
        number = numbers[i];
        count[number] = (count[number] || 0) + 1;
        if (count[number] > maxIndex) {
            maxIndex = count[number];
        }
    }

    for (i in count){
        if (count.hasOwnProperty(i)) {
            if (count[i] === maxIndex) {
                modes.push(Number(i));
            }
        }
    }
    // there could be multiple modes, if there are multiple of the same length. so just always use the first one
    return modes[0];
}

//---------------------------------------------------------------------------
//                         Vision tracking Stuff
//---------------------------------------------------------------------------
// talk to the android app to get the camera information


function positionTrack(lines) {
    let result = [];
    // get values from csv into result (multidimensional array)
    lines.forEach(line => {
        let vals = [];
        line.split(",").forEach(val =>{
            vals.push(parseInt(val));
        })
        result.push(vals);
    });
    // find largest one
    let largest = 0;
    let largestAreaSoFar = 0;
    if(result.length > 0){
        for(let i=0;i<result.length;i++){
            // do something
            // remember: result[i][0] is x, 1 is y, 2 is width, 3 is hight
            if(result[i][2]*result[i][3] > largestAreaSoFar ){
                largestAreaSoFar = result[i][2]*result[i][3]
                largest = i;
            }
        }
        // check if valid value, only then update the tracking location
        if(!isNaN(result[largest][0]) && result[largest][0] != undefined){
            // update the position
            if(largestAreaSoFar > 25){

                // decently sized area, might give us a kinda accurrate distance
                // find distance based on the avg of width+height of the object - if its further away, its smaller
                // set the distance from the ball to the camera distance
                // and low pass it of course, to smooth the result
                distanceBack = distanceBack*0.5 + 0.5 * (trackerRadius)/Math.tan(((result[largest][2]+result[largest][3])/2/pixelsPerDegree)/2* Math.PI/180)
                controllerLocation.object3D.position.setZ(distanceBack)
            }
            controllerAngle.object3D.rotation.set(
                /// caclulate controller angle based on degrees from center of ball to centre of camera view angle
                // center of ball at x + trackerwidth/2, centre of camera view angle at imagewidth/2
                // divide by pixelsperdegree to get the degrees from centre instead of pixels from centre.
                //angle up
                THREE.Math.degToRad( (result[largest][1] + 0.5*result[largest][3] - 120) / pixelsPerDegree*-1),
                //angle accross
                THREE.Math.degToRad( (result[largest][0] + 0.5*result[largest][2] - 160) / pixelsPerDegree),
                0
            );
            // offset tracker rotation
            controllerAngle.object3D.rotation.x += Math.PI;

            // move the hand to wherever the ball is now

            controllerLocation.object3D.getWorldPosition(controller.object3D.position);

            // if moving the red ball, move the red ball to where it should be
            if(moving) objectLocation.object3D.getWorldPosition(movableObject.object3D.position);



        }
    }
}
