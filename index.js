'use strict';
let gl;
let canvas;
const pwgl = {
  ongoingImageLoads: [],
  listOfPressedKeys: {},
};
const goldenColour = [1.0, 0.84, 0.0];
const ballBlueColour = [0.13, 0.67, 0.8];
const silverColour = [0.75, 0.75, 0.75];

// variables for translations and rotations controls
let transX = 0;
let transY = 0;
let transZ = 0;
let xRot = 0;
let yRot = 0;
let zRot = 0;
let xOffs = 0;
let yOffs = 0;
let dragging = false;

function startup() {
  canvas = document.getElementById('gl-canvas');
  canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);
  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
  document.addEventListener('keydown', handleKeyDown, false);
  document.addEventListener('keyup', handleKeyUp, false);
  canvas.addEventListener('mousemove', mymousemove, false);
  canvas.addEventListener('mousedown', mymousedown, false);
  canvas.addEventListener('mouseup', mymouseup, false);
  canvas.addEventListener('mousewheel', wheelHandler, false);
  canvas.addEventListener('DOMMouseScroll', wheelHandler, false);

  gl = createGLContext(canvas);

  init();

  pwgl.fpsCounter = document.getElementById('fps');

  draw();
}

function createGLContext(canvas) {
  const names = ['webgl', 'experimental-webgl'];
  let context = null;
  for (let i = 0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch (e) {}
    if (context) {
      break;
    }
  }

  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert('Failed to create WebGL context!');
  }
  return context;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function loadShaderFromDOM(id) {
  const shaderScript = document.getElementById(id);

  if (!shaderScript) {
    return null;
  }

  let shaderSource = '';
  let currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeName === '#text') {
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }

  let shader;
  if (shaderScript.type === 'x-shader/x-fragment') {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type === 'x-shader/x-vertex') {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (
    !gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
    !gl.isContextLost()
  ) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

function setupShaders() {
  const vertexShader = loadShaderFromDOM('shader-vs');
  const fragmentShader = loadShaderFromDOM('shader-fs');

  const shaderProgram = gl.createProgram();

  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);

  gl.linkProgram(shaderProgram);
  if (
    !gl.getProgramParameter(shaderProgram, gl.LINK_STATUS) &&
    !gl.isContextLost()
  ) {
    alert('Failed to link shaders: ' + gl.getProgramInfoLog(shaderProgram));
  }

  gl.useProgram(shaderProgram);

  pwgl.vertexPositionAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    'aVertexPosition'
  );
  pwgl.vertexNormalAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    'aVertexNormal'
  );
  pwgl.vertexTextureAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    'aTextureCoordinates'
  );
  pwgl.vertexColourAttributeLoc = gl.getAttribLocation(
    shaderProgram,
    'aVertexColour'
  );
  pwgl.uniformMVMatrixLoc = gl.getUniformLocation(shaderProgram, 'uMVMatrix');
  pwgl.uniformProjMatrixLoc = gl.getUniformLocation(shaderProgram, 'uPMatrix');
  pwgl.uniformSamplerLoc = gl.getUniformLocation(shaderProgram, 'uSampler');
  pwgl.uniformNormalMatrixLoc = gl.getUniformLocation(
    shaderProgram,
    'uNMatrix'
  );
  pwgl.uniformLightPositionLoc = gl.getUniformLocation(
    shaderProgram,
    'uLightPosition'
  );
  pwgl.uniformAmbientLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    'uAmbientLightColor'
  );
  pwgl.uniformDiffuseLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    'uDiffuseLightColor'
  );
  pwgl.uniformSpecularLightColorLoc = gl.getUniformLocation(
    shaderProgram,
    'uSpecularLightColor'
  );

  gl.enableVertexAttribArray(pwgl.vertexNormalAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexPositionAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexTextureAttributeLoc);
  gl.enableVertexAttribArray(pwgl.vertexColourAttributeLoc);

  pwgl.modelViewMatrix = mat4.create();
  pwgl.projectionMatrix = mat4.create();
  pwgl.modelViewMatrixStack = [];
}

