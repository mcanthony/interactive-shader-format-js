var ISFGLState = require("./ISFGLState.js").ISFGLState;
var ISFGLProgram = require("./ISFGLProgram.js").ISFGLProgram;
var ISFBuffer = require("./ISFBuffer.js").ISFBuffer;
var ISFParser = require("./ISFParser.js").ISFParser;
var ISFTexture = require("./ISFTexture.js").ISFTexture;
var MathJS = require("./math.js")

var bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

function ISFRenderer(gl) {
  this.gl = gl;
  this.uniforms = [];
  this.pushUniform = bind(this.pushUniform, this);
  this.pushUniforms = bind(this.pushUniforms, this);
  this.pushTextures = bind(this.pushTextures, this);
  this.setupGL = bind(this.setupGL, this);
  this.initUniforms = bind(this.initUniforms, this);
  this.contextState = new ISFGLState(this.gl);
  this.setupPaintToScreen();
  this.startTime = Date.now();
}

ISFRenderer.prototype.loadSource = function(fragmentISF, vertexISFOpt) {
  var parser = new ISFParser()
  parser.parse(fragmentISF, vertexISFOpt);
  this.sourceChanged(parser.fragmentShader, parser.vertexShader, parser);
}

ISFRenderer.prototype.sourceChanged = function(fragmentShader, vertexShader, model) {
  this.fragmentShader = fragmentShader;
  this.vertexShader = vertexShader;
  this.model = model;
  this.setupGL();
  this.initUniforms();
  for (var i = 0; i < model.inputs.length; i++) {
    var input = model.inputs[i];
    if (input.DEFAULT !== undefined) {
      this.setValue(input.NAME, input.DEFAULT);
    }
  }
};

ISFRenderer.prototype.initUniforms = function() {
  this.uniforms = this.findUniforms(this.fragmentShader);
  var inputs = this.model.inputs;
  for (var i = 0; i < inputs.length; ++i) {
    var input = inputs[i];
    var uniform = this.uniforms[input.NAME];
    if (!uniform) {
      continue;
    }
    uniform.value = this.model[input.NAME];
    if (uniform.type === 't') {
      uniform.texture = new ISFTexture({}, this.contextState);
    }
  }
  this.pushTextures();
};

ISFRenderer.prototype.setValue = function(name, value) {
  var uniform = this.uniforms[name];
  if (!uniform) {
    console.error("No uniform named " + name);
    return;
  }
  uniform.value = value;
  if (uniform.type === 't') {
    uniform.textureLoaded = false;
  }
  this.pushUniform(uniform);
};

ISFRenderer.prototype.setNormalizedValue = function(name, normalizedValue) {
  var uniform = this.uniforms[name];
  var inputs = this.model.inputs;
  var input = null;
  for (var i = 0; i < inputs.length; i++) {
    var thisInput = inputs[i];
    if (thisInput.NAME == name) {
      input = thisInput;
      break;
    }
  }
  if (input && input.MIN !== undefined && input.MAX !== undefined) {
    this.setValue(name, input.MIN + (input.MAX - input.MIN) * normalizedValue);
  } else {
    console.log("Trying to set normalized value without MIN and MAX input", name, input);
  }
}

ISFRenderer.prototype.setupPaintToScreen = function() {
  this.paintProgram = new ISFGLProgram(this.gl, this.basicVertexShader, this.basicFragmentShader);
  return this.paintProgram.bindVertices();
};

ISFRenderer.prototype.setupGL = function() {
  this.cleanup();
  this.program = new ISFGLProgram(this.gl, this.vertexShader, this.fragmentShader);
  this.program.bindVertices();
  this.generatePersistentBuffers();
};

ISFRenderer.prototype.generatePersistentBuffers = function() {
  this.renderBuffers = [];
  var passes = this.model.passes;
  for (var i = 0; i < passes.length; ++i) {
    var pass = passes[i];
    var buffer = new ISFBuffer(pass, this.contextState);
    pass.buffer = buffer;
    this.renderBuffers.push(buffer);
  }
};

ISFRenderer.prototype.paintToScreen = function(destination, target) {
  this.paintProgram.use();
  this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  this.gl.viewport(0, 0, destination.width, destination.height);
  var loc = this.paintProgram.getUniformLocation("tex");
  target.readTexture().bind(loc);
  this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  this.program.use();
};

ISFRenderer.prototype.pushTextures = function() {
  for (var i = 0; i < this.uniforms.length; ++i) {
    var uniform = this.uniforms[i];
    if (this.uniforms.hasOwnProperty(name)) {
      if (uniform.type == 't') {
        this.pushTexture(uniform);
      }
    }
  }
};

ISFRenderer.prototype.pushTexture = function(uniform) {
  if (!uniform.value) {
    return;
  }
  if (uniform.value.tagName != "CANVAS" && !uniform.value.complete && uniform.value.readyState !== 4) {
    return;
  }
  var loc = this.program.getUniformLocation(uniform.name);
  uniform.texture.bind(loc);
  this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, uniform.value);
  if (!uniform.textureLoaded) {
    var img = uniform.value;
    uniform.textureLoaded = true;
    var w = img.naturalWidth || img.width || img.videoWidth;
    var h = img.naturalHeight || img.height || img.videoHeight;
    this.setValue("_" + uniform.name + "_imgSize", [w, h]);
    this.setValue("_" + uniform.name + "_imgRect", [0, 0, 1, 1]);
    return this.setValue("_" + uniform.name + "_flip", false);
  }
};

ISFRenderer.prototype.pushUniforms = function() {
  for (var name in this.uniforms) {
    var uniform = this.uniforms[name];
    if (this.uniforms.hasOwnProperty(name)) {
      this.pushUniform(value);
    }
  }
};

