"use strict"
// this file is for the implementation specific extendvr code;
AFRAME.registerComponent("finger-tracker", {
    init:function(){
        this.indexFingerJoints = this.el.querySelectorAll(".index-finger.joint")
        this.middleFingerJoints = this.el.querySelectorAll(".middle-finger.joint")
        this.ringFingerJoints = this.el.querySelectorAll(".ring-finger.joint")
        this.pinkieFingerJoints = this.el.querySelectorAll(".pinkie-finger.joint")
        this.thumbJoints = this.el.querySelectorAll(".thumb.joint")
        this.thumb = 0;
        this.index = 0;
        this.middle = 0;
        this.ring = 0;
        this.pinkie = 0;
        this.el.addEventListener("onFingerData",e=>{
            //this.thumb = this.thumb *0.3 + e.detail.thumb *0.7
            this.index = this.index *0.3 + e.detail.index *0.7
            this.middle = this.middle *0.3 + e.detail.middle *0.7
            this.ring = this.ring *0.3 + e.detail.ring *0.7
            this.pinkie = this.pinkie *0.3 + e.detail.pinkie *0.7
            //this.rotateFingerJoints(this.thumbJoints,this.thumb);
            this.rotateFingerJoints(this.indexFingerJoints,this.index);
            this.rotateFingerJoints(this.middleFingerJoints,this.middle);
            this.rotateFingerJoints(this.ringFingerJoints,this.ring);
            this.rotateFingerJoints(this.pinkieFingerJoints,this.pinkie);
        })
        this.el.addEventListener("gripdown", ()=>{
            console.log("grip down");
        })
    },
    rotateFingerJoints: (joints,amount) =>{
        if(joints.length == 3){
            // fingers do this
            joints[0].object3D.rotation.x = -THREE.Math.degToRad(amount*0.8);
            joints[1].object3D.rotation.x = -THREE.Math.degToRad(amount);
            joints[2].object3D.rotation.x = -THREE.Math.degToRad(amount*0.8);
        } else if(joints.length == 2){
            // thumb does this
            joints[0].object3D.rotation.x = -THREE.Math.degToRad(amount*1.3);
            joints[1].object3D.rotation.x = -THREE.Math.degToRad(amount*0.7);
        }
    }
})