function pushModelViewMatrix() {
  const copyToPush = mat4.create(pwgl.modelViewMatrix);
  pwgl.modelViewMatrixStack.push(copyToPush);
}

function popModelViewMatrix() {
  if (!pwgl.modelViewMatrixStack.length) {
    throw 'Error popModelViewMatrix() - Stack is empty ';
  }
  pwgl.modelViewMatrix = pwgl.modelViewMatrixStack.pop();
}

function setupSphereBuffers() {
  const latBands = 25;
  const longBands = 25;
  pwgl.EARTH_RADIUS = 10;

  const sphereVertexPosition = [];
  const sphereVertexNormals = [];
  const sphereVertexIndices = [];
  const sphereVertexTextureCoordinates = [];

  for (let latNumber = 0; latNumber <= latBands; latNumber++) {
    const theta = (latNumber * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let longNumber = 0; longNumber <= longBands; longNumber++) {
      const phi = (longNumber * 2 * Math.PI) / longBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      // calculate positions and normals
      const x = sinTheta * cosPhi;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      sphereVertexPosition.push(
        pwgl.EARTH_RADIUS * x,
        pwgl.EARTH_RADIUS * y,
        pwgl.EARTH_RADIUS * z
      );

      sphereVertexNormals.push(x, y, z);

      // calculate indices
      const v1 = latNumber * (longBands + 1) + longNumber;
      const v2 = v1 + longBands + 1;
      const v3 = v1 + 1;
      const v4 = v2 + 1;

      // indices of first triangle
      sphereVertexIndices.push(v1, v2, v3);
      // indices of second triangle
      sphereVertexIndices.push(v3, v2, v4);

      // calculate texture coords | u and v represent the texture coordinates
      const u = 1 - longNumber / longBands;
      const v = 1 - latNumber / latBands;
      sphereVertexTextureCoordinates.push(u, v);
    }
  }

  // position buffer
  pwgl.sphereVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexPositionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(sphereVertexPosition),
    gl.STATIC_DRAW
  );
  pwgl.SPHERE_VERTEX_POS_BUF_ITEM_SIZE = 3;
  pwgl.SPHERE_VERTEX_POS_BUF_NUM_ITEMS =
    sphereVertexPosition.length / pwgl.SPHERE_VERTEX_POS_BUF_ITEM_SIZE;

  // index buffer
  pwgl.sphereVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.sphereVertexIndexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(sphereVertexIndices),
    gl.STATIC_DRAW
  );
  pwgl.SPHERE_VERTEX_INDEX_BUF_ITEM_SIZE = 1;
  pwgl.SPHERE_VERTEX_INDEX_BUF_NUM_ITEMS = sphereVertexIndices.length;

  // normals buffer
  pwgl.sphereVertexNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexNormalBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(sphereVertexNormals),
    gl.STATIC_DRAW
  );
  pwgl.SPHERE_VERTEX_NORMAL_BUF_ITEM_SIZE = 3;
  pwgl.SPHERE_VERTEX_NORMAL_BUF_NUM_ITEMS =
    sphereVertexNormals.length / pwgl.SPHERE_VERTEX_NORMAL_BUF_ITEM_SIZE;

  // texture buffer
  pwgl.sphereVertexTextureCoordinateBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexTextureCoordinateBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(sphereVertexTextureCoordinates),
    gl.STATIC_DRAW
  );
  pwgl.SPHERE_VERTEX_TEX_COORD_BUF_ITEM_SIZE = 2;
  pwgl.SPHERE_VERTEX_TEX_COORD_BUF_NUM_ITEMS =
    sphereVertexTextureCoordinates.length /
    pwgl.SPHERE_VERTEX_TEX_COORD_BUF_ITEM_SIZE;
}

