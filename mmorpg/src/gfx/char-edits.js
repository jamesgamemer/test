// What the animator (dev/animator.html) has changed in each character's motion: posture corrections laid over
// every clip, changes to single clips, keyed poses, new clips, the timing of the game's moves, how the sword
// is held. The format is described in motion.js; the game works these into the clips when it loads them.
// Do not edit by hand: change it in the animator and paste what it saves here.
export const EDITS = {
  hero: {
    "all": {"rot": {"neck": [-0.04361, -0.00072, 0.00068, 0.99905], "Head": [-0.06103, -0.00101, 0.00095, 0.99813]}},
    "clips": {"run": {"rot": {"Head": [0.04361, 0.00072, -0.00068, 0.99905]}, "keys": []}, "ease": {"rot": {"Spine02": [-0.02181, -0.00016, 0.00015, 0.99976], "Spine01": [-0.01745, -0.00012, 0.00012, 0.99985], "Spine": [-0.01309, -9e-05, 9e-05, 0.99991], "Head": [-0.04361, -0.00072, 0.00068, 0.99905], "LeftArm": [-0.12409, 0.05801, -0.00027, 0.99057], "LeftForeArm": [-0.05629, 0.0001, 0.04893, 0.99721], "LeftHand": [0.06766, 0.01436, 0.0991, 0.99267], "RightArm": [-0.12079, -0.20485, -0.02219, 0.97106], "RightForeArm": [-0.24256, -0.07455, -0.16622, 0.95288], "RightHand": [0.46897, -0.09295, -0.01607, 0.87816], "LeftUpLeg": [-0.03683, -0.00922, -0.01618, 0.99915], "LeftLeg": [0.06474, -0.00091, 0.01138, 0.99784], "LeftFoot": [-0.04245, -0.01317, -0.0383, 0.99828], "RightUpLeg": [-0.00481, -0.00151, 0.02992, 0.99954], "RightLeg": [0.05254, 0.00109, -0.01398, 0.99852], "RightFoot": [-0.0556, 0.01187, 0.03802, 0.99766]}, "keys": []}},
    "made": {"ease": {"from": {"copy": "idle"}, "dur": 1.9, "loop": true}},
  },
};