ISFRenderer.prototype.pushUniform = function(uniform) {
  var loc = this.program.getUniformLocation(uniform.name);
  if (loc !== -1) {
    if (uniform.type === 't') {
      return this.pushTexture(uniform);
    } else {
      var v = uniform.value;
      switch (uniform.type) {
        case 'f':
          return this.gl.uniform1f(loc, v);
        case 'v2':
          return this.gl.uniform2f(loc, v[0], v[1]);
        case 'v3':
          return this.gl.uniform3f(loc, v[0], v[1], v[2]);
        case 'v4':
          return this.gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        case 'i':
          return this.gl.uniform1i(loc, v);
        case 'color':
          return this.gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        default:
          return console.log("Unknown type for uniform setting " + uniform.type, uniform);
      }
    }
  }
};

ISFRenderer.prototype.findUniforms = function(shader) {
  var lines = shader.split("\n");
  var uniforms = {
    TIME: 0,
    PASSINDEX: 0,
    RENDERSIZE: [0, 0]
  };
  var len = lines.length
  for (var i = 0; i < len; ++i) {
    var line = lines[i];
    if (line.indexOf("uniform") === 0) {
      var tokens = line.split(" ");
      var name = tokens[2].substring(0, tokens[2].length - 1);
      var uniform = this.typeToUniform(tokens[1]);
      uniform.name = name;
      uniforms[name] = uniform;
    }
  }
  return uniforms;
};

ISFRenderer.prototype.typeToUniform = function(type) {
  switch (type) {
    case "float":
      return {
        type: "f",
        value: 0
      };
    case "vec2":
      return {
        type: "v2",
        value: [0, 0]
      };
    case "vec3":
      return {
        type: "v3",
        value: [0, 0, 0]
      };
    case "vec4":
      return {
        type: "v4",
        value: [0, 0, 0, 0]
      };
    case "bool":
      return {
        type: "i",
        value: 0
      };
    case "int":
      return {
        type: "i",
        value: 0
      };
    case "color":
      return {
        type: "v4",
        value: [0, 0, 0, 0]
      };
    case "point2D":
      return {
        type: "v2",
        value: [0, 0],
        isPoint: true
      };
    case "sampler2D":
      return {
        type: "t",
        value: {
          complete: false,
          readyState: 0
        },
        texture: null,
        textureUnit: null
      };
    default:
      throw "Unknown uniform type in ISFRenderer.typeToUniform: " + type;
  }
};

ISFRenderer.prototype.draw = function(destination) {
  this.contextState.reset();
  this.program.use();
  this.setValue("TIME", (Date.now() - this.startTime) / 1000);
  var buffers = this.renderBuffers;
  for (var i = 0; i < buffers.length; ++i) {
    var buffer = buffers[i];
    var readTexture = buffer.readTexture();
    var loc = this.program.getUniformLocation(buffer.name);
    readTexture.bind(loc);
    if (buffer.name) {
      this.setValue("_" + buffer.name + "_imgSize", [buffer.width, buffer.height]);
      this.setValue("_" + buffer.name + "_imgRect", [0, 0, 1, 1]);
      this.setValue("_" + buffer.name + "_flip", false);
    }
  }
  var lastTarget = null;
  var passes = this.model.passes;
  for (var i = 0; i < passes.length; ++i) {
    var pass = passes[i];
    this.setValue("PASSINDEX", i);
    var buffer = pass.buffer;
    if (pass.target) {
      var w = this.evaluateSize(destination, pass.width);
      var h = this.evaluateSize(destination, pass.height);
      buffer.setSize(w, h);
      var writeTexture = buffer.writeTexture();
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, buffer.fbo);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, writeTexture.texture, 0);
      this.setValue("RENDERSIZE", [buffer.width, buffer.height]);
      lastTarget = buffer;
      this.gl.viewport(0, 0, w, h);
    } else {
      var renderWidth = destination.width;
      var renderHeight = destination.height;
      buffer.setSize(renderWidth, renderHeight);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.setValue("RENDERSIZE", [renderWidth, renderHeight]);
      lastTarget = null;
      this.gl.viewport(0, 0, renderWidth, renderHeight);
    }
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }
  var buffers = this.renderBuffers;
  for (var i = 0; i < buffers.length; ++i) {
    buffers[i].flip();
  }
  if (lastTarget) {
    return this.paintToScreen(destination, lastTarget);
  }
};

ISFRenderer.prototype.evaluateSize = function(destination, formula) {
  formula = formula + "";
  var s = formula.replace("$WIDTH", destination.offsetWidth).replace("$HEIGHT", destination.offsetHeight);
  for (var name in this.uniforms) {
    var uniform = this.uniforms[name];
    s = s.replace("$" + name, uniform.value);
  }
  this.math || (this.math = new MathJS);
  return this.math["eval"](s);
};

ISFRenderer.prototype.cleanup = function() {
  this.contextState.reset();
  if (this.renderBuffers) {
    for (var i = 0; i < this.renderBuffers.length; ++i) {
      this.renderBuffers[i].destroy();
    }
  }
};

ISFRenderer.prototype.basicVertexShader = "precision mediump float;\nprecision mediump int;\nattribute vec2 position; // -1..1\nvarying vec2 texCoord;\n\nvoid main(void) {\n  // Since webgl doesn't support ftransform, we do this by hand.\n  gl_Position = vec4(position, 0, 1);\n  texCoord = position;\n}\n";

ISFRenderer.prototype.basicFragmentShader = "precision mediump float;\nuniform sampler2D tex;\nvarying vec2 texCoord;\nvoid main()\n{\n  gl_FragColor = texture2D(tex, texCoord * 0.5 + 0.5);\n  //gl_FragColor = vec4(texCoord.x);\n}";

exports.ISFRenderer = ISFRenderer;