function setupCubeBuffers() {
  // position buffer
  pwgl.cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexPositionBuffer);

  // prettier-ignore
  const cubeVertexPosition = [
    // Front face
    1.0,  1.0,  1.0, //v0
    -1.0,  1.0,  1.0, //v1
    -1.0, -1.0,  1.0, //v2
    1.0, -1.0,  1.0, //v3

    // Back face
    1.0,  1.0, -1.0, //v4
    -1.0,  1.0, -1.0, //v5
    -1.0, -1.0, -1.0, //v6
    1.0, -1.0, -1.0, //v7

    // Left face
    -1.0,  1.0,  1.0, //v8
    -1.0,  1.0, -1.0, //v9
    -1.0, -1.0, -1.0, //v10
    -1.0, -1.0,  1.0, //v11      

    // Right face
    1.0,  1.0,  1.0, //12
    1.0, -1.0,  1.0, //13
    1.0, -1.0, -1.0, //14
    1.0,  1.0, -1.0, //15

    // Top face
    1.0,  1.0,  1.0, //v16
    1.0,  1.0, -1.0, //v17
    -1.0,  1.0, -1.0, //v18
    -1.0,  1.0,  1.0, //v19

    // Bottom face
    1.0, -1.0,  1.0, //v20
    1.0, -1.0, -1.0, //v21
    -1.0, -1.0, -1.0, //v22
    -1.0, -1.0,  1.0, //v23
  ];

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cubeVertexPosition),
    gl.STATIC_DRAW
  );

  pwgl.CUBE_VERTEX_POS_BUF_ITEM_SIZE = 3;
  pwgl.CUBE_VERTEX_POS_BUF_NUM_ITEMS = 24;

  // colours buffer
  pwgl.cubeVertexColourBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexColourBuffer);

  // prettier-ignore
  const cubeColoursVertices = [
    // Front face
    0.0, 0.0, 0.0, //v0
    0.0, 0.0, 0.0, //v1
    0.0, 0.0, 0.0, //v2
    0.0, 0.0, 0.0, //v3

    // Back face
    0.75, 0.75, 0.75, //v4
    0.75, 0.75, 0.75, //v5
    0.75, 0.75, 0.75, //v6
    0.75, 0.75, 0.75, //v7

    // Left face
    0.75, 0.75, 0.75, //v8
    0.75, 0.75, 0.75, //v9
    0.75, 0.75, 0.75, //v10
    0.75, 0.75, 0.75, //v11

    // Right face
    0.75, 0.75, 0.75, //12
    0.75, 0.75, 0.75, //13
    0.75, 0.75, 0.75, //14
    0.75, 0.75, 0.75, //15

    // Top face
    0.75, 0.75, 0.75, //v16
    0.75, 0.75, 0.75, //v17
    0.75, 0.75, 0.75, //v18
    0.75, 0.75, 0.75, //v19

    // Bottom face
    0.75, 0.75, 0.75, //v20
    0.75, 0.75, 0.75, //v21
    0.75, 0.75, 0.75, //v22
    0.75, 0.75, 0.75, //v23
  ];
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cubeColoursVertices),
    gl.STATIC_DRAW
  );
  pwgl.CUBE_VERTEX_COLOUR_BUF_ITEM_SIZE = 3;
  pwgl.CUBE_VERTEX_COLOUR_BUF_NUM_ITEMS = 24;

  // index buffer
  pwgl.cubeVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.cubeVertexIndexBuffer);

  // prettier-ignore
  const cubeVertexIndices = [
    0, 1, 2,      0, 2, 3,    // Front face
    4, 6, 5,      4, 7, 6,    // Back face
    8, 9, 10,     8, 10, 11,  // Left face
    12, 13, 14,   12, 14, 15, // Right face
    16, 17, 18,   16, 18, 19, // Top face
    20, 22, 21,   20, 23, 22  // Bottom face
  ];

  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(cubeVertexIndices),
    gl.STATIC_DRAW
  );
  pwgl.CUBE_VERTEX_INDEX_BUF_ITEM_SIZE = 1;
  pwgl.CUBE_VERTEX_INDEX_BUF_NUM_ITEMS = 36;

  // normals to be able to do lighting calculations
  pwgl.cubeVertexNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexNormalBuffer);

  // prettier-ignore
  const cubeVertexNormals = [
    // Front face
    0.0,  0.0,  1.0, //v0
    0.0,  0.0,  1.0, //v1
    0.0,  0.0,  1.0, //v2
    0.0,  0.0,  1.0, //v3

    // Back face
    0.0,  0.0, -1.0, //v4
    0.0,  0.0, -1.0, //v5
    0.0,  0.0, -1.0, //v6
    0.0,  0.0, -1.0, //v7

    // Left face
    -1.0,  0.0,  0.0, //v1
    -1.0,  0.0,  0.0, //v5
    -1.0,  0.0,  0.0, //v6
    -1.0,  0.0,  0.0, //v2

    // Right face
    1.0,  0.0,  0.0, //0
    1.0,  0.0,  0.0, //3
    1.0,  0.0,  0.0, //7
    1.0,  0.0,  0.0, //4

    // Top face
    0.0,  1.0,  0.0, //v0
    0.0,  1.0,  0.0, //v4
    0.0,  1.0,  0.0, //v5
    0.0,  1.0,  0.0, //v1

    // Bottom face
    0.0, -1.0,  0.0, //v3
    0.0, -1.0,  0.0, //v7
    0.0, -1.0,  0.0, //v6
    0.0, -1.0,  0.0, //v2
  ];

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(cubeVertexNormals),
    gl.STATIC_DRAW
  );
  pwgl.CUBE_VERTEX_NORMAL_BUF_ITEM_SIZE = 3;
  pwgl.CUBE_VERTEX_NORMAL_BUF_NUM_ITEMS = 24;
}

function setupBuffers() {
  setupSphereBuffers();
  setupCubeBuffers();
}

function setupLights() {
  gl.uniform3fv(pwgl.uniformLightPositionLoc, [0.0, 60.0, 5.0]);
  gl.uniform3fv(pwgl.uniformAmbientLightColorLoc, [0.2, 0.2, 0.2]);
  gl.uniform3fv(pwgl.uniformDiffuseLightColorLoc, [0.7, 0.7, 0.7]);
  gl.uniform3fv(pwgl.uniformSpecularLightColorLoc, [0.8, 0.8, 0.8]);
}

function setupTextures() {
  // texture for the earth
  pwgl.earthTexture = gl.createTexture();
  loadImageForTexture('texs/earth.jpg', pwgl.earthTexture);

  // white texture for un-textured objects, got solution on https://stackoverflow.com/questions/8552488/how-to-use-texture-and-color-also-in-webgl
  pwgl.whiteTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, pwgl.whiteTexture);
  const whitePixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    whitePixel
  );
}

function loadImageForTexture(url, texture) {
  const image = new Image();
  image.onload = () => {
    pwgl.ongoingImageLoads.splice(pwgl.ongoingImageLoads.indexOf(image), 1);
    textureFinishedLoading(image, texture);
  };
  pwgl.ongoingImageLoads.push(image);
  image.src = url;
}

function textureFinishedLoading(image, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function uploadNormalMatrixToShader() {
  const normalMatrix = mat3.create();
  mat4.toInverseMat3(pwgl.modelViewMatrix, normalMatrix);
  mat3.transpose(normalMatrix);
  gl.uniformMatrix3fv(pwgl.uniformNormalMatrixLoc, false, normalMatrix);
}

function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(pwgl.uniformMVMatrixLoc, false, pwgl.modelViewMatrix);
}

function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(pwgl.uniformProjMatrixLoc, false, pwgl.projectionMatrix);
}

function drawSphere(texture, r, g, b, numItems) {
  gl.disableVertexAttribArray(pwgl.vertexColourAttributeLoc);
  gl.vertexAttrib3f(pwgl.vertexColourAttributeLoc, r, g, b);

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexPositionBuffer);
  gl.vertexAttribPointer(
    pwgl.vertexPositionAttributeLoc,
    pwgl.SPHERE_VERTEX_POS_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexNormalBuffer);
  gl.vertexAttribPointer(
    pwgl.vertexNormalAttributeLoc,
    pwgl.SPHERE_VERTEX_NORMAL_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  );

  if (texture) {
    gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.sphereVertexTextureCoordinateBuffer);
    gl.vertexAttribPointer(
      pwgl.vertexTextureAttributeLoc,
      pwgl.SPHERE_VERTEX_TEX_COORD_BUF_ITEM_SIZE,
      gl.FLOAT,
      false,
      0,
      0
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, pwgl.whiteTexture);
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.sphereVertexIndexBuffer);

  gl.drawElements(
    gl.TRIANGLES,
    numItems,
    gl.UNSIGNED_SHORT,
    0
  );
}

function drawCube(r, g, b) {
  gl.disableVertexAttribArray(pwgl.vertexColourAttributeLoc);

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexPositionBuffer);
  gl.vertexAttribPointer(
    pwgl.vertexPositionAttribute,
    pwgl.CUBE_VERTEX_POS_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexNormalBuffer);
  gl.vertexAttribPointer(
    pwgl.vertexNormalAttributeLoc,
    pwgl.CUBE_VERTEX_NORMAL_BUF_ITEM_SIZE,
    gl.FLOAT,
    false,
    0,
    0
  );

  // vertex colour
  gl.vertexAttrib3f(pwgl.vertexColourAttributeLoc, r, g, b);

  // this would be my solution for the black side facing the earth but for some reason this doesn't work
  // or the white texture is overriding it (?). For that reason this will remain commented to show I was in the
  // way of doing it
  // gl.bindBuffer(gl.ARRAY_BUFFER, pwgl.cubeVertexColourBuffer);
  // gl.vertexAttribPointer(
  //   pwgl.vertexColourAttributeLoc,
  //   pwgl.CUBE_VERTEX_COLOUR_BUF_ITEM_SIZE,
  //   gl.FLOAT,
  //   false,
  //   0,
  //   0
  // );
  gl.bindTexture(gl.TEXTURE_2D, pwgl.whiteTexture);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pwgl.cubeVertexIndexBuffer);

  gl.drawElements(
    gl.TRIANGLES,
    pwgl.CUBE_VERTEX_INDEX_BUF_NUM_ITEMS,
    gl.UNSIGNED_SHORT,
    0
  );
}

function drawRod(translateZ) {
  // draw rod with dimensions: 0.2x0.2x0.5
  pushModelViewMatrix();
  mat4.translate(
    pwgl.modelViewMatrix,
    [0.0, 0.0, translateZ],
    pwgl.modelViewMatrix
  );
  // My cube is of dimensions 2x2x2, so the scale value will be:
  // desiredSize / originalCubeSize, e.g.: 0.5 / 2 = 0.25
  mat4.scale(pwgl.modelViewMatrix, [0.1, 0.1, 0.25], pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawCube(...goldenColour);
  popModelViewMatrix();
}

function drawSolarPanel(translateZ) {
  pushModelViewMatrix();
  mat4.translate(
    pwgl.modelViewMatrix,
    [0.0, 0.0, translateZ],
    pwgl.modelViewMatrix
  );
  mat4.scale(pwgl.modelViewMatrix, [0.5, 0.09, 1.0], pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawCube(...ballBlueColour);
  popModelViewMatrix();
}

function drawAntennaDish() {
  // draw rod on the the side that will face the earth with dimensions: 0.2x0.2x0.4
  pushModelViewMatrix();
  mat4.translate(pwgl.modelViewMatrix, [-1.2, 0.0, 0.0], pwgl.modelViewMatrix);
  mat4.rotateY(pwgl.modelViewMatrix, degToRad(90), pwgl.modelViewMatrix);
  mat4.scale(pwgl.modelViewMatrix, [0.1, 0.1, 0.2], pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawCube(...goldenColour);
  popModelViewMatrix();

  // draw dish
  pushModelViewMatrix();
  mat4.translate(pwgl.modelViewMatrix, [-5.4, 0.0, 0.0], pwgl.modelViewMatrix);
  mat4.rotateZ(pwgl.modelViewMatrix, degToRad(90), pwgl.modelViewMatrix)
  mat4.rotateX(pwgl.modelViewMatrix, degToRad(180), pwgl.modelViewMatrix)
  // diameter of 4
  mat4.scale(pwgl.modelViewMatrix, [0.4, 0.4, 0.4], pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawSphere(null, ...goldenColour, Math.round(pwgl.SPHERE_VERTEX_INDEX_BUF_NUM_ITEMS / 8.7));
  popModelViewMatrix();
}

function drawSatellite() {
  // draw main body of the satellite
  pushModelViewMatrix();
  drawCube(...silverColour);
  popModelViewMatrix();

  // draw rods on opposite sides of the main body
  drawRod(1.25);
  drawRod(-1.25);

  // draw antenna dish
  drawAntennaDish();

  // draw solar panels
  drawSolarPanel(2.5);
  drawSolarPanel(-2.5);
}

function handleContextLost(e) {
  e.preventDefault();
  cancelRequestAnimFrame(pwgl.requestId);

  for (let i = 0; i < pwgl.ongoingImageLoads.length; i++) {
    pwgl.ongoingImageLoads[i].onload = undefined;
  }
  pwgl.ongoingImageLoads = [];
}

function handleContextRestored(_e) {
  init();
  pwgl.requestId = requestAnimFrame(draw, canvas);
}

function init() {
  setupShaders();
  setupBuffers();
  setupLights();
  setupTextures();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  // Default values for the moving satellite
  pwgl.satX = 0.0;
  pwgl.satZ = 0.0;
  pwgl.satCircleRadius = pwgl.EARTH_RADIUS + 5.0;
  pwgl.satAngle = 0;
  pwgl.satTimeToOrbit = 5000;

  // Initialize variables for the animation
  pwgl.animationStartTime = undefined;
  pwgl.fps = 0;
  pwgl.previousFrameTimeStamp = Date.now();

  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  mat4.perspective(
    60,
    gl.viewportWidth / gl.viewportHeight,
    1,
    150.0,
    pwgl.projectionMatrix
  );
  mat4.identity(pwgl.modelViewMatrix);
  mat4.lookAt([0, 0, 45], [0, 0, 0], [0, 1, 0], pwgl.modelViewMatrix);
}

function draw() {
  pwgl.requestId = requestAnimFrame(draw);

  const currentTime = Date.now();

  handlePressedDownKeys();

  // Update FPS if a second or more has passed since last FPS update
  if (currentTime - pwgl.previousFrameTimeStamp >= 1000) {
    pwgl.fpsCounter.textContent = `FPS: ${pwgl.fps}`;
    pwgl.fps = 0;
    pwgl.previousFrameTimeStamp = currentTime;
  }

  // zoom controls
  mat4.translate(
    pwgl.modelViewMatrix,
    [transX, transY, transZ],
    pwgl.modelViewMatrix
  );

  // rotation controls
  mat4.rotateX(pwgl.modelViewMatrix, xRot / 50, pwgl.modelViewMatrix);
  mat4.rotateY(pwgl.modelViewMatrix, yRot / 50, pwgl.modelViewMatrix);

  // reset zoom and rotation values
  yRot = xRot = zRot = transX = transY = transZ = 0;

  uploadModelViewMatrixToShader();
  uploadProjectionMatrixToShader();
  uploadNormalMatrixToShader();

  gl.uniform1i(pwgl.uniformSamplerLoc, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (!pwgl.animationStartTime) {
    pwgl.animationStartTime = currentTime;
  }

  // Draw Earth
  pushModelViewMatrix();
  const earthAngle =
    (((currentTime - pwgl.animationStartTime) / 10000) * 2 * Math.PI) %
    (2 * Math.PI);
  mat4.rotateY(pwgl.modelViewMatrix, -earthAngle, pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawSphere(pwgl.earthTexture, 1, 1, 1, pwgl.SPHERE_VERTEX_INDEX_BUF_NUM_ITEMS);
  popModelViewMatrix();

  // draw satellite
  pushModelViewMatrix();
  pwgl.satAngle =
    (((currentTime - pwgl.animationStartTime) / pwgl.satTimeToOrbit) *
      2 *
      Math.PI) %
    (2 * Math.PI);
  pwgl.satX = Math.cos(pwgl.satAngle) * pwgl.satCircleRadius;
  pwgl.satZ = Math.sin(pwgl.satAngle) * pwgl.satCircleRadius;
  mat4.translate(
    pwgl.modelViewMatrix,
    [pwgl.satX, 0.0, pwgl.satZ],
    pwgl.modelViewMatrix
  );
  mat4.rotateY(pwgl.modelViewMatrix, -1 * pwgl.satAngle, pwgl.modelViewMatrix);
  uploadModelViewMatrixToShader();
  uploadNormalMatrixToShader();
  drawSatellite();
  popModelViewMatrix();

  pwgl.fps++;
}

function handleKeyDown(event) {
  pwgl.listOfPressedKeys[event.keyCode] = true;
}

function handleKeyUp(event) {
  pwgl.listOfPressedKeys[event.keyCode] = false;
}

function handlePressedDownKeys() {
  // Arrow left, increase radius of circle
  if (pwgl.listOfPressedKeys[37]) {
    pwgl.satCircleRadius += 0.1;
  }

  // Arrow right, decrease radius of circle
  if (pwgl.listOfPressedKeys[39]) {
    pwgl.satCircleRadius -= 0.1;
    // this 1.0 refers to half of the cube size (2.0 / 2 = 1.0)
    if (pwgl.satCircleRadius <= pwgl.EARTH_RADIUS + 1.0) {
      pwgl.satCircleRadius = pwgl.EARTH_RADIUS + 1.0;
    }
  }

  // Arrow up, increase satellite orbit speed
  if (pwgl.listOfPressedKeys[38]) {
    pwgl.satTimeToOrbit -= 100;
  }

  // Arrow down, decrease satellite orbit speed
  if (pwgl.listOfPressedKeys[40]) {
    if (pwgl.satTimeToOrbit <= 0) {
      return;
    }

    pwgl.satTimeToOrbit += 100;
  }
}

function mymousedown(e) {
  dragging = true;
  xOffs = e.clientX;
  yOffs = e.clientY;
}

function mymouseup(_e) {
  dragging = false;
}

function mymousemove(e) {
  if (!dragging) return;
  if (e.shiftKey) {
    transZ = (e.clientY - yOffs) / 10;
  } else if (e.altKey) {
    transY = -(e.clientY - yOffs) / 10;
  } else {
    yRot = -xOffs + e.clientX;
    xRot = -yOffs + e.clientY;
  }
  xOffs = e.clientX;
  yOffs = e.clientY;
}

function wheelHandler(e) {
  e.preventDefault();
  if (e.altKey) {
    transY = -e.detail / 3;
  } else if (e.shiftKey) {
    transX = -e.detail / 3;
  } else {
    transZ = e.detail / 3;
  }
}
