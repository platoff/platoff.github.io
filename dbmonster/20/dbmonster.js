// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var s = func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - asm.stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 256000000;

var WASM_PAGE_SIZE = 64 * 1024;

var totalMemory = WASM_PAGE_SIZE;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024;
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var lastChar, end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);    
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;





// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 43520;
  /* global initializers */  __ATINIT__.push();
  

/* memory initializer */ allocate([21,0,0,0,21,0,0,0,112,97,116,99,104,32,101,108,101,109,101,110,116,32,114,101,112,108,97,99,101,0,0,0,171,3,0,0,127,3,0,0,185,3,0,0,187,3,0,0,194,3,0,0,198,3,0,0,201,3,0,0,208,3,0,0,211,3,0,0,217,3,0,0,223,3,0,0,226,3,0,0,228,3,0,0,236,3,0,0,241,3,0,0,247,3,0,0,253,3,0,0,0,4,0,0,3,4,0,0,14,0,0,0,14,0,0,0,77,101,109,111,114,121,32,117,115,97,103,101,58,10,0,0,15,0,0,0,15,0,0,0,99,111,110,116,101,110,116,32,115,116,97,99,107,58,32,0,15,0,0,0,15,0,0,0,101,108,101,109,101,110,116,32,115,116,97,99,107,58,32,0,17,0,0,0,17,0,0,0,68,79,77,32,40,115,116,114,117,99,116,117,114,101,41,58,32,0,0,0,15,0,0,0,15,0,0,0,68,79,77,32,40,115,116,114,105,110,103,115,41,58,32,0,2,0,0,0,2,0,0,0,61,34,0,0,2,0,0,0,2,0,0,0,62,10,0,0,2,0,0,0,2,0,0,0,60,47,0,0,6,0,0,0,6,0,0,0,118,97,99,117,117,109,0,0,21,0,0,0,21,0,0,0,60,73,68,76,69,62,32,105,110,32,116,114,97,110,115,97,99,116,105,111,110,0,0,0,26,0,0,0,26,0,0,0,83,69,76,69,67,84,32,98,108,97,104,32,70,82,79,77,32,115,111,109,101,116,104,105,110,103,0,0,6,0,0,0,6,0,0,0,32,115,108,97,118,101,0,0,13,0,0,0,13,0,0,0,111,117,116,32,111,102,32,109,101,109,111,114,121,0,0,0,63,0,0,0,63,0,0,0,91,71,67,93,32,99,97,110,110,111,116,32,114,101,103,105,115,116,101,114,32,103,108,111,98,97,108,32,118,97,114,105,97,98,108,101,59,32,116,111,111,32,109,97,110,121,32,103,108,111,98,97,108,32,118,97,114,105,97,98,108,101,115,0,16,0,0,0,16,0,0,0,32,40,105,110,118,97,108,105,100,32,100,97,116,97,33,41,0,0,0,0,18,0,0,0,18,0,0,0,111,118,101,114,45,32,111,114,32,117,110,100,101,114,102,108,111,119,0,0,5,0,0,0,5,0,0,0,70,80,83,58,32,0,0,0,36,2,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,241,165,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,152,2,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,249,165,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,152,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,103,102,101,84,69,88,84,0,99,108,97,115,115,0,102,111,114,0,112,108,97,99,101,104,111,108,100,101,114,0,116,121,112,101,0,118,97,108,117,101,0,119,105,100,116,104,0,68,79,67,85,77,69,78,84,95,82,79,79,84,0,97,0,98,117,116,116,111,110,0,100,105,118,0,104,49,0,104,101,97,100,101,114,0,104,114,0,105,110,112,117,116,0,108,97,98,101,108,0,108,105,0,112,0,115,101,99,116,105,111,110,0,115,112,97,110,0,116,97,98,108,101,0,116,98,111,100,121,0,116,100,0,116,114,0,117,108,0,118,118,118,118,118,118,0,121,121,121,0,116,105,116,108,101,0,108,97,98,101,108,32,108,97,98,101,108,45,119,97,114,110,105,110,103,0,108,97,98,101,108,32,108,97,98,101,108,45,115,117,99,99,101,115,115,0,108,97,98,101,108,32,108,97,98,101,108,45,105,109,112,111,114,116,97,110,116,0,81,117,101,114,121,32,101,108,97,112,115,101,100,32,119,97,114,110,0,81,117,101,114,121,32,101,108,97,112,115,101,100,32,115,104,111,114,116,0,81,117,101,114,121,32,101,108,97,112,115,101,100,32,119,97,114,110,95,108,111,110,103,0,116,97,98,108,101,32,116,97,98,108,101,45,115,116,114,105,112,101,100,32,108,97,116,101,115,116,45,100,97,116,97,0,100,98,110,97,109,101,0,113,117,101,114,121,45,99,111,117,110,116,0,112,111,112,111,118,101,114,32,108,101,102,116,0,112,111,112,111,118,101,114,45,99,111,110,116,101,110,116,0,97,114,114,111,119,0,81,117,101,114,121,0,32,0,113,117,101,114,121,0,101,108,97,112,115,101,100,0,119,97,105,116,105,110,103,0,113,117,101,114,105,101,115,0,100,97,116,97,98,97,115,101,115,0,83,73,71,83,69,71,86,58,32,73,108,108,101,103,97,108,32,115,116,111,114,97,103,101,32,97,99,99,101,115,115,46,32,40,65,116,116,101,109,112,116,32,116,111,32,114,101,97,100,32,102,114,111,109,32,110,105,108,63,41,10,0,83,73,71,65,66,82,84,58,32,65,98,110,111,114,109,97,108,32,116,101,114,109,105,110,97,116,105,111,110,46,10,0,83,73,71,70,80,69,58,32,65,114,105,116,104,109,101,116,105,99,32,101,114,114,111,114,46,10,0,83,73,71,73,76,76,58,32,73,108,108,101,103,97,108,32,111,112,101,114,97,116,105,111,110,46,10,0,83,73,71,80,73,80,69,58,32,80,105,112,101,32,99,108,111,115,101,100,46,10,0,117,110,107,110,111,119,110,32,115,105,103,110,97,108,10,0,83,73,71,73,78,84,58,32,73,110,116,101,114,114,117,112,116,101,100,32,98,121,32,67,116,114,108,45,67,46,10,0,69,114,114,111,114,58,32,117,110,104,97,110,100,108,101,100,32,101,120,99,101,112,116,105,111,110,58,32,0,79,118,101,114,102,108,111,119,69,114,114,111,114,0,112,97,114,101,110,116,0,110,97,109,101,0,109,115,103,0,116,114,97,99,101,0,110,105,108,0,37,115,37,115,10,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  var attributeNames=["TEXT","class","for","placeholder","type","value","width","title"];
  
  
  var tags=["DOCUMENT_ROOT","TEXT","a","button","div","h1","header","hr","input","label","li","p","section","span","table","tbody","td","tr","ul"];function renderElement(p) {
      p = p | 0;
  
      var t = HEAP32[((p)>>2)];
      p += 4;
      var kids = HEAP32[((p)>>2)];
      p += 4;
      var attrs = HEAP32[((p)>>2)];
      p += 4;
  
      var e;
      switch(t) {
        case 0:
          console.log("render DOCUMENT_ROOT");
          e = createTextNode("error: DOCUMENT ROOT HERE");
          break;
        case 1:
          p += 4; //attrid == text
          var text = AsciiToString(HEAP32[((p)>>2)]);
          e = document.createTextNode(text);
          p += 4;
          break;
        default:
          e = document.createElement(tags[t]);
          for (var i=0; i<attrs; i++) {
            var a = HEAP32[((p)>>2)];
            p += 4;
            var v = HEAP32[((p)>>2)];
            p += 4;
            var value = AsciiToString(v);
            e.setAttribute(attributeNames[a], value);
          }
          for (var i=0; i<kids; i++) {
            var kid = HEAP32[((p)>>2)];
            p += 4;
            var re = renderElement(kid);
            e.appendChild(re);
          }
      }
      return e;
    }function _JSrender(p) {
      p = p | 0;
      var element = document.getElementById("app");
      //console.log("RENDER: ", p);
      // p is PATCH address
      while(true) {
        var cmd = HEAP32[((p)>>2)] | 0;
        //console.log("cmd: ", cmd);
        p += 4;
        switch(cmd) {
          case 0: // HALT
            return;
          case 1: // NAV_UP
            var times = HEAP32[((p)>>2)] | 0;
            p += 4;
            for(var i=0;i<times;i++)
              element = element.parentNode;
            break;
          case 2: // NAV_KID
            var nkid = HEAP32[((p)>>2)] | 0;
            p += 4;
            element = element.children[nkid];
            break;
          case 3: // NAV_PARENT
            element = element.parentNode;
            break;
          case 4: // NAV_GRAND_PARENT
            element = element.parentNode.parentNode;
            break;
          case 5: // NAV_FIRST_CHILD
            element = element.firstChild;
            break;
          case 6: // NAV_SECOND_CHILD
            element = element.firstChild.nextSibling;
            break;
          case 7: // NAV_NEXT_SIBLING
            element = element.nextSibling;
            break;
          case 8: // APPEND
            var e = HEAP32[((p)>>2)] | 0;
            p += 4;          
            element.appendChild(renderElement(e));
            break;
          case 9: // REMOVE_LAST
            element.removeChild(element.lastChild);
            break;
          case 10: // REMOVE_LAST_MANY
            var times = HEAP32[((p)>>2)] | 0;
            p += 4;   
            for(var i=0;i<times;i++)
              element.removeChild(element.lastChild);
            break;
          case 11: // ATTR_SET
            var attr = HEAP32[((p)>>2)] | 0;
            p += 4;   
            var value = AsciiToString(HEAP32[((p)>>2)]);
            p += 4;
            if(attr == 0) {
              //console.log("current value: ", element.nodeValue);
              //console.log("text: ", value);
              element.nodeValue = value;
            } else {
              element.setAttribute(attributeNames[attr], value);
            }
            break;
          case 12: // ATTR_REMOVE
            var attr = HEAP32[((p)>>2)] | 0;
            p += 4;   
            element.removeAttribute(attributeNames[attr]);
            break;
          default:
            console.log("SHIT HAPPENS");
            return;
        }
      }
    }

  
  var _tzname=STATICTOP; STATICTOP += 16;;
  
  var _daylight=STATICTOP; STATICTOP += 16;;
  
  var _timezone=STATICTOP; STATICTOP += 16;;function _tzset() {
      // TODO: Use (malleable) environment variables instead of system settings.
      if (_tzset.called) return;
      _tzset.called = true;
  
      HEAP32[((_timezone)>>2)]=-(new Date()).getTimezoneOffset() * 60;
  
      var winter = new Date(2000, 0, 1);
      var summer = new Date(2000, 6, 1);
      HEAP32[((_daylight)>>2)]=Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
  
      function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT";
      };
      var winterName = extractZone(winter);
      var summerName = extractZone(summer);
      var winterNamePtr = allocate(intArrayFromString(winterName), 'i8', ALLOC_NORMAL);
      var summerNamePtr = allocate(intArrayFromString(summerName), 'i8', ALLOC_NORMAL);
      if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        // Northern hemisphere
        HEAP32[((_tzname)>>2)]=winterNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=summerNamePtr;
      } else {
        HEAP32[((_tzname)>>2)]=summerNamePtr;
        HEAP32[(((_tzname)+(4))>>2)]=winterNamePtr;
      }
    }

   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

  
  
  var Browser={mainLoop:{scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function () {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++; // Incrementing this signals the previous main loop that it's now become old, and it must return.
        },resume:function () {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true /* do not set timing and call scheduler, we will do it on the next lines */);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        },runIter:function (func) {
          if (ABORT) return;
          if (Module['preMainLoop']) {
            var preRet = Module['preMainLoop']();
            if (preRet === false) {
              return; // |return false| skips a frame
            }
          }
          try {
            func();
          } catch (e) {
            if (e instanceof ExitStatus) {
              return;
            } else {
              if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
              throw e;
            }
          }
          if (Module['postMainLoop']) Module['postMainLoop']();
        }},isFullscreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers
  
        if (Browser.initted) return;
        Browser.initted = true;
  
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
          console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
          Module.noImageDecoding = true;
        }
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              if (b.size !== byteArray.length) { // Safari bug #118630
                // Safari's Blob can only take an ArrayBuffer
                b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
              }
            } catch(e) {
              Runtime.warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
          var img = new Image();
          img.onload = function img_onload() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function img_onerror(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function audio_onerror(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            Browser.safeSetTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
  
        // Canvas event setup
  
        var canvas = Module['canvas'];
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === canvas ||
                                document['mozPointerLockElement'] === canvas ||
                                document['webkitPointerLockElement'] === canvas ||
                                document['msPointerLockElement'] === canvas;
        }
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
          
          canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                      canvas['mozRequestPointerLock'] ||
                                      canvas['webkitRequestPointerLock'] ||
                                      canvas['msRequestPointerLock'] ||
                                      function(){};
          canvas.exitPointerLock = document['exitPointerLock'] ||
                                   document['mozExitPointerLock'] ||
                                   document['webkitExitPointerLock'] ||
                                   document['msExitPointerLock'] ||
                                   function(){}; // no-op if function does not exist
          canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
  
  
          document.addEventListener('pointerlockchange', pointerLockChange, false);
          document.addEventListener('mozpointerlockchange', pointerLockChange, false);
          document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
          document.addEventListener('mspointerlockchange', pointerLockChange, false);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener("click", function(ev) {
              if (!Browser.pointerLock && canvas.requestPointerLock) {
                canvas.requestPointerLock();
                ev.preventDefault();
              }
            }, false);
          }
        }
      },createContext:function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx === 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
  
          Module.ctx = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullscreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullscreen:function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
  
        var canvas = Module['canvas'];
        function fullscreenChange() {
          Browser.isFullscreen = false;
          var canvasContainer = canvas.parentNode;
          if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
               document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
               document['webkitCurrentFullScreenElement']) === canvasContainer) {
            canvas.exitFullscreen = document['exitFullscreen'] ||
                                    document['cancelFullScreen'] ||
                                    document['mozCancelFullScreen'] ||
                                    document['msExitFullscreen'] ||
                                    document['webkitCancelFullScreen'] ||
                                    function() {};
            canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullscreen = true;
            if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize();
          } else {
            
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
            
            if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
          if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
          Browser.updateCanvasDimensions(canvas);
        }
  
        if (!Browser.fullscreenHandlersInstalled) {
          Browser.fullscreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullscreenChange, false);
          document.addEventListener('mozfullscreenchange', fullscreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
          document.addEventListener('MSFullscreenChange', fullscreenChange, false);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
                                            canvasContainer['mozRequestFullScreen'] ||
                                            canvasContainer['msRequestFullscreen'] ||
                                           (canvasContainer['webkitRequestFullscreen'] ? function() { canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null) ||
                                           (canvasContainer['webkitRequestFullScreen'] ? function() { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
  
        if (vrDevice) {
          canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
        } else {
          canvasContainer.requestFullscreen();
        }
      },requestFullScreen:function (lockPointer, resizeCanvas, vrDevice) {
          Module.printErr('Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.');
          Browser.requestFullScreen = function(lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
          }
          return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
      },nextRAF:0,fakeRequestAnimationFrame:function (func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (Browser.nextRAF === 0) {
          Browser.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            Browser.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
      },requestAnimationFrame:function requestAnimationFrame(func) {
        if (typeof window === 'undefined') { // Provide fallback to setTimeout if window is undefined (e.g. in Node.js)
          Browser.fakeRequestAnimationFrame(func);
        } else {
          if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                           window['mozRequestAnimationFrame'] ||
                                           window['webkitRequestAnimationFrame'] ||
                                           window['msRequestAnimationFrame'] ||
                                           window['oRequestAnimationFrame'] ||
                                           Browser.fakeRequestAnimationFrame;
          }
          window.requestAnimationFrame(func);
        }
      },safeCallback:function (func) {
        return function() {
          if (!ABORT) return func.apply(null, arguments);
        };
      },allowAsyncCallbacks:true,queuedAsyncCallbacks:[],pauseAsyncCallbacks:function () {
        Browser.allowAsyncCallbacks = false;
      },resumeAsyncCallbacks:function () { // marks future callbacks as ok to execute, and synchronously runs any remaining ones right now
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
          var callbacks = Browser.queuedAsyncCallbacks;
          Browser.queuedAsyncCallbacks = [];
          callbacks.forEach(function(func) {
            func();
          });
        }
      },safeRequestAnimationFrame:function (func) {
        return Browser.requestAnimationFrame(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        });
      },safeSetTimeout:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setTimeout(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        }, timeout);
      },safeSetInterval:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setInterval(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } // drop it on the floor otherwise, next interval will kick in
        }, timeout);
      },getMimetype:function (name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.substr(name.lastIndexOf('.')+1)];
      },getUserMedia:function (func) {
        if(!window.getUserMedia) {
          window.getUserMedia = navigator['getUserMedia'] ||
                                navigator['mozGetUserMedia'];
        }
        window.getUserMedia(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },getMouseWheelDelta:function (event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll': 
            delta = event.detail;
            break;
          case 'mousewheel': 
            delta = event.wheelDelta;
            break;
          case 'wheel': 
            delta = event['deltaY'];
            break;
          default:
            throw 'unrecognized mouse wheel event: ' + event.type;
        }
        return delta;
      },mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function (event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          // Workaround for Firefox bug 764498
          if (event.type != 'mousemove' &&
              ('mozMovementX' in event)) {
            Browser.mouseMovementX = Browser.mouseMovementY = 0;
          } else {
            Browser.mouseMovementX = Browser.getMovementX(event);
            Browser.mouseMovementY = Browser.getMovementY(event);
          }
          
          // check if SDL is available
          if (typeof SDL != "undefined") {
          	Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
          	Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
          } else {
          	// just add the mouse delta to the current absolut mouse position
          	// FIXME: ideally this should be clamped against the canvas size and zero
          	Browser.mouseX += Browser.mouseMovementX;
          	Browser.mouseY += Browser.mouseMovementY;
          }        
        } else {
          // Otherwise, calculate the movement based on the changes
          // in the coordinates.
          var rect = Module["canvas"].getBoundingClientRect();
          var cw = Module["canvas"].width;
          var ch = Module["canvas"].height;
  
          // Neither .scrollX or .pageXOffset are defined in a spec, but
          // we prefer .scrollX because it is currently in a spec draft.
          // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
          var scrollX = ((typeof window.scrollX !== 'undefined') ? window.scrollX : window.pageXOffset);
          var scrollY = ((typeof window.scrollY !== 'undefined') ? window.scrollY : window.pageYOffset);
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the "touch" property is only defined in SDL
  
            }
            var adjustedX = touch.pageX - (scrollX + rect.left);
            var adjustedY = touch.pageY - (scrollY + rect.top);
  
            adjustedX = adjustedX * (cw / rect.width);
            adjustedY = adjustedY * (ch / rect.height);
  
            var coords = { x: adjustedX, y: adjustedY };
            
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              if (!last) last = coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            } 
            return;
          }
  
          var x = event.pageX - (scrollX + rect.left);
          var y = event.pageY - (scrollY + rect.top);
  
          // the canvas might be CSS-scaled compared to its backbuffer;
          // SDL-using content will want mouse coordinates in terms
          // of backbuffer units.
          x = x * (cw / rect.width);
          y = y * (ch / rect.height);
  
          Browser.mouseMovementX = x - Browser.mouseX;
          Browser.mouseMovementY = y - Browser.mouseY;
          Browser.mouseX = x;
          Browser.mouseY = y;
        }
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
        Module['readAsync'](url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (dep) addRunDependency(dep);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullscreenCanvasSize:function () {
        // check if SDL is available   
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },updateCanvasDimensions:function (canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
          if (w/h < Module['forcedAspectRatio']) {
            w = Math.round(h * Module['forcedAspectRatio']);
          } else {
            h = Math.round(w / Module['forcedAspectRatio']);
          }
        }
        if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
             document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
             document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( "width");
            canvas.style.removeProperty("height");
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( "width", w + "px", "important");
              canvas.style.setProperty("height", h + "px", "important");
            } else {
              canvas.style.removeProperty( "width");
              canvas.style.removeProperty("height");
            }
          }
        }
      },wgetRequests:{},nextWgetRequestHandle:0,getNextWgetRequestHandle:function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
      }};function _emscripten_set_main_loop_timing(mode, value) {
      Browser.mainLoop.timingMode = mode;
      Browser.mainLoop.timingValue = value;
  
      if (!Browser.mainLoop.func) {
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
        Browser.mainLoop.method = 'timeout';
      } else if (mode == 1 /*EM_TIMING_RAF*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
          Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'rAF';
      } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
        if (!window['setImmediate']) {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = 'setimmediate';
          function Browser_setImmediate_messageHandler(event) {
            if (event.source === window && event.data === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          window.addEventListener("message", Browser_setImmediate_messageHandler, true);
          window['setImmediate'] = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            if (ENVIRONMENT_IS_WORKER) {
              if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
              Module['setImmediates'].push(func);
              window.postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
            } else window.postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          window['setImmediate'](Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }
  
  function _emscripten_get_now() { abort() }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
      Module['noExitRuntime'] = true;
  
      assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  
      Browser.mainLoop.func = func;
      Browser.mainLoop.arg = arg;
  
      var browserIterationFunc;
      if (typeof arg !== 'undefined') {
        var argArray = [arg];
        browserIterationFunc = function() {
          Runtime.dynCall('vi', func, argArray);
        };
      } else {
        browserIterationFunc = function() {
          Runtime.dynCall('v', func);
        };
      }
  
      var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  
      Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = Browser.mainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (Browser.mainLoop.remainingBlockers) {
            var remaining = Browser.mainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              Browser.mainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
          Browser.mainLoop.updateStatus();
          
          // catches pause/resume main loop from blocker execution
          if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
          
          setTimeout(Browser.mainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Implement very basic swap interval control
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          Browser.mainLoop.scheduler();
          return;
        } else if (Browser.mainLoop.timingMode == 0/*EM_TIMING_SETTIMEOUT*/) {
          Browser.mainLoop.tickStartTime = _emscripten_get_now();
        }
  
        // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
        // VBO double-buffering and reduce GPU stalls.
  
  
        if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
          Module.printErr('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          Browser.mainLoop.method = ''; // just warn once per call to set main loop
        }
  
        Browser.mainLoop.runIter(browserIterationFunc);
  
        checkStackCookie();
  
        // catch pauses from the main loop itself
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
        // to queue the newest produced audio samples.
        // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
        //       do not need to be hardcoded into this function, but can be more generic.
        if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
  
        Browser.mainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
        else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)
  
        Browser.mainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'SimulateInfiniteLoop';
      }
    }

   
  Module["_memset"] = _memset;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _abort() {
      Module['abort']();
    }

   
  Module["_pthread_self"] = _pthread_self;

  
  
  function _realloc() { throw 'bad' }
  Module["_realloc"] = _realloc; 
  Module["_saveSetjmp"] = _saveSetjmp;
  
   
  Module["_testSetjmp"] = _testSetjmp;function _longjmp(env, value) {
      asm['setThrew'](env, value || 1);
      throw 'longjmp';
    }

  function ___lock() {}

  function ___unlock() {}

  
  
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up--; up) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.buffer.byteLength which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.buffer.byteLength : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) { // Can we just reuse the buffer we are given?
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
          transaction.onerror = function(e) {
            callback(this.error);
            e.preventDefault();
          };
  
          var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
          var index = store.index('timestamp');
  
          index.openKeyCursor().onsuccess = function(event) {
            var cursor = event.target.result;
  
            if (!cursor) {
              return callback(null, { type: 'remote', db: db, entries: entries });
            }
  
            entries[cursor.primaryKey] = { timestamp: cursor.key };
  
            cursor.continue();
          };
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { encoding: 'binary', canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // On Windows, directories return permission bits 'rw-rw-rw-', even though they have 'rwxrwxrwx', so
            // propagate write bits to execute bits.
            stat.mode = stat.mode | ((stat.mode & 146) >> 1);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsToPermissionStringMap:{0:"r",1:"r+",2:"r+",64:"r",65:"r+",66:"r+",129:"rx+",193:"rx+",514:"w+",577:"w",578:"w+",705:"wx",706:"wx+",1024:"a",1025:"a",1026:"a+",1089:"a",1090:"a+",1153:"ax",1154:"ax+",1217:"ax",1218:"ax+",4096:"rs",4098:"rs+"},flagsToPermissionString:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        if (flags in NODEFS.flagsToPermissionStringMap) {
          return NODEFS.flagsToPermissionStringMap[flags];
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          if (length === 0) return 0; // node errors on 0 length reads
          // FIXME this is terrible.
          var nbuffer = new Buffer(length);
          var res;
          try {
            res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          if (res > 0) {
            for (var i = 0; i < res; i++) {
              buffer[offset + i] = nbuffer[i];
            }
          }
          return res;
        },write:function (stream, buffer, offset, length, position) {
          // FIXME this is terrible.
          var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
          var res;
          try {
            res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return res;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin=STATICTOP; STATICTOP += 16;;
  
  var _stdout=STATICTOP; STATICTOP += 16;;
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:[null],streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            Module['printErr']('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
      },llseek:function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        opts.encoding = opts.encoding || 'utf8';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var stream = FS.open(path, opts.flags, opts.mode);
        if (opts.encoding === 'utf8') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn);
        } else if (opts.encoding === 'binary') {
          FS.write(stream, data, 0, data.length, 0, opts.canOwn);
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs
          random_device = function() { return require('crypto').randomBytes(1)[0]; };
        } else {
          // default for ES5 platforms
          random_device = function() { return (Math.random()*256)|0; };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //Module.printErr(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC); 
  Module["_llvm_cttz_i32"] = _llvm_cttz_i32; 
  Module["___udivmoddi4"] = ___udivmoddi4; 
  Module["___udivdi3"] = ___udivdi3;

   
  Module["_sbrk"] = _sbrk;

  function _clock() {
      if (_clock.start === undefined) _clock.start = Date.now();
      return ((Date.now() - _clock.start) * (1000000 / 1000))|0;
    }

  
  var __sigalrm_handler=0;function _signal(sig, func) {
      if (sig == 14 /*SIGALRM*/) {
        __sigalrm_handler = func;
      } else {
        Module.printErr('Calling stub instead of signal()');
      }
      return 0;
    }

   
  Module["___uremdi3"] = ___uremdi3;

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;


  function ___syscall192(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // mmap2
      var addr = SYSCALLS.get(), len = SYSCALLS.get(), prot = SYSCALLS.get(), flags = SYSCALLS.get(), fd = SYSCALLS.get(), off = SYSCALLS.get()
      off <<= 12; // undo pgoffset
      var ptr;
      var allocated = false;
      if (fd === -1) {
        ptr = _malloc(len);
        if (!ptr) return -ERRNO_CODES.ENOMEM;
        _memset(ptr, 0, len);
        allocated = true;
      } else {
        var info = FS.getStream(fd);
        if (!info) return -ERRNO_CODES.EBADF;
        var res = FS.mmap(info, HEAPU8, addr, len, off, prot, flags);
        ptr = res.ptr;
        allocated = res.allocated;
      }
      SYSCALLS.mappings[ptr] = { malloc: ptr, len: len, allocated: allocated, fd: fd, flags: flags };
      return ptr;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function __exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      Module['exit'](status);
    }function _exit(status) {
      __exit(status);
    }

  function ___syscall91(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // munmap
      var addr = SYSCALLS.get(), len = SYSCALLS.get();
      // TODO: support unmmap'ing parts of allocations
      var info = SYSCALLS.mappings[addr];
      if (!info) return 0;
      if (len === info.len) {
        var stream = FS.getStream(info.fd);
        SYSCALLS.doMsync(addr, stream, len, info.flags)
        FS.munmap(stream);
        SYSCALLS.mappings[addr] = null;
        if (info.allocated) {
          _free(info.malloc);
        }
      }
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21506: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead."); Module["requestFullScreen"] = Module["requestFullscreen"]; Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (typeof self === 'object' && self['performance'] && typeof self['performance']['now'] === 'function') {
    _emscripten_get_now = function() { return self['performance']['now'](); };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function() { return performance['now'](); };
  } else {
    _emscripten_get_now = Date.now;
  };
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });Module["FS_createFolder"] = FS.createFolder;Module["FS_createPath"] = FS.createPath;Module["FS_createDataFile"] = FS.createDataFile;Module["FS_createPreloadedFile"] = FS.createPreloadedFile;Module["FS_createLazyFile"] = FS.createLazyFile;Module["FS_createLink"] = FS.createLink;Module["FS_createDevice"] = FS.createDevice;Module["FS_unlink"] = FS.unlink;;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_v": nullFunc_v, "nullFunc_iii": nullFunc_iii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_v": invoke_v, "invoke_iii": invoke_iii, "_pthread_cleanup_pop": _pthread_cleanup_pop, "_abort": _abort, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_longjmp": _longjmp, "_signal": _signal, "_tzset": _tzset, "___setErrNo": ___setErrNo, "___syscall192": ___syscall192, "_emscripten_memcpy_big": _emscripten_memcpy_big, "__exit": __exit, "_clock": _clock, "renderElement": renderElement, "___syscall91": ___syscall91, "___syscall54": ___syscall54, "___unlock": ___unlock, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_get_now": _emscripten_get_now, "___lock": ___lock, "___syscall6": ___syscall6, "_pthread_cleanup_push": _pthread_cleanup_push, "___syscall140": ___syscall140, "_exit": _exit, "_JSrender": _JSrender, "___syscall146": ___syscall146, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_iii=env.nullFunc_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_v=env.invoke_v;
  var invoke_iii=env.invoke_iii;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var _abort=env._abort;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _longjmp=env._longjmp;
  var _signal=env._signal;
  var _tzset=env._tzset;
  var ___setErrNo=env.___setErrNo;
  var ___syscall192=env.___syscall192;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var __exit=env.__exit;
  var _clock=env._clock;
  var renderElement=env.renderElement;
  var ___syscall91=env.___syscall91;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_get_now=env._emscripten_get_now;
  var ___lock=env.___lock;
  var ___syscall6=env.___syscall6;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var ___syscall140=env.___syscall140;
  var _exit=env._exit;
  var _JSrender=env._JSrender;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _unknown_emscriptenInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_emscriptenDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_bytesInit000() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1820]|0;
 $1 = (($0) + 1)|0;
 HEAP32[1820] = $1;
 $2 = (7284 + ($0)|0);
 HEAP8[$2>>0] = 1;
 HEAP8[(7284)>>0] = 1;
 return;
}
function _unknown_bytesDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _initpatch_134031_1183121033($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2064|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2064|0);
 $1 = sp;
 _memset(($1|0),0,2064)|0;
 $2 = ((($1)) + 2056|0);
 _initbuf_124455_1295010462($2,1048576);
 _memcpy(($0|0),($1|0),2064)|0;
 STACKTOP = sp;return;
}
function _clear_134038_1183121033($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 1024|0);
 HEAP32[$1>>2] = 0;
 $2 = ((($0)) + 2052|0);
 HEAP32[$2>>2] = 0;
 $3 = ((($0)) + 2056|0);
 _clear_124484_1295010462($3);
 return;
}
function _navigate_134843_1183121033($0) {
 $0 = $0|0;
 var $$ = 0, $$032$i = 0, $$032$i75 = 0, $$032$i81 = 0, $$072 = 0, $$173 = 0, $$17388 = 0, $$pre = 0, $$pre$i = 0, $$pre$i77 = 0, $$pre$i83 = 0, $$pre$phi94Z2D = 0, $$pre$phiZ2D = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0;
 var $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $14 = 0, $15 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond$i = 0, $exitcond$i76 = 0, $exitcond$i82 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 1024|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 2052|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2|0)>($4|0);
 $$ = $5 ? $4 : $2;
 $$072 = 0;
 while(1) {
  $6 = ($$072|0)<($$|0);
  if (!($6)) {
   $$17388 = $$072;
   break;
  }
  $7 = (((($0)) + 1028|0) + ($$072<<2)|0);
  $8 = (($0) + ($$072<<2)|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = HEAP32[$7>>2]|0;
  $11 = ($9|0)==($10|0);
  $12 = $11&1;
  $$173 = (($12) + ($$072))|0;
  if ($11) {
   $$072 = $$173;
  } else {
   $$17388 = $$173;
   break;
  }
 }
 $13 = ($2|0)>($$17388|0);
 if (!($13)) {
  $116 = ($4|0)>($$17388|0);
  if ($116) {
   $117 = ((($0)) + 2060|0);
   $$032$i75 = $$17388;
   while(1) {
    $118 = (((($0)) + 1028|0) + ($$032$i75<<2)|0);
    $119 = HEAP32[$118>>2]|0;
    $120 = (($0) + ($$032$i75<<2)|0);
    HEAP32[$120>>2] = $119;
    switch ($119|0) {
    case 0:  {
     $121 = HEAP32[$117>>2]|0;
     HEAP32[$121>>2] = 5;
     $122 = $121;
     $123 = (($122) + 4)|0;
     $124 = $123;
     HEAP32[$117>>2] = $124;
     break;
    }
    case 1:  {
     $125 = HEAP32[$117>>2]|0;
     HEAP32[$125>>2] = 6;
     $126 = $125;
     $127 = (($126) + 4)|0;
     $128 = $127;
     HEAP32[$117>>2] = $128;
     break;
    }
    default: {
     $129 = HEAP32[$117>>2]|0;
     HEAP32[$129>>2] = 2;
     $130 = $129;
     $131 = (($130) + 4)|0;
     $132 = $131;
     HEAP32[$117>>2] = $132;
     $133 = HEAP32[$118>>2]|0;
     $134 = $131;
     HEAP32[$134>>2] = $133;
     $135 = (($130) + 8)|0;
     $136 = $135;
     HEAP32[$117>>2] = $136;
    }
    }
    $137 = (($$032$i75) + 1)|0;
    $exitcond$i76 = ($137|0)==($4|0);
    if ($exitcond$i76) {
     break;
    } else {
     $$032$i75 = $137;
    }
   }
   $$pre$i77 = HEAP32[$3>>2]|0;
   $138 = $$pre$i77;
  } else {
   $138 = $4;
  }
  HEAP32[$1>>2] = $138;
  return;
 }
 $14 = ($$17388|0)<($4|0);
 if ($14) {
  $16 = (($0) + ($$17388<<2)|0);
  $17 = (((($0)) + 1028|0) + ($$17388<<2)|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = HEAP32[$16>>2]|0;
  $20 = (($19) + 1)|0;
  $21 = ($18|0)==($20|0);
  $22 = (($2) - ($$17388))|0;
  if ($21) {
   switch ($22|0) {
   case 1:  {
    $$pre = ((($0)) + 2060|0);
    $$pre$phi94Z2D = $$pre;$$pre$phiZ2D = $$pre;
    break;
   }
   case 2:  {
    $23 = ((($0)) + 2060|0);
    $24 = HEAP32[$23>>2]|0;
    HEAP32[$24>>2] = 3;
    $25 = $24;
    $26 = (($25) + 4)|0;
    $27 = $26;
    HEAP32[$23>>2] = $27;
    $$pre$phi94Z2D = $23;$$pre$phiZ2D = $23;
    break;
   }
   case 3:  {
    $28 = ((($0)) + 2060|0);
    $29 = HEAP32[$28>>2]|0;
    HEAP32[$29>>2] = 4;
    $30 = $29;
    $31 = (($30) + 4)|0;
    $32 = $31;
    HEAP32[$28>>2] = $32;
    $$pre$phi94Z2D = $28;$$pre$phiZ2D = $28;
    break;
   }
   default: {
    $33 = ((($0)) + 2060|0);
    $34 = HEAP32[$33>>2]|0;
    HEAP32[$34>>2] = 1;
    $35 = $34;
    $36 = (($35) + 4)|0;
    $37 = HEAP32[$1>>2]|0;
    $38 = $$17388 ^ -1;
    $39 = (($37) + ($38))|0;
    $40 = $36;
    HEAP32[$40>>2] = $39;
    $41 = (($35) + 8)|0;
    $42 = $41;
    HEAP32[$33>>2] = $42;
    $$pre$phi94Z2D = $33;$$pre$phiZ2D = $33;
   }
   }
   $43 = HEAP32[$$pre$phi94Z2D>>2]|0;
   HEAP32[$43>>2] = 7;
   $44 = $43;
   $45 = (($44) + 4)|0;
   $46 = $45;
   HEAP32[$$pre$phiZ2D>>2] = $46;
   $47 = (($$17388) + 1)|0;
   $48 = HEAP32[$3>>2]|0;
   $49 = ($48|0)>($47|0);
   if ($49) {
    $$032$i = $47;
    while(1) {
     $50 = (((($0)) + 1028|0) + ($$032$i<<2)|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = (($0) + ($$032$i<<2)|0);
     HEAP32[$52>>2] = $51;
     switch ($51|0) {
     case 0:  {
      $53 = HEAP32[$$pre$phi94Z2D>>2]|0;
      HEAP32[$53>>2] = 5;
      $54 = $53;
      $55 = (($54) + 4)|0;
      $56 = $55;
      HEAP32[$$pre$phiZ2D>>2] = $56;
      break;
     }
     case 1:  {
      $57 = HEAP32[$$pre$phi94Z2D>>2]|0;
      HEAP32[$57>>2] = 6;
      $58 = $57;
      $59 = (($58) + 4)|0;
      $60 = $59;
      HEAP32[$$pre$phiZ2D>>2] = $60;
      break;
     }
     default: {
      $61 = HEAP32[$$pre$phi94Z2D>>2]|0;
      HEAP32[$61>>2] = 2;
      $62 = $61;
      $63 = (($62) + 4)|0;
      $64 = $63;
      HEAP32[$$pre$phiZ2D>>2] = $64;
      $65 = HEAP32[$50>>2]|0;
      $66 = $63;
      HEAP32[$66>>2] = $65;
      $67 = (($62) + 8)|0;
      $68 = $67;
      HEAP32[$$pre$phiZ2D>>2] = $68;
     }
     }
     $69 = (($$032$i) + 1)|0;
     $exitcond$i = ($69|0)==($48|0);
     if ($exitcond$i) {
      break;
     } else {
      $$032$i = $69;
     }
    }
    $$pre$i = HEAP32[$3>>2]|0;
    $70 = $$pre$i;
   } else {
    $70 = $48;
   }
   HEAP32[$1>>2] = $70;
   $71 = ((($0)) + 1028|0);
   _memcpy(($0|0),($71|0),1024)|0;
   return;
  } else {
   $72 = $22;
  }
 } else {
  $15 = (($2) - ($$17388))|0;
  $72 = $15;
 }
 switch ($72|0) {
 case 0:  {
  break;
 }
 case 1:  {
  $73 = ((($0)) + 2060|0);
  $74 = HEAP32[$73>>2]|0;
  HEAP32[$74>>2] = 3;
  $75 = $74;
  $76 = (($75) + 4)|0;
  $77 = $76;
  HEAP32[$73>>2] = $77;
  break;
 }
 case 2:  {
  $78 = ((($0)) + 2060|0);
  $79 = HEAP32[$78>>2]|0;
  HEAP32[$79>>2] = 4;
  $80 = $79;
  $81 = (($80) + 4)|0;
  $82 = $81;
  HEAP32[$78>>2] = $82;
  break;
 }
 default: {
  $83 = ((($0)) + 2060|0);
  $84 = HEAP32[$83>>2]|0;
  HEAP32[$84>>2] = 1;
  $85 = $84;
  $86 = (($85) + 4)|0;
  $87 = HEAP32[$1>>2]|0;
  $88 = (($87) - ($$17388))|0;
  $89 = $86;
  HEAP32[$89>>2] = $88;
  $90 = (($85) + 8)|0;
  $91 = $90;
  HEAP32[$83>>2] = $91;
 }
 }
 $92 = HEAP32[$3>>2]|0;
 $93 = ($92|0)>($$17388|0);
 if ($93) {
  $94 = ((($0)) + 2060|0);
  $$032$i81 = $$17388;
  while(1) {
   $95 = (((($0)) + 1028|0) + ($$032$i81<<2)|0);
   $96 = HEAP32[$95>>2]|0;
   $97 = (($0) + ($$032$i81<<2)|0);
   HEAP32[$97>>2] = $96;
   switch ($96|0) {
   case 0:  {
    $98 = HEAP32[$94>>2]|0;
    HEAP32[$98>>2] = 5;
    $99 = $98;
    $100 = (($99) + 4)|0;
    $101 = $100;
    HEAP32[$94>>2] = $101;
    break;
   }
   case 1:  {
    $102 = HEAP32[$94>>2]|0;
    HEAP32[$102>>2] = 6;
    $103 = $102;
    $104 = (($103) + 4)|0;
    $105 = $104;
    HEAP32[$94>>2] = $105;
    break;
   }
   default: {
    $106 = HEAP32[$94>>2]|0;
    HEAP32[$106>>2] = 2;
    $107 = $106;
    $108 = (($107) + 4)|0;
    $109 = $108;
    HEAP32[$94>>2] = $109;
    $110 = HEAP32[$95>>2]|0;
    $111 = $108;
    HEAP32[$111>>2] = $110;
    $112 = (($107) + 8)|0;
    $113 = $112;
    HEAP32[$94>>2] = $113;
   }
   }
   $114 = (($$032$i81) + 1)|0;
   $exitcond$i82 = ($114|0)==($92|0);
   if ($exitcond$i82) {
    break;
   } else {
    $$032$i81 = $114;
   }
  }
  $$pre$i83 = HEAP32[$3>>2]|0;
  $115 = $$pre$i83;
 } else {
  $115 = $92;
 }
 HEAP32[$1>>2] = $115;
 return;
}
function _diffattrs_138628_1183121033($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$$i = 0, $$0112 = 0, $$071113 = 0, $$072 = 0, $$073$ph = 0, $$073$ph$be = 0, $$073$ph101 = 0, $$075$ph = 0, $$pre = 0, $$sroa$0$0$copyload = 0, $$sroa$082$0$copyload = 0, $$sroa$087$0$copyload = 0, $$sroa$484$0$copyload = 0, $$sroa$489$0$copyload = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $9 = 0, $exitcond = 0, $exitcond119 = 0, $switch = 0, $trunc = 0, $trunc$clear = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1;
 $4 = (($3) + 12)|0;
 $5 = $4;
 $6 = $2;
 $7 = (($6) + 12)|0;
 $8 = $7;
 $9 = ((($2)) + 8|0);
 $10 = ((($1)) + 8|0);
 $11 = ((($0)) + 2060|0);
 $$073$ph = 0;$$075$ph = 0;
 L1: while(1) {
  $12 = (($8) + ($$075$ph<<3)|0);
  $13 = (((($8) + ($$075$ph<<3)|0)) + 4|0);
  $$073$ph101 = $$073$ph;
  L3: while(1) {
   $14 = (($5) + ($$073$ph101<<3)|0);
   $15 = (((($5) + ($$073$ph101<<3)|0)) + 4|0);
   while(1) {
    $16 = HEAP32[$10>>2]|0;
    $17 = ($$073$ph101|0)<($16|0);
    if (!($17)) {
     $60 = $16;
     break L1;
    }
    $18 = HEAP32[$9>>2]|0;
    $19 = ($$075$ph|0)<($18|0);
    if (!($19)) {
     $60 = $16;
     break L1;
    }
    $20 = HEAP32[$14>>2]|0;
    $21 = HEAP32[$12>>2]|0;
    $22 = (_cmp_125146_1689653243($20,$21)|0);
    $23 = ($22|0)==(0);
    if (!($23)) {
     break;
    }
    $24 = HEAP32[$15>>2]|0;
    $25 = HEAP32[$13>>2]|0;
    $26 = ($24|0)==($25|0);
    $27 = $24;
    do {
     if ($26) {
      $$072 = 7;
     } else {
      $28 = ($24|0)==(0|0);
      $29 = ($25|0)==(0|0);
      $$$i = $28 | $29;
      if (!($$$i)) {
       $30 = (_strcmp($24,$25)|0);
       $31 = ($30|0)==(0);
       if ($31) {
        $$072 = 7;
        break;
       }
      }
      $$sroa$0$0$copyload = HEAPU8[$14>>0]|(HEAPU8[$14+1>>0]<<8)|(HEAPU8[$14+2>>0]<<16)|(HEAPU8[$14+3>>0]<<24);
      _navigate_134843_1183121033($0);
      $32 = HEAP32[$11>>2]|0;
      HEAP32[$32>>2] = 11;
      $33 = $32;
      $34 = (($33) + 4)|0;
      $35 = $34;
      HEAP32[$35>>2] = $$sroa$0$0$copyload;
      $36 = (($33) + 8)|0;
      $37 = $36;
      HEAP32[$37>>2] = $27;
      $38 = (($33) + 12)|0;
      $39 = $38;
      HEAP32[$11>>2] = $39;
      $$072 = 0;
     }
    } while(0);
    $trunc = $$072&255;
    $trunc$clear = $trunc & 7;
    switch ($trunc$clear<<24>>24) {
    case 7: case 0:  {
     label = 12;
     break L3;
     break;
    }
    default: {
    }
    }
    $switch = ($$072|0)==(0);
    if (!($switch)) {
     label = 18;
     break L1;
    }
   }
   $41 = ($22|0)<(0);
   if (!($41)) {
    label = 15;
    break;
   }
   $$sroa$082$0$copyload = HEAPU8[$14>>0]|(HEAPU8[$14+1>>0]<<8)|(HEAPU8[$14+2>>0]<<16)|(HEAPU8[$14+3>>0]<<24);
   $$sroa$484$0$copyload = HEAPU8[$15>>0]|(HEAPU8[$15+1>>0]<<8)|(HEAPU8[$15+2>>0]<<16)|(HEAPU8[$15+3>>0]<<24);
   _navigate_134843_1183121033($0);
   $42 = HEAP32[$11>>2]|0;
   HEAP32[$42>>2] = 11;
   $43 = $42;
   $44 = (($43) + 4)|0;
   $45 = $44;
   HEAP32[$45>>2] = $$sroa$082$0$copyload;
   $46 = (($43) + 8)|0;
   $47 = $46;
   HEAP32[$47>>2] = $$sroa$484$0$copyload;
   $48 = (($43) + 12)|0;
   $49 = $48;
   HEAP32[$11>>2] = $49;
   $50 = (($$073$ph101) + 1)|0;
   $$073$ph101 = $50;
  }
  if ((label|0) == 12) {
   label = 0;
   $40 = (($$073$ph101) + 1)|0;
   $$073$ph$be = $40;
  }
  else if ((label|0) == 15) {
   label = 0;
   $51 = HEAP32[$12>>2]|0;
   _navigate_134843_1183121033($0);
   $52 = HEAP32[$11>>2]|0;
   HEAP32[$52>>2] = 12;
   $53 = $52;
   $54 = (($53) + 4)|0;
   $55 = $54;
   HEAP32[$55>>2] = $51;
   $56 = (($53) + 8)|0;
   $57 = $56;
   HEAP32[$11>>2] = $57;
   $$073$ph$be = $$073$ph101;
  }
  $58 = (($$075$ph) + 1)|0;
  $$073$ph = $$073$ph$be;$$075$ph = $58;
 }
 if ((label|0) == 18) {
  $$pre = HEAP32[$10>>2]|0;
  $60 = $$pre;
 }
 $59 = ($$073$ph101|0)<($60|0);
 if ($59) {
  $$071113 = $$073$ph101;
  while(1) {
   $$sroa$087$0$copyload = HEAPU8[$14>>0]|(HEAPU8[$14+1>>0]<<8)|(HEAPU8[$14+2>>0]<<16)|(HEAPU8[$14+3>>0]<<24);
   $$sroa$489$0$copyload = HEAPU8[$15>>0]|(HEAPU8[$15+1>>0]<<8)|(HEAPU8[$15+2>>0]<<16)|(HEAPU8[$15+3>>0]<<24);
   _navigate_134843_1183121033($0);
   $61 = HEAP32[$11>>2]|0;
   HEAP32[$61>>2] = 11;
   $62 = $61;
   $63 = (($62) + 4)|0;
   $64 = $63;
   HEAP32[$64>>2] = $$sroa$087$0$copyload;
   $65 = (($62) + 8)|0;
   $66 = $65;
   HEAP32[$66>>2] = $$sroa$489$0$copyload;
   $67 = (($62) + 12)|0;
   $68 = $67;
   HEAP32[$11>>2] = $68;
   $69 = (($$071113) + 1)|0;
   $exitcond119 = ($69|0)==($60|0);
   if ($exitcond119) {
    break;
   } else {
    $$071113 = $69;
   }
  }
 }
 $70 = HEAP32[$9>>2]|0;
 $71 = ($$075$ph|0)<($70|0);
 if ($71) {
  $$0112 = $$075$ph;
 } else {
  return;
 }
 while(1) {
  $72 = HEAP32[$12>>2]|0;
  _navigate_134843_1183121033($0);
  $73 = HEAP32[$11>>2]|0;
  HEAP32[$73>>2] = 12;
  $74 = $73;
  $75 = (($74) + 4)|0;
  $76 = $75;
  HEAP32[$76>>2] = $72;
  $77 = (($74) + 8)|0;
  $78 = $77;
  HEAP32[$11>>2] = $78;
  $79 = (($$0112) + 1)|0;
  $exitcond = ($79|0)==($70|0);
  if ($exitcond) {
   break;
  } else {
   $$0112 = $79;
  }
 }
 return;
}
function _diffchildren_138763_1183121033($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$050$lcssa = 0, $$050$lcssa$ph = 0, $$05054 = 0, $$053 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, $storemerge$i = 0, $storemerge$in$i = 0, $storemerge$in$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1;
 $4 = (($3) + 12)|0;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 << 3;
 $8 = (($4) + ($7))|0;
 $9 = $8;
 $10 = $2;
 $11 = (($10) + 12)|0;
 $12 = ((($2)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = $13 << 3;
 $15 = (($11) + ($14))|0;
 $16 = $15;
 $17 = ((($0)) + 2052|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = (($18) + 1)|0;
 HEAP32[$17>>2] = $19;
 $20 = ((($2)) + 4|0);
 $21 = ((($1)) + 4|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ($22|0)>(0);
 if ($23) {
  $24 = HEAP32[165]|0;
  $$05054 = 0;$66 = $22;
  while(1) {
   $25 = HEAP32[$20>>2]|0;
   $26 = ($$05054|0)<($25|0);
   if (!($26)) {
    $$050$lcssa$ph = $$05054;$67 = $66;
    break;
   }
   $27 = HEAP32[$17>>2]|0;
   $28 = (($27) + -1)|0;
   $29 = (((($0)) + 1028|0) + ($28<<2)|0);
   HEAP32[$29>>2] = $$05054;
   $30 = (($9) + ($$05054<<2)|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = (($16) + ($$05054<<2)|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = HEAP32[$31>>2]|0;
   $35 = ($34|0)==(0);
   do {
    if (!($35)) {
     $36 = HEAP32[$33>>2]|0;
     $37 = ($34|0)==($36|0);
     if ($37) {
      _diffattrs_138628_1183121033($0,$31,$33);
      break;
     } else {
      (_puts((16))|0);
      (_fflush($24)|0);
      break;
     }
    }
   } while(0);
   _diffchildren_138763_1183121033($0,$31,$33);
   $38 = (($$05054) + 1)|0;
   $39 = HEAP32[$21>>2]|0;
   $40 = ($38|0)<($39|0);
   if ($40) {
    $$05054 = $38;$66 = $39;
   } else {
    $$050$lcssa$ph = $38;$67 = $39;
    break;
   }
  }
  $$pre = HEAP32[$17>>2]|0;
  $$050$lcssa = $$050$lcssa$ph;$42 = $$pre;$45 = $67;
 } else {
  $$050$lcssa = 0;$42 = $19;$45 = $22;
 }
 $41 = (($42) + -1)|0;
 HEAP32[$17>>2] = $41;
 $43 = HEAP32[$20>>2]|0;
 $44 = ($43|0)<($45|0);
 if ($44) {
  $46 = ($$050$lcssa|0)<($45|0);
  if (!($46)) {
   return;
  }
  $47 = ((($0)) + 2060|0);
  $$053 = $$050$lcssa;
  while(1) {
   $48 = (($9) + ($$053<<2)|0);
   $49 = HEAP32[$48>>2]|0;
   _navigate_134843_1183121033($0);
   $50 = HEAP32[$47>>2]|0;
   HEAP32[$50>>2] = 8;
   $51 = $50;
   $52 = (($51) + 4)|0;
   $53 = $52;
   HEAP32[$53>>2] = $49;
   $54 = (($51) + 8)|0;
   $55 = $54;
   HEAP32[$47>>2] = $55;
   $56 = (($$053) + 1)|0;
   $exitcond = ($56|0)==($45|0);
   if ($exitcond) {
    break;
   } else {
    $$053 = $56;
   }
  }
  return;
 }
 $57 = ($45|0)<($43|0);
 if (!($57)) {
  return;
 }
 $58 = (($43) - ($$050$lcssa))|0;
 _navigate_134843_1183121033($0);
 $59 = ($58|0)==(1);
 $60 = ((($0)) + 2060|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = $61;
 if ($59) {
  HEAP32[$61>>2] = 9;
  $storemerge$in$in$i = $62;
 } else {
  HEAP32[$61>>2] = 10;
  $63 = (($62) + 4)|0;
  $64 = $63;
  HEAP32[$60>>2] = $64;
  $65 = $63;
  HEAP32[$65>>2] = $58;
  $storemerge$in$in$i = $63;
 }
 $storemerge$in$i = (($storemerge$in$in$i) + 4)|0;
 $storemerge$i = $storemerge$in$i;
 HEAP32[$60>>2] = $storemerge$i;
 return;
}
function _diff_138757_1183121033($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$1>>2]|0;
 $4 = ($3|0)==(0);
 do {
  if (!($4)) {
   $5 = HEAP32[$2>>2]|0;
   $6 = ($3|0)==($5|0);
   if ($6) {
    _diffattrs_138628_1183121033($0,$1,$2);
    break;
   } else {
    (_puts((16))|0);
    $7 = HEAP32[165]|0;
    (_fflush($7)|0);
    break;
   }
  }
 } while(0);
 _diffchildren_138763_1183121033($0,$1,$2);
 return;
}
function _done_138896_1183121033($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 2060|0);
 $2 = HEAP32[$1>>2]|0;
 HEAP32[$2>>2] = 0;
 $3 = $2;
 $4 = (($3) + 4)|0;
 $5 = $4;
 HEAP32[$1>>2] = $5;
 return;
}
function _unknown_diffInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_diffDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _ntcpuTime() {
 var $0 = 0, $1 = 0.0, $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_clock()|0);
 $1 = (+($0|0));
 $2 = $1 / 1.0E+6;
 return (+$2);
}
function _stdlib_timesInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _tzset();
 return;
}
function _stdlib_timesDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_parseutilsInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_parseutilsDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_etcprivInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_etcprivDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_hashesInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_hashesDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_macrosInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_macrosDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_xasInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_xasDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _nsuRepeatChar($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $scevgep = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_mnewString($1)|0);
 $3 = ($1|0)>(0);
 if (!($3)) {
  return ($2|0);
 }
 $scevgep = ((($2)) + 8|0);
 _memset(($scevgep|0),($0|0),($1|0))|0;
 return ($2|0);
}
function _nsuformatFloat($0,$1,$2,$3) {
 $0 = +$0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$026$i = 0, $$027$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond$i = 0, $vararg_buffer = 0, $vararg_buffer2 = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2544|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2544|0);
 $vararg_buffer2 = sp + 16|0;
 $vararg_buffer = sp;
 $4 = sp + 2526|0;
 $5 = sp + 24|0;
 HEAP8[$4>>0] = 37;
 $6 = ($2|0)>(0);
 if ($6) {
  $7 = ((($4)) + 1|0);
  HEAP8[$7>>0] = 35;
  $8 = ((($4)) + 2|0);
  HEAP8[$8>>0] = 46;
  $9 = ((($4)) + 3|0);
  HEAP8[$9>>0] = 42;
  $10 = $1&255;
  $11 = (892 + ($10)|0);
  $12 = HEAP8[$11>>0]|0;
  $13 = ((($4)) + 4|0);
  HEAP8[$13>>0] = $12;
  $14 = ((($4)) + 5|0);
  HEAP8[$14>>0] = 0;
  HEAP32[$vararg_buffer>>2] = $2;
  $vararg_ptr1 = ((($vararg_buffer)) + 8|0);
  HEAPF64[$vararg_ptr1>>3] = $0;
  $15 = (_sprintf($5,$4,$vararg_buffer)|0);
  $$026$i = $15;
 } else {
  $16 = $1&255;
  $17 = (892 + ($16)|0);
  $18 = HEAP8[$17>>0]|0;
  $19 = ((($4)) + 1|0);
  HEAP8[$19>>0] = $18;
  $20 = ((($4)) + 2|0);
  HEAP8[$20>>0] = 0;
  HEAPF64[$vararg_buffer2>>3] = $0;
  $21 = (_sprintf($5,$4,$vararg_buffer2)|0);
  $$026$i = $21;
 }
 $22 = (_mnewString($$026$i)|0);
 $23 = ($$026$i|0)>(0);
 if ($23) {
  $$027$i = 0;
 } else {
  STACKTOP = sp;return ($22|0);
 }
 while(1) {
  $24 = (($5) + ($$027$i)|0);
  $25 = HEAP8[$24>>0]|0;
  switch ($25<<24>>24) {
  case 44: case 46:  {
   $26 = (((($22)) + 8|0) + ($$027$i)|0);
   HEAP8[$26>>0] = $3;
   break;
  }
  default: {
   $27 = (((($22)) + 8|0) + ($$027$i)|0);
   HEAP8[$27>>0] = $25;
  }
  }
  $28 = (($$027$i) + 1)|0;
  $exitcond$i = ($28|0)==($$026$i|0);
  if ($exitcond$i) {
   break;
  } else {
   $$027$i = $28;
  }
 }
 STACKTOP = sp;return ($22|0);
}
function _stdlib_strutilsInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_strutilsDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_htmltagsInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _unknown_htmltagsDatInit000() {
 var $$02123 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[1825] = 1;
 HEAP8[(7304)>>0] = 14;
 HEAP32[(7308)>>2] = 0;
 HEAP8[(7305)>>0] = 3;
 $$02123 = 0;
 while(1) {
  $0 = (7356 + (($$02123*24)|0)|0);
  HEAP8[$0>>0] = 1;
  $1 = (((7356 + (($$02123*24)|0)|0)) + 4|0);
  HEAP32[$1>>2] = $$02123;
  $2 = (40 + ($$02123<<2)|0);
  $3 = HEAP32[$2>>2]|0;
  $4 = (((7356 + (($$02123*24)|0)|0)) + 12|0);
  HEAP32[$4>>2] = $3;
  $5 = (8052 + ($$02123<<2)|0);
  HEAP32[$5>>2] = $0;
  $6 = (($$02123) + 1)|0;
  $exitcond = ($6|0)==(19);
  if ($exitcond) {
   break;
  } else {
   $$02123 = $6;
  }
 }
 HEAP32[(7828)>>2] = 19;
 HEAP8[(7812)>>0] = 2;
 HEAP32[(7832)>>2] = 8052;
 HEAP32[(7312)>>2] = (7812);
 HEAP32[1832] = 1;
 HEAP8[(7332)>>0] = 14;
 HEAP32[(7336)>>2] = 0;
 HEAP8[(7333)>>0] = 3;
 HEAP8[(7836)>>0] = 1;
 HEAP32[(7840)>>2] = 0;
 HEAP32[(7848)>>2] = (895);
 HEAP32[2032] = (7836);
 HEAP8[(7860)>>0] = 1;
 HEAP32[(7864)>>2] = 1;
 HEAP32[(7872)>>2] = (900);
 HEAP32[(8132)>>2] = (7860);
 HEAP8[(7884)>>0] = 1;
 HEAP32[(7888)>>2] = 2;
 HEAP32[(7896)>>2] = (906);
 HEAP32[(8136)>>2] = (7884);
 HEAP8[(7908)>>0] = 1;
 HEAP32[(7912)>>2] = 3;
 HEAP32[(7920)>>2] = (910);
 HEAP32[(8140)>>2] = (7908);
 HEAP8[(7932)>>0] = 1;
 HEAP32[(7936)>>2] = 4;
 HEAP32[(7944)>>2] = (922);
 HEAP32[(8144)>>2] = (7932);
 HEAP8[(7956)>>0] = 1;
 HEAP32[(7960)>>2] = 5;
 HEAP32[(7968)>>2] = (927);
 HEAP32[(8148)>>2] = (7956);
 HEAP8[(7980)>>0] = 1;
 HEAP32[(7984)>>2] = 6;
 HEAP32[(7992)>>2] = (933);
 HEAP32[(8152)>>2] = (7980);
 HEAP8[(8004)>>0] = 1;
 HEAP32[(8008)>>2] = 7;
 HEAP32[(8016)>>2] = (1041);
 HEAP32[(8156)>>2] = (8004);
 HEAP32[(8044)>>2] = 8;
 HEAP8[(8028)>>0] = 2;
 HEAP32[(8048)>>2] = 8128;
 HEAP32[(7340)>>2] = (8028);
 return;
}
function _initbuf_124455_1295010462($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_alloc_7801_1689653243($1)|0);
 HEAP32[$0>>2] = $2;
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = $2;
 return;
}
function _opentag_123270_1295010462($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$cast = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$4>>2] = $2;
 $5 = HEAP32[$3>>2]|0;
 $6 = (($5) + 4)|0;
 $7 = $6;
 HEAP32[$3>>2] = $7;
 $8 = ((($0)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 HEAP32[$0>>2] = $9;
 $10 = (($9) + 12)|0;
 $11 = $10;
 HEAP32[$8>>2] = $11;
 $12 = $1&255;
 $$cast = $9;
 HEAP32[$$cast>>2] = $12;
 $13 = ((($$cast)) + 8|0);
 HEAP32[$13>>2] = 0;
 $14 = ((($$cast)) + 4|0);
 HEAP32[$14>>2] = 0;
 return;
}
function _initdombuilder_124460_1295010462($0) {
 $0 = $0|0;
 var $$sroa$10$0$$sroa_idx6 = 0, $$sroa$11$0$$sroa_idx8 = 0, $$sroa$15$0$$sroa_idx11 = 0, $$sroa$16$0$$sroa_idx13 = 0, $$sroa$17$0$$sroa_idx15 = 0, $$sroa$18$0$$sroa_idx17 = 0, $$sroa$6$0$$sroa_idx2 = 0, $$sroa$7$0$$sroa_idx4 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_alloc_7801_1689653243(1048576)|0);
 $2 = $1;
 $3 = (_alloc_7801_1689653243(8192)|0);
 $4 = $3;
 $5 = (_alloc_7801_1689653243(1048576)|0);
 $6 = (_alloc_7801_1689653243(1048576)|0);
 HEAP32[$3>>2] = 0;
 $7 = (($4) + 4)|0;
 $8 = (($2) + 12)|0;
 HEAP32[$1>>2] = 0;
 $9 = ((($1)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = ((($1)) + 4|0);
 HEAP32[$10>>2] = 0;
 HEAP32[$0>>2] = $2;
 $$sroa$6$0$$sroa_idx2 = ((($0)) + 4|0);
 HEAP32[$$sroa$6$0$$sroa_idx2>>2] = $1;
 $$sroa$7$0$$sroa_idx4 = ((($0)) + 8|0);
 HEAP32[$$sroa$7$0$$sroa_idx4>>2] = $8;
 $$sroa$10$0$$sroa_idx6 = ((($0)) + 12|0);
 HEAP32[$$sroa$10$0$$sroa_idx6>>2] = $3;
 $$sroa$11$0$$sroa_idx8 = ((($0)) + 16|0);
 HEAP32[$$sroa$11$0$$sroa_idx8>>2] = $7;
 $$sroa$15$0$$sroa_idx11 = ((($0)) + 20|0);
 HEAP32[$$sroa$15$0$$sroa_idx11>>2] = $6;
 $$sroa$16$0$$sroa_idx13 = ((($0)) + 24|0);
 HEAP32[$$sroa$16$0$$sroa_idx13>>2] = $6;
 $$sroa$17$0$$sroa_idx15 = ((($0)) + 28|0);
 HEAP32[$$sroa$17$0$$sroa_idx15>>2] = $5;
 $$sroa$18$0$$sroa_idx17 = ((($0)) + 32|0);
 HEAP32[$$sroa$18$0$$sroa_idx17>>2] = $5;
 return;
}
function _attr_123671_1295010462($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1&255;
 $4 = ((($0)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$5>>2] = $3;
 $6 = $5;
 $7 = (($6) + 4)|0;
 $8 = $7;
 HEAP32[$4>>2] = $8;
 $9 = $7;
 HEAP32[$9>>2] = $2;
 $10 = HEAP32[$4>>2]|0;
 $11 = (($10) + 4)|0;
 $12 = $11;
 HEAP32[$4>>2] = $12;
 $13 = HEAP32[$0>>2]|0;
 $14 = ((($13)) + 8|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($15) + 1)|0;
 HEAP32[$14>>2] = $16;
 return;
}
function _closetag_123437_1295010462($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 32|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = HEAP32[$0>>2]|0;
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 << 3;
 $7 = (($6) + 12)|0;
 $8 = ((($3)) + 4|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = $9 << 2;
 $11 = (($7) + ($10))|0;
 _memcpy(($2|0),($3|0),($11|0))|0;
 $12 = HEAP32[$1>>2]|0;
 $13 = HEAP32[$0>>2]|0;
 $14 = ((($13)) + 8|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = $15 << 3;
 $17 = ((($13)) + 4|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = $18 << 2;
 $20 = (($12) + 12)|0;
 $21 = (($20) + ($16))|0;
 $22 = (($21) + ($19))|0;
 $23 = $22;
 HEAP32[$1>>2] = $23;
 $24 = ((($0)) + 8|0);
 HEAP32[$24>>2] = $13;
 HEAP32[$13>>2] = $2;
 $25 = HEAP32[$24>>2]|0;
 $26 = (($25) + 4)|0;
 $27 = $26;
 HEAP32[$24>>2] = $27;
 $28 = ((($0)) + 16|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = (($29) + -4)|0;
 $31 = $30;
 HEAP32[$28>>2] = $31;
 $32 = $30;
 $33 = HEAP32[$32>>2]|0;
 HEAP32[$0>>2] = $33;
 $34 = ((($33)) + 4|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = (($35) + 1)|0;
 HEAP32[$34>>2] = $36;
 return;
}
function _HEX24_124520_1295010462($0) {
 $0 = $0|0;
 var $$sroa$0$0$$sroa_idx = 0, $$sroa$0$0$copyload = 0, $$sroa$074$0$$sroa_idx = 0, $$sroa$074$0$copyload = 0, $$sroa$079$0$$sroa_idx = 0, $$sroa$079$0$copyload = 0, $$sroa$084$0$$sroa_idx = 0, $$sroa$084$0$copyload = 0, $$sroa$4$0$$sroa_idx72 = 0, $$sroa$4$0$copyload = 0, $$sroa$476$0$$sroa_idx77 = 0, $$sroa$476$0$copyload = 0, $$sroa$481$0$$sroa_idx82 = 0, $$sroa$481$0$copyload = 0, $$sroa$486$0$$sroa_idx87 = 0, $$sroa$486$0$copyload = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 $1 = (_copyString(116)|0);
 $$sroa$0$0$$sroa_idx = ((($0)) + 4|0);
 $$sroa$0$0$copyload = HEAPU8[$$sroa$0$0$$sroa_idx>>0]|(HEAPU8[$$sroa$0$0$$sroa_idx+1>>0]<<8)|(HEAPU8[$$sroa$0$0$$sroa_idx+2>>0]<<16)|(HEAPU8[$$sroa$0$0$$sroa_idx+3>>0]<<24);
 $$sroa$4$0$$sroa_idx72 = ((($0)) + 8|0);
 $$sroa$4$0$copyload = HEAPU8[$$sroa$4$0$$sroa_idx72>>0]|(HEAPU8[$$sroa$4$0$$sroa_idx72+1>>0]<<8)|(HEAPU8[$$sroa$4$0$$sroa_idx72+2>>0]<<16)|(HEAPU8[$$sroa$4$0$$sroa_idx72+3>>0]<<24);
 $2 = (($$sroa$4$0$copyload) - ($$sroa$0$0$copyload))|0;
 $3 = (_nimIntToStr($2)|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) + 15)|0;
 $6 = (_rawNewString($5)|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (((($6)) + 8|0) + ($7)|0);
 dest=$8; src=(148); stop=dest+16|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $9 = HEAP32[$6>>2]|0;
 $10 = (($9) + 15)|0;
 HEAP32[$6>>2] = $10;
 $11 = (((($6)) + 8|0) + ($10)|0);
 $12 = ((($3)) + 8|0);
 $13 = HEAP32[$3>>2]|0;
 $14 = (($13) + 1)|0;
 _memcpy(($11|0),($12|0),($14|0))|0;
 $15 = HEAP32[$3>>2]|0;
 $16 = HEAP32[$6>>2]|0;
 $17 = (($16) + ($15))|0;
 HEAP32[$6>>2] = $17;
 $18 = (_resizeString($1,$17)|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = (((($18)) + 8|0) + ($19)|0);
 $21 = ((($6)) + 8|0);
 $22 = HEAP32[$6>>2]|0;
 $23 = (($22) + 1)|0;
 _memcpy(($20|0),($21|0),($23|0))|0;
 $24 = HEAP32[$6>>2]|0;
 $25 = HEAP32[$18>>2]|0;
 $26 = (($25) + ($24))|0;
 HEAP32[$18>>2] = $26;
 $27 = (_resizeString($18,1)|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = (((($27)) + 8|0) + ($28)|0);
 HEAP8[$29>>0]=10&255;HEAP8[$29+1>>0]=10>>8;
 $30 = HEAP32[$27>>2]|0;
 $31 = (($30) + 1)|0;
 HEAP32[$27>>2] = $31;
 $$sroa$084$0$$sroa_idx = ((($0)) + 12|0);
 $$sroa$084$0$copyload = HEAPU8[$$sroa$084$0$$sroa_idx>>0]|(HEAPU8[$$sroa$084$0$$sroa_idx+1>>0]<<8)|(HEAPU8[$$sroa$084$0$$sroa_idx+2>>0]<<16)|(HEAPU8[$$sroa$084$0$$sroa_idx+3>>0]<<24);
 $$sroa$486$0$$sroa_idx87 = ((($0)) + 16|0);
 $$sroa$486$0$copyload = HEAPU8[$$sroa$486$0$$sroa_idx87>>0]|(HEAPU8[$$sroa$486$0$$sroa_idx87+1>>0]<<8)|(HEAPU8[$$sroa$486$0$$sroa_idx87+2>>0]<<16)|(HEAPU8[$$sroa$486$0$$sroa_idx87+3>>0]<<24);
 $32 = (($$sroa$486$0$copyload) - ($$sroa$084$0$copyload))|0;
 $33 = (_nimIntToStr($32)|0);
 $34 = HEAP32[$33>>2]|0;
 $35 = (($34) + 15)|0;
 $36 = (_rawNewString($35)|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = (((($36)) + 8|0) + ($37)|0);
 dest=$38; src=(172); stop=dest+16|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $39 = HEAP32[$36>>2]|0;
 $40 = (($39) + 15)|0;
 HEAP32[$36>>2] = $40;
 $41 = (((($36)) + 8|0) + ($40)|0);
 $42 = ((($33)) + 8|0);
 $43 = HEAP32[$33>>2]|0;
 $44 = (($43) + 1)|0;
 _memcpy(($41|0),($42|0),($44|0))|0;
 $45 = HEAP32[$33>>2]|0;
 $46 = HEAP32[$36>>2]|0;
 $47 = (($46) + ($45))|0;
 HEAP32[$36>>2] = $47;
 $48 = (_resizeString($27,$47)|0);
 $49 = HEAP32[$48>>2]|0;
 $50 = (((($48)) + 8|0) + ($49)|0);
 $51 = ((($36)) + 8|0);
 $52 = HEAP32[$36>>2]|0;
 $53 = (($52) + 1)|0;
 _memcpy(($50|0),($51|0),($53|0))|0;
 $54 = HEAP32[$36>>2]|0;
 $55 = HEAP32[$48>>2]|0;
 $56 = (($55) + ($54))|0;
 HEAP32[$48>>2] = $56;
 $57 = (_resizeString($48,1)|0);
 $58 = HEAP32[$57>>2]|0;
 $59 = (((($57)) + 8|0) + ($58)|0);
 HEAP8[$59>>0]=10&255;HEAP8[$59+1>>0]=10>>8;
 $60 = HEAP32[$57>>2]|0;
 $61 = (($60) + 1)|0;
 HEAP32[$57>>2] = $61;
 $$sroa$079$0$$sroa_idx = ((($0)) + 28|0);
 $$sroa$079$0$copyload = HEAPU8[$$sroa$079$0$$sroa_idx>>0]|(HEAPU8[$$sroa$079$0$$sroa_idx+1>>0]<<8)|(HEAPU8[$$sroa$079$0$$sroa_idx+2>>0]<<16)|(HEAPU8[$$sroa$079$0$$sroa_idx+3>>0]<<24);
 $$sroa$481$0$$sroa_idx82 = ((($0)) + 32|0);
 $$sroa$481$0$copyload = HEAPU8[$$sroa$481$0$$sroa_idx82>>0]|(HEAPU8[$$sroa$481$0$$sroa_idx82+1>>0]<<8)|(HEAPU8[$$sroa$481$0$$sroa_idx82+2>>0]<<16)|(HEAPU8[$$sroa$481$0$$sroa_idx82+3>>0]<<24);
 $62 = (($$sroa$481$0$copyload) - ($$sroa$079$0$copyload))|0;
 $63 = (_nimIntToStr($62)|0);
 $64 = HEAP32[$63>>2]|0;
 $65 = (($64) + 17)|0;
 $66 = (_rawNewString($65)|0);
 $67 = HEAP32[$66>>2]|0;
 $68 = (((($66)) + 8|0) + ($67)|0);
 dest=$68; src=(196); stop=dest+18|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $69 = HEAP32[$66>>2]|0;
 $70 = (($69) + 17)|0;
 HEAP32[$66>>2] = $70;
 $71 = (((($66)) + 8|0) + ($70)|0);
 $72 = ((($63)) + 8|0);
 $73 = HEAP32[$63>>2]|0;
 $74 = (($73) + 1)|0;
 _memcpy(($71|0),($72|0),($74|0))|0;
 $75 = HEAP32[$63>>2]|0;
 $76 = HEAP32[$66>>2]|0;
 $77 = (($76) + ($75))|0;
 HEAP32[$66>>2] = $77;
 $78 = (_resizeString($57,$77)|0);
 $79 = HEAP32[$78>>2]|0;
 $80 = (((($78)) + 8|0) + ($79)|0);
 $81 = ((($66)) + 8|0);
 $82 = HEAP32[$66>>2]|0;
 $83 = (($82) + 1)|0;
 _memcpy(($80|0),($81|0),($83|0))|0;
 $84 = HEAP32[$66>>2]|0;
 $85 = HEAP32[$78>>2]|0;
 $86 = (($85) + ($84))|0;
 HEAP32[$78>>2] = $86;
 $87 = (_resizeString($78,1)|0);
 $88 = HEAP32[$87>>2]|0;
 $89 = (((($87)) + 8|0) + ($88)|0);
 HEAP8[$89>>0]=10&255;HEAP8[$89+1>>0]=10>>8;
 $90 = HEAP32[$87>>2]|0;
 $91 = (($90) + 1)|0;
 HEAP32[$87>>2] = $91;
 $$sroa$074$0$$sroa_idx = ((($0)) + 20|0);
 $$sroa$074$0$copyload = HEAPU8[$$sroa$074$0$$sroa_idx>>0]|(HEAPU8[$$sroa$074$0$$sroa_idx+1>>0]<<8)|(HEAPU8[$$sroa$074$0$$sroa_idx+2>>0]<<16)|(HEAPU8[$$sroa$074$0$$sroa_idx+3>>0]<<24);
 $$sroa$476$0$$sroa_idx77 = ((($0)) + 24|0);
 $$sroa$476$0$copyload = HEAPU8[$$sroa$476$0$$sroa_idx77>>0]|(HEAPU8[$$sroa$476$0$$sroa_idx77+1>>0]<<8)|(HEAPU8[$$sroa$476$0$$sroa_idx77+2>>0]<<16)|(HEAPU8[$$sroa$476$0$$sroa_idx77+3>>0]<<24);
 $92 = (($$sroa$476$0$copyload) - ($$sroa$074$0$copyload))|0;
 $93 = (_nimIntToStr($92)|0);
 $94 = HEAP32[$93>>2]|0;
 $95 = (($94) + 15)|0;
 $96 = (_rawNewString($95)|0);
 $97 = HEAP32[$96>>2]|0;
 $98 = (((($96)) + 8|0) + ($97)|0);
 dest=$98; src=(224); stop=dest+16|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $99 = HEAP32[$96>>2]|0;
 $100 = (($99) + 15)|0;
 HEAP32[$96>>2] = $100;
 $101 = (((($96)) + 8|0) + ($100)|0);
 $102 = ((($93)) + 8|0);
 $103 = HEAP32[$93>>2]|0;
 $104 = (($103) + 1)|0;
 _memcpy(($101|0),($102|0),($104|0))|0;
 $105 = HEAP32[$93>>2]|0;
 $106 = HEAP32[$96>>2]|0;
 $107 = (($106) + ($105))|0;
 HEAP32[$96>>2] = $107;
 $108 = (_resizeString($87,$107)|0);
 $109 = HEAP32[$108>>2]|0;
 $110 = (((($108)) + 8|0) + ($109)|0);
 $111 = ((($96)) + 8|0);
 $112 = HEAP32[$96>>2]|0;
 $113 = (($112) + 1)|0;
 _memcpy(($110|0),($111|0),($113|0))|0;
 $114 = HEAP32[$96>>2]|0;
 $115 = HEAP32[$108>>2]|0;
 $116 = (($115) + ($114))|0;
 HEAP32[$108>>2] = $116;
 return ($108|0);
}
function _tohtml_123131_1295010462($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$08991 = 0, $$090 = 0, $$pre = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $2 << 1;
 $4 = (_nsuRepeatChar(32,$3)|0);
 $5 = HEAP32[$1>>2]|0;
 $6 = HEAP32[$4>>2]|0;
 $7 = (_resizeString($5,$6)|0);
 HEAP32[$1>>2] = $7;
 $8 = HEAP32[$7>>2]|0;
 $9 = (((($7)) + 8|0) + ($8)|0);
 $10 = ((($4)) + 8|0);
 $11 = HEAP32[$4>>2]|0;
 $12 = (($11) + 1)|0;
 _memcpy(($9|0),($10|0),($12|0))|0;
 $13 = HEAP32[$4>>2]|0;
 $14 = HEAP32[$7>>2]|0;
 $15 = (($14) + ($13))|0;
 HEAP32[$7>>2] = $15;
 $16 = HEAP32[$1>>2]|0;
 $17 = (_addChar($16,60)|0);
 HEAP32[$1>>2] = $17;
 $18 = HEAP32[$0>>2]|0;
 $19 = $18 & 255;
 $20 = (_reprEnum($19,7300)|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = (_resizeString($17,$21)|0);
 HEAP32[$1>>2] = $22;
 $23 = HEAP32[$0>>2]|0;
 $24 = $23 & 255;
 $25 = (_reprEnum($24,7300)|0);
 $26 = HEAP32[$22>>2]|0;
 $27 = (((($22)) + 8|0) + ($26)|0);
 $28 = ((($25)) + 8|0);
 $29 = HEAP32[$25>>2]|0;
 $30 = (($29) + 1)|0;
 _memcpy(($27|0),($28|0),($30|0))|0;
 $31 = HEAP32[$25>>2]|0;
 $32 = HEAP32[$22>>2]|0;
 $33 = (($32) + ($31))|0;
 HEAP32[$22>>2] = $33;
 $34 = $0;
 $35 = (($34) + 12)|0;
 $36 = $35;
 $37 = ((($0)) + 8|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = ($38|0)>(0);
 $$pre = HEAP32[$1>>2]|0;
 if ($39) {
  $$08991 = 0;$40 = $$pre;
  while(1) {
   $41 = (_addChar($40,32)|0);
   HEAP32[$1>>2] = $41;
   $42 = (($36) + ($$08991<<3)|0);
   $43 = HEAP32[$42>>2]|0;
   $44 = $43 & 255;
   $45 = (_reprEnum($44,7328)|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = (_resizeString($41,$46)|0);
   HEAP32[$1>>2] = $47;
   $48 = HEAP32[$42>>2]|0;
   $49 = $48 & 255;
   $50 = (_reprEnum($49,7328)|0);
   $51 = HEAP32[$47>>2]|0;
   $52 = (((($47)) + 8|0) + ($51)|0);
   $53 = ((($50)) + 8|0);
   $54 = HEAP32[$50>>2]|0;
   $55 = (($54) + 1)|0;
   _memcpy(($52|0),($53|0),($55|0))|0;
   $56 = HEAP32[$50>>2]|0;
   $57 = HEAP32[$47>>2]|0;
   $58 = (($57) + ($56))|0;
   HEAP32[$47>>2] = $58;
   $59 = HEAP32[$1>>2]|0;
   $60 = (_resizeString($59,2)|0);
   HEAP32[$1>>2] = $60;
   $61 = HEAP32[$60>>2]|0;
   $62 = (((($60)) + 8|0) + ($61)|0);
   ;HEAP8[$62>>0]=HEAP8[(248)>>0]|0;HEAP8[$62+1>>0]=HEAP8[(248)+1>>0]|0;HEAP8[$62+2>>0]=HEAP8[(248)+2>>0]|0;
   $63 = HEAP32[$60>>2]|0;
   $64 = (($63) + 2)|0;
   HEAP32[$60>>2] = $64;
   $65 = (((($36) + ($$08991<<3)|0)) + 4|0);
   $66 = HEAP32[$65>>2]|0;
   _add_10638_1689653243($1,$66);
   $67 = HEAP32[$1>>2]|0;
   $68 = (_addChar($67,34)|0);
   HEAP32[$1>>2] = $68;
   $69 = (($$08991) + 1)|0;
   $exitcond95 = ($69|0)==($38|0);
   if ($exitcond95) {
    $73 = $68;
    break;
   } else {
    $$08991 = $69;$40 = $68;
   }
  }
 } else {
  $73 = $$pre;
 }
 $70 = ((($0)) + 4|0);
 $71 = HEAP32[$70>>2]|0;
 $72 = ($71|0)==(0);
 if ($72) {
  $74 = (_resizeString($73,3)|0);
  HEAP32[$1>>2] = $74;
  $75 = HEAP32[$74>>2]|0;
  $76 = (((($74)) + 8|0) + ($75)|0);
  HEAP8[$76>>0]=671279&255;HEAP8[$76+1>>0]=(671279>>8)&255;HEAP8[$76+2>>0]=(671279>>16)&255;HEAP8[$76+3>>0]=671279>>24;
  $77 = HEAP32[$74>>2]|0;
  $78 = (($77) + 3)|0;
  HEAP32[$74>>2] = $78;
  return;
 }
 $79 = (_resizeString($73,2)|0);
 HEAP32[$1>>2] = $79;
 $80 = HEAP32[$79>>2]|0;
 $81 = (((($79)) + 8|0) + ($80)|0);
 ;HEAP8[$81>>0]=HEAP8[(260)>>0]|0;HEAP8[$81+1>>0]=HEAP8[(260)+1>>0]|0;HEAP8[$81+2>>0]=HEAP8[(260)+2>>0]|0;
 $82 = HEAP32[$79>>2]|0;
 $83 = (($82) + 2)|0;
 HEAP32[$79>>2] = $83;
 $84 = HEAP32[$37>>2]|0;
 $85 = $84 << 3;
 $86 = (($85) + ($35))|0;
 $87 = $86;
 $88 = HEAP32[$70>>2]|0;
 $89 = ($88|0)>(0);
 if ($89) {
  $90 = (($2) + 1)|0;
  $$090 = 0;
  while(1) {
   $91 = (($87) + ($$090<<2)|0);
   $92 = HEAP32[$91>>2]|0;
   _tohtml_123131_1295010462($92,$1,$90);
   $93 = (($$090) + 1)|0;
   $exitcond = ($93|0)==($88|0);
   if ($exitcond) {
    break;
   } else {
    $$090 = $93;
   }
  }
 }
 $94 = (_nsuRepeatChar(32,$3)|0);
 $95 = HEAP32[$1>>2]|0;
 $96 = HEAP32[$94>>2]|0;
 $97 = (_resizeString($95,$96)|0);
 HEAP32[$1>>2] = $97;
 $98 = HEAP32[$97>>2]|0;
 $99 = (((($97)) + 8|0) + ($98)|0);
 $100 = ((($94)) + 8|0);
 $101 = HEAP32[$94>>2]|0;
 $102 = (($101) + 1)|0;
 _memcpy(($99|0),($100|0),($102|0))|0;
 $103 = HEAP32[$94>>2]|0;
 $104 = HEAP32[$97>>2]|0;
 $105 = (($104) + ($103))|0;
 HEAP32[$97>>2] = $105;
 $106 = HEAP32[$1>>2]|0;
 $107 = (_resizeString($106,2)|0);
 HEAP32[$1>>2] = $107;
 $108 = HEAP32[$107>>2]|0;
 $109 = (((($107)) + 8|0) + ($108)|0);
 ;HEAP8[$109>>0]=HEAP8[(272)>>0]|0;HEAP8[$109+1>>0]=HEAP8[(272)+1>>0]|0;HEAP8[$109+2>>0]=HEAP8[(272)+2>>0]|0;
 $110 = HEAP32[$107>>2]|0;
 $111 = (($110) + 2)|0;
 HEAP32[$107>>2] = $111;
 $112 = HEAP32[$1>>2]|0;
 $113 = HEAP32[$0>>2]|0;
 $114 = $113 & 255;
 $115 = (_reprEnum($114,7300)|0);
 $116 = HEAP32[$115>>2]|0;
 $117 = (_resizeString($112,$116)|0);
 HEAP32[$1>>2] = $117;
 $118 = HEAP32[$0>>2]|0;
 $119 = $118 & 255;
 $120 = (_reprEnum($119,7300)|0);
 $121 = HEAP32[$117>>2]|0;
 $122 = (((($117)) + 8|0) + ($121)|0);
 $123 = ((($120)) + 8|0);
 $124 = HEAP32[$120>>2]|0;
 $125 = (($124) + 1)|0;
 _memcpy(($122|0),($123|0),($125|0))|0;
 $126 = HEAP32[$120>>2]|0;
 $127 = HEAP32[$117>>2]|0;
 $128 = (($127) + ($126))|0;
 HEAP32[$117>>2] = $128;
 $129 = HEAP32[$1>>2]|0;
 $130 = (_resizeString($129,2)|0);
 HEAP32[$1>>2] = $130;
 $131 = HEAP32[$130>>2]|0;
 $132 = (((($130)) + 8|0) + ($131)|0);
 ;HEAP8[$132>>0]=HEAP8[(260)>>0]|0;HEAP8[$132+1>>0]=HEAP8[(260)+1>>0]|0;HEAP8[$132+2>>0]=HEAP8[(260)+2>>0]|0;
 $133 = HEAP32[$130>>2]|0;
 $134 = (($133) + 2)|0;
 HEAP32[$130>>2] = $134;
 return;
}
function _clear_124484_1295010462($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($0)) + 4|0);
 HEAP32[$2>>2] = $1;
 return;
}
function _clear_124496_1295010462($0) {
 $0 = $0|0;
 var $$cast$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 8|0);
 HEAP32[$3>>2] = $2;
 $4 = ((($0)) + 12|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($0)) + 16|0);
 HEAP32[$6>>2] = $5;
 $7 = ((($0)) + 28|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 32|0);
 HEAP32[$9>>2] = $8;
 $10 = ((($0)) + 20|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ((($0)) + 24|0);
 HEAP32[$12>>2] = $11;
 $13 = HEAP32[$0>>2]|0;
 $14 = $5;
 HEAP32[$14>>2] = $13;
 $15 = HEAP32[$6>>2]|0;
 $16 = (($15) + 4)|0;
 $17 = $16;
 HEAP32[$6>>2] = $17;
 $18 = HEAP32[$3>>2]|0;
 HEAP32[$0>>2] = $18;
 $19 = (($18) + 12)|0;
 $20 = $19;
 HEAP32[$3>>2] = $20;
 $$cast$i = $18;
 HEAP32[$$cast$i>>2] = 0;
 $21 = ((($$cast$i)) + 8|0);
 HEAP32[$21>>2] = 0;
 $22 = ((($$cast$i)) + 4|0);
 HEAP32[$22>>2] = 0;
 return;
}
function _text_124216_1295010462($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$cast$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($0)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$4>>2] = $2;
 $5 = HEAP32[$3>>2]|0;
 $6 = (($5) + 4)|0;
 $7 = $6;
 HEAP32[$3>>2] = $7;
 $8 = ((($0)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 HEAP32[$0>>2] = $9;
 $10 = (($9) + 12)|0;
 $$cast$i = $9;
 HEAP32[$$cast$i>>2] = 1;
 $11 = ((($$cast$i)) + 8|0);
 HEAP32[$11>>2] = 0;
 $12 = ((($$cast$i)) + 4|0);
 HEAP32[$12>>2] = 0;
 $13 = $10;
 HEAP32[$13>>2] = 0;
 $14 = (($9) + 16)|0;
 $15 = $14;
 HEAP32[$8>>2] = $15;
 $16 = $14;
 HEAP32[$16>>2] = $1;
 $17 = HEAP32[$8>>2]|0;
 $18 = (($17) + 4)|0;
 $19 = $18;
 HEAP32[$8>>2] = $19;
 $20 = HEAP32[$0>>2]|0;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = (($22) + 1)|0;
 HEAP32[$21>>2] = $23;
 $24 = ((($0)) + 32|0);
 $25 = HEAP32[$24>>2]|0;
 $26 = $23 << 3;
 $27 = (($26) + 12)|0;
 $28 = ((($20)) + 4|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = $29 << 2;
 $31 = (($27) + ($30))|0;
 _memcpy(($25|0),($20|0),($31|0))|0;
 $32 = HEAP32[$24>>2]|0;
 $33 = HEAP32[$0>>2]|0;
 $34 = ((($33)) + 8|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = $35 << 3;
 $37 = ((($33)) + 4|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = $38 << 2;
 $40 = (($32) + 12)|0;
 $41 = (($40) + ($36))|0;
 $42 = (($41) + ($39))|0;
 $43 = $42;
 HEAP32[$24>>2] = $43;
 HEAP32[$8>>2] = $33;
 HEAP32[$33>>2] = $25;
 $44 = HEAP32[$8>>2]|0;
 $45 = (($44) + 4)|0;
 $46 = $45;
 HEAP32[$8>>2] = $46;
 $47 = HEAP32[$3>>2]|0;
 $48 = (($47) + -4)|0;
 $49 = $48;
 HEAP32[$3>>2] = $49;
 $50 = $48;
 $51 = HEAP32[$50>>2]|0;
 HEAP32[$0>>2] = $51;
 $52 = ((($51)) + 4|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = (($53) + 1)|0;
 HEAP32[$52>>2] = $54;
 return;
}
function _unknown_domInit000() {
 var $$cast = 0, $$cast$i = 0, $$cast$i8 = 0, $$cast$i9 = 0, $$cast10 = 0, $$cast11 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0;
 var $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0;
 var $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0;
 var $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0;
 var $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0;
 var $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0;
 var $255 = 0, $256 = 0, $257 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = sp;
 $1 = (_alloc_7801_1689653243(1048576)|0);
 $2 = $1;
 $3 = (_alloc_7801_1689653243(8192)|0);
 $4 = $3;
 $5 = (_alloc_7801_1689653243(1048576)|0);
 $6 = (_alloc_7801_1689653243(1048576)|0);
 HEAP32[$3>>2] = 0;
 $7 = (($4) + 4)|0;
 $8 = (($2) + 12)|0;
 HEAP32[$1>>2] = 0;
 $9 = ((($1)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = ((($1)) + 4|0);
 HEAP32[$10>>2] = 0;
 HEAP32[(8164)>>2] = $1;
 HEAP32[(8168)>>2] = $8;
 HEAP32[(8172)>>2] = $3;
 HEAP32[(8176)>>2] = $7;
 HEAP32[(8180)>>2] = $6;
 HEAP32[(8184)>>2] = $6;
 HEAP32[(8188)>>2] = $5;
 HEAP32[(8192)>>2] = $5;
 $$cast = $7;
 HEAP32[$$cast>>2] = $2;
 $11 = HEAP32[(8176)>>2]|0;
 $12 = (($11) + 4)|0;
 $13 = $12;
 HEAP32[(8176)>>2] = $13;
 $14 = HEAP32[(8168)>>2]|0;
 HEAP32[2040] = $14;
 $15 = (($14) + 12)|0;
 $$cast$i = $14;
 HEAP32[$$cast$i>>2] = 12;
 $16 = ((($$cast$i)) + 8|0);
 HEAP32[$16>>2] = 0;
 $17 = ((($$cast$i)) + 4|0);
 HEAP32[$17>>2] = 0;
 $18 = $15;
 HEAP32[$18>>2] = 6;
 $19 = (($14) + 16)|0;
 $20 = $19;
 HEAP32[(8168)>>2] = $20;
 $21 = $19;
 HEAP32[$21>>2] = 1030;
 $22 = HEAP32[(8168)>>2]|0;
 $23 = (($22) + 4)|0;
 $24 = $23;
 HEAP32[(8168)>>2] = $24;
 $25 = HEAP32[2040]|0;
 $26 = ((($25)) + 8|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = (($27) + 1)|0;
 HEAP32[$26>>2] = $28;
 $$cast10 = $25;
 $29 = HEAP32[(8176)>>2]|0;
 HEAP32[$29>>2] = $$cast10;
 $30 = HEAP32[(8176)>>2]|0;
 $31 = (($30) + 4)|0;
 $32 = $31;
 HEAP32[(8176)>>2] = $32;
 $33 = HEAP32[(8168)>>2]|0;
 HEAP32[2040] = $33;
 $34 = (($33) + 12)|0;
 $$cast$i8 = $33;
 HEAP32[$$cast$i8>>2] = 11;
 $35 = ((($$cast$i8)) + 8|0);
 HEAP32[$35>>2] = 0;
 $36 = ((($$cast$i8)) + 4|0);
 HEAP32[$36>>2] = 0;
 $37 = $34;
 HEAP32[$37>>2] = 1;
 $38 = (($33) + 16)|0;
 $39 = $38;
 HEAP32[(8168)>>2] = $39;
 $40 = $38;
 HEAP32[$40>>2] = 1037;
 $41 = HEAP32[(8168)>>2]|0;
 $42 = (($41) + 4)|0;
 $43 = HEAP32[2040]|0;
 $44 = ((($43)) + 8|0);
 $45 = HEAP32[$44>>2]|0;
 $46 = (($45) + 1)|0;
 HEAP32[$44>>2] = $46;
 $47 = $42;
 HEAP32[$47>>2] = 5;
 $48 = (($41) + 8)|0;
 $49 = $48;
 HEAP32[(8168)>>2] = $49;
 $50 = $48;
 HEAP32[$50>>2] = 1041;
 $51 = HEAP32[(8168)>>2]|0;
 $52 = (($51) + 4)|0;
 $53 = HEAP32[2040]|0;
 $54 = ((($53)) + 8|0);
 $55 = HEAP32[$54>>2]|0;
 $56 = (($55) + 1)|0;
 HEAP32[$54>>2] = $56;
 $57 = $52;
 HEAP32[$57>>2] = 3;
 $58 = (($51) + 8)|0;
 $59 = $58;
 HEAP32[(8168)>>2] = $59;
 $60 = $58;
 HEAP32[$60>>2] = 1030;
 $61 = HEAP32[(8168)>>2]|0;
 $62 = (($61) + 4)|0;
 $63 = HEAP32[2040]|0;
 $64 = ((($63)) + 8|0);
 $65 = HEAP32[$64>>2]|0;
 $66 = (($65) + 1)|0;
 HEAP32[$64>>2] = $66;
 $67 = $62;
 HEAP32[$67>>2] = 7;
 $68 = (($61) + 8)|0;
 $69 = $68;
 HEAP32[(8168)>>2] = $69;
 $70 = $68;
 HEAP32[$70>>2] = 1041;
 $71 = HEAP32[(8168)>>2]|0;
 $72 = (($71) + 4)|0;
 $73 = HEAP32[2040]|0;
 $74 = ((($73)) + 8|0);
 $75 = HEAP32[$74>>2]|0;
 $76 = (($75) + 1)|0;
 HEAP32[$74>>2] = $76;
 $77 = $72;
 HEAP32[$77>>2] = 6;
 $78 = (($71) + 8)|0;
 $79 = $78;
 HEAP32[(8168)>>2] = $79;
 $80 = $78;
 HEAP32[$80>>2] = 1030;
 $81 = HEAP32[(8168)>>2]|0;
 $82 = (($81) + 4)|0;
 $83 = $82;
 HEAP32[(8168)>>2] = $83;
 $84 = HEAP32[2040]|0;
 $85 = ((($84)) + 8|0);
 $86 = HEAP32[$85>>2]|0;
 $87 = (($86) + 1)|0;
 HEAP32[$85>>2] = $87;
 $88 = HEAP32[(8192)>>2]|0;
 $89 = $87 << 3;
 $90 = (($89) + 12)|0;
 $91 = ((($84)) + 4|0);
 $92 = HEAP32[$91>>2]|0;
 $93 = $92 << 2;
 $94 = (($90) + ($93))|0;
 _memcpy(($88|0),($84|0),($94|0))|0;
 $95 = HEAP32[(8192)>>2]|0;
 $96 = HEAP32[2040]|0;
 $97 = ((($96)) + 8|0);
 $98 = HEAP32[$97>>2]|0;
 $99 = $98 << 3;
 $100 = ((($96)) + 4|0);
 $101 = HEAP32[$100>>2]|0;
 $102 = $101 << 2;
 $103 = (($95) + 12)|0;
 $104 = (($103) + ($99))|0;
 $105 = (($104) + ($102))|0;
 $106 = $105;
 HEAP32[(8192)>>2] = $106;
 HEAP32[(8168)>>2] = $96;
 HEAP32[$96>>2] = $88;
 $107 = HEAP32[(8168)>>2]|0;
 $108 = (($107) + 4)|0;
 $109 = $108;
 HEAP32[(8168)>>2] = $109;
 $110 = HEAP32[(8176)>>2]|0;
 $111 = (($110) + -4)|0;
 $112 = $111;
 HEAP32[(8176)>>2] = $112;
 $113 = $111;
 $114 = HEAP32[$113>>2]|0;
 $115 = ((($114)) + 4|0);
 $116 = HEAP32[$115>>2]|0;
 $117 = (($116) + 1)|0;
 HEAP32[$115>>2] = $117;
 $$cast11 = $114;
 $118 = $111;
 HEAP32[$118>>2] = $$cast11;
 $119 = HEAP32[(8176)>>2]|0;
 $120 = (($119) + 4)|0;
 $121 = $120;
 HEAP32[(8176)>>2] = $121;
 $122 = HEAP32[(8168)>>2]|0;
 HEAP32[2040] = $122;
 $123 = (($122) + 12)|0;
 $$cast$i9 = $122;
 HEAP32[$$cast$i9>>2] = 2;
 $124 = ((($$cast$i9)) + 8|0);
 HEAP32[$124>>2] = 0;
 $125 = ((($$cast$i9)) + 4|0);
 HEAP32[$125>>2] = 0;
 $126 = $123;
 HEAP32[$126>>2] = 6;
 $127 = (($122) + 16)|0;
 $128 = $127;
 HEAP32[(8168)>>2] = $128;
 $129 = $127;
 HEAP32[$129>>2] = 1030;
 $130 = HEAP32[(8168)>>2]|0;
 $131 = (($130) + 4)|0;
 $132 = HEAP32[2040]|0;
 $133 = ((($132)) + 8|0);
 $134 = HEAP32[$133>>2]|0;
 $135 = (($134) + 1)|0;
 HEAP32[$133>>2] = $135;
 $136 = $131;
 HEAP32[$136>>2] = 5;
 $137 = (($130) + 8)|0;
 $138 = $137;
 HEAP32[(8168)>>2] = $138;
 $139 = $137;
 HEAP32[$139>>2] = 1041;
 $140 = HEAP32[(8168)>>2]|0;
 $141 = (($140) + 4)|0;
 $142 = HEAP32[2040]|0;
 $143 = ((($142)) + 8|0);
 $144 = HEAP32[$143>>2]|0;
 $145 = (($144) + 1)|0;
 HEAP32[$143>>2] = $145;
 $146 = $141;
 HEAP32[$146>>2] = 7;
 $147 = (($140) + 8)|0;
 $148 = $147;
 HEAP32[(8168)>>2] = $148;
 $149 = $147;
 HEAP32[$149>>2] = 1041;
 $150 = HEAP32[(8168)>>2]|0;
 $151 = (($150) + 4)|0;
 $152 = $151;
 HEAP32[(8168)>>2] = $152;
 $153 = HEAP32[2040]|0;
 $154 = ((($153)) + 8|0);
 $155 = HEAP32[$154>>2]|0;
 $156 = (($155) + 1)|0;
 HEAP32[$154>>2] = $156;
 $157 = HEAP32[(8192)>>2]|0;
 $158 = $156 << 3;
 $159 = (($158) + 12)|0;
 $160 = ((($153)) + 4|0);
 $161 = HEAP32[$160>>2]|0;
 $162 = $161 << 2;
 $163 = (($159) + ($162))|0;
 _memcpy(($157|0),($153|0),($163|0))|0;
 $164 = HEAP32[(8192)>>2]|0;
 $165 = HEAP32[2040]|0;
 $166 = ((($165)) + 8|0);
 $167 = HEAP32[$166>>2]|0;
 $168 = $167 << 3;
 $169 = ((($165)) + 4|0);
 $170 = HEAP32[$169>>2]|0;
 $171 = $170 << 2;
 $172 = (($164) + 12)|0;
 $173 = (($172) + ($168))|0;
 $174 = (($173) + ($171))|0;
 $175 = $174;
 HEAP32[(8192)>>2] = $175;
 HEAP32[(8168)>>2] = $165;
 HEAP32[$165>>2] = $157;
 $176 = HEAP32[(8168)>>2]|0;
 $177 = (($176) + 4)|0;
 $178 = $177;
 HEAP32[(8168)>>2] = $178;
 $179 = HEAP32[(8176)>>2]|0;
 $180 = (($179) + -4)|0;
 $181 = $180;
 HEAP32[(8176)>>2] = $181;
 $182 = $180;
 $183 = HEAP32[$182>>2]|0;
 HEAP32[2040] = $183;
 $184 = ((($183)) + 4|0);
 $185 = HEAP32[$184>>2]|0;
 $186 = (($185) + 1)|0;
 HEAP32[$184>>2] = $186;
 $187 = HEAP32[(8192)>>2]|0;
 $188 = ((($183)) + 8|0);
 $189 = HEAP32[$188>>2]|0;
 $190 = $189 << 3;
 $191 = (($190) + 12)|0;
 $192 = $186 << 2;
 $193 = (($191) + ($192))|0;
 _memcpy(($187|0),($183|0),($193|0))|0;
 $194 = HEAP32[(8192)>>2]|0;
 $195 = HEAP32[2040]|0;
 $196 = ((($195)) + 8|0);
 $197 = HEAP32[$196>>2]|0;
 $198 = $197 << 3;
 $199 = ((($195)) + 4|0);
 $200 = HEAP32[$199>>2]|0;
 $201 = $200 << 2;
 $202 = (($194) + 12)|0;
 $203 = (($202) + ($198))|0;
 $204 = (($203) + ($201))|0;
 $205 = $204;
 HEAP32[(8192)>>2] = $205;
 HEAP32[(8168)>>2] = $195;
 HEAP32[$195>>2] = $187;
 $206 = HEAP32[(8168)>>2]|0;
 $207 = (($206) + 4)|0;
 $208 = $207;
 HEAP32[(8168)>>2] = $208;
 $209 = HEAP32[(8176)>>2]|0;
 $210 = (($209) + -4)|0;
 $211 = $210;
 HEAP32[(8176)>>2] = $211;
 $212 = $210;
 $213 = HEAP32[$212>>2]|0;
 HEAP32[2040] = $213;
 $214 = ((($213)) + 4|0);
 $215 = HEAP32[$214>>2]|0;
 $216 = (($215) + 1)|0;
 HEAP32[$214>>2] = $216;
 $217 = HEAP32[(8192)>>2]|0;
 $218 = ((($213)) + 8|0);
 $219 = HEAP32[$218>>2]|0;
 $220 = $219 << 3;
 $221 = (($220) + 12)|0;
 $222 = $216 << 2;
 $223 = (($221) + ($222))|0;
 _memcpy(($217|0),($213|0),($223|0))|0;
 $224 = HEAP32[(8192)>>2]|0;
 $225 = HEAP32[2040]|0;
 $226 = ((($225)) + 8|0);
 $227 = HEAP32[$226>>2]|0;
 $228 = $227 << 3;
 $229 = ((($225)) + 4|0);
 $230 = HEAP32[$229>>2]|0;
 $231 = $230 << 2;
 $232 = (($224) + 12)|0;
 $233 = (($232) + ($228))|0;
 $234 = (($233) + ($231))|0;
 $235 = $234;
 HEAP32[(8192)>>2] = $235;
 HEAP32[(8168)>>2] = $225;
 HEAP32[$225>>2] = $217;
 $236 = HEAP32[(8168)>>2]|0;
 $237 = (($236) + 4)|0;
 $238 = $237;
 HEAP32[(8168)>>2] = $238;
 $239 = HEAP32[(8176)>>2]|0;
 $240 = (($239) + -4)|0;
 $241 = $240;
 HEAP32[(8176)>>2] = $241;
 $242 = $240;
 $243 = HEAP32[$242>>2]|0;
 HEAP32[2040] = $243;
 $244 = $236;
 HEAP32[(8168)>>2] = $244;
 $245 = $236;
 $246 = HEAP32[$245>>2]|0;
 HEAP32[2040] = $246;
 $247 = (_HEX24_124520_1295010462(8160)|0);
 $248 = ($247|0)!=(0|0);
 $249 = ((($247)) + 8|0);
 $250 = $248 ? $249 : 1591;
 (_puts($250)|0);
 $251 = HEAP32[165]|0;
 (_fflush($251)|0);
 $252 = HEAP32[2040]|0;
 $253 = (_copyString(8196)|0);
 HEAP32[$0>>2] = $253;
 _tohtml_123131_1295010462($252,$0,0);
 $254 = HEAP32[$0>>2]|0;
 $255 = ($254|0)!=(0|0);
 $256 = ((($254)) + 8|0);
 $257 = $255 ? $256 : 1591;
 (_puts($257)|0);
 (_fflush($251)|0);
 STACKTOP = sp;return;
}
function _unknown_domDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _merge_125205_3792311747($0,$1,$2,$3,$4,$5,$6,$7,$8) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 $8 = $8|0;
 var $$0$lcssa = 0, $$0$lcssa$pn = 0, $$0111129 = 0, $$0112$ph163 = 0, $$0115$ph167 = 0, $$0115$us = 0, $$0130 = 0, $$1$ph161 = 0, $$1109$us = 0, $$1116$us = 0, $$119 = 0, $$119166 = 0, $$2 = 0, $$2114128 = 0, $$3118$ph = 0, $$3118127 = 0, $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0;
 var $$byval_copy4 = 0, $$byval_copy5 = 0, $$byval_copy6 = 0, $$byval_copy7 = 0, $$in = 0, $$pn = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $9 = 0, $exitcond = 0, $not$ = 0, $switch1$us = 0, $trunc$us = 0, $trunc$us$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $$byval_copy7 = sp + 84|0;
 $$byval_copy6 = sp + 72|0;
 $$byval_copy5 = sp + 60|0;
 $$byval_copy4 = sp + 48|0;
 $$byval_copy3 = sp + 36|0;
 $$byval_copy2 = sp + 24|0;
 $$byval_copy1 = sp + 12|0;
 $$byval_copy = sp;
 $9 = ((($7)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ($10|0)==(0|0);
 $12 = HEAP32[$7>>2]|0;
 if ($11) {
  $17 = (($0) + (($5*12)|0)|0);
  $18 = (($5) + 1)|0;
  $19 = (($0) + (($18*12)|0)|0);
  ;HEAP32[$$byval_copy2>>2]=HEAP32[$17>>2]|0;HEAP32[$$byval_copy2+4>>2]=HEAP32[$17+4>>2]|0;HEAP32[$$byval_copy2+8>>2]=HEAP32[$17+8>>2]|0;
  ;HEAP32[$$byval_copy3>>2]=HEAP32[$19>>2]|0;HEAP32[$$byval_copy3+4>>2]=HEAP32[$19+4>>2]|0;HEAP32[$$byval_copy3+8>>2]=HEAP32[$19+8>>2]|0;
  $20 = (FUNCTION_TABLE_iii[$12 & 15]($$byval_copy2,$$byval_copy3)|0);
  $24 = $20;
 } else {
  $13 = (($0) + (($5*12)|0)|0);
  $14 = (($5) + 1)|0;
  $15 = (($0) + (($14*12)|0)|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$13>>2]|0;HEAP32[$$byval_copy+4>>2]=HEAP32[$13+4>>2]|0;HEAP32[$$byval_copy+8>>2]=HEAP32[$13+8>>2]|0;
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$15>>2]|0;HEAP32[$$byval_copy1+4>>2]=HEAP32[$15+4>>2]|0;HEAP32[$$byval_copy1+8>>2]=HEAP32[$15+8>>2]|0;
  $16 = (FUNCTION_TABLE_iiii[$12 & 7]($$byval_copy,$$byval_copy1,$10)|0);
  $24 = $16;
 }
 $21 = $8&255;
 $22 = (($21) + -1)|0;
 $23 = $24 ^ $22;
 $not$ = ($23|0)<($21|0);
 if ($not$) {
  STACKTOP = sp;return;
 }
 $25 = ($4|0)>($5|0);
 if ($25) {
  $$0$lcssa = $4;
 } else {
  $$0111129 = 0;$$0130 = $4;
  while(1) {
   $28 = (($2) + (($$0111129*12)|0)|0);
   $29 = (($0) + (($$0130*12)|0)|0);
   $30 = HEAP32[$29>>2]|0;
   _unsureAsgnRef($28,$30);
   $31 = (((($0) + (($$0130*12)|0)|0)) + 4|0);
   $32 = HEAP32[$31>>2]|0;
   $33 = (((($2) + (($$0111129*12)|0)|0)) + 4|0);
   HEAP32[$33>>2] = $32;
   $34 = (((($0) + (($$0130*12)|0)|0)) + 8|0);
   $35 = HEAP8[$34>>0]|0;
   $36 = (((($2) + (($$0111129*12)|0)|0)) + 8|0);
   HEAP8[$36>>0] = $35;
   $37 = (($$0111129) + 1)|0;
   $38 = (($$0130) + 1)|0;
   $39 = ($$0130|0)<($5|0);
   if ($39) {
    $$0111129 = $37;$$0130 = $38;
   } else {
    $$0$lcssa = $38;
    break;
   }
  }
 }
 $26 = ($$0$lcssa|0)>($4|0);
 $27 = ($$0$lcssa|0)<=($6|0);
 $$119166 = $26 & $27;
 L12: do {
  if ($$119166) {
   $$0$lcssa$pn = $$0$lcssa;$$0115$ph167 = 0;$$pn = $4;$75 = $26;
   while(1) {
    $$in = (($0) + (($$pn*12)|0)|0);
    $43 = (($0) + (($$0$lcssa$pn*12)|0)|0);
    $44 = (((($0) + (($$pn*12)|0)|0)) + 4|0);
    $45 = (((($0) + (($$pn*12)|0)|0)) + 8|0);
    $$0115$us = $$0115$ph167;
    L15: while(1) {
     $46 = (($2) + (($$0115$us*12)|0)|0);
     if ($11) {
      ;HEAP32[$$byval_copy6>>2]=HEAP32[$46>>2]|0;HEAP32[$$byval_copy6+4>>2]=HEAP32[$46+4>>2]|0;HEAP32[$$byval_copy6+8>>2]=HEAP32[$46+8>>2]|0;
      ;HEAP32[$$byval_copy7>>2]=HEAP32[$43>>2]|0;HEAP32[$$byval_copy7+4>>2]=HEAP32[$43+4>>2]|0;HEAP32[$$byval_copy7+8>>2]=HEAP32[$43+8>>2]|0;
      $48 = (FUNCTION_TABLE_iii[$12 & 15]($$byval_copy6,$$byval_copy7)|0);
      $50 = $48;
     } else {
      ;HEAP32[$$byval_copy4>>2]=HEAP32[$46>>2]|0;HEAP32[$$byval_copy4+4>>2]=HEAP32[$46+4>>2]|0;HEAP32[$$byval_copy4+8>>2]=HEAP32[$46+8>>2]|0;
      ;HEAP32[$$byval_copy5>>2]=HEAP32[$43>>2]|0;HEAP32[$$byval_copy5+4>>2]=HEAP32[$43+4>>2]|0;HEAP32[$$byval_copy5+8>>2]=HEAP32[$43+8>>2]|0;
      $47 = (FUNCTION_TABLE_iiii[$12 & 7]($$byval_copy4,$$byval_copy5,$10)|0);
      $50 = $47;
     }
     $49 = $50 ^ $22;
     $51 = ($49|0)<($21|0);
     if ($51) {
      $52 = HEAP32[$46>>2]|0;
      _unsureAsgnRef($$in,$52);
      $53 = (((($2) + (($$0115$us*12)|0)|0)) + 4|0);
      $54 = HEAP32[$53>>2]|0;
      HEAP32[$44>>2] = $54;
      $55 = (((($2) + (($$0115$us*12)|0)|0)) + 8|0);
      $56 = HEAP8[$55>>0]|0;
      HEAP8[$45>>0] = $56;
      $57 = (($$0115$us) + 1)|0;
      $$1109$us = 0;$$1116$us = $57;
     } else {
      $$1109$us = 11;$$1116$us = $$0115$us;
     }
     $trunc$us = $$1109$us&255;
     $trunc$us$clear = $trunc$us & 15;
     switch ($trunc$us$clear<<24>>24) {
     case 0:  {
      $$2 = $$0$lcssa$pn;
      break L15;
      break;
     }
     case 11:  {
      label = 17;
      break L15;
      break;
     }
     default: {
     }
     }
     $switch1$us = ($$1109$us|0)==(0);
     if ($switch1$us) {
      $$0115$us = $$1116$us;
     } else {
      $$0112$ph163 = $$pn;$$1$ph161 = $$0$lcssa$pn;$$3118$ph = $$1116$us;$76 = $75;
      break L12;
     }
    }
    if ((label|0) == 17) {
     label = 0;
     $58 = HEAP32[$43>>2]|0;
     _unsureAsgnRef($$in,$58);
     $59 = (((($0) + (($$0$lcssa$pn*12)|0)|0)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     HEAP32[$44>>2] = $60;
     $61 = (((($0) + (($$0$lcssa$pn*12)|0)|0)) + 8|0);
     $62 = HEAP8[$61>>0]|0;
     HEAP8[$45>>0] = $62;
     $63 = (($$0$lcssa$pn) + 1)|0;
     $$2 = $63;
    }
    $40 = (($$pn) + 1)|0;
    $41 = ($40|0)<($$2|0);
    $42 = ($$2|0)<=($6|0);
    $$119 = $41 & $42;
    if ($$119) {
     $$0$lcssa$pn = $$2;$$0115$ph167 = $$1116$us;$$pn = $40;$75 = $41;
    } else {
     $$0112$ph163 = $40;$$1$ph161 = $$2;$$3118$ph = $$1116$us;$76 = $41;
     break;
    }
   }
  } else {
   $$0112$ph163 = $4;$$1$ph161 = $$0$lcssa;$$3118$ph = 0;$76 = $26;
  }
 } while(0);
 if ($76) {
  $$2114128 = $$0112$ph163;$$3118127 = $$3118$ph;
 } else {
  STACKTOP = sp;return;
 }
 while(1) {
  $64 = (($0) + (($$2114128*12)|0)|0);
  $65 = (($2) + (($$3118127*12)|0)|0);
  $66 = HEAP32[$65>>2]|0;
  _unsureAsgnRef($64,$66);
  $67 = (((($2) + (($$3118127*12)|0)|0)) + 4|0);
  $68 = HEAP32[$67>>2]|0;
  $69 = (((($0) + (($$2114128*12)|0)|0)) + 4|0);
  HEAP32[$69>>2] = $68;
  $70 = (((($2) + (($$3118127*12)|0)|0)) + 8|0);
  $71 = HEAP8[$70>>0]|0;
  $72 = (((($0) + (($$2114128*12)|0)|0)) + 8|0);
  HEAP8[$72>>0] = $71;
  $73 = (($$2114128) + 1)|0;
  $74 = (($$3118127) + 1)|0;
  $exitcond = ($73|0)==($$1$ph161|0);
  if ($exitcond) {
   break;
  } else {
   $$2114128 = $73;$$3118127 = $74;
  }
 }
 STACKTOP = sp;return;
}
function _sort_125160_3792311747($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$02931 = 0, $$03032 = 0, $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp;
 $4 = (($1|0) / 2)&-1;
 $5 = (_newSeq(10820,$4)|0);
 $6 = ($1|0)>(1);
 if (!($6)) {
  STACKTOP = sp;return;
 }
 $7 = (($1) + -1)|0;
 $8 = ((($5)) + 8|0);
 $$03032 = 1;
 while(1) {
  $9 = (($7) - ($$03032))|0;
  $10 = ($9|0)>(-1);
  $11 = $$03032 << 1;
  if ($10) {
   $$02931 = $9;
   while(1) {
    $12 = (($$02931) - ($$03032))|0;
    $13 = ($12|0)>(-2);
    $14 = (($12) + 1)|0;
    $$ = $13 ? $14 : 0;
    $15 = (($$02931) + ($$03032))|0;
    ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;HEAP32[$$byval_copy+4>>2]=HEAP32[$2+4>>2]|0;
    _merge_125205_3792311747($0,0,$8,0,$$,$$02931,$15,$$byval_copy,$3);
    $16 = (($$02931) - ($11))|0;
    $17 = ($16|0)>(-1);
    if ($17) {
     $$02931 = $16;
    } else {
     break;
    }
   }
  }
  $18 = ($11|0)<($1|0);
  if ($18) {
   $$03032 = $11;
  } else {
   break;
  }
 }
 STACKTOP = sp;return;
}
function _stdlib_algorithmInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_algorithmDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _newmersennetwister_98011_1632002213($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2512|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2512|0);
 $2 = sp;
 $3 = ((($2)) + 4|0);
 _memset(($3|0),0,2496)|0;
 HEAP32[$2>>2] = $1;
 $$011 = 1;$5 = $1;
 while(1) {
  $4 = $5 >>> 30;
  $6 = $4 ^ $5;
  $7 = Math_imul($6, 1812433253)|0;
  $8 = (($7) + ($$011))|0;
  $9 = (($2) + ($$011<<2)|0);
  HEAP32[$9>>2] = $8;
  $10 = (($$011) + 1)|0;
  $exitcond = ($10|0)==(624);
  if ($exitcond) {
   break;
  } else {
   $$011 = $10;$5 = $8;
  }
 }
 _memcpy(($0|0),($2|0),2500)|0;
 STACKTOP = sp;return;
}
function _getnum_98383_1632002213($0) {
 $0 = $0|0;
 var $$$i = 0, $$02223$i = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tmp$i = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 2496|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0);
 if ($3) {
  $$02223$i = 0;
  while(1) {
   $4 = (($0) + ($$02223$i<<2)|0);
   $5 = HEAP32[$4>>2]|0;
   $6 = $5 & -2147483648;
   $7 = (($$02223$i) + 1)|0;
   $8 = ($7|0)==(624);
   $tmp$i = $8 ? 0 : $7;
   $9 = (($0) + ($tmp$i<<2)|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = $10 & 2147483646;
   $12 = $11 | $6;
   $13 = (($$02223$i) + 397)|0;
   $14 = (($13|0) % 624)&-1;
   $15 = (($0) + ($14<<2)|0);
   $16 = HEAP32[$15>>2]|0;
   $17 = $12 >>> 1;
   $18 = $17 ^ $16;
   $19 = $10 & 1;
   $20 = ($19|0)==(0);
   $21 = $18 ^ -1727483681;
   $$$i = $20 ? $18 : $21;
   HEAP32[$4>>2] = $$$i;
   if ($8) {
    break;
   } else {
    $$02223$i = $7;
   }
  }
  $$pre = HEAP32[$1>>2]|0;
  $23 = $$pre;
 } else {
  $23 = $2;
 }
 $22 = (($0) + ($23<<2)|0);
 $24 = HEAP32[$22>>2]|0;
 $25 = (($23) + 1)|0;
 $26 = (($25|0) % 624)&-1;
 HEAP32[$1>>2] = $26;
 $27 = $24 >>> 11;
 $28 = $27 ^ $24;
 $29 = 7 << $28;
 $30 = $29 & -1658038656;
 $31 = $30 ^ $28;
 $32 = 15 << $31;
 $33 = $32 & -272236544;
 $34 = $33 ^ $31;
 $35 = $34 >>> 18;
 $36 = $35 ^ $34;
 return ($36|0);
}
function _stdlib_mersenneInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_mersenneDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_mathInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _stdlib_mathDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _T3248314680_4($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$09 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = ($2|0)>(0);
 if (!($3)) {
  return;
 }
 $4 = ((($0)) + 8|0);
 $$09 = 0;
 while(1) {
  $5 = (($4) + (($$09*12)|0)|0);
  $6 = HEAP32[$5>>2]|0;
  _nimGCvisit($6,$1);
  $7 = (($$09) + 1)|0;
  $8 = HEAP32[$0>>2]|0;
  $9 = ($7|0)<($8|0);
  if ($9) {
   $$09 = $7;
  } else {
   break;
  }
 }
 return;
}
function _T3248314680_5($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$011 = 0;
 while(1) {
  $2 = (($0) + ($$011<<3)|0);
  $3 = HEAP32[$2>>2]|0;
  _nimGCvisit($3,$1);
  $4 = (((($0) + ($$011<<3)|0)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  _nimGCvisit($5,$1);
  $6 = (($$011) + 1)|0;
  $exitcond = ($6|0)==(20);
  if ($exitcond) {
   break;
  } else {
   $$011 = $6;
  }
 }
 return;
}
function _getquery_125032_3248314680($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $trunc = 0, $trunc$clear = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_getnum_98383_1632002213(8208)|0);
 $2 = (($1>>>0) % 1500)&-1;
 $3 = ((($0)) + 4|0);
 HEAP32[$3>>2] = $2;
 $4 = (_getnum_98383_1632002213(8208)|0);
 $5 = $4 & 1;
 $6 = $5 ^ 1;
 $7 = $6&255;
 $8 = ((($0)) + 8|0);
 HEAP8[$8>>0] = $7;
 $9 = (_getnum_98383_1632002213(8208)|0);
 $10 = (($9>>>0) % 10)&-1;
 $trunc = $10&255;
 $trunc$clear = $trunc & 15;
 switch ($trunc$clear<<24>>24) {
 case 0:  {
  $11 = (_copyString(276)|0);
  _unsureAsgnRef($0,$11);
  return;
  break;
 }
 case 2: case 1:  {
  $12 = (_copyString(292)|0);
  _unsureAsgnRef($0,$12);
  return;
  break;
 }
 default: {
  $13 = (_copyString(324)|0);
  _unsureAsgnRef($0,$13);
  return;
 }
 }
}
function _HEX3Aanonymous_125140_3248314680($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (_cmp_125146_1689653243($3,$5)|0);
 return ($6|0);
}
function _getdatabase_125066_3248314680($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$03233 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $tmpcast$byval_copy = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $tmpcast$byval_copy = sp + 24|0;
 $2 = sp;
 $3 = sp + 8|0;
 $4 = (_copyString($0)|0);
 _unsureAsgnRef($1,$4);
 $5 = ((($1)) + 4|0);
 $6 = (_newseq_125083_1689653243(0)|0);
 _unsureAsgnRef($5,$6);
 $7 = (_getnum_98383_1632002213(8208)|0);
 $8 = (($7>>>0) % 10)&-1;
 $9 = ((($3)) + 4|0);
 $10 = ((($3)) + 8|0);
 $$03233 = 0;
 while(1) {
  ;HEAP32[$3>>2]=0|0;HEAP32[$3+4>>2]=0|0;HEAP32[$3+8>>2]=0|0;
  _getquery_125032_3248314680($3);
  $11 = HEAP32[$5>>2]|0;
  $12 = (_incrSeqV2($11,12)|0);
  HEAP32[$5>>2] = $12;
  $13 = HEAP32[$12>>2]|0;
  $14 = ((($12)) + 8|0);
  $15 = (($14) + (($13*12)|0)|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = HEAP32[$3>>2]|0;
  $18 = (_copyStringRC1($17)|0);
  $19 = HEAP32[$5>>2]|0;
  $20 = HEAP32[$19>>2]|0;
  $21 = (((($19)) + 8|0) + (($20*12)|0)|0);
  HEAP32[$21>>2] = $18;
  $22 = ($16|0)==(0|0);
  if ($22) {
   $31 = $19;
  } else {
   $23 = $16;
   $24 = (($23) + -8)|0;
   $25 = $24;
   $26 = HEAP32[$25>>2]|0;
   $27 = (($26) + -8)|0;
   HEAP32[$25>>2] = $27;
   $28 = ($27>>>0)<(8);
   if ($28) {
    _addzct_51217_1689653243((4044),$25);
    $$pre = HEAP32[$5>>2]|0;
    $31 = $$pre;
   } else {
    $31 = $19;
   }
  }
  $29 = HEAP32[$9>>2]|0;
  $30 = HEAP32[$31>>2]|0;
  $32 = (((((($31)) + 8|0) + (($30*12)|0)|0)) + 4|0);
  HEAP32[$32>>2] = $29;
  $33 = HEAP8[$10>>0]|0;
  $34 = HEAP32[$31>>2]|0;
  $35 = (((((($31)) + 8|0) + (($34*12)|0)|0)) + 8|0);
  HEAP8[$35>>0] = $33;
  $36 = HEAP32[$31>>2]|0;
  $37 = (($36) + 1)|0;
  HEAP32[$31>>2] = $37;
  $38 = (($$03233) + 1)|0;
  $39 = ($$03233|0)<($8|0);
  if ($39) {
   $$03233 = $38;
  } else {
   break;
  }
 }
 HEAP32[$2>>2] = 6;
 $40 = ((($2)) + 4|0);
 HEAP32[$40>>2] = 0;
 $41 = ((($31)) + 8|0);
 $42 = HEAP32[$31>>2]|0;
 ;HEAP32[$tmpcast$byval_copy>>2]=HEAP32[$2>>2]|0;HEAP32[$tmpcast$byval_copy+4>>2]=HEAP32[$2+4>>2]|0;
 _sort_125160_3792311747($41,$42,$tmpcast$byval_copy,1);
 STACKTOP = sp;return;
}
function _getdata_126643_3248314680() {
 var $$03435 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_newObj(10708,160)|0);
 $$03435 = 0;
 while(1) {
  $1 = (($$03435) + 1)|0;
  $2 = (_nimIntToStr($1)|0);
  $3 = HEAP32[$2>>2]|0;
  $4 = (($3) + 7)|0;
  $5 = (_rawNewString($4)|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = (((($5)) + 8|0) + ($6)|0);
  $8 = $7;
  $9 = $8;
  HEAP8[$9>>0]=1937075299&255;HEAP8[$9+1>>0]=(1937075299>>8)&255;HEAP8[$9+2>>0]=(1937075299>>16)&255;HEAP8[$9+3>>0]=1937075299>>24;
  $10 = (($8) + 4)|0;
  $11 = $10;
  HEAP8[$11>>0]=7497076&255;HEAP8[$11+1>>0]=(7497076>>8)&255;HEAP8[$11+2>>0]=(7497076>>16)&255;HEAP8[$11+3>>0]=7497076>>24;
  $12 = HEAP32[$5>>2]|0;
  $13 = (($12) + 7)|0;
  HEAP32[$5>>2] = $13;
  $14 = (((($5)) + 8|0) + ($13)|0);
  $15 = ((($2)) + 8|0);
  $16 = HEAP32[$2>>2]|0;
  $17 = (($16) + 1)|0;
  _memcpy(($14|0),($15|0),($17|0))|0;
  $18 = HEAP32[$2>>2]|0;
  $19 = HEAP32[$5>>2]|0;
  $20 = (($19) + ($18))|0;
  HEAP32[$5>>2] = $20;
  $21 = $$03435 << 1;
  $22 = (($0) + ($21<<3)|0);
  _getdatabase_125066_3248314680($5,$22);
  $23 = (_nimIntToStr($1)|0);
  $24 = HEAP32[$23>>2]|0;
  $25 = (($24) + 13)|0;
  $26 = (_rawNewString($25)|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = (((($26)) + 8|0) + ($27)|0);
  $29 = $28;
  $30 = $29;
  HEAP8[$30>>0]=1937075299&255;HEAP8[$30+1>>0]=(1937075299>>8)&255;HEAP8[$30+2>>0]=(1937075299>>16)&255;HEAP8[$30+3>>0]=1937075299>>24;
  $31 = (($29) + 4)|0;
  $32 = $31;
  HEAP8[$32>>0]=7497076&255;HEAP8[$32+1>>0]=(7497076>>8)&255;HEAP8[$32+2>>0]=(7497076>>16)&255;HEAP8[$32+3>>0]=7497076>>24;
  $33 = HEAP32[$26>>2]|0;
  $34 = (($33) + 7)|0;
  HEAP32[$26>>2] = $34;
  $35 = (((($26)) + 8|0) + ($34)|0);
  $36 = ((($23)) + 8|0);
  $37 = HEAP32[$23>>2]|0;
  $38 = (($37) + 1)|0;
  _memcpy(($35|0),($36|0),($38|0))|0;
  $39 = HEAP32[$23>>2]|0;
  $40 = HEAP32[$26>>2]|0;
  $41 = (($40) + ($39))|0;
  HEAP32[$26>>2] = $41;
  $42 = (((($26)) + 8|0) + ($41)|0);
  ;HEAP8[$42>>0]=HEAP8[(368)>>0]|0;HEAP8[$42+1>>0]=HEAP8[(368)+1>>0]|0;HEAP8[$42+2>>0]=HEAP8[(368)+2>>0]|0;HEAP8[$42+3>>0]=HEAP8[(368)+3>>0]|0;HEAP8[$42+4>>0]=HEAP8[(368)+4>>0]|0;HEAP8[$42+5>>0]=HEAP8[(368)+5>>0]|0;HEAP8[$42+6>>0]=HEAP8[(368)+6>>0]|0;
  $43 = HEAP32[$26>>2]|0;
  $44 = (($43) + 6)|0;
  HEAP32[$26>>2] = $44;
  $45 = $21 | 1;
  $46 = (($0) + ($45<<3)|0);
  _getdatabase_125066_3248314680($26,$46);
  $exitcond = ($1|0)==(10);
  if ($exitcond) {
   break;
  } else {
   $$03435 = $1;
  }
 }
 return ($0|0);
}
function _render_126695_3248314680($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$$i = 0, $$$i90 = 0, $$0$i91 = 0, $$079 = 0, $$081115 = 0, $$180 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $8 = 0, $9 = 0, $exitcond = 0, $phitmp$i = 0, $phitmp$i$i = 0, $phitmp$i$i82 = 0, $phitmp$i$i86 = 0, $phitmp$i$i92 = 0, $phitmp11$i$i = 0, $phitmp11$i$i83 = 0, $phitmp11$i$i87 = 0, $phitmp11$i$i93 = 0, $phitmp2$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $2 = sp;
 _opentag_123270_1295010462($1,14);
 _attr_123671_1295010462($1,1,1172);
 _opentag_123270_1295010462($1,15);
 _memcpy(($2|0),($0|0),160)|0;
 $3 = ((($1)) + 24|0);
 $$079 = 0;
 while(1) {
  $4 = (($2) + ($$079<<3)|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (((($2) + ($$079<<3)|0)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  _opentag_123270_1295010462($1,17);
  _opentag_123270_1295010462($1,16);
  _attr_123671_1295010462($1,1,1204);
  $8 = HEAP32[$3>>2]|0;
  $9 = ((($5)) + 8|0);
  $10 = ($5|0)==(0|0);
  if ($10) {
   $11 = HEAP8[$9>>0]|0;
   HEAP8[$8>>0] = $11;
   $16 = 1;
  } else {
   $12 = HEAP32[$5>>2]|0;
   $phitmp$i$i = (($12) + 1)|0;
   _memcpy(($8|0),($9|0),($phitmp$i$i|0))|0;
   $13 = HEAP32[$5>>2]|0;
   $phitmp11$i$i = (($13) + 1)|0;
   $16 = $phitmp11$i$i;
  }
  $14 = HEAP32[$3>>2]|0;
  $15 = (($14) + ($16))|0;
  $17 = $15;
  HEAP32[$3>>2] = $17;
  _text_124216_1295010462($1,$8);
  _closetag_123437_1295010462($1);
  $18 = ($7|0)==(0|0);
  if ($18) {
   $22 = 0;
  } else {
   $19 = HEAP32[$7>>2]|0;
   $22 = $19;
  }
  _opentag_123270_1295010462($1,16);
  _attr_123671_1295010462($1,1,1211);
  _opentag_123270_1295010462($1,13);
  if ($18) {
   $21 = 1067;
  } else {
   $20 = HEAP32[$7>>2]|0;
   $phitmp$i = ($20|0)>(19);
   if ($phitmp$i) {
    $21 = 1087;
   } else {
    $phitmp2$i = ($20|0)>(9);
    $$$i = $phitmp2$i ? 1047 : 1067;
    $21 = $$$i;
   }
  }
  _attr_123671_1295010462($1,1,$21);
  $23 = (_nimIntToStr($22)|0);
  $24 = HEAP32[$3>>2]|0;
  $25 = ((($23)) + 8|0);
  $26 = ($23|0)==(0|0);
  if ($26) {
   $27 = HEAP8[$25>>0]|0;
   HEAP8[$24>>0] = $27;
   $32 = 1;
  } else {
   $28 = HEAP32[$23>>2]|0;
   $phitmp$i$i86 = (($28) + 1)|0;
   _memcpy(($24|0),($25|0),($phitmp$i$i86|0))|0;
   $29 = HEAP32[$23>>2]|0;
   $phitmp11$i$i87 = (($29) + 1)|0;
   $32 = $phitmp11$i$i87;
  }
  $30 = HEAP32[$3>>2]|0;
  $31 = (($30) + ($32))|0;
  $33 = $31;
  HEAP32[$3>>2] = $33;
  _text_124216_1295010462($1,$24);
  _closetag_123437_1295010462($1);
  _closetag_123437_1295010462($1);
  $$081115 = 0;
  while(1) {
   $34 = ($$081115|0)<($22|0);
   if ($34) {
    $35 = (((($7)) + 8|0) + (($$081115*12)|0)|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = (((((($7)) + 8|0) + (($$081115*12)|0)|0)) + 4|0);
    $38 = HEAP32[$37>>2]|0;
    _opentag_123270_1295010462($1,16);
    $39 = ($38|0)>(999);
    $40 = ($38|0)>(99);
    $$$i90 = $40 ? 1109 : 1128;
    $$0$i91 = $39 ? 1148 : $$$i90;
    _attr_123671_1295010462($1,1,$$0$i91);
    $41 = (($38|0) / 100)&-1;
    $42 = (_nimIntToStr($41)|0);
    $43 = (_addChar($42,46)|0);
    $44 = (($38|0) % 100)&-1;
    $45 = (_nimIntToStr($44)|0);
    $46 = HEAP32[$45>>2]|0;
    $47 = (_resizeString($43,$46)|0);
    $48 = HEAP32[$47>>2]|0;
    $49 = (((($47)) + 8|0) + ($48)|0);
    $50 = ((($45)) + 8|0);
    $51 = HEAP32[$45>>2]|0;
    $52 = (($51) + 1)|0;
    _memcpy(($49|0),($50|0),($52|0))|0;
    $53 = HEAP32[$45>>2]|0;
    $54 = HEAP32[$47>>2]|0;
    $55 = (($54) + ($53))|0;
    HEAP32[$47>>2] = $55;
    $56 = HEAP32[$3>>2]|0;
    $57 = ((($47)) + 8|0);
    $58 = ($47|0)==(0|0);
    if ($58) {
     $59 = HEAP8[$57>>0]|0;
     HEAP8[$56>>0] = $59;
     $63 = 1;
    } else {
     $phitmp$i$i92 = (($55) + 1)|0;
     _memcpy(($56|0),($57|0),($phitmp$i$i92|0))|0;
     $60 = HEAP32[$47>>2]|0;
     $phitmp11$i$i93 = (($60) + 1)|0;
     $63 = $phitmp11$i$i93;
    }
    $61 = HEAP32[$3>>2]|0;
    $62 = (($61) + ($63))|0;
    $64 = $62;
    HEAP32[$3>>2] = $64;
    _text_124216_1295010462($1,$56);
    _opentag_123270_1295010462($1,4);
    _attr_123671_1295010462($1,1,1223);
    _opentag_123270_1295010462($1,4);
    _attr_123671_1295010462($1,1,1236);
    $65 = HEAP32[$3>>2]|0;
    $66 = ((($36)) + 8|0);
    $67 = ($36|0)==(0|0);
    if ($67) {
     $68 = HEAP8[$66>>0]|0;
     HEAP8[$65>>0] = $68;
     $73 = 1;
    } else {
     $69 = HEAP32[$36>>2]|0;
     $phitmp$i$i82 = (($69) + 1)|0;
     _memcpy(($65|0),($66|0),($phitmp$i$i82|0))|0;
     $70 = HEAP32[$36>>2]|0;
     $phitmp11$i$i83 = (($70) + 1)|0;
     $73 = $phitmp11$i$i83;
    }
    $71 = HEAP32[$3>>2]|0;
    $72 = (($71) + ($73))|0;
    $74 = $72;
    HEAP32[$3>>2] = $74;
    _text_124216_1295010462($1,$65);
    _closetag_123437_1295010462($1);
    _opentag_123270_1295010462($1,4);
    _attr_123671_1295010462($1,1,1252);
    _closetag_123437_1295010462($1);
    _closetag_123437_1295010462($1);
    _closetag_123437_1295010462($1);
   } else {
    _opentag_123270_1295010462($1,16);
    _attr_123671_1295010462($1,1,1258);
    _text_124216_1295010462($1,1264);
    _closetag_123437_1295010462($1);
   }
   $75 = (($$081115) + 1)|0;
   $exitcond = ($75|0)==(5);
   if ($exitcond) {
    break;
   } else {
    $$081115 = $75;
   }
  }
  _closetag_123437_1295010462($1);
  $76 = ($$079|0)>(18);
  $77 = $76&1;
  $78 = $77 ^ 1;
  $$180 = (($78) + ($$079))|0;
  if ($76) {
   break;
  } else {
   $$079 = $$180;
  }
 }
 _closetag_123437_1295010462($1);
 _closetag_123437_1295010462($1);
 STACKTOP = sp;return;
}
function _unknown_dbmonsterInit000() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2512|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2512|0);
 $0 = sp;
 _newmersennetwister_98011_1632002213($0,556);
 _memcpy((8208|0),($0|0),2500)|0;
 STACKTOP = sp;return;
}
function _unknown_dbmonsterDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[2684] = 160;
 HEAP8[(10740)>>0] = 18;
 HEAP32[(10744)>>2] = 0;
 HEAP8[(10741)>>0] = 2;
 HEAP32[2691] = 8;
 HEAP8[(10768)>>0] = 18;
 HEAP32[(10772)>>2] = 0;
 HEAP8[(10769)>>0] = 2;
 HEAP32[2767] = (10924);
 HEAP8[(10924)>>0] = 1;
 HEAP32[(10928)>>2] = 0;
 HEAP32[(10932)>>2] = 39292;
 HEAP32[(10936)>>2] = 1576;
 HEAP32[(11072)>>2] = (10948);
 HEAP32[2698] = 12;
 HEAP8[(10796)>>0] = 18;
 HEAP32[(10800)>>2] = 0;
 HEAP8[(10797)>>0] = 2;
 HEAP32[2769] = (10996);
 HEAP8[(10996)>>0] = 1;
 HEAP32[(11000)>>2] = 0;
 HEAP32[(11004)>>2] = 39292;
 HEAP32[(11008)>>2] = 1266;
 HEAP32[(11080)>>2] = (11020);
 HEAP8[(11020)>>0] = 1;
 HEAP32[(11024)>>2] = 4;
 HEAP32[(11028)>>2] = 39320;
 HEAP32[(11032)>>2] = 1272;
 HEAP32[(11084)>>2] = (11044);
 HEAP8[(11044)>>0] = 1;
 HEAP32[(11048)>>2] = 8;
 HEAP32[(11052)>>2] = 39348;
 HEAP32[(11056)>>2] = 1280;
 HEAP32[(10988)>>2] = 3;
 HEAP8[(10972)>>0] = 2;
 HEAP32[(10992)>>2] = 11076;
 HEAP32[(10804)>>2] = (10972);
 HEAP32[2705] = 4;
 HEAP8[(10824)>>0] = 24;
 HEAP32[(10828)>>2] = 10792;
 HEAP8[(10825)>>0] = 2;
 HEAP32[(10840)>>2] = 7;
 HEAP8[(10948)>>0] = 1;
 HEAP32[(10952)>>2] = 4;
 HEAP32[(10956)>>2] = 10820;
 HEAP32[(10960)>>2] = 1288;
 HEAP32[(10916)>>2] = 2;
 HEAP8[(10900)>>0] = 2;
 HEAP32[(10920)>>2] = 11068;
 HEAP32[(10776)>>2] = (10900);
 HEAP32[2712] = 160;
 HEAP8[(10852)>>0] = 16;
 HEAP32[(10856)>>2] = 10764;
 HEAP8[(10853)>>0] = 2;
 HEAP8[10876] = 1;
 HEAP32[(10880)>>2] = 0;
 HEAP32[(10884)>>2] = 10848;
 HEAP32[(10888)>>2] = 1296;
 HEAP32[(10748)>>2] = 10876;
 HEAP32[2677] = 4;
 HEAP8[(10712)>>0] = 22;
 HEAP32[(10716)>>2] = 10736;
 HEAP8[(10713)>>0] = 2;
 HEAP32[(10728)>>2] = 8;
 return;
}
function _setStackBottom($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $storemerge = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[(4036)>>2]|0;
 $2 = ($1|0)==(0|0);
 $3 = $0;
 $4 = $1;
 $5 = ($3|0)<=($4|0);
 $6 = $5 ? $3 : $4;
 $7 = $6;
 $storemerge = $2 ? $0 : $7;
 HEAP32[(4036)>>2] = $storemerge;
 return;
}
function _raiseoutofmem_27633_1689653243() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2772]|0;
 $1 = ($0|0)==(0|0);
 if (!($1)) {
  FUNCTION_TABLE_v[$0 & 31]();
 }
 (_puts((384))|0);
 $2 = HEAP32[165]|0;
 (_fflush($2)|0);
 _exit(1);
 // unreachable;
}
function _intsetput_30505_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$i = 0, $$010$i = 0, $$011$i = 0, $$019 = 0, $$41$i$i = 0, $$cast$i = 0, $$phi$trans$insert31$i = 0, $$pre32$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $magicptr$i$i = 0, $phitmp = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 $3 = $2 & 255;
 $4 = (($1) + ($3<<2)|0);
 $$010$i = HEAP32[$4>>2]|0;
 $5 = ($$010$i|0)==(0|0);
 L1: do {
  if (!($5)) {
   $$011$i = $$010$i;
   while(1) {
    $6 = ((($$011$i)) + 4|0);
    $7 = HEAP32[$6>>2]|0;
    $8 = ($7|0)==($2|0);
    if ($8) {
     $$019 = $$011$i;
     break;
    }
    $$0$i = HEAP32[$$011$i>>2]|0;
    $9 = ($$0$i|0)==(0|0);
    if ($9) {
     break L1;
    } else {
     $$011$i = $$0$i;
    }
   }
   return ($$019|0);
  }
 } while(0);
 $10 = ((($0)) + 2056|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($11|0)==(0|0);
 $13 = $11;
 if ($12) {
  label = 7;
 } else {
  $14 = HEAP32[$11>>2]|0;
  $15 = ($14|0)<(72);
  if ($15) {
   label = 7;
  } else {
   $$phi$trans$insert31$i = ((($11)) + 4|0);
   $$pre32$i = HEAP32[$$phi$trans$insert31$i>>2]|0;
   $phitmp = (($14) + -72)|0;
   $29 = $11;$31 = $$pre32$i;$33 = $phitmp;
  }
 }
 L10: do {
  if ((label|0) == 7) {
   $16 = (___mmap(0,8201,3,34,-1,0)|0);
   $magicptr$i$i = $16;
   switch ($magicptr$i$i|0) {
   case 0: case -1:  {
    _raiseoutofmem_27633_1689653243();
    // unreachable;
    break;
   }
   default: {
    $17 = $magicptr$i$i & 4095;
    $18 = (4096 - ($17))|0;
    $19 = (($18) + ($magicptr$i$i))|0;
    $20 = ($18>>>0)<(8);
    $21 = (($19) + 4096)|0;
    $$41$i$i = $20 ? $21 : $19;
    $22 = $$41$i$i;
    HEAP32[$10>>2] = $22;
    $23 = ((($0)) + 2060|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = (($24) + 4096)|0;
    HEAP32[$23>>2] = $25;
    $$cast$i = $$41$i$i;
    HEAP32[$$cast$i>>2] = 4084;
    $26 = ((($$cast$i)) + 4|0);
    HEAP32[$26>>2] = 12;
    $27 = ((($$cast$i)) + 8|0);
    HEAP32[$27>>2] = $13;
    $29 = $$cast$i;$31 = 12;$33 = 4012;
    break L10;
   }
   }
  }
 } while(0);
 $28 = $29;
 $30 = (($28) + ($31))|0;
 $32 = $30;
 HEAP32[$29>>2] = $33;
 $34 = ((($29)) + 4|0);
 $35 = (($31) + 72)|0;
 HEAP32[$34>>2] = $35;
 dest=$32; stop=dest+72|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 $36 = $30;
 $37 = HEAP32[$4>>2]|0;
 $38 = $30;
 HEAP32[$38>>2] = $37;
 HEAP32[$4>>2] = $32;
 $39 = ((($32)) + 4|0);
 HEAP32[$39>>2] = $2;
 $$019 = $36;
 return ($$019|0);
}
function _splitchunk_34809_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$i$i$i$i = 0, $$010$i$i$i$i = 0, $$011$i$i$i$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1;
 $4 = (($3) + ($2))|0;
 $5 = $4;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($7) - ($2))|0;
 $9 = ((($5)) + 4|0);
 HEAP32[$9>>2] = $8;
 $10 = ((($5)) + 8|0);
 HEAP8[$10>>0] = 0;
 $11 = ((($5)) + 12|0);
 HEAP32[$11>>2] = 0;
 $12 = ((($5)) + 16|0);
 HEAP32[$12>>2] = 0;
 HEAP32[$5>>2] = $2;
 $13 = HEAP32[$6>>2]|0;
 $14 = (($13) + ($3))|0;
 $15 = $14 >>> 12;
 $16 = $14 >>> 21;
 $17 = $16 & 255;
 $18 = (((($0)) + 2080|0) + ($17<<2)|0);
 $$010$i$i$i$i = HEAP32[$18>>2]|0;
 $19 = ($$010$i$i$i$i|0)==(0|0);
 L1: do {
  if (!($19)) {
   $$011$i$i$i$i = $$010$i$i$i$i;
   while(1) {
    $20 = ((($$011$i$i$i$i)) + 4|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = ($21|0)==($16|0);
    if ($22) {
     break;
    }
    $$0$i$i$i$i = HEAP32[$$011$i$i$i$i>>2]|0;
    $23 = ($$0$i$i$i$i|0)==(0|0);
    if ($23) {
     break L1;
    } else {
     $$011$i$i$i$i = $$0$i$i$i$i;
    }
   }
   $24 = $14 >>> 17;
   $25 = $24 & 15;
   $26 = (((($$011$i$i$i$i)) + 8|0) + ($25<<2)|0);
   $27 = $15 & 31;
   $28 = 1 << $27;
   $29 = HEAP32[$26>>2]|0;
   $30 = $29 & $28;
   $31 = ($30|0)==(0);
   if (!($31)) {
    $32 = $14;
    HEAP32[$32>>2] = $8;
   }
  }
 } while(0);
 HEAP32[$6>>2] = $2;
 $33 = $4 >>> 12;
 $34 = ((($0)) + 2080|0);
 $35 = $4 >>> 21;
 $36 = (_intsetput_30505_1689653243($0,$34,$35)|0);
 $37 = $4 >>> 17;
 $38 = $37 & 15;
 $39 = (((($36)) + 8|0) + ($38<<2)|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = $33 & 31;
 $42 = 1 << $41;
 $43 = $40 | $42;
 HEAP32[$39>>2] = $43;
 $44 = ((($0)) + 2076|0);
 $45 = HEAP32[$44>>2]|0;
 HEAP32[$11>>2] = $45;
 $46 = HEAP32[$44>>2]|0;
 $47 = ($46|0)==(0|0);
 if ($47) {
  HEAP32[$44>>2] = $5;
  return;
 }
 $48 = ((($46)) + 16|0);
 HEAP32[$48>>2] = $5;
 HEAP32[$44>>2] = $5;
 return;
}
function _requestoschunks_30988_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $$0$i$i = 0, $$0$i$i63 = 0, $$010$i$i = 0, $$010$i$i60 = 0, $$011$i$i = 0, $$011$i$i61 = 0, $$41$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $7 = 0, $8 = 0, $9 = 0, $magicptr$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 2060|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (($3) + ($1))|0;
 HEAP32[$2>>2] = $4;
 $5 = ((($0)) + 2068|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($6) + ($1))|0;
 HEAP32[$5>>2] = $7;
 $8 = (($1) + 4105)|0;
 $9 = (___mmap(0,$8,3,34,-1,0)|0);
 $magicptr$i = $9;
 switch ($magicptr$i|0) {
 case 0: case -1:  {
  _raiseoutofmem_27633_1689653243();
  // unreachable;
  break;
 }
 default: {
 }
 }
 $10 = $magicptr$i & 4095;
 $11 = (4096 - ($10))|0;
 $12 = (($11) + ($magicptr$i))|0;
 $13 = ($11>>>0)<(8);
 $14 = (($12) + 4096)|0;
 $$41$i = $13 ? $14 : $12;
 $15 = $$41$i;
 $16 = $$41$i;
 $17 = ((($15)) + 12|0);
 HEAP32[$17>>2] = 0;
 $18 = ((($15)) + 16|0);
 HEAP32[$18>>2] = 0;
 $19 = ((($15)) + 8|0);
 HEAP8[$19>>0] = 0;
 $20 = ((($15)) + 4|0);
 HEAP32[$20>>2] = $1;
 $21 = (($$41$i) + ($1))|0;
 $22 = $21;
 $23 = $21 >>> 12;
 $24 = $21 >>> 21;
 $25 = $24 & 255;
 $26 = (((($0)) + 2080|0) + ($25<<2)|0);
 $$010$i$i60 = HEAP32[$26>>2]|0;
 $27 = ($$010$i$i60|0)==(0|0);
 L4: do {
  if (!($27)) {
   $$011$i$i61 = $$010$i$i60;
   while(1) {
    $28 = ((($$011$i$i61)) + 4|0);
    $29 = HEAP32[$28>>2]|0;
    $30 = ($29|0)==($24|0);
    if ($30) {
     break;
    }
    $$0$i$i63 = HEAP32[$$011$i$i61>>2]|0;
    $31 = ($$0$i$i63|0)==(0|0);
    if ($31) {
     break L4;
    } else {
     $$011$i$i61 = $$0$i$i63;
    }
   }
   $32 = $21 >>> 17;
   $33 = $32 & 15;
   $34 = (((($$011$i$i61)) + 8|0) + ($33<<2)|0);
   $35 = $23 & 31;
   $36 = 1 << $35;
   $37 = HEAP32[$34>>2]|0;
   $38 = $37 & $36;
   $39 = ($38|0)==(0);
   if (!($39)) {
    HEAP32[$22>>2] = $1;
   }
  }
 } while(0);
 $40 = ((($0)) + 2072|0);
 $41 = HEAP32[$40>>2]|0;
 $42 = ($41|0)==(0);
 $$ = $42 ? 4096 : $41;
 $43 = (($$41$i) - ($$))|0;
 $44 = $43;
 $45 = $43 >>> 12;
 $46 = $43 >>> 21;
 $47 = $46 & 255;
 $48 = (((($0)) + 2080|0) + ($47<<2)|0);
 $$010$i$i = HEAP32[$48>>2]|0;
 $49 = ($$010$i$i|0)==(0|0);
 L11: do {
  if (!($49)) {
   $$011$i$i = $$010$i$i;
   while(1) {
    $50 = ((($$011$i$i)) + 4|0);
    $51 = HEAP32[$50>>2]|0;
    $52 = ($51|0)==($46|0);
    if ($52) {
     break;
    }
    $$0$i$i = HEAP32[$$011$i$i>>2]|0;
    $53 = ($$0$i$i|0)==(0|0);
    if ($53) {
     break L11;
    } else {
     $$011$i$i = $$0$i$i;
    }
   }
   $54 = $43 >>> 17;
   $55 = $54 & 15;
   $56 = (((($$011$i$i)) + 8|0) + ($55<<2)|0);
   $57 = $45 & 31;
   $58 = 1 << $57;
   $59 = HEAP32[$56>>2]|0;
   $60 = $59 & $58;
   $61 = ($60|0)==(0);
   if (!($61)) {
    $62 = ((($44)) + 4|0);
    $63 = HEAP32[$62>>2]|0;
    $64 = ($63|0)==($$|0);
    if ($64) {
     $65 = $$41$i;
     HEAP32[$65>>2] = $$;
     HEAP32[$40>>2] = $1;
     return ($16|0);
    }
   }
  }
 } while(0);
 $66 = $$41$i;
 HEAP32[$66>>2] = 0;
 HEAP32[$40>>2] = $1;
 return ($16|0);
}
function _getbigchunk_35014_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$037 = 0, $$038 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 2076|0);
 $$037 = HEAP32[$2>>2]|0;
 $3 = ($$037|0)==(0|0);
 L1: do {
  if ($3) {
   label = 17;
  } else {
   $$038 = $$037;
   while(1) {
    $4 = ((($$038)) + 4|0);
    $5 = HEAP32[$4>>2]|0;
    $6 = ($5|0)==($1|0);
    if ($6) {
     label = 3;
     break;
    }
    $20 = ($5|0)>($1|0);
    if ($20) {
     label = 10;
     break;
    }
    $34 = ((($$038)) + 12|0);
    $$0 = HEAP32[$34>>2]|0;
    $35 = ($$0|0)==(0|0);
    if ($35) {
     label = 17;
     break L1;
    } else {
     $$038 = $$0;
    }
   }
   if ((label|0) == 3) {
    $7 = ($$037|0)==($$038|0);
    $8 = ((($$038)) + 12|0);
    $9 = HEAP32[$8>>2]|0;
    if ($7) {
     HEAP32[$2>>2] = $9;
     $10 = ($9|0)==(0|0);
     if (!($10)) {
      $11 = ((($9)) + 16|0);
      HEAP32[$11>>2] = 0;
     }
    } else {
     $12 = ((($$038)) + 16|0);
     $13 = HEAP32[$12>>2]|0;
     $14 = ((($13)) + 12|0);
     HEAP32[$14>>2] = $9;
     $15 = HEAP32[$8>>2]|0;
     $16 = ($15|0)==(0|0);
     if (!($16)) {
      $17 = $13;
      $18 = ((($15)) + 16|0);
      HEAP32[$18>>2] = $17;
     }
    }
    HEAP32[$8>>2] = 0;
    $19 = ((($$038)) + 16|0);
    HEAP32[$19>>2] = 0;
    $$1 = $$038;
    break;
   }
   else if ((label|0) == 10) {
    $21 = ($$037|0)==($$038|0);
    $22 = ((($$038)) + 12|0);
    $23 = HEAP32[$22>>2]|0;
    if ($21) {
     HEAP32[$2>>2] = $23;
     $24 = ($23|0)==(0|0);
     if (!($24)) {
      $25 = ((($23)) + 16|0);
      HEAP32[$25>>2] = 0;
     }
    } else {
     $26 = ((($$038)) + 16|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = ((($27)) + 12|0);
     HEAP32[$28>>2] = $23;
     $29 = HEAP32[$22>>2]|0;
     $30 = ($29|0)==(0|0);
     if (!($30)) {
      $31 = $27;
      $32 = ((($29)) + 16|0);
      HEAP32[$32>>2] = $31;
     }
    }
    HEAP32[$22>>2] = 0;
    $33 = ((($$038)) + 16|0);
    HEAP32[$33>>2] = 0;
    _splitchunk_34809_1689653243($0,$$038,$1);
    $$1 = $$038;
    break;
   }
  }
 } while(0);
 do {
  if ((label|0) == 17) {
   $36 = ($1|0)<(524288);
   if ($36) {
    $37 = (_requestoschunks_30988_1689653243($0,524288)|0);
    _splitchunk_34809_1689653243($0,$37,$1);
    $$1 = $37;
    break;
   } else {
    $38 = (_requestoschunks_30988_1689653243($0,$1)|0);
    $$1 = $38;
    break;
   }
  }
 } while(0);
 HEAP32[$$1>>2] = 0;
 $39 = ((($$1)) + 8|0);
 HEAP8[$39>>0] = 1;
 $40 = $$1;
 $41 = $40 >>> 12;
 $42 = ((($0)) + 2080|0);
 $43 = $40 >>> 21;
 $44 = (_intsetput_30505_1689653243($0,$42,$43)|0);
 $45 = $40 >>> 17;
 $46 = $45 & 15;
 $47 = (((($44)) + 8|0) + ($46<<2)|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = $41 & 31;
 $50 = 1 << $49;
 $51 = $48 | $50;
 HEAP32[$47>>2] = $51;
 $52 = ((($0)) + 2068|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = (($53) - ($1))|0;
 HEAP32[$52>>2] = $54;
 return ($$1|0);
}
function _allocavlnode_29627_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$41$i$i = 0, $$cast$i = 0, $$phi$trans$insert31$i = 0, $$pre32$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $magicptr$i$i = 0, $phitmp = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 3116|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if (!($5)) {
  $6 = HEAP32[$4>>2]|0;
  HEAP32[$3>>2] = $6;
  $$0 = $4;
  $34 = ((($$0)) + 8|0);
  HEAP32[$34>>2] = $1;
  $35 = ((($$0)) + 12|0);
  HEAP32[$35>>2] = $2;
  $36 = HEAP32[2773]|0;
  HEAP32[$$0>>2] = $36;
  $37 = HEAP32[2773]|0;
  $38 = ((($$0)) + 4|0);
  HEAP32[$38>>2] = $37;
  $39 = ((($$0)) + 16|0);
  HEAP32[$39>>2] = 1;
  return ($$0|0);
 }
 $7 = ((($0)) + 2056|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 $10 = $8;
 if ($9) {
  label = 6;
 } else {
  $11 = HEAP32[$8>>2]|0;
  $12 = ($11|0)<(20);
  if ($12) {
   label = 6;
  } else {
   $$phi$trans$insert31$i = ((($8)) + 4|0);
   $$pre32$i = HEAP32[$$phi$trans$insert31$i>>2]|0;
   $phitmp = (($11) + -20)|0;
   $26 = $8;$28 = $$pre32$i;$30 = $phitmp;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $13 = (___mmap(0,8201,3,34,-1,0)|0);
   $magicptr$i$i = $13;
   switch ($magicptr$i$i|0) {
   case 0: case -1:  {
    _raiseoutofmem_27633_1689653243();
    // unreachable;
    break;
   }
   default: {
    $14 = $magicptr$i$i & 4095;
    $15 = (4096 - ($14))|0;
    $16 = (($15) + ($magicptr$i$i))|0;
    $17 = ($15>>>0)<(8);
    $18 = (($16) + 4096)|0;
    $$41$i$i = $17 ? $18 : $16;
    $19 = $$41$i$i;
    HEAP32[$7>>2] = $19;
    $20 = ((($0)) + 2060|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = (($21) + 4096)|0;
    HEAP32[$20>>2] = $22;
    $$cast$i = $$41$i$i;
    HEAP32[$$cast$i>>2] = 4084;
    $23 = ((($$cast$i)) + 4|0);
    HEAP32[$23>>2] = 12;
    $24 = ((($$cast$i)) + 8|0);
    HEAP32[$24>>2] = $10;
    $26 = $$cast$i;$28 = 12;$30 = 4064;
    break L8;
   }
   }
  }
 } while(0);
 $25 = $26;
 $27 = (($25) + ($28))|0;
 $29 = $27;
 HEAP32[$26>>2] = $30;
 $31 = ((($26)) + 4|0);
 $32 = (($28) + 20)|0;
 HEAP32[$31>>2] = $32;
 dest=$29; stop=dest+20|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 $33 = $27;
 $$0 = $33;
 $34 = ((($$0)) + 8|0);
 HEAP32[$34>>2] = $1;
 $35 = ((($$0)) + 12|0);
 HEAP32[$35>>2] = $2;
 $36 = HEAP32[2773]|0;
 HEAP32[$$0>>2] = $36;
 $37 = HEAP32[2773]|0;
 $38 = ((($$0)) + 4|0);
 HEAP32[$38>>2] = $37;
 $39 = ((($$0)) + 16|0);
 HEAP32[$39>>2] = 1;
 return ($$0|0);
}
function _add_30353_1689653243($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre19 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = HEAP32[$1>>2]|0;
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($4|0);
 if ($6) {
  $7 = (_allocavlnode_29627_1689653243($0,$2,$3)|0);
  HEAP32[$1>>2] = $7;
  return;
 }
 $8 = ((($4)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9>>>0)>($2>>>0);
 if ($10) {
  _add_30353_1689653243($0,$4,$2,$3);
 } else {
  $11 = ($9>>>0)<($2>>>0);
  if ($11) {
   $12 = ((($4)) + 4|0);
   _add_30353_1689653243($0,$12,$2,$3);
  }
 }
 $13 = HEAP32[$1>>2]|0;
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + 16|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($13)) + 16|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($16|0)==($18|0);
 if ($19) {
  HEAP32[$1>>2] = $14;
  $20 = ((($14)) + 4|0);
  $21 = HEAP32[$20>>2]|0;
  HEAP32[$13>>2] = $21;
  $22 = HEAP32[$1>>2]|0;
  $23 = ((($22)) + 4|0);
  HEAP32[$23>>2] = $13;
  $$pre = HEAP32[$1>>2]|0;
  $$phi$trans$insert = ((($$pre)) + 16|0);
  $$pre19 = HEAP32[$$phi$trans$insert>>2]|0;
  $25 = $$pre;$32 = $$pre19;
 } else {
  $25 = $13;$32 = $18;
 }
 $24 = ((($25)) + 4|0);
 $26 = HEAP32[$24>>2]|0;
 $27 = ((($26)) + 4|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ((($28)) + 16|0);
 $30 = HEAP32[$29>>2]|0;
 $31 = ($30|0)==($32|0);
 if (!($31)) {
  return;
 }
 HEAP32[$1>>2] = $26;
 $33 = HEAP32[$26>>2]|0;
 HEAP32[$24>>2] = $33;
 $34 = HEAP32[$1>>2]|0;
 HEAP32[$34>>2] = $25;
 $35 = HEAP32[$1>>2]|0;
 $36 = ((($35)) + 16|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = (($37) + 1)|0;
 HEAP32[$36>>2] = $38;
 return;
}
function _rawalloc_36404_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$057 = 0, $$058 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($1) + 7)|0;
 $3 = $2 & -8;
 $4 = ($3|0)<(4065);
 if (!($4)) {
  $52 = (($1) + 4119)|0;
  $53 = $52 & -4096;
  $54 = (_getbigchunk_35014_1689653243($0,$53)|0);
  $55 = ((($54)) + 24|0);
  $56 = ((($0)) + 3104|0);
  $57 = HEAP32[$56>>2]|0;
  $58 = ($57|0)==(0|0);
  if ($58) {
   $59 = HEAP32[2773]|0;
   HEAP32[$56>>2] = $59;
  }
  $60 = $55;
  $61 = (($60) + ($53))|0;
  _add_30353_1689653243($0,$56,$60,$61);
  $$0 = $55;
  return ($$0|0);
 }
 $5 = (($3|0) / 8)&-1;
 $6 = (((($0)) + 8|0) + ($5<<2)|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==(0|0);
 if ($8) {
  $9 = (_getbigchunk_35014_1689653243($0,4096)|0);
  $10 = ((($9)) + 20|0);
  HEAP32[$10>>2] = 0;
  $11 = ((($9)) + 4|0);
  HEAP32[$11>>2] = $3;
  $12 = ((($9)) + 28|0);
  HEAP32[$12>>2] = $3;
  $13 = (4064 - ($3))|0;
  $14 = ((($9)) + 24|0);
  HEAP32[$14>>2] = $13;
  $15 = ((($9)) + 12|0);
  HEAP32[$15>>2] = 0;
  $16 = ((($9)) + 16|0);
  HEAP32[$16>>2] = 0;
  $17 = HEAP32[$6>>2]|0;
  HEAP32[$15>>2] = $17;
  $18 = HEAP32[$6>>2]|0;
  $19 = ($18|0)==(0|0);
  if (!($19)) {
   $20 = ((($18)) + 16|0);
   HEAP32[$20>>2] = $9;
  }
  HEAP32[$6>>2] = $9;
  $21 = ((($9)) + 32|0);
  $$057 = $9;$$1 = $21;$37 = $13;
 } else {
  $22 = ((($7)) + 20|0);
  $23 = HEAP32[$22>>2]|0;
  $24 = ($23|0)==(0|0);
  if ($24) {
   $25 = ((($7)) + 32|0);
   $26 = $25;
   $27 = ((($7)) + 28|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (($28) + ($26))|0;
   $30 = $29;
   $31 = (($28) + ($3))|0;
   HEAP32[$27>>2] = $31;
   $$058 = $30;
  } else {
   $32 = HEAP32[$23>>2]|0;
   HEAP32[$22>>2] = $32;
   $$058 = $23;
  }
  $33 = ((($7)) + 24|0);
  $34 = HEAP32[$33>>2]|0;
  $35 = (($34) - ($3))|0;
  HEAP32[$33>>2] = $35;
  $$057 = $7;$$1 = $$058;$37 = $35;
 }
 $36 = ($37|0)<($3|0);
 if (!($36)) {
  $$0 = $$1;
  return ($$0|0);
 }
 $38 = HEAP32[$6>>2]|0;
 $39 = ($38|0)==($$057|0);
 $40 = ((($$057)) + 12|0);
 $41 = HEAP32[$40>>2]|0;
 if ($39) {
  HEAP32[$6>>2] = $41;
  $42 = ($41|0)==(0|0);
  if (!($42)) {
   $43 = ((($41)) + 16|0);
   HEAP32[$43>>2] = 0;
  }
 } else {
  $44 = ((($$057)) + 16|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = ((($45)) + 12|0);
  HEAP32[$46>>2] = $41;
  $47 = HEAP32[$40>>2]|0;
  $48 = ($47|0)==(0|0);
  if (!($48)) {
   $49 = $45;
   $50 = ((($47)) + 16|0);
   HEAP32[$50>>2] = $49;
  }
 }
 HEAP32[$40>>2] = 0;
 $51 = ((($$057)) + 16|0);
 HEAP32[$51>>2] = 0;
 $$0 = $$1;
 return ($$0|0);
}
function _initgc_12201_1689653243() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[(4040)>>2] = 4194304;
 HEAP32[(4044)>>2] = 0;
 ;HEAP32[(7208)>>2]=0|0;HEAP32[(7208)+4>>2]=0|0;HEAP32[(7208)+8>>2]=0|0;HEAP32[(7208)+12>>2]=0|0;HEAP32[(7208)+16>>2]=0|0;HEAP32[(7208)+20>>2]=0|0;
 HEAP32[(4048)>>2] = 1024;
 $0 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $1 = ((($0)) + 24|0);
 $2 = HEAP32[(7188)>>2]|0;
 $3 = ($2|0)==(0|0);
 if ($3) {
  $4 = HEAP32[2773]|0;
  HEAP32[(7188)>>2] = $4;
 }
 $5 = $1;
 $6 = (($5) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$5,$6);
 $7 = ((($1)) + 4|0);
 HEAP32[$7>>2] = 1;
 $8 = (($5) + 8)|0;
 $9 = $8;
 _memset(($9|0),0,4096)|0;
 HEAP32[(4052)>>2] = $9;
 HEAP32[(4068)>>2] = 0;
 HEAP32[(4072)>>2] = 1024;
 $10 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $11 = ((($10)) + 24|0);
 $12 = HEAP32[(7188)>>2]|0;
 $13 = ($12|0)==(0|0);
 if ($13) {
  $14 = HEAP32[2773]|0;
  HEAP32[(7188)>>2] = $14;
 }
 $15 = $11;
 $16 = (($15) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$15,$16);
 $17 = ((($11)) + 4|0);
 HEAP32[$17>>2] = 1;
 $18 = (($15) + 8)|0;
 $19 = $18;
 _memset(($19|0),0,4096)|0;
 HEAP32[(4076)>>2] = $19;
 HEAP32[(4056)>>2] = 0;
 HEAP32[(4060)>>2] = 1024;
 $20 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $21 = ((($20)) + 24|0);
 $22 = HEAP32[(7188)>>2]|0;
 $23 = ($22|0)==(0|0);
 if ($23) {
  $24 = HEAP32[2773]|0;
  HEAP32[(7188)>>2] = $24;
 }
 $25 = $21;
 $26 = (($25) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$25,$26);
 $27 = ((($21)) + 4|0);
 HEAP32[$27>>2] = 1;
 $28 = (($25) + 8)|0;
 $29 = $28;
 _memset(($29|0),0,4096)|0;
 HEAP32[(4064)>>2] = $29;
 $30 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $31 = ((($30)) + 24|0);
 $32 = HEAP32[(7188)>>2]|0;
 $33 = ($32|0)==(0|0);
 if ($33) {
  $34 = HEAP32[2773]|0;
  HEAP32[(7188)>>2] = $34;
 }
 $35 = $31;
 $36 = (($35) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$35,$36);
 $37 = ((($31)) + 4|0);
 HEAP32[$37>>2] = 1;
 $38 = (($35) + 8)|0;
 $39 = $38;
 _memset(($39|0),0,4096)|0;
 HEAP32[(7252)>>2] = $39;
 HEAP32[(7244)>>2] = 1023;
 HEAP32[(7240)>>2] = 0;
 HEAP32[(7248)>>2] = 0;
 HEAP32[(7256)>>2] = 0;
 HEAP32[(7260)>>2] = 1024;
 $40 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $41 = ((($40)) + 24|0);
 $42 = HEAP32[(7188)>>2]|0;
 $43 = ($42|0)==(0|0);
 if (!($43)) {
  $45 = $41;
  $46 = (($45) + 8192)|0;
  _add_30353_1689653243((4084),(7188),$45,$46);
  $47 = ((($41)) + 4|0);
  HEAP32[$47>>2] = 1;
  $48 = (($45) + 8)|0;
  $49 = $48;
  _memset(($49|0),0,4096)|0;
  HEAP32[(7264)>>2] = $49;
  return;
 }
 $44 = HEAP32[2773]|0;
 HEAP32[(7188)>>2] = $44;
 $45 = $41;
 $46 = (($45) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$45,$46);
 $47 = ((($41)) + 4|0);
 HEAP32[$47>>2] = 1;
 $48 = (($45) + 8)|0;
 $49 = $48;
 _memset(($49|0),0,4096)|0;
 HEAP32[(7264)>>2] = $49;
 return;
}
function _alloc_7801_1689653243($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (($0) + 8)|0;
 $2 = (_rawalloc_36404_1689653243((4084),$1)|0);
 $3 = ((($2)) + 4|0);
 HEAP32[$3>>2] = 1;
 $4 = $2;
 $5 = (($4) + 8)|0;
 $6 = $5;
 return ($6|0);
}
function _freeoschunks_31607_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$$i = 0, $$0$i$i = 0, $$0$i$i30 = 0, $$010$i$i = 0, $$010$i$i27 = 0, $$011$i$i = 0, $$011$i$i28 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($5) + ($3))|0;
 $7 = $6;
 $8 = $6 >>> 12;
 $9 = $6 >>> 21;
 $10 = $9 & 255;
 $11 = (((($0)) + 2080|0) + ($10<<2)|0);
 $$010$i$i = HEAP32[$11>>2]|0;
 $12 = ($$010$i$i|0)==(0|0);
 L1: do {
  if (!($12)) {
   $$011$i$i = $$010$i$i;
   while(1) {
    $13 = ((($$011$i$i)) + 4|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($14|0)==($9|0);
    if ($15) {
     break;
    }
    $$0$i$i = HEAP32[$$011$i$i>>2]|0;
    $16 = ($$0$i$i|0)==(0|0);
    if ($16) {
     break L1;
    } else {
     $$011$i$i = $$0$i$i;
    }
   }
   $17 = $6 >>> 17;
   $18 = $17 & 15;
   $19 = (((($$011$i$i)) + 8|0) + ($18<<2)|0);
   $20 = $8 & 31;
   $21 = 1 << $20;
   $22 = HEAP32[$19>>2]|0;
   $23 = $22 & $21;
   $24 = ($23|0)==(0);
   if (!($24)) {
    HEAP32[$7>>2] = 0;
   }
  }
 } while(0);
 $25 = $3 >>> 12;
 $26 = $3 >>> 21;
 $27 = $26 & 255;
 $28 = (((($0)) + 2080|0) + ($27<<2)|0);
 $$010$i$i27 = HEAP32[$28>>2]|0;
 $29 = ($$010$i$i27|0)==(0|0);
 L8: do {
  if (!($29)) {
   $$011$i$i28 = $$010$i$i27;
   while(1) {
    $30 = ((($$011$i$i28)) + 4|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = ($31|0)==($26|0);
    if ($32) {
     break;
    }
    $$0$i$i30 = HEAP32[$$011$i$i28>>2]|0;
    $33 = ($$0$i$i30|0)==(0|0);
    if ($33) {
     break L8;
    } else {
     $$011$i$i28 = $$0$i$i30;
    }
   }
   $34 = $3 >>> 17;
   $35 = $34 & 15;
   $36 = (((($$011$i$i28)) + 8|0) + ($35<<2)|0);
   $37 = $25 & 31;
   $38 = 1 << $37;
   $39 = $38 ^ -1;
   $40 = HEAP32[$36>>2]|0;
   $41 = $40 & $39;
   HEAP32[$36>>2] = $41;
  }
 } while(0);
 $42 = (($3) + -8)|0;
 (___munmap(0,$42)|0);
 $43 = ((($0)) + 2064|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = ((($0)) + 2060|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = ($44|0)<($46|0);
 $$$i = $47 ? $46 : $44;
 HEAP32[$43>>2] = $$$i;
 $48 = (($46) - ($2))|0;
 HEAP32[$45>>2] = $48;
 $49 = ((($0)) + 2068|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = (($50) - ($2))|0;
 HEAP32[$49>>2] = $51;
 return;
}
function _freebigchunk_32003_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$i$i$i = 0, $$0$i$i$i$i = 0, $$0$i$i$i94 = 0, $$0$i$i100 = 0, $$0$i$i90 = 0, $$010$i$i = 0, $$010$i$i$i = 0, $$010$i$i$i$i = 0, $$010$i$i$i91 = 0, $$010$i$i97 = 0, $$011$i$i = 0, $$011$i$i$i = 0, $$011$i$i$i$i = 0, $$011$i$i$i92 = 0, $$011$i$i98 = 0, $$084 = 0, $$2 = 0, $$idx = 0, $$idx$val = 0, $$idx87 = 0;
 var $$idx87$val = 0, $$idx88 = 0, $$idx88$val = 0, $$idx89 = 0, $$idx89$val = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0;
 var $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($0)) + 2068|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($5) + ($3))|0;
 HEAP32[$4>>2] = $6;
 $7 = $1;
 $8 = (($3) + ($7))|0;
 $9 = $8;
 $10 = $8 >>> 12;
 $11 = $8 >>> 21;
 $12 = $11 & 255;
 $13 = (((($0)) + 2080|0) + ($12<<2)|0);
 $$010$i$i$i = HEAP32[$13>>2]|0;
 $14 = ($$010$i$i$i|0)==(0|0);
 L1: do {
  if (!($14)) {
   $$011$i$i$i = $$010$i$i$i;
   while(1) {
    $15 = ((($$011$i$i$i)) + 4|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==($11|0);
    if ($17) {
     break;
    }
    $$0$i$i$i = HEAP32[$$011$i$i$i>>2]|0;
    $18 = ($$0$i$i$i|0)==(0|0);
    if ($18) {
     break L1;
    } else {
     $$011$i$i$i = $$0$i$i$i;
    }
   }
   $19 = $8 >>> 17;
   $20 = $19 & 15;
   $21 = (((($$011$i$i$i)) + 8|0) + ($20<<2)|0);
   $22 = $10 & 31;
   $23 = 1 << $22;
   $24 = HEAP32[$21>>2]|0;
   $25 = $24 & $23;
   $26 = ($25|0)==(0);
   if (!($26)) {
    $$idx87 = ((($9)) + 8|0);
    $$idx87$val = HEAP8[$$idx87>>0]|0;
    $27 = ($$idx87$val<<24>>24)==(0);
    if ($27) {
     $$idx89 = ((($9)) + 4|0);
     $$idx89$val = HEAP32[$$idx89>>2]|0;
     $28 = ($$idx89$val|0)<(4065);
     if (!($28)) {
      $29 = ((($0)) + 2076|0);
      $30 = $8;
      $31 = HEAP32[$29>>2]|0;
      $32 = ($31|0)==($30|0);
      $33 = ((($30)) + 12|0);
      $34 = HEAP32[$33>>2]|0;
      if ($32) {
       HEAP32[$29>>2] = $34;
       $35 = ($34|0)==(0|0);
       if (!($35)) {
        $36 = ((($34)) + 16|0);
        HEAP32[$36>>2] = 0;
       }
      } else {
       $37 = ((($30)) + 16|0);
       $38 = HEAP32[$37>>2]|0;
       $39 = ((($38)) + 12|0);
       HEAP32[$39>>2] = $34;
       $40 = HEAP32[$33>>2]|0;
       $41 = ($40|0)==(0|0);
       if (!($41)) {
        $42 = $38;
        $43 = ((($40)) + 16|0);
        HEAP32[$43>>2] = $42;
       }
      }
      HEAP32[$33>>2] = 0;
      $44 = ((($30)) + 16|0);
      HEAP32[$44>>2] = 0;
      $45 = (($3) + ($$idx89$val))|0;
      HEAP32[$2>>2] = $45;
      $$010$i$i97 = HEAP32[$13>>2]|0;
      $46 = ($$010$i$i97|0)==(0|0);
      if (!($46)) {
       $$011$i$i98 = $$010$i$i97;
       while(1) {
        $47 = ((($$011$i$i98)) + 4|0);
        $48 = HEAP32[$47>>2]|0;
        $49 = ($48|0)==($11|0);
        if ($49) {
         break;
        }
        $$0$i$i100 = HEAP32[$$011$i$i98>>2]|0;
        $50 = ($$0$i$i100|0)==(0|0);
        if ($50) {
         break L1;
        } else {
         $$011$i$i98 = $$0$i$i100;
        }
       }
       $51 = (((($$011$i$i98)) + 8|0) + ($20<<2)|0);
       $52 = $23 ^ -1;
       $53 = HEAP32[$51>>2]|0;
       $54 = $53 & $52;
       HEAP32[$51>>2] = $54;
      }
     }
    }
   }
  }
 } while(0);
 $55 = HEAP32[$1>>2]|0;
 $56 = ($55|0)==(0);
 L20: do {
  if ($56) {
   $$2 = $1;
  } else {
   $57 = (($7) - ($55))|0;
   $58 = $57;
   $59 = $57 >>> 12;
   $60 = $57 >>> 21;
   $61 = $60 & 255;
   $62 = (((($0)) + 2080|0) + ($61<<2)|0);
   $$010$i$i$i91 = HEAP32[$62>>2]|0;
   $63 = ($$010$i$i$i91|0)==(0|0);
   if ($63) {
    $$2 = $1;
   } else {
    $$011$i$i$i92 = $$010$i$i$i91;
    while(1) {
     $64 = ((($$011$i$i$i92)) + 4|0);
     $65 = HEAP32[$64>>2]|0;
     $66 = ($65|0)==($60|0);
     if ($66) {
      break;
     }
     $$0$i$i$i94 = HEAP32[$$011$i$i$i92>>2]|0;
     $67 = ($$0$i$i$i94|0)==(0|0);
     if ($67) {
      $$2 = $1;
      break L20;
     } else {
      $$011$i$i$i92 = $$0$i$i$i94;
     }
    }
    $68 = $57 >>> 17;
    $69 = $68 & 15;
    $70 = (((($$011$i$i$i92)) + 8|0) + ($69<<2)|0);
    $71 = $59 & 31;
    $72 = 1 << $71;
    $73 = HEAP32[$70>>2]|0;
    $74 = $73 & $72;
    $75 = ($74|0)==(0);
    if ($75) {
     $$2 = $1;
    } else {
     $$idx = ((($58)) + 8|0);
     $$idx$val = HEAP8[$$idx>>0]|0;
     $76 = ($$idx$val<<24>>24)==(0);
     if ($76) {
      $$idx88 = ((($58)) + 4|0);
      $$idx88$val = HEAP32[$$idx88>>2]|0;
      $77 = ($$idx88$val|0)<(4065);
      if ($77) {
       $$2 = $1;
      } else {
       $78 = ((($0)) + 2076|0);
       $79 = $57;
       $80 = HEAP32[$78>>2]|0;
       $81 = ($80|0)==($79|0);
       $82 = ((($79)) + 12|0);
       $83 = HEAP32[$82>>2]|0;
       if ($81) {
        HEAP32[$78>>2] = $83;
        $84 = ($83|0)==(0|0);
        if (!($84)) {
         $85 = ((($83)) + 16|0);
         HEAP32[$85>>2] = 0;
        }
       } else {
        $86 = ((($79)) + 16|0);
        $87 = HEAP32[$86>>2]|0;
        $88 = ((($87)) + 12|0);
        HEAP32[$88>>2] = $83;
        $89 = HEAP32[$82>>2]|0;
        $90 = ($89|0)==(0|0);
        if (!($90)) {
         $91 = $87;
         $92 = ((($89)) + 16|0);
         HEAP32[$92>>2] = $91;
        }
       }
       HEAP32[$82>>2] = 0;
       $93 = ((($79)) + 16|0);
       HEAP32[$93>>2] = 0;
       $94 = HEAP32[$2>>2]|0;
       $95 = (($$idx88$val) + ($94))|0;
       HEAP32[$$idx88>>2] = $95;
       $96 = $7 >>> 12;
       $97 = $7 >>> 21;
       $98 = $97 & 255;
       $99 = (((($0)) + 2080|0) + ($98<<2)|0);
       $$010$i$i = HEAP32[$99>>2]|0;
       $100 = ($$010$i$i|0)==(0|0);
       if ($100) {
        $$2 = $79;
       } else {
        $$011$i$i = $$010$i$i;
        while(1) {
         $101 = ((($$011$i$i)) + 4|0);
         $102 = HEAP32[$101>>2]|0;
         $103 = ($102|0)==($97|0);
         if ($103) {
          break;
         }
         $$0$i$i90 = HEAP32[$$011$i$i>>2]|0;
         $104 = ($$0$i$i90|0)==(0|0);
         if ($104) {
          $$2 = $79;
          break L20;
         } else {
          $$011$i$i = $$0$i$i90;
         }
        }
        $105 = $7 >>> 17;
        $106 = $105 & 15;
        $107 = (((($$011$i$i)) + 8|0) + ($106<<2)|0);
        $108 = $96 & 31;
        $109 = 1 << $108;
        $110 = $109 ^ -1;
        $111 = HEAP32[$107>>2]|0;
        $112 = $111 & $110;
        HEAP32[$107>>2] = $112;
        $$2 = $79;
       }
      }
     } else {
      $$2 = $1;
     }
    }
   }
  }
 } while(0);
 $113 = ((($$2)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = ($114|0)<(1048576);
 $116 = $115&1;
 if ($115) {
  $$084 = $116;
 } else {
  $117 = ((($0)) + 3120|0);
  $118 = HEAP8[$117>>0]|0;
  $$084 = $118;
 }
 $119 = ($$084<<24>>24)==(0);
 if ($119) {
  _freeoschunks_31607_1689653243($0,$$2,$114);
  return;
 }
 $120 = $$2;
 $121 = $120 >>> 12;
 $122 = ((($0)) + 2080|0);
 $123 = $120 >>> 21;
 $124 = (_intsetput_30505_1689653243($0,$122,$123)|0);
 $125 = $120 >>> 17;
 $126 = $125 & 15;
 $127 = (((($124)) + 8|0) + ($126<<2)|0);
 $128 = HEAP32[$127>>2]|0;
 $129 = $121 & 31;
 $130 = 1 << $129;
 $131 = $128 | $130;
 HEAP32[$127>>2] = $131;
 $132 = HEAP32[$113>>2]|0;
 $133 = (($132) + ($120))|0;
 $134 = $133 >>> 12;
 $135 = $133 >>> 21;
 $136 = $135 & 255;
 $137 = (((($0)) + 2080|0) + ($136<<2)|0);
 $$010$i$i$i$i = HEAP32[$137>>2]|0;
 $138 = ($$010$i$i$i$i|0)==(0|0);
 L47: do {
  if (!($138)) {
   $$011$i$i$i$i = $$010$i$i$i$i;
   while(1) {
    $139 = ((($$011$i$i$i$i)) + 4|0);
    $140 = HEAP32[$139>>2]|0;
    $141 = ($140|0)==($135|0);
    if ($141) {
     break;
    }
    $$0$i$i$i$i = HEAP32[$$011$i$i$i$i>>2]|0;
    $142 = ($$0$i$i$i$i|0)==(0|0);
    if ($142) {
     break L47;
    } else {
     $$011$i$i$i$i = $$0$i$i$i$i;
    }
   }
   $143 = $133 >>> 17;
   $144 = $143 & 15;
   $145 = (((($$011$i$i$i$i)) + 8|0) + ($144<<2)|0);
   $146 = $134 & 31;
   $147 = 1 << $146;
   $148 = HEAP32[$145>>2]|0;
   $149 = $148 & $147;
   $150 = ($149|0)==(0);
   if (!($150)) {
    $151 = $133;
    HEAP32[$151>>2] = $132;
   }
  }
 } while(0);
 $152 = ((($0)) + 2076|0);
 $153 = HEAP32[$152>>2]|0;
 $154 = ((($$2)) + 12|0);
 HEAP32[$154>>2] = $153;
 $155 = HEAP32[$152>>2]|0;
 $156 = ($155|0)==(0|0);
 if (!($156)) {
  $157 = ((($155)) + 16|0);
  HEAP32[$157>>2] = $$2;
 }
 HEAP32[$152>>2] = $$2;
 $158 = ((($$2)) + 8|0);
 HEAP8[$158>>0] = 0;
 return;
}
function _del_30401_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$phi$trans$insert = 0, $$phi$trans$insert60 = 0, $$phi$trans$insert62 = 0, $$phi$trans$insert65 = 0, $$phi$trans$insert68 = 0, $$phi$trans$insert70 = 0, $$phi$trans$insert72 = 0, $$phi$trans$insert74 = 0, $$phi$trans$insert76 = 0, $$pre = 0, $$pre58 = 0, $$pre59 = 0, $$pre61 = 0, $$pre63 = 0, $$pre64 = 0, $$pre66 = 0, $$pre67 = 0, $$pre69 = 0, $$pre71 = 0, $$pre73 = 0;
 var $$pre75 = 0, $$pre77 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $12 = 0;
 var $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$1>>2]|0;
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==($3|0);
 if ($5) {
  return;
 }
 $6 = ((($0)) + 3112|0);
 HEAP32[$6>>2] = $3;
 $7 = HEAP32[$1>>2]|0;
 $8 = ((($7)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9>>>0)>($2>>>0);
 if ($10) {
  _del_30401_1689653243($0,$7,$2);
 } else {
  $11 = ((($0)) + 3108|0);
  HEAP32[$11>>2] = $7;
  $12 = HEAP32[$1>>2]|0;
  $13 = ((($12)) + 4|0);
  _del_30401_1689653243($0,$13,$2);
 }
 $14 = HEAP32[$1>>2]|0;
 $15 = HEAP32[$6>>2]|0;
 $16 = ($14|0)==($15|0);
 if ($16) {
  $17 = ((($0)) + 3108|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = HEAP32[$18>>2]|0;
  $20 = ($19|0)==($18|0);
  if (!($20)) {
   $21 = ((($18)) + 8|0);
   $22 = HEAP32[$21>>2]|0;
   $23 = ($22|0)==($2|0);
   if ($23) {
    $24 = ((($14)) + 8|0);
    $25 = HEAP32[$24>>2]|0;
    HEAP32[$21>>2] = $25;
    $26 = ((($14)) + 12|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ((($18)) + 12|0);
    HEAP32[$28>>2] = $27;
    $29 = HEAP32[2773]|0;
    HEAP32[$17>>2] = $29;
    $30 = HEAP32[$1>>2]|0;
    $31 = ((($30)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    HEAP32[$1>>2] = $32;
    $33 = HEAP32[$6>>2]|0;
    $34 = ((($0)) + 3116|0);
    $35 = HEAP32[$34>>2]|0;
    HEAP32[$33>>2] = $35;
    HEAP32[$34>>2] = $33;
    return;
   }
  }
 }
 $36 = HEAP32[$14>>2]|0;
 $37 = ((($36)) + 16|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = ((($14)) + 16|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = (($40) + -1)|0;
 $42 = ($38|0)<($41|0);
 $$phi$trans$insert = ((($14)) + 4|0);
 $$pre = HEAP32[$$phi$trans$insert>>2]|0;
 if (!($42)) {
  $43 = ((($$pre)) + 16|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = ($44|0)<($41|0);
  if (!($45)) {
   return;
  }
 }
 HEAP32[$39>>2] = $41;
 $46 = ((($$pre)) + 16|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = ($40|0)>($47|0);
 if ($48) {
  $112 = $47;$51 = $41;
 } else {
  HEAP32[$46>>2] = $41;
  $$pre58 = HEAP32[$39>>2]|0;
  $112 = $41;$51 = $$pre58;
 }
 $49 = HEAP32[$37>>2]|0;
 $50 = ($49|0)==($51|0);
 if ($50) {
  HEAP32[$1>>2] = $36;
  $52 = ((($36)) + 4|0);
  $53 = HEAP32[$52>>2]|0;
  HEAP32[$14>>2] = $53;
  $54 = HEAP32[$1>>2]|0;
  $55 = ((($54)) + 4|0);
  HEAP32[$55>>2] = $14;
  $$pre59 = HEAP32[$1>>2]|0;
  $$phi$trans$insert60 = ((($$pre59)) + 4|0);
  $$pre61 = HEAP32[$$phi$trans$insert60>>2]|0;
  $$phi$trans$insert62 = ((($$pre61)) + 16|0);
  $$pre63 = HEAP32[$$phi$trans$insert62>>2]|0;
  $57 = $$pre59;$59 = $$pre61;$63 = $$pre63;
 } else {
  $57 = $14;$59 = $$pre;$63 = $112;
 }
 $56 = ((($57)) + 4|0);
 $58 = HEAP32[$59>>2]|0;
 $60 = ((($58)) + 16|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = ($61|0)==($63|0);
 if ($62) {
  HEAP32[$56>>2] = $58;
  $64 = ((($58)) + 4|0);
  $65 = HEAP32[$64>>2]|0;
  HEAP32[$59>>2] = $65;
  $66 = HEAP32[$56>>2]|0;
  $67 = ((($66)) + 4|0);
  HEAP32[$67>>2] = $59;
  $$pre64 = HEAP32[$1>>2]|0;
  $$phi$trans$insert65 = ((($$pre64)) + 4|0);
  $$pre66 = HEAP32[$$phi$trans$insert65>>2]|0;
  $113 = $$pre64;$69 = $$pre66;
 } else {
  $113 = $57;$69 = $59;
 }
 $68 = ((($69)) + 4|0);
 $70 = HEAP32[$68>>2]|0;
 $71 = HEAP32[$70>>2]|0;
 $72 = ((($71)) + 16|0);
 $73 = HEAP32[$72>>2]|0;
 $74 = ((($70)) + 16|0);
 $75 = HEAP32[$74>>2]|0;
 $76 = ($73|0)==($75|0);
 if ($76) {
  HEAP32[$68>>2] = $71;
  $77 = ((($71)) + 4|0);
  $78 = HEAP32[$77>>2]|0;
  HEAP32[$70>>2] = $78;
  $79 = HEAP32[$68>>2]|0;
  $80 = ((($79)) + 4|0);
  HEAP32[$80>>2] = $70;
  $$pre67 = HEAP32[$1>>2]|0;
  $$phi$trans$insert68 = ((($$pre67)) + 4|0);
  $$pre69 = HEAP32[$$phi$trans$insert68>>2]|0;
  $$phi$trans$insert70 = ((($$pre69)) + 4|0);
  $$pre71 = HEAP32[$$phi$trans$insert70>>2]|0;
  $$phi$trans$insert72 = ((($$pre71)) + 16|0);
  $$pre73 = HEAP32[$$phi$trans$insert72>>2]|0;
  $114 = $$pre71;$82 = $$pre67;$85 = $$pre73;$87 = $$pre69;
 } else {
  $114 = $70;$82 = $113;$85 = $75;$87 = $69;
 }
 $81 = ((($82)) + 16|0);
 $83 = HEAP32[$81>>2]|0;
 $84 = ($85|0)==($83|0);
 if ($84) {
  $86 = ((($82)) + 4|0);
  HEAP32[$1>>2] = $87;
  $88 = HEAP32[$87>>2]|0;
  HEAP32[$86>>2] = $88;
  $89 = HEAP32[$1>>2]|0;
  HEAP32[$89>>2] = $82;
  $90 = HEAP32[$1>>2]|0;
  $91 = ((($90)) + 16|0);
  $92 = HEAP32[$91>>2]|0;
  $93 = (($92) + 1)|0;
  HEAP32[$91>>2] = $93;
  $$phi$trans$insert74 = ((($90)) + 4|0);
  $$pre75 = HEAP32[$$phi$trans$insert74>>2]|0;
  $$phi$trans$insert76 = ((($$pre75)) + 4|0);
  $$pre77 = HEAP32[$$phi$trans$insert76>>2]|0;
  $102 = $$pre75;$95 = $90;$97 = $$pre77;
 } else {
  $102 = $87;$95 = $82;$97 = $114;
 }
 $94 = ((($95)) + 4|0);
 $96 = ((($97)) + 4|0);
 $98 = HEAP32[$96>>2]|0;
 $99 = ((($98)) + 16|0);
 $100 = HEAP32[$99>>2]|0;
 $101 = ((($102)) + 16|0);
 $103 = HEAP32[$101>>2]|0;
 $104 = ($100|0)==($103|0);
 if (!($104)) {
  return;
 }
 $105 = ((($102)) + 4|0);
 HEAP32[$94>>2] = $97;
 $106 = HEAP32[$97>>2]|0;
 HEAP32[$105>>2] = $106;
 $107 = HEAP32[$94>>2]|0;
 HEAP32[$107>>2] = $102;
 $108 = HEAP32[$94>>2]|0;
 $109 = ((($108)) + 16|0);
 $110 = HEAP32[$109>>2]|0;
 $111 = (($110) + 1)|0;
 HEAP32[$109>>2] = $111;
 return;
}
function _rawdealloc_42817_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$idx = 0, $$idx$val = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $1;
 $3 = $2 & -4096;
 $4 = $3;
 $$idx = ((($4)) + 4|0);
 $$idx$val = HEAP32[$$idx>>2]|0;
 $5 = ($$idx$val|0)<(4065);
 if (!($5)) {
  $40 = $3;
  $41 = HEAP32[2773]|0;
  $42 = ((($0)) + 3108|0);
  HEAP32[$42>>2] = $41;
  $43 = ((($0)) + 3104|0);
  $44 = ((($4)) + 24|0);
  $45 = $44;
  _del_30401_1689653243($0,$43,$45);
  _freebigchunk_32003_1689653243($0,$40);
  return;
 }
 $6 = $3;
 $7 = ((($1)) + 4|0);
 HEAP32[$7>>2] = 0;
 $8 = ((($4)) + 20|0);
 $9 = HEAP32[$8>>2]|0;
 HEAP32[$1>>2] = $9;
 HEAP32[$8>>2] = $1;
 $10 = ((($4)) + 24|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($11|0)<($$idx$val|0);
 if ($12) {
  $13 = (($$idx$val|0) / 8)&-1;
  $14 = (((($0)) + 8|0) + ($13<<2)|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = ((($6)) + 12|0);
  HEAP32[$16>>2] = $15;
  $17 = HEAP32[$14>>2]|0;
  $18 = ($17|0)==(0|0);
  if (!($18)) {
   $19 = ((($17)) + 16|0);
   HEAP32[$19>>2] = $6;
  }
  HEAP32[$14>>2] = $6;
  $20 = (($11) + ($$idx$val))|0;
  HEAP32[$10>>2] = $20;
  return;
 }
 $21 = (($11) + ($$idx$val))|0;
 HEAP32[$10>>2] = $21;
 $22 = ($21|0)==(4064);
 if (!($22)) {
  return;
 }
 $23 = (($$idx$val|0) / 8)&-1;
 $24 = (((($0)) + 8|0) + ($23<<2)|0);
 $25 = HEAP32[$24>>2]|0;
 $26 = ($25|0)==($6|0);
 $27 = ((($6)) + 12|0);
 $28 = HEAP32[$27>>2]|0;
 if ($26) {
  HEAP32[$24>>2] = $28;
  $29 = ($28|0)==(0|0);
  if (!($29)) {
   $30 = ((($28)) + 16|0);
   HEAP32[$30>>2] = 0;
  }
 } else {
  $31 = ((($6)) + 16|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = ((($32)) + 12|0);
  HEAP32[$33>>2] = $28;
  $34 = HEAP32[$27>>2]|0;
  $35 = ($34|0)==(0|0);
  if (!($35)) {
   $36 = $32;
   $37 = ((($34)) + 16|0);
   HEAP32[$37>>2] = $36;
  }
 }
 HEAP32[$27>>2] = 0;
 $38 = ((($6)) + 16|0);
 HEAP32[$38>>2] = 0;
 HEAP32[$$idx>>2] = 4096;
 $39 = $3;
 _freebigchunk_32003_1689653243($0,$39);
 return;
}
function _addzct_51217_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$phi$trans$insert$i = 0, $$pre$i = 0, $$pre19$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$1>>2]|0;
 $3 = $2 & 4;
 $4 = ($3|0)==(0);
 if (!($4)) {
  return;
 }
 $5 = $2 | 4;
 HEAP32[$1>>2] = $5;
 $6 = ((($0)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = HEAP32[$0>>2]|0;
 $9 = ($7|0)>($8|0);
 if ($9) {
  $$phi$trans$insert$i = ((($0)) + 8|0);
  $$pre19$i = HEAP32[$$phi$trans$insert$i>>2]|0;
  $28 = $$pre19$i;$29 = $8;
 } else {
  $10 = ($7*3)|0;
  $11 = (($10|0) / 2)&-1;
  HEAP32[$6>>2] = $11;
  $12 = $11 << 2;
  $13 = (($12) + 8)|0;
  $14 = (_rawalloc_36404_1689653243((4084),$13)|0);
  $15 = ((($14)) + 4|0);
  HEAP32[$15>>2] = 1;
  $16 = $14;
  $17 = (($16) + 8)|0;
  $18 = $17;
  $19 = ((($0)) + 8|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = HEAP32[$0>>2]|0;
  $22 = $21 << 2;
  _memcpy(($18|0),($20|0),($22|0))|0;
  $23 = HEAP32[$19>>2]|0;
  $24 = (($23) + -8)|0;
  $25 = $24;
  _rawdealloc_42817_1689653243((4084),$25);
  HEAP32[$19>>2] = $18;
  $$pre$i = HEAP32[$0>>2]|0;
  $26 = $17;
  $28 = $26;$29 = $$pre$i;
 }
 $27 = (($28) + ($29<<2)|0);
 HEAP32[$27>>2] = $1;
 $30 = (($29) + 1)|0;
 HEAP32[$0>>2] = $30;
 return;
}
function _cellsetput_47641_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$in = 0, $$034$i = 0, $$045 = 0, $$04860 = 0, $$058$i = 0, $$07$i$i = 0, $$1$i54 = 0, $$250$lcssa = 0, $$25059 = 0, $$lcssa$i$i = 0, $$pre = 0, $$pre68 = 0, $$sroa$3$0$copyload$i = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond$i = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & $1;
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($6) + ($4<<2)|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 L1: do {
  if (!($9)) {
   $$04860 = $4;$11 = $8;
   while(1) {
    $10 = ((($11)) + 4|0);
    $12 = HEAP32[$10>>2]|0;
    $13 = ($12|0)==($1|0);
    if ($13) {
     $$045 = $11;
     break;
    }
    $14 = ($$04860*5)|0;
    $15 = (($14) + 1)|0;
    $16 = $3 & $15;
    $17 = (($6) + ($16<<2)|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($18|0)==(0|0);
    if ($19) {
     break L1;
    } else {
     $$04860 = $16;$11 = $18;
    }
   }
   return ($$045|0);
  }
 } while(0);
 $20 = (($3) + 1)|0;
 $21 = $20 << 1;
 $22 = HEAP32[$0>>2]|0;
 $23 = ($22*3)|0;
 $24 = ($21|0)<($23|0);
 $25 = (($20) - ($22))|0;
 $26 = ($25|0)<(4);
 $$0$in = $24 | $26;
 if ($$0$in) {
  $27 = $3 << 1;
  $28 = $27 | 1;
  HEAP32[$2>>2] = $28;
  $29 = $3 << 3;
  $30 = (($29) + 8)|0;
  $31 = (($29) + 16)|0;
  $32 = (_rawalloc_36404_1689653243((4084),$31)|0);
  $33 = ((($32)) + 4|0);
  HEAP32[$33>>2] = 1;
  $34 = $32;
  $35 = (($34) + 8)|0;
  $36 = $35;
  _memset(($36|0),0,($30|0))|0;
  $37 = $35;
  $38 = ($3|0)<(0);
  if (!($38)) {
   $$034$i = 0;
   while(1) {
    $39 = HEAP32[$5>>2]|0;
    $40 = (($39) + ($$034$i<<2)|0);
    $41 = HEAP32[$40>>2]|0;
    $42 = ($41|0)==(0|0);
    if (!($42)) {
     $$sroa$3$0$copyload$i = HEAPU8[$2>>0]|(HEAPU8[$2+1>>0]<<8)|(HEAPU8[$2+2>>0]<<16)|(HEAPU8[$2+3>>0]<<24);
     $43 = ((($41)) + 4|0);
     $44 = HEAP32[$43>>2]|0;
     $45 = $44 & $$sroa$3$0$copyload$i;
     $46 = (($37) + ($45<<2)|0);
     $47 = HEAP32[$46>>2]|0;
     $48 = ($47|0)==(0|0);
     if ($48) {
      $$lcssa$i$i = $46;
     } else {
      $$07$i$i = $45;
      while(1) {
       $49 = ($$07$i$i*5)|0;
       $50 = (($49) + 1)|0;
       $51 = $50 & $$sroa$3$0$copyload$i;
       $52 = (($37) + ($51<<2)|0);
       $53 = HEAP32[$52>>2]|0;
       $54 = ($53|0)==(0|0);
       if ($54) {
        $$lcssa$i$i = $52;
        break;
       } else {
        $$07$i$i = $51;
       }
      }
     }
     HEAP32[$$lcssa$i$i>>2] = $41;
    }
    $55 = (($$034$i) + 1)|0;
    $exitcond$i = ($$034$i|0)==($3|0);
    if ($exitcond$i) {
     break;
    } else {
     $$034$i = $55;
    }
   }
  }
  $56 = HEAP32[$5>>2]|0;
  $57 = (($56) + -8)|0;
  $58 = $57;
  _rawdealloc_42817_1689653243((4084),$58);
  HEAP32[$5>>2] = $36;
  $$pre = HEAP32[$0>>2]|0;
  $$pre68 = HEAP32[$2>>2]|0;
  $59 = $35;
  $61 = $$pre;$63 = $$pre68;$65 = $59;
 } else {
  $61 = $22;$63 = $3;$65 = $6;
 }
 $60 = (($61) + 1)|0;
 HEAP32[$0>>2] = $60;
 $62 = $63 & $1;
 $64 = (($65) + ($62<<2)|0);
 $66 = HEAP32[$64>>2]|0;
 $67 = ($66|0)==(0|0);
 if ($67) {
  $$250$lcssa = $62;
 } else {
  $$25059 = $62;
  while(1) {
   $68 = ($$25059*5)|0;
   $69 = (($68) + 1)|0;
   $70 = $63 & $69;
   $71 = (($65) + ($70<<2)|0);
   $72 = HEAP32[$71>>2]|0;
   $73 = ($72|0)==(0|0);
   if ($73) {
    $$250$lcssa = $70;
    break;
   } else {
    $$25059 = $70;
   }
  }
 }
 $74 = HEAP32[(4132)>>2]|0;
 $75 = ($74|0)==(0|0);
 if ($75) {
  $76 = (_getbigchunk_35014_1689653243((4084),4096)|0);
  $77 = ((($76)) + 20|0);
  HEAP32[$77>>2] = 0;
  $78 = ((($76)) + 4|0);
  HEAP32[$78>>2] = 80;
  $79 = ((($76)) + 28|0);
  HEAP32[$79>>2] = 80;
  $80 = ((($76)) + 24|0);
  HEAP32[$80>>2] = 3984;
  $81 = ((($76)) + 12|0);
  HEAP32[$81>>2] = 0;
  $82 = ((($76)) + 16|0);
  HEAP32[$82>>2] = 0;
  $83 = HEAP32[(4132)>>2]|0;
  HEAP32[$81>>2] = $83;
  $84 = HEAP32[(4132)>>2]|0;
  $85 = ($84|0)==(0|0);
  if (!($85)) {
   $86 = ((($84)) + 16|0);
   HEAP32[$86>>2] = $76;
  }
  HEAP32[(4132)>>2] = $76;
  $87 = ((($76)) + 32|0);
  $$1$i54 = $87;
 } else {
  $88 = ((($74)) + 20|0);
  $89 = HEAP32[$88>>2]|0;
  $90 = ($89|0)==(0|0);
  if ($90) {
   $91 = ((($74)) + 32|0);
   $92 = $91;
   $93 = ((($74)) + 28|0);
   $94 = HEAP32[$93>>2]|0;
   $95 = (($94) + ($92))|0;
   $96 = $95;
   $97 = (($94) + 80)|0;
   HEAP32[$93>>2] = $97;
   $$058$i = $96;
  } else {
   $98 = HEAP32[$89>>2]|0;
   HEAP32[$88>>2] = $98;
   $$058$i = $89;
  }
  $99 = ((($74)) + 24|0);
  $100 = HEAP32[$99>>2]|0;
  $101 = (($100) + -80)|0;
  HEAP32[$99>>2] = $101;
  $102 = ($101|0)<(80);
  if ($102) {
   $103 = HEAP32[(4132)>>2]|0;
   $104 = ($103|0)==($74|0);
   $105 = ((($74)) + 12|0);
   $106 = HEAP32[$105>>2]|0;
   if ($104) {
    HEAP32[(4132)>>2] = $106;
    $107 = ($106|0)==(0|0);
    if (!($107)) {
     $108 = ((($106)) + 16|0);
     HEAP32[$108>>2] = 0;
    }
   } else {
    $109 = ((($74)) + 16|0);
    $110 = HEAP32[$109>>2]|0;
    $111 = ((($110)) + 12|0);
    HEAP32[$111>>2] = $106;
    $112 = HEAP32[$105>>2]|0;
    $113 = ($112|0)==(0|0);
    if (!($113)) {
     $114 = $110;
     $115 = ((($112)) + 16|0);
     HEAP32[$115>>2] = $114;
    }
   }
   HEAP32[$105>>2] = 0;
   $116 = ((($74)) + 16|0);
   HEAP32[$116>>2] = 0;
   $$1$i54 = $$058$i;
  } else {
   $$1$i54 = $$058$i;
  }
 }
 $117 = ((($$1$i54)) + 4|0);
 HEAP32[$117>>2] = 1;
 $118 = $$1$i54;
 $119 = (($118) + 8)|0;
 $120 = $119;
 dest=$120; stop=dest+72|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 $121 = $119;
 $122 = ((($0)) + 8|0);
 $123 = HEAP32[$122>>2]|0;
 $124 = $119;
 HEAP32[$124>>2] = $123;
 $125 = ((($120)) + 4|0);
 HEAP32[$125>>2] = $1;
 HEAP32[$122>>2] = $120;
 $126 = HEAP32[$5>>2]|0;
 $127 = (($126) + ($$250$lcssa<<2)|0);
 HEAP32[$127>>2] = $120;
 $$045 = $121;
 return ($$045|0);
}
function _incl_47847_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $1;
 $3 = $2 >>> 12;
 $4 = (_cellsetput_47641_1689653243($0,$3)|0);
 $5 = $2 >>> 3;
 $6 = $2 >>> 8;
 $7 = $6 & 15;
 $8 = (((($4)) + 8|0) + ($7<<2)|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = $5 & 31;
 $11 = 1 << $10;
 $12 = $9 | $11;
 HEAP32[$8>>2] = $12;
 return;
}
function _forallslotsaux_55632_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$i = 0, $$0$i$i = 0, $$0$i$in = 0, $$055 = 0, $$tr48 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $0;
 $$tr48 = $1;
 L1: while(1) {
  $4 = HEAP8[$$tr48>>0]|0;
  switch ($4<<24>>24) {
  case 1:  {
   label = 3;
   break L1;
   break;
  }
  case 2:  {
   label = 4;
   break L1;
   break;
  }
  case 3:  {
   break;
  }
  default: {
   label = 19;
   break L1;
  }
  }
  $34 = ((($$tr48)) + 8|0);
  $35 = HEAP32[$34>>2]|0;
  $36 = HEAP32[$35>>2]|0;
  switch ($36|0) {
  case 1:  {
   $37 = ((($$tr48)) + 4|0);
   $38 = HEAP32[$37>>2]|0;
   $39 = (($38) + ($3))|0;
   $40 = $39;
   $41 = HEAP8[$40>>0]|0;
   $42 = $41&255;
   $$0$i$i = $42;
   break;
  }
  case 2:  {
   $43 = ((($$tr48)) + 4|0);
   $44 = HEAP32[$43>>2]|0;
   $45 = (($44) + ($3))|0;
   $46 = $45;
   $47 = HEAP16[$46>>1]|0;
   $48 = $47&65535;
   $$0$i$i = $48;
   break;
  }
  case 4:  {
   $49 = ((($$tr48)) + 4|0);
   $50 = HEAP32[$49>>2]|0;
   $51 = (($50) + ($3))|0;
   $52 = $51;
   $53 = HEAP32[$52>>2]|0;
   $$0$i$i = $53;
   break;
  }
  default: {
   $$0$i$i = 0;
  }
  }
  $54 = ((($$tr48)) + 16|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = ($$0$i$i>>>0)<($55>>>0);
  $57 = ((($$tr48)) + 20|0);
  $58 = HEAP32[$57>>2]|0;
  if ($56) {
   $59 = (($58) + ($$0$i$i<<2)|0);
   $60 = HEAP32[$59>>2]|0;
   $61 = ($60|0)==(0|0);
   if (!($61)) {
    $$tr48 = $60;
    continue;
   }
  }
  $$0$i$in = (($58) + ($55<<2)|0);
  $$0$i = HEAP32[$$0$i$in>>2]|0;
  $62 = ($$0$i|0)==(0|0);
  if ($62) {
   label = 19;
   break;
  } else {
   $$tr48 = $$0$i;
  }
 }
 if ((label|0) == 3) {
  $5 = ((($$tr48)) + 4|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = (($6) + ($3))|0;
  $8 = $7;
  $9 = ((($$tr48)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  _forallchildrenaux_51622_1689653243($8,$10,$2);
  return;
 }
 else if ((label|0) == 4) {
  $11 = ((($$tr48)) + 16|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($12|0)>(0);
  if (!($13)) {
   return;
  }
  $14 = ((($$tr48)) + 20|0);
  $$055 = 0;
  while(1) {
   $15 = HEAP32[$14>>2]|0;
   $16 = (($15) + ($$055<<2)|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = HEAP8[$17>>0]|0;
   $19 = ($18<<24>>24)==(1);
   L21: do {
    if ($19) {
     $20 = ((($17)) + 8|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ((($21)) + 4|0);
     $23 = HEAP8[$22>>0]|0;
     switch ($23<<24>>24) {
     case 24: case 28: case 22:  {
      $24 = ((($17)) + 4|0);
      $25 = HEAP32[$24>>2]|0;
      $26 = (($25) + ($3))|0;
      $27 = $26;
      $28 = HEAP32[$27>>2]|0;
      _dooperation_51618_1689653243($28,$2);
      break L21;
      break;
     }
     default: {
      $29 = ((($17)) + 4|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (($30) + ($3))|0;
      $32 = $31;
      _forallchildrenaux_51622_1689653243($32,$21,$2);
      break L21;
     }
     }
    } else {
     _forallslotsaux_55632_1689653243($0,$17,$2);
    }
   } while(0);
   $33 = (($$055) + 1)|0;
   $exitcond = ($33|0)==($12|0);
   if ($exitcond) {
    break;
   } else {
    $$055 = $33;
   }
  }
  return;
 }
 else if ((label|0) == 19) {
  return;
 }
}
function _forallchildrenaux_51622_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $$pre27 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, $exitcond28 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $0;
 $4 = ($0|0)==(0|0);
 if ($4) {
  return;
 }
 $5 = ((($1)) + 5|0);
 $6 = HEAP8[$5>>0]|0;
 $7 = $6 & 1;
 $8 = ($7<<24>>24)==(0);
 if (!($8)) {
  return;
 }
 $9 = ((($1)) + 4|0);
 $10 = HEAP8[$9>>0]|0;
 switch ($10<<24>>24) {
 case 24: case 28: case 22:  {
  $11 = HEAP32[$0>>2]|0;
  _dooperation_51618_1689653243($11,$2);
  return;
  break;
 }
 case 18: case 17:  {
  $12 = ((($1)) + 12|0);
  $13 = HEAP32[$12>>2]|0;
  _forallslotsaux_55632_1689653243($0,$13,$2);
  return;
  break;
 }
 case 27: case 4: case 16:  {
  $14 = HEAP32[$1>>2]|0;
  $15 = ((($1)) + 8|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = HEAP32[$16>>2]|0;
  $18 = (($14|0) / ($17|0))&-1;
  $19 = ($18|0)>(0);
  if (!($19)) {
   return;
  }
  _forallchildrenaux_51622_1689653243($0,$16,$2);
  $exitcond28 = ($18|0)==(1);
  if ($exitcond28) {
   return;
  } else {
   $21 = 1;
  }
  while(1) {
   $$pre = HEAP32[$15>>2]|0;
   $$pre27 = HEAP32[$$pre>>2]|0;
   $20 = Math_imul($$pre27, $21)|0;
   $22 = (($20) + ($3))|0;
   $23 = $22;
   _forallchildrenaux_51622_1689653243($23,$$pre,$2);
   $24 = (($21) + 1)|0;
   $exitcond = ($24|0)==($18|0);
   if ($exitcond) {
    break;
   } else {
    $21 = $24;
   }
  }
  return;
  break;
 }
 default: {
  return;
 }
 }
}
function _dooperation_51618_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$pre$i = 0, $$pre$i9 = 0, $$pre19$i = 0, $$pre19$i7 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = $0;
 $4 = (($3) + -8)|0;
 $5 = $4;
 switch ($1<<24>>24) {
 case 2:  {
  $6 = HEAP32[$5>>2]|0;
  $7 = (($6) + -8)|0;
  HEAP32[$5>>2] = $7;
  $8 = ($7>>>0)<(8);
  if (!($8)) {
   return;
  }
  _addzct_51217_1689653243((4044),$5);
  return;
  break;
 }
 case 3:  {
  $9 = HEAP32[(4072)>>2]|0;
  $10 = HEAP32[(4068)>>2]|0;
  $11 = ($9|0)>($10|0);
  if ($11) {
   $$pre19$i7 = HEAP32[(4076)>>2]|0;
   $29 = $$pre19$i7;$30 = $10;
  } else {
   $12 = ($9*3)|0;
   $13 = (($12|0) / 2)&-1;
   HEAP32[(4072)>>2] = $13;
   $14 = $13 << 2;
   $15 = (($14) + 8)|0;
   $16 = (_rawalloc_36404_1689653243((4084),$15)|0);
   $17 = ((($16)) + 4|0);
   HEAP32[$17>>2] = 1;
   $18 = $16;
   $19 = (($18) + 8)|0;
   $20 = $19;
   $21 = HEAP32[(4076)>>2]|0;
   $22 = HEAP32[(4068)>>2]|0;
   $23 = $22 << 2;
   _memcpy(($20|0),($21|0),($23|0))|0;
   $24 = HEAP32[(4076)>>2]|0;
   $25 = (($24) + -8)|0;
   $26 = $25;
   _rawdealloc_42817_1689653243((4084),$26);
   HEAP32[(4076)>>2] = $20;
   $$pre$i9 = HEAP32[(4068)>>2]|0;
   $27 = $19;
   $29 = $27;$30 = $$pre$i9;
  }
  $28 = (($29) + ($30<<2)|0);
  HEAP32[$28>>2] = $5;
  $31 = (($30) + 1)|0;
  HEAP32[(4068)>>2] = $31;
  return;
  break;
 }
 case 0:  {
  _marks_67401_1689653243(4032,$5);
  return;
  break;
 }
 case 1:  {
  $32 = HEAP32[(4072)>>2]|0;
  $33 = HEAP32[(4068)>>2]|0;
  $34 = ($32|0)>($33|0);
  if ($34) {
   $$pre19$i = HEAP32[(4076)>>2]|0;
   $52 = $$pre19$i;$53 = $33;
  } else {
   $35 = ($32*3)|0;
   $36 = (($35|0) / 2)&-1;
   HEAP32[(4072)>>2] = $36;
   $37 = $36 << 2;
   $38 = (($37) + 8)|0;
   $39 = (_rawalloc_36404_1689653243((4084),$38)|0);
   $40 = ((($39)) + 4|0);
   HEAP32[$40>>2] = 1;
   $41 = $39;
   $42 = (($41) + 8)|0;
   $43 = $42;
   $44 = HEAP32[(4076)>>2]|0;
   $45 = HEAP32[(4068)>>2]|0;
   $46 = $45 << 2;
   _memcpy(($43|0),($44|0),($46|0))|0;
   $47 = HEAP32[(4076)>>2]|0;
   $48 = (($47) + -8)|0;
   $49 = $48;
   _rawdealloc_42817_1689653243((4084),$49);
   HEAP32[(4076)>>2] = $43;
   $$pre$i = HEAP32[(4068)>>2]|0;
   $50 = $42;
   $52 = $50;$53 = $$pre$i;
  }
  $51 = (($52) + ($53<<2)|0);
  HEAP32[$51>>2] = $5;
  $54 = (($53) + 1)|0;
  HEAP32[(4068)>>2] = $54;
  return;
  break;
 }
 default: {
  return;
 }
 }
}
function _marks_67401_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$09$i$i = 0, $$pre = 0, $$pre28 = 0, $$sroa$3$0$$sroa_idx20$i = 0, $$sroa$3$0$copyload$i = 0, $$sroa$424$0$$sroa_idx25$i = 0, $$sroa$424$0$copyload$i = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond26 = 0, $exitcond2632 = 0, $exitcond31 = 0, $switch = 0, $trunc = 0, $trunc$clear = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 3208|0);
 _incl_47847_1689653243($2,$1);
 $3 = ((($1)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($4)) + 20|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(0|0);
 L1: do {
  if ($7) {
   $11 = ((($4)) + 4|0);
   $12 = HEAP8[$11>>0]|0;
   switch ($12<<24>>24) {
   case 22:  {
    $13 = $1;
    $14 = (($13) + 8)|0;
    $15 = $14;
    $16 = ((($4)) + 8|0);
    $17 = HEAP32[$16>>2]|0;
    _forallchildrenaux_51622_1689653243($15,$17,1);
    break L1;
    break;
   }
   case 24:  {
    break;
   }
   default: {
    break L1;
   }
   }
   $18 = $1;
   $19 = (($18) + 8)|0;
   $20 = ($19|0)==(0);
   if (!($20)) {
    $21 = $19;
    $22 = HEAP32[$21>>2]|0;
    $23 = ($22|0)>(0);
    if ($23) {
     $24 = (($18) + 16)|0;
     $25 = ((($4)) + 8|0);
     $26 = HEAP32[$25>>2]|0;
     $27 = $24;
     _forallchildrenaux_51622_1689653243($27,$26,1);
     $exitcond2632 = ($22|0)==(1);
     if (!($exitcond2632)) {
      $36 = 1;
      while(1) {
       $$pre = HEAP32[$3>>2]|0;
       $32 = ((($$pre)) + 8|0);
       $33 = HEAP32[$32>>2]|0;
       $34 = HEAP32[$33>>2]|0;
       $35 = Math_imul($34, $36)|0;
       $37 = (($24) + ($35))|0;
       $38 = $37;
       _forallchildrenaux_51622_1689653243($38,$33,1);
       $39 = (($36) + 1)|0;
       $exitcond26 = ($39|0)==($22|0);
       if ($exitcond26) {
        break;
       } else {
        $36 = $39;
       }
      }
     }
    }
   }
  } else {
   $8 = $1;
   $9 = (($8) + 8)|0;
   $10 = $9;
   FUNCTION_TABLE_vii[$6 & 15]($10,1);
  }
 } while(0);
 $28 = ((($0)) + 36|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = ($29|0)>(0);
 if (!($30)) {
  return;
 }
 $31 = ((($0)) + 44|0);
 $$sroa$3$0$$sroa_idx20$i = ((($0)) + 3212|0);
 $$sroa$424$0$$sroa_idx25$i = ((($0)) + 3220|0);
 $41 = $29;
 L15: while(1) {
  $40 = (($41) + -1)|0;
  HEAP32[$28>>2] = $40;
  $42 = HEAP32[$31>>2]|0;
  $43 = (($42) + ($40<<2)|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $44;
  $46 = $45 >>> 12;
  $$sroa$3$0$copyload$i = HEAPU8[$$sroa$3$0$$sroa_idx20$i>>0]|(HEAPU8[$$sroa$3$0$$sroa_idx20$i+1>>0]<<8)|(HEAPU8[$$sroa$3$0$$sroa_idx20$i+2>>0]<<16)|(HEAPU8[$$sroa$3$0$$sroa_idx20$i+3>>0]<<24);
  $$sroa$424$0$copyload$i = HEAPU8[$$sroa$424$0$$sroa_idx25$i>>0]|(HEAPU8[$$sroa$424$0$$sroa_idx25$i+1>>0]<<8)|(HEAPU8[$$sroa$424$0$$sroa_idx25$i+2>>0]<<16)|(HEAPU8[$$sroa$424$0$$sroa_idx25$i+3>>0]<<24);
  $47 = $46 & $$sroa$3$0$copyload$i;
  $48 = (($$sroa$424$0$copyload$i) + ($47<<2)|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ($49|0)==(0|0);
  L17: do {
   if ($50) {
    label = 16;
   } else {
    $$09$i$i = $47;$52 = $49;
    while(1) {
     $51 = ((($52)) + 4|0);
     $53 = HEAP32[$51>>2]|0;
     $54 = ($53|0)==($46|0);
     if ($54) {
      break;
     }
     $55 = ($$09$i$i*5)|0;
     $56 = (($55) + 1)|0;
     $57 = $56 & $$sroa$3$0$copyload$i;
     $58 = (($$sroa$424$0$copyload$i) + ($57<<2)|0);
     $59 = HEAP32[$58>>2]|0;
     $60 = ($59|0)==(0|0);
     if ($60) {
      label = 16;
      break L17;
     } else {
      $$09$i$i = $57;$52 = $59;
     }
    }
    $61 = $45 >>> 3;
    $62 = $45 >>> 8;
    $63 = $62 & 15;
    $64 = (((($52)) + 8|0) + ($63<<2)|0);
    $65 = HEAP32[$64>>2]|0;
    $66 = $61 & 31;
    $67 = 1 << $66;
    $68 = $65 & $67;
    $69 = ($68|0)==(0);
    if ($69) {
     $70 = $65 | $67;
     HEAP32[$64>>2] = $70;
     label = 17;
    } else {
     $$0 = 5;
    }
   }
  } while(0);
  if ((label|0) == 16) {
   label = 0;
   _incl_47847_1689653243($2,$44);
   label = 17;
  }
  L25: do {
   if ((label|0) == 17) {
    label = 0;
    $71 = ((($44)) + 4|0);
    $72 = HEAP32[$71>>2]|0;
    $73 = ((($72)) + 20|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = ($74|0)==(0|0);
    if (!($75)) {
     $76 = (($45) + 8)|0;
     $77 = $76;
     FUNCTION_TABLE_vii[$74 & 15]($77,1);
     $$0 = 0;
     break;
    }
    $78 = ((($72)) + 4|0);
    $79 = HEAP8[$78>>0]|0;
    switch ($79<<24>>24) {
    case 22:  {
     $80 = (($45) + 8)|0;
     $81 = $80;
     $82 = ((($72)) + 8|0);
     $83 = HEAP32[$82>>2]|0;
     _forallchildrenaux_51622_1689653243($81,$83,1);
     $$0 = 0;
     break L25;
     break;
    }
    case 24:  {
     break;
    }
    default: {
     $$0 = 0;
     break L25;
    }
    }
    $84 = (($45) + 8)|0;
    $85 = ($84|0)==(0);
    if ($85) {
     $$0 = 0;
    } else {
     $86 = $84;
     $87 = HEAP32[$86>>2]|0;
     $88 = ($87|0)>(0);
     if ($88) {
      $89 = (($45) + 16)|0;
      $90 = ((($72)) + 8|0);
      $91 = HEAP32[$90>>2]|0;
      $92 = (($45) + 16)|0;
      $93 = $92;
      _forallchildrenaux_51622_1689653243($93,$91,1);
      $exitcond31 = ($87|0)==(1);
      if ($exitcond31) {
       $$0 = 0;
      } else {
       $98 = 1;
       while(1) {
        $$pre28 = HEAP32[$71>>2]|0;
        $94 = ((($$pre28)) + 8|0);
        $95 = HEAP32[$94>>2]|0;
        $96 = HEAP32[$95>>2]|0;
        $97 = Math_imul($96, $98)|0;
        $99 = (($89) + ($97))|0;
        $100 = $99;
        _forallchildrenaux_51622_1689653243($100,$95,1);
        $101 = (($98) + 1)|0;
        $exitcond = ($101|0)==($87|0);
        if ($exitcond) {
         $$0 = 0;
         break;
        } else {
         $98 = $101;
        }
       }
      }
     } else {
      $$0 = 0;
     }
    }
   }
  } while(0);
  $trunc = $$0&255;
  $trunc$clear = $trunc & 7;
  switch ($trunc$clear<<24>>24) {
  case 5: case 0:  {
   break;
  }
  default: {
   $switch = ($$0|0)==(0);
   if (!($switch)) {
    label = 28;
    break L15;
   }
  }
  }
  $102 = HEAP32[$28>>2]|0;
  $103 = ($102|0)>(0);
  if ($103) {
   $41 = $102;
  } else {
   label = 28;
   break;
  }
 }
 if ((label|0) == 28) {
  return;
 }
}
function _nimGCvisit($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $1&255;
 _dooperation_51618_1689653243($0,$2);
 return;
}
function _T1689653243_4($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $1&255;
 _dooperation_51618_1689653243($3,$4);
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 _dooperation_51618_1689653243($6,$4);
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 _dooperation_51618_1689653243($8,$4);
 return;
}
function _T1689653243_5() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2774]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = $0;
 $3 = (($2) + -8)|0;
 $4 = $3;
 _marks_67401_1689653243(4032,$4);
 return;
}
function _stacksize_70801_1689653243() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = sp;
 HEAP32[$0>>2] = 0;
 $1 = $0;
 $2 = HEAP32[(4036)>>2]|0;
 $3 = (($1) - ($2))|0;
 $4 = ($3|0)>(0);
 $5 = (0 - ($3))|0;
 $6 = $4 ? $3 : $5;
 STACKTOP = sp;return ($6|0);
}
function _interiorallocatedptr_44492_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $$$6 = 0, $$0 = 0, $$0$i$i$i = 0, $$010$i$i$i = 0, $$011$i$i$i = 0, $$01928$i = 0, $$idx = 0, $$idx$val = 0, $$idx83 = 0, $$idx83$val = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = $1;
 $3 = $2 >>> 12;
 $4 = $2 >>> 21;
 $5 = $4 & 255;
 $6 = (((($0)) + 2080|0) + ($5<<2)|0);
 $$010$i$i$i = HEAP32[$6>>2]|0;
 $7 = ($$010$i$i$i|0)==(0|0);
 L1: do {
  if (!($7)) {
   $$011$i$i$i = $$010$i$i$i;
   while(1) {
    $8 = ((($$011$i$i$i)) + 4|0);
    $9 = HEAP32[$8>>2]|0;
    $10 = ($9|0)==($4|0);
    if ($10) {
     break;
    }
    $$0$i$i$i = HEAP32[$$011$i$i$i>>2]|0;
    $11 = ($$0$i$i$i|0)==(0|0);
    if ($11) {
     break L1;
    } else {
     $$011$i$i$i = $$0$i$i$i;
    }
   }
   $12 = $2 >>> 17;
   $13 = $12 & 15;
   $14 = (((($$011$i$i$i)) + 8|0) + ($13<<2)|0);
   $15 = $3 & 31;
   $16 = 1 << $15;
   $17 = HEAP32[$14>>2]|0;
   $18 = $17 & $16;
   $19 = ($18|0)==(0);
   if (!($19)) {
    $20 = $2 & -4096;
    $21 = $20;
    $$idx = ((($21)) + 8|0);
    $$idx$val = HEAP8[$$idx>>0]|0;
    $22 = ($$idx$val<<24>>24)==(0);
    if ($22) {
     $$0 = 0;
     return ($$0|0);
    }
    $$idx83 = ((($21)) + 4|0);
    $$idx83$val = HEAP32[$$idx83>>2]|0;
    $23 = ($$idx83$val|0)<(4065);
    if ($23) {
     $24 = $2 & 4095;
     $25 = (($24) + -32)|0;
     $26 = ((($21)) + 28|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = ($25>>>0)<($27>>>0);
     if (!($28)) {
      $$0 = 0;
      return ($$0|0);
     }
     $29 = ((($21)) + 32|0);
     $30 = $29;
     $31 = (($30) + ($25))|0;
     $32 = (($25>>>0) % ($$idx83$val>>>0))&-1;
     $33 = (($31) - ($32))|0;
     $34 = $33;
     $35 = ((($34)) + 4|0);
     $36 = HEAP32[$35>>2]|0;
     $37 = ($36>>>0)>(1);
     $38 = $33;
     $$ = $37 ? $38 : 0;
     $$0 = $$;
     return ($$0|0);
    } else {
     $39 = ((($21)) + 24|0);
     $40 = ($39>>>0)>($1>>>0);
     if ($40) {
      $$0 = 0;
      return ($$0|0);
     }
     $41 = ((($21)) + 28|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42>>>0)>(1);
     $phitmp = $43 ? $39 : 0;
     $$0 = $phitmp;
     return ($$0|0);
    }
   }
  }
 } while(0);
 $44 = HEAP32[$0>>2]|0;
 $45 = ($44>>>0)>($2>>>0);
 if ($45) {
  $$0 = 0;
  return ($$0|0);
 }
 $46 = ((($0)) + 4|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = ($2>>>0)>($47>>>0);
 if ($48) {
  $$0 = 0;
  return ($$0|0);
 }
 $49 = ((($0)) + 3104|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = HEAP32[$50>>2]|0;
 $52 = ($51|0)==($50|0);
 if ($52) {
  $$0 = 0;
  return ($$0|0);
 } else {
  $$01928$i = $50;
 }
 while(1) {
  $53 = ((($$01928$i)) + 8|0);
  $54 = HEAP32[$53>>2]|0;
  $55 = ($54>>>0)>($2>>>0);
  if (!($55)) {
   $56 = ((($$01928$i)) + 12|0);
   $57 = HEAP32[$56>>2]|0;
   $58 = ($57>>>0)>($2>>>0);
   if ($58) {
    break;
   }
  }
  $59 = ($54>>>0)<($2>>>0);
  $60 = $59&1;
  $61 = (($$01928$i) + ($60<<2)|0);
  $62 = HEAP32[$61>>2]|0;
  $63 = HEAP32[$62>>2]|0;
  $64 = ($63|0)==($62|0);
  if ($64) {
   $$0 = 0;
   label = 18;
   break;
  } else {
   $$01928$i = $62;
  }
 }
 if ((label|0) == 18) {
  return ($$0|0);
 }
 $65 = $54;
 $66 = ((($65)) + 4|0);
 $67 = HEAP32[$66>>2]|0;
 $68 = ($67>>>0)>(1);
 $$$6 = $68 ? $65 : 0;
 $$0 = $$$6;
 return ($$0|0);
}
function _markstackandregisters_72238_1689653243($0) {
 $0 = $0|0;
 var $$01213$reg2mem68$0 = 0, $$phi$trans$insert$i$i = 0, $$pre$i$i = 0, $$pre19$i$i = 0, $$reg2mem64$0 = 0, $$reg2mem66$0 = 0, $$reg2mem70$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $cond = 0, $cond72 = 0, $cond73 = 0, $cond74 = 0, _setjmpTable = 0, _setjmpTableSize = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 _setjmpTableSize = 4;_setjmpTable = _malloc(40) | 0;HEAP32[_setjmpTable>>2]=0;
 $1 = sp;
 _setjmpTable = _saveSetjmp($1,1,_setjmpTable|0,_setjmpTableSize|0)|0;_setjmpTableSize = tempRet0;
 __THREW__ = 0;
 $2 = __THREW__; __THREW__ = 0;
 if ((($2|0) != 0) & ((threwValue|0) != 0)) { $3 = _testSetjmp(HEAP32[$2>>2]|0, _setjmpTable|0, _setjmpTableSize|0)|0; if (($3|0) == 0) { _longjmp($2|0, threwValue|0); } tempRet0 = (threwValue); } else { $3 = -1; };
 $4 = tempRet0;
 $cond = ($3|0)==(1);
 if ($cond) {
  $$reg2mem70$0 = $4;
 } else {
  $$reg2mem70$0 = 0;
 }
 L3: while(1) {
  $5 = ($$reg2mem70$0|0)==(0);
  if (!($5)) {
   label = 16;
   break;
  }
  $6 = ((($0)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $1;
  $9 = (($8) + 152)|0;
  $10 = ($7>>>0)>($9>>>0);
  if ($10) {
   label = 16;
   break;
  }
  $11 = ((($0)) + 52|0);
  $12 = ((($0)) + 28|0);
  $13 = ((($0)) + 24|0);
  $$phi$trans$insert$i$i = ((($0)) + 32|0);
  $$01213$reg2mem68$0 = $9;
  while(1) {
   $14 = $$01213$reg2mem68$0;
   $15 = HEAP32[$14>>2]|0;
   $16 = (($15) + -8)|0;
   $17 = $16;
   $18 = ($17>>>0)>((4096)>>>0);
   if ($18) {
    $19 = $16;
    __THREW__ = 0;
    $20 = (invoke_iii(9,($11|0),($19|0))|0);
    $21 = __THREW__; __THREW__ = 0;
    if ((($21|0) != 0) & ((threwValue|0) != 0)) { $22 = _testSetjmp(HEAP32[$21>>2]|0, _setjmpTable|0, _setjmpTableSize|0)|0; if (($22|0) == 0) { _longjmp($21|0, threwValue|0); } tempRet0 = (threwValue); } else { $22 = -1; };
    $23 = tempRet0;
    $cond72 = ($22|0)==(1);
    if ($cond72) {
     $$reg2mem70$0 = $23;
     continue L3;
    }
    $24 = ($20|0)==(0|0);
    if (!($24)) {
     $25 = HEAP32[$20>>2]|0;
     $26 = (($25) + 8)|0;
     HEAP32[$20>>2] = $26;
     $27 = HEAP32[$12>>2]|0;
     $28 = HEAP32[$13>>2]|0;
     $29 = ($27|0)>($28|0);
     if ($29) {
      $$pre19$i$i = HEAP32[$$phi$trans$insert$i$i>>2]|0;
      $$reg2mem64$0 = $28;$$reg2mem66$0 = $$pre19$i$i;
     } else {
      $30 = ($27*3)|0;
      $31 = (($30|0) / 2)&-1;
      HEAP32[$12>>2] = $31;
      $32 = $31 << 2;
      $33 = (($32) + 8)|0;
      __THREW__ = 0;
      $34 = (invoke_iii(10,((4084)|0),($33|0))|0);
      $35 = __THREW__; __THREW__ = 0;
      if ((($35|0) != 0) & ((threwValue|0) != 0)) { $36 = _testSetjmp(HEAP32[$35>>2]|0, _setjmpTable|0, _setjmpTableSize|0)|0; if (($36|0) == 0) { _longjmp($35|0, threwValue|0); } tempRet0 = (threwValue); } else { $36 = -1; };
      $37 = tempRet0;
      $cond73 = ($36|0)==(1);
      if ($cond73) {
       $$reg2mem70$0 = $37;
       continue L3;
      }
      $38 = ((($34)) + 4|0);
      HEAP32[$38>>2] = 1;
      $39 = $34;
      $40 = (($39) + 8)|0;
      $41 = $40;
      $42 = HEAP32[$$phi$trans$insert$i$i>>2]|0;
      $43 = HEAP32[$13>>2]|0;
      $44 = $43 << 2;
      _memcpy(($41|0),($42|0),($44|0))|0;
      $45 = HEAP32[$$phi$trans$insert$i$i>>2]|0;
      $46 = (($45) + -8)|0;
      $47 = $46;
      __THREW__ = 0;
      invoke_vii(11,((4084)|0),($47|0));
      $48 = __THREW__; __THREW__ = 0;
      if ((($48|0) != 0) & ((threwValue|0) != 0)) { $49 = _testSetjmp(HEAP32[$48>>2]|0, _setjmpTable|0, _setjmpTableSize|0)|0; if (($49|0) == 0) { _longjmp($48|0, threwValue|0); } tempRet0 = (threwValue); } else { $49 = -1; };
      $50 = tempRet0;
      $cond74 = ($49|0)==(1);
      if ($cond74) {
       $$reg2mem70$0 = $50;
       continue L3;
      }
      HEAP32[$$phi$trans$insert$i$i>>2] = $41;
      $$pre$i$i = HEAP32[$13>>2]|0;
      $51 = $40;
      $$reg2mem64$0 = $$pre$i$i;$$reg2mem66$0 = $51;
     }
     $52 = (($$reg2mem66$0) + ($$reg2mem64$0<<2)|0);
     HEAP32[$52>>2] = $20;
     $53 = (($$reg2mem64$0) + 1)|0;
     HEAP32[$13>>2] = $53;
    }
   }
   $54 = (($$01213$reg2mem68$0) + -4)|0;
   $55 = ($7>>>0)>($54>>>0);
   if ($55) {
    label = 16;
    break L3;
   } else {
    $$01213$reg2mem68$0 = $54;
   }
  }
 }
 if ((label|0) == 16) {
  _free(_setjmpTable|0);
  STACKTOP = sp;return;
 }
}
function _collectzct_69207_1689653243($0) {
 $0 = $0|0;
 var $$pr = 0, $$pre = 0, $$pre$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $exitcond$i = 0, $exitcond$i21 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 $2 = ((($0)) + 20|0);
 $3 = ((($0)) + 52|0);
 L1: while(1) {
  $$pr = HEAP32[$1>>2]|0;
  $5 = $$pr;
  while(1) {
   $4 = ($5|0)>(0);
   if (!($4)) {
    break L1;
   }
   $6 = HEAP32[$2>>2]|0;
   $7 = HEAP32[$6>>2]|0;
   $8 = HEAP32[$7>>2]|0;
   $9 = $8 & -5;
   HEAP32[$7>>2] = $9;
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -1)|0;
   $12 = (($6) + ($11<<2)|0);
   $13 = HEAP32[$12>>2]|0;
   HEAP32[$6>>2] = $13;
   HEAP32[$1>>2] = $11;
   $14 = HEAP32[$7>>2]|0;
   $15 = ($14>>>0)<(8);
   if ($15) {
    break;
   } else {
    $5 = $11;
   }
  }
  $16 = ((($7)) + 4|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = ((($17)) + 16|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = ($19|0)==(0|0);
  if ($20) {
   $29 = $17;
  } else {
   $21 = HEAP32[(4080)>>2]|0;
   $22 = (($21) + 1)|0;
   HEAP32[(4080)>>2] = $22;
   $23 = $7;
   $24 = (($23) + 8)|0;
   $25 = $24;
   FUNCTION_TABLE_vi[$19 & 31]($25);
   $26 = HEAP32[(4080)>>2]|0;
   $27 = (($26) + -1)|0;
   HEAP32[(4080)>>2] = $27;
   $$pre = HEAP32[$16>>2]|0;
   $29 = $$pre;
  }
  $28 = ((($29)) + 20|0);
  $30 = HEAP32[$28>>2]|0;
  $31 = ($30|0)==(0|0);
  L10: do {
   if ($31) {
    $35 = ((($29)) + 4|0);
    $36 = HEAP8[$35>>0]|0;
    switch ($36<<24>>24) {
    case 22:  {
     $37 = $7;
     $38 = (($37) + 8)|0;
     $39 = $38;
     $40 = ((($29)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     _forallchildrenaux_51622_1689653243($39,$41,2);
     break L10;
     break;
    }
    case 24:  {
     break;
    }
    default: {
     break L10;
    }
    }
    $42 = $7;
    $43 = (($42) + 8)|0;
    $44 = ($43|0)==(0);
    if (!($44)) {
     $45 = $43;
     $46 = HEAP32[$45>>2]|0;
     $47 = ($46|0)>(0);
     if ($47) {
      $48 = (($42) + 16)|0;
      $49 = ((($29)) + 8|0);
      $50 = HEAP32[$49>>2]|0;
      $51 = $48;
      _forallchildrenaux_51622_1689653243($51,$50,2);
      $exitcond$i21 = ($46|0)==(1);
      if (!($exitcond$i21)) {
       $56 = 1;
       while(1) {
        $$pre$i = HEAP32[$16>>2]|0;
        $52 = ((($$pre$i)) + 8|0);
        $53 = HEAP32[$52>>2]|0;
        $54 = HEAP32[$53>>2]|0;
        $55 = Math_imul($54, $56)|0;
        $57 = (($48) + ($55))|0;
        $58 = $57;
        _forallchildrenaux_51622_1689653243($58,$53,2);
        $59 = (($56) + 1)|0;
        $exitcond$i = ($59|0)==($46|0);
        if ($exitcond$i) {
         break;
        } else {
         $56 = $59;
        }
       }
      }
     }
    }
   } else {
    $32 = $7;
    $33 = (($32) + 8)|0;
    $34 = $33;
    FUNCTION_TABLE_vii[$30 & 15]($34,2);
   }
  } while(0);
  _rawdealloc_42817_1689653243($3,$7);
 }
 return 1;
}
function _cellsetreset_55628_1689653243($0) {
 $0 = $0|0;
 var $$01213$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 8|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  $$01213$i = $2;
  while(1) {
   $4 = HEAP32[$$01213$i>>2]|0;
   $5 = $$01213$i;
   $6 = (($5) + -8)|0;
   $7 = $6;
   _rawdealloc_42817_1689653243((4084),$7);
   $8 = ($4|0)==(0|0);
   if ($8) {
    break;
   } else {
    $$01213$i = $4;
   }
  }
 }
 HEAP32[$1>>2] = 0;
 $9 = ((($0)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) + -8)|0;
 $12 = $11;
 _rawdealloc_42817_1689653243((4084),$12);
 HEAP32[$9>>2] = 0;
 HEAP32[$0>>2] = 0;
 $13 = (_getbigchunk_35014_1689653243((4084),8192)|0);
 $14 = ((($13)) + 24|0);
 $15 = HEAP32[(7188)>>2]|0;
 $16 = ($15|0)==(0|0);
 if ($16) {
  $17 = HEAP32[2773]|0;
  HEAP32[(7188)>>2] = $17;
 }
 $18 = $14;
 $19 = (($18) + 8192)|0;
 _add_30353_1689653243((4084),(7188),$18,$19);
 $20 = ((($14)) + 4|0);
 HEAP32[$20>>2] = 1;
 $21 = (($18) + 8)|0;
 $22 = $21;
 _memset(($22|0),0,4096)|0;
 HEAP32[$9>>2] = $22;
 $23 = ((($0)) + 4|0);
 HEAP32[$23>>2] = 1023;
 HEAP32[$0>>2] = 0;
 HEAP32[$1>>2] = 0;
 return;
}
function _sweep_67201_1689653243($0) {
 $0 = $0|0;
 var $$0$i$i = 0, $$010$i$i = 0, $$0101161 = 0, $$0103159 = 0, $$0104158 = 0, $$0105156 = 0, $$011$i$i = 0, $$0164 = 0, $$09$i$i = 0, $$09$i$i110 = 0, $$099 = 0, $$099162 = 0, $$099163 = 0, $$idx = 0, $$idx$val = 0, $$idx106 = 0, $$idx106$val = 0, $$sroa$3$0$copyload = 0, $$sroa$3125$0$$sroa_idx126 = 0, $$sroa$3125$0$copyload = 0;
 var $$sroa$4120$0$copyload = 0, $$sroa$4131$0$$sroa_idx132 = 0, $$sroa$4131$0$copyload = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1024|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(1024|0);
 $1 = sp;
 $2 = ((($0)) + 3172|0);
 HEAP8[$2>>0] = 1;
 $3 = ((($0)) + 2132|0);
 _memcpy(($1|0),($3|0),1024)|0;
 $$sroa$3125$0$$sroa_idx126 = ((($0)) + 3212|0);
 $$sroa$4131$0$$sroa_idx132 = ((($0)) + 3220|0);
 $4 = ((($0)) + 52|0);
 $$0164 = 0;
 while(1) {
  $5 = (($1) + ($$0164<<2)|0);
  $$099162 = HEAP32[$5>>2]|0;
  $6 = ($$099162|0)==(0|0);
  if (!($6)) {
   $$099163 = $$099162;
   while(1) {
    $7 = ((($$099163)) + 4|0);
    $$0101161 = 0;
    while(1) {
     $8 = (((($$099163)) + 8|0) + ($$0101161<<2)|0);
     $9 = HEAP32[$8>>2]|0;
     $10 = ($9|0)==(0);
     if (!($10)) {
      $11 = $$0101161 << 5;
      $$0103159 = $9;$$0104158 = 0;
      while(1) {
       $12 = $$0103159 & 1;
       $13 = ($12|0)==(0);
       L12: do {
        if (!($13)) {
         $14 = HEAP32[$7>>2]|0;
         $15 = $14 << 9;
         $16 = (($$0104158) + ($11))|0;
         $17 = $15 | $16;
         $18 = $17 >>> 9;
         $19 = $18 & 255;
         $20 = (((($0)) + 2132|0) + ($19<<2)|0);
         $$010$i$i = HEAP32[$20>>2]|0;
         $21 = ($$010$i$i|0)==(0|0);
         if (!($21)) {
          $$011$i$i = $$010$i$i;
          while(1) {
           $22 = ((($$011$i$i)) + 4|0);
           $23 = HEAP32[$22>>2]|0;
           $24 = ($23|0)==($18|0);
           if ($24) {
            break;
           }
           $$0$i$i = HEAP32[$$011$i$i>>2]|0;
           $25 = ($$0$i$i|0)==(0|0);
           if ($25) {
            break L12;
           } else {
            $$011$i$i = $$0$i$i;
           }
          }
          $26 = $16 >>> 5;
          $27 = $26 & 15;
          $28 = (((($$011$i$i)) + 8|0) + ($27<<2)|0);
          $29 = $16 & 31;
          $30 = 1 << $29;
          $31 = HEAP32[$28>>2]|0;
          $32 = $31 & $30;
          $33 = ($32|0)==(0);
          if (!($33)) {
           $34 = $17 << 12;
           $35 = $34;
           $$idx = ((($35)) + 8|0);
           $$idx$val = HEAP8[$$idx>>0]|0;
           $36 = ($$idx$val<<24>>24)==(0);
           if (!($36)) {
            $$idx106 = ((($35)) + 4|0);
            $$idx106$val = HEAP32[$$idx106>>2]|0;
            $37 = ($$idx106$val|0)<(4065);
            if (!($37)) {
             $89 = $34;
             $90 = ((($89)) + 24|0);
             $91 = ((($90)) + 4|0);
             $92 = HEAP32[$91>>2]|0;
             $93 = ($92>>>0)>(1);
             $94 = $92;
             if (!($93)) {
              break;
             }
             $$sroa$3$0$copyload = HEAPU8[$$sroa$3125$0$$sroa_idx126>>0]|(HEAPU8[$$sroa$3125$0$$sroa_idx126+1>>0]<<8)|(HEAPU8[$$sroa$3125$0$$sroa_idx126+2>>0]<<16)|(HEAPU8[$$sroa$3125$0$$sroa_idx126+3>>0]<<24);
             $$sroa$4120$0$copyload = HEAPU8[$$sroa$4131$0$$sroa_idx132>>0]|(HEAPU8[$$sroa$4131$0$$sroa_idx132+1>>0]<<8)|(HEAPU8[$$sroa$4131$0$$sroa_idx132+2>>0]<<16)|(HEAPU8[$$sroa$4131$0$$sroa_idx132+3>>0]<<24);
             $95 = $90;
             $96 = $95 >>> 12;
             $97 = $$sroa$3$0$copyload & $96;
             $98 = (($$sroa$4120$0$copyload) + ($97<<2)|0);
             $99 = HEAP32[$98>>2]|0;
             $100 = ($99|0)==(0|0);
             L23: do {
              if (!($100)) {
               $$09$i$i = $97;$102 = $99;
               while(1) {
                $101 = ((($102)) + 4|0);
                $103 = HEAP32[$101>>2]|0;
                $104 = ($103|0)==($96|0);
                if ($104) {
                 break;
                }
                $105 = ($$09$i$i*5)|0;
                $106 = (($105) + 1)|0;
                $107 = $106 & $$sroa$3$0$copyload;
                $108 = (($$sroa$4120$0$copyload) + ($107<<2)|0);
                $109 = HEAP32[$108>>2]|0;
                $110 = ($109|0)==(0|0);
                if ($110) {
                 break L23;
                } else {
                 $$09$i$i = $107;$102 = $109;
                }
               }
               $111 = $95 >>> 3;
               $112 = $111 & 31;
               $113 = 1 << $112;
               $114 = $95 >>> 8;
               $115 = $114 & 15;
               $116 = (((($102)) + 8|0) + ($115<<2)|0);
               $117 = HEAP32[$116>>2]|0;
               $118 = $117 & $113;
               $119 = ($118|0)==(0);
               if (!($119)) {
                break L12;
               }
              }
             } while(0);
             $120 = ((($94)) + 16|0);
             $121 = HEAP32[$120>>2]|0;
             $122 = ($121|0)==(0|0);
             if (!($122)) {
              $123 = HEAP32[(4080)>>2]|0;
              $124 = (($123) + 1)|0;
              HEAP32[(4080)>>2] = $124;
              $125 = (($95) + 8)|0;
              $126 = $125;
              FUNCTION_TABLE_vi[$121 & 31]($126);
              $127 = HEAP32[(4080)>>2]|0;
              $128 = (($127) + -1)|0;
              HEAP32[(4080)>>2] = $128;
             }
             _rawdealloc_42817_1689653243($4,$90);
             break;
            }
            $38 = $34;
            $39 = ((($38)) + 4|0);
            $40 = HEAP32[$39>>2]|0;
            $41 = ((($38)) + 32|0);
            $42 = $41;
            $43 = ((($38)) + 28|0);
            $44 = HEAP32[$43>>2]|0;
            $45 = (($44) + ($42))|0;
            $46 = ($42>>>0)<($45>>>0);
            if ($46) {
             $$0105156 = $42;
             while(1) {
              $47 = $$0105156;
              $48 = ((($47)) + 4|0);
              $49 = HEAP32[$48>>2]|0;
              $50 = ($49>>>0)>(1);
              L35: do {
               if ($50) {
                $51 = $$0105156;
                $$sroa$3125$0$copyload = HEAPU8[$$sroa$3125$0$$sroa_idx126>>0]|(HEAPU8[$$sroa$3125$0$$sroa_idx126+1>>0]<<8)|(HEAPU8[$$sroa$3125$0$$sroa_idx126+2>>0]<<16)|(HEAPU8[$$sroa$3125$0$$sroa_idx126+3>>0]<<24);
                $$sroa$4131$0$copyload = HEAPU8[$$sroa$4131$0$$sroa_idx132>>0]|(HEAPU8[$$sroa$4131$0$$sroa_idx132+1>>0]<<8)|(HEAPU8[$$sroa$4131$0$$sroa_idx132+2>>0]<<16)|(HEAPU8[$$sroa$4131$0$$sroa_idx132+3>>0]<<24);
                $52 = $$0105156 >>> 12;
                $53 = $$sroa$3125$0$copyload & $52;
                $54 = (($$sroa$4131$0$copyload) + ($53<<2)|0);
                $55 = HEAP32[$54>>2]|0;
                $56 = ($55|0)==(0|0);
                L37: do {
                 if (!($56)) {
                  $$09$i$i110 = $53;$58 = $55;
                  while(1) {
                   $57 = ((($58)) + 4|0);
                   $59 = HEAP32[$57>>2]|0;
                   $60 = ($59|0)==($52|0);
                   if ($60) {
                    break;
                   }
                   $61 = ($$09$i$i110*5)|0;
                   $62 = (($61) + 1)|0;
                   $63 = $62 & $$sroa$3125$0$copyload;
                   $64 = (($$sroa$4131$0$copyload) + ($63<<2)|0);
                   $65 = HEAP32[$64>>2]|0;
                   $66 = ($65|0)==(0|0);
                   if ($66) {
                    break L37;
                   } else {
                    $$09$i$i110 = $63;$58 = $65;
                   }
                  }
                  $67 = $$0105156 >>> 3;
                  $68 = $67 & 31;
                  $69 = 1 << $68;
                  $70 = $$0105156 >>> 8;
                  $71 = $70 & 15;
                  $72 = (((($58)) + 8|0) + ($71<<2)|0);
                  $73 = HEAP32[$72>>2]|0;
                  $74 = $73 & $69;
                  $75 = ($74|0)==(0);
                  if (!($75)) {
                   break L35;
                  }
                 }
                } while(0);
                $76 = ((($51)) + 4|0);
                $77 = HEAP32[$76>>2]|0;
                $78 = ((($77)) + 16|0);
                $79 = HEAP32[$78>>2]|0;
                $80 = ($79|0)==(0|0);
                if (!($80)) {
                 $81 = HEAP32[(4080)>>2]|0;
                 $82 = (($81) + 1)|0;
                 HEAP32[(4080)>>2] = $82;
                 $83 = (($$0105156) + 8)|0;
                 $84 = $83;
                 FUNCTION_TABLE_vi[$79 & 31]($84);
                 $85 = HEAP32[(4080)>>2]|0;
                 $86 = (($85) + -1)|0;
                 HEAP32[(4080)>>2] = $86;
                }
                _rawdealloc_42817_1689653243($4,$47);
               }
              } while(0);
              $87 = (($$0105156) + ($40))|0;
              $88 = ($87>>>0)<($45>>>0);
              if ($88) {
               $$0105156 = $87;
              } else {
               break;
              }
             }
            }
           }
          }
         }
        }
       } while(0);
       $129 = (($$0104158) + 1)|0;
       $130 = $$0103159 >>> 1;
       $131 = ($130|0)==(0);
       if ($131) {
        break;
       } else {
        $$0103159 = $130;$$0104158 = $129;
       }
      }
     }
     $132 = (($$0101161) + 1)|0;
     $133 = ($132|0)<(16);
     if ($133) {
      $$0101161 = $132;
     } else {
      break;
     }
    }
    $$099 = HEAP32[$$099163>>2]|0;
    $134 = ($$099|0)==(0|0);
    if ($134) {
     break;
    } else {
     $$099163 = $$099;
    }
   }
  }
  $135 = (($$0164) + 1)|0;
  $136 = ($135|0)<(256);
  if ($136) {
   $$0164 = $135;
  } else {
   break;
  }
 }
 HEAP8[$2>>0] = 0;
 STACKTOP = sp;return;
}
function _collectcycles_69211_1689653243($0) {
 $0 = $0|0;
 var $$022 = 0, $$02628$i = 0, $$027$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond = 0, $exitcond$i = 0, $exitcond32$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)>(0);
 if ($3) {
  while(1) {
   (_collectzct_69207_1689653243($0)|0);
   $4 = HEAP32[$1>>2]|0;
   $5 = ($4|0)>(0);
   if (!($5)) {
    break;
   }
  }
 }
 $6 = ((($0)) + 3208|0);
 _cellsetreset_55628_1689653243($6);
 $7 = ((($0)) + 32|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($0)) + 24|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ($10|0)>(0);
 if ($11) {
  $$022 = 0;
  while(1) {
   $12 = (($8) + ($$022<<2)|0);
   $13 = HEAP32[$12>>2]|0;
   _marks_67401_1689653243($0,$13);
   $14 = (($$022) + 1)|0;
   $exitcond = ($14|0)==($10|0);
   if ($exitcond) {
    break;
   } else {
    $$022 = $14;
   }
  }
 }
 $15 = HEAP32[2775]|0;
 $16 = ($15|0)>(0);
 if ($16) {
  $$02628$i = 0;
  while(1) {
   $17 = (11104 + ($$02628$i<<2)|0);
   $18 = HEAP32[$17>>2]|0;
   FUNCTION_TABLE_v[$18 & 31]();
   $19 = (($$02628$i) + 1)|0;
   $exitcond32$i = ($19|0)==($15|0);
   if ($exitcond32$i) {
    break;
   } else {
    $$02628$i = $19;
   }
  }
 }
 $20 = ((($0)) + 3232|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = ((($0)) + 3224|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = ($23|0)>(0);
 if ($24) {
  $$027$i = 0;
 } else {
  _sweep_67201_1689653243($0);
  return;
 }
 while(1) {
  $25 = (($21) + ($$027$i<<2)|0);
  $26 = HEAP32[$25>>2]|0;
  _marks_67401_1689653243($0,$26);
  $27 = (($$027$i) + 1)|0;
  $exitcond$i = ($27|0)==($23|0);
  if ($exitcond$i) {
   break;
  } else {
   $$027$i = $27;
  }
 }
 _sweep_67201_1689653243($0);
 return;
}
function _collectctbody_74409_1689653243($0) {
 $0 = $0|0;
 var $$ = 0, $$015$i = 0, $$08$lcssa$i7$i = 0, $$09$i$i = 0, $$09$i$i$phi = 0, $$09$i4$i = 0, $$35 = 0, $$idx = 0, $$idx$val = 0, $$idx36 = 0, $$idx36$val = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_stacksize_70801_1689653243()|0);
 $2 = ((($0)) + 3188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<($1|0);
 $$ = $4 ? $1 : $3;
 HEAP32[$2>>2] = $$;
 $5 = ((($0)) + 52|0);
 $6 = ((($0)) + 3156|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==($7|0);
 if ($9) {
  HEAP32[$5>>2] = 0;
  $$08$lcssa$i7$i = -1;
 } else {
  $$09$i$i = $7;$11 = $8;
  while(1) {
   $10 = HEAP32[$11>>2]|0;
   $12 = ($10|0)==($11|0);
   if ($12) {
    break;
   } else {
    $$09$i$i$phi = $11;$11 = $10;$$09$i$i = $$09$i$i$phi;
   }
  }
  $13 = ((($$09$i$i)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  HEAP32[$5>>2] = $14;
  $$09$i4$i = $7;
  while(1) {
   $15 = ((($$09$i4$i)) + 4|0);
   $16 = HEAP32[$15>>2]|0;
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($16|0);
   if ($18) {
    break;
   } else {
    $$09$i4$i = $16;
   }
  }
  $19 = ((($$09$i4$i)) + 12|0);
  $20 = HEAP32[$19>>2]|0;
  $$08$lcssa$i7$i = $20;
 }
 $21 = ((($0)) + 56|0);
 HEAP32[$21>>2] = $$08$lcssa$i7$i;
 _markstackandregisters_72238_1689653243($0);
 $22 = ((($0)) + 3192|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = ((($0)) + 24|0);
 $25 = HEAP32[$24>>2]|0;
 $26 = ($23|0)<($25|0);
 $27 = $26 ? $25 : $23;
 HEAP32[$22>>2] = $27;
 $28 = ((($0)) + 3176|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = (($29) + 1)|0;
 HEAP32[$28>>2] = $30;
 (_collectzct_69207_1689653243($0)|0);
 $$idx = ((($0)) + 2112|0);
 $$idx$val = HEAP32[$$idx>>2]|0;
 $$idx36 = ((($0)) + 2120|0);
 $$idx36$val = HEAP32[$$idx36>>2]|0;
 $31 = (($$idx$val) - ($$idx36$val))|0;
 $32 = ((($0)) + 8|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = ($33|0)>($31|0);
 if (!($34)) {
  _collectcycles_69211_1689653243($0);
  $35 = ((($0)) + 3180|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = (($36) + 1)|0;
  HEAP32[$35>>2] = $37;
  $38 = HEAP32[(6144)>>2]|0;
  $39 = HEAP32[(6152)>>2]|0;
  $40 = (($38) - ($39))|0;
  $41 = $40 << 1;
  $42 = ($41|0)>(4194304);
  $43 = $42 ? $41 : 4194304;
  HEAP32[$32>>2] = $43;
  $44 = ((($0)) + 3184|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = ($45|0)<($43|0);
  $$35 = $46 ? $43 : $45;
  HEAP32[$44>>2] = $$35;
 }
 $47 = ((($0)) + 32|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = HEAP32[$24>>2]|0;
 $50 = ($49|0)>(0);
 if ($50) {
  $$015$i = 0;
 } else {
  HEAP32[$24>>2] = 0;
  return;
 }
 while(1) {
  $51 = (($48) + ($$015$i<<2)|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = HEAP32[$52>>2]|0;
  $54 = (($53) + -8)|0;
  HEAP32[$52>>2] = $54;
  $55 = ($54>>>0)<(8);
  if ($55) {
   _addzct_51217_1689653243((4044),$52);
  }
  $56 = (($$015$i) + 1)|0;
  $exitcond$i = ($56|0)==($49|0);
  if ($exitcond$i) {
   break;
  } else {
   $$015$i = $56;
  }
 }
 HEAP32[$24>>2] = 0;
 return;
}
function _rawnewobj_57201_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$idx$i = 0, $$idx$val$i = 0, $$idx25$i = 0, $$idx25$val$i = 0, $$pre$i$i = 0, $10 = 0, $100 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (_stacksize_70801_1689653243()|0);
 $4 = ($3|0)>(31999);
 $5 = (($3|0) / 64)&-1;
 $6 = $4 ? $5 : 500;
 $7 = ((($2)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($6|0)>($8|0);
 if ($9) {
  $$idx$i = ((($2)) + 2112|0);
  $$idx$val$i = HEAP32[$$idx$i>>2]|0;
  $$idx25$i = ((($2)) + 2120|0);
  $$idx25$val$i = HEAP32[$$idx25$i>>2]|0;
  $10 = (($$idx$val$i) - ($$idx25$val$i))|0;
  $11 = ((($2)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($12|0)>($10|0);
  if (!($13)) {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $14 = ((($2)) + 48|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = ($15|0)==(0);
  if ($16) {
   _collectctbody_74409_1689653243($2);
  }
 }
 $17 = ((($2)) + 52|0);
 $18 = (($1) + 8)|0;
 $19 = (_rawalloc_36404_1689653243($17,$18)|0);
 $20 = ((($19)) + 4|0);
 HEAP32[$20>>2] = $0;
 HEAP32[$19>>2] = 4;
 $21 = HEAP32[$7>>2]|0;
 $22 = ((($2)) + 20|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = ($21|0)>(8);
 if (!($24)) {
  $96 = (($23) + ($21<<2)|0);
  HEAP32[$96>>2] = $19;
  $97 = (($21) + 1)|0;
  HEAP32[$7>>2] = $97;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $25 = (($21) + -1)|0;
 $26 = (($23) + ($25<<2)|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = HEAP32[$27>>2]|0;
 $29 = ($28>>>0)>(7);
 if ($29) {
  $30 = $28 & -5;
  HEAP32[$27>>2] = $30;
  HEAP32[$26>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $31 = (($21) + -2)|0;
 $32 = (($23) + ($31<<2)|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = HEAP32[$33>>2]|0;
 $35 = ($34>>>0)>(7);
 if ($35) {
  $36 = $34 & -5;
  HEAP32[$33>>2] = $36;
  HEAP32[$32>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $37 = (($21) + -3)|0;
 $38 = (($23) + ($37<<2)|0);
 $39 = HEAP32[$38>>2]|0;
 $40 = HEAP32[$39>>2]|0;
 $41 = ($40>>>0)>(7);
 if ($41) {
  $42 = $40 & -5;
  HEAP32[$39>>2] = $42;
  HEAP32[$38>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $43 = (($21) + -4)|0;
 $44 = (($23) + ($43<<2)|0);
 $45 = HEAP32[$44>>2]|0;
 $46 = HEAP32[$45>>2]|0;
 $47 = ($46>>>0)>(7);
 if ($47) {
  $48 = $46 & -5;
  HEAP32[$45>>2] = $48;
  HEAP32[$44>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $49 = (($21) + -5)|0;
 $50 = (($23) + ($49<<2)|0);
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$51>>2]|0;
 $53 = ($52>>>0)>(7);
 if ($53) {
  $54 = $52 & -5;
  HEAP32[$51>>2] = $54;
  HEAP32[$50>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $55 = (($21) + -6)|0;
 $56 = (($23) + ($55<<2)|0);
 $57 = HEAP32[$56>>2]|0;
 $58 = HEAP32[$57>>2]|0;
 $59 = ($58>>>0)>(7);
 if ($59) {
  $60 = $58 & -5;
  HEAP32[$57>>2] = $60;
  HEAP32[$56>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $61 = (($21) + -7)|0;
 $62 = (($23) + ($61<<2)|0);
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$63>>2]|0;
 $65 = ($64>>>0)>(7);
 if ($65) {
  $66 = $64 & -5;
  HEAP32[$63>>2] = $66;
  HEAP32[$62>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $67 = (($21) + -8)|0;
 $68 = (($23) + ($67<<2)|0);
 $69 = HEAP32[$68>>2]|0;
 $70 = HEAP32[$69>>2]|0;
 $71 = ($70>>>0)>(7);
 if ($71) {
  $72 = $70 & -5;
  HEAP32[$69>>2] = $72;
  HEAP32[$68>>2] = $19;
  $98 = $19;
  $99 = (($98) + 8)|0;
  $100 = $99;
  return ($100|0);
 }
 $73 = ((($2)) + 16|0);
 $74 = HEAP32[$73>>2]|0;
 $75 = ($74|0)>($21|0);
 if ($75) {
  $93 = $23;$94 = $21;
 } else {
  $76 = ($74*3)|0;
  $77 = (($76|0) / 2)&-1;
  HEAP32[$73>>2] = $77;
  $78 = $77 << 2;
  $79 = (($78) + 8)|0;
  $80 = (_rawalloc_36404_1689653243((4084),$79)|0);
  $81 = ((($80)) + 4|0);
  HEAP32[$81>>2] = 1;
  $82 = $80;
  $83 = (($82) + 8)|0;
  $84 = $83;
  $85 = HEAP32[$22>>2]|0;
  $86 = HEAP32[$7>>2]|0;
  $87 = $86 << 2;
  _memcpy(($84|0),($85|0),($87|0))|0;
  $88 = HEAP32[$22>>2]|0;
  $89 = (($88) + -8)|0;
  $90 = $89;
  _rawdealloc_42817_1689653243((4084),$90);
  HEAP32[$22>>2] = $84;
  $$pre$i$i = HEAP32[$7>>2]|0;
  $91 = $83;
  $93 = $91;$94 = $$pre$i$i;
 }
 $92 = (($93) + ($94<<2)|0);
 HEAP32[$92>>2] = $19;
 $95 = (($94) + 1)|0;
 HEAP32[$7>>2] = $95;
 $98 = $19;
 $99 = (($98) + 8)|0;
 $100 = $99;
 return ($100|0);
}
function _showerrormessage_18606_1689653243($0) {
 $0 = $0|0;
 var $$$i$i$i = 0, $$0$i = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[9784]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $12 = HEAP32[136]|0;
  (_fputs($0,$12)|0);
  return;
 }
 $3 = ($0|0)==(0|0);
 if ($3) {
  $$0$i = 0;$11 = $1;
 } else {
  $4 = (_strlen($0)|0);
  $5 = ($4|0)<(7);
  $$$i$i$i = $5 ? 7 : $4;
  $6 = (($$$i$i$i) + 9)|0;
  $7 = (_rawnewobj_57201_1689653243(39108,$6,4032)|0);
  $8 = ((($7)) + 4|0);
  HEAP32[$8>>2] = $$$i$i$i;
  HEAP32[$7>>2] = $4;
  $9 = ((($7)) + 8|0);
  $10 = (($4) + 1)|0;
  _memcpy(($9|0),($0|0),($10|0))|0;
  $$pre = HEAP32[9784]|0;
  $$0$i = $7;$11 = $$pre;
 }
 FUNCTION_TABLE_vi[$11 & 31]($$0$i);
 return;
}
function _signalHandler($0) {
 $0 = $0|0;
 var $$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 switch ($0|0) {
 case 2:  {
  $$0 = 1494;
  break;
 }
 case 11:  {
  $$0 = 1306;
  break;
 }
 case 6:  {
  $$0 = 1368;
  break;
 }
 case 8:  {
  $$0 = 1400;
  break;
 }
 case 4:  {
  $$0 = 1427;
  break;
 }
 case 13:  {
  $$0 = 1455;
  break;
 }
 default: {
  $$0 = 1478;
 }
 }
 _showerrormessage_18606_1689653243($$0);
 _exit(1);
 // unreachable;
}
function _copyString($0) {
 $0 = $0|0;
 var $$$i = 0, $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 0;
  return ($$0|0);
 }
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)>(-1);
 if (!($4)) {
  $$0 = $0;
  return ($$0|0);
 }
 $5 = HEAP32[$0>>2]|0;
 $6 = ($5|0)<(7);
 $$$i = $6 ? 7 : $5;
 $7 = (($$$i) + 9)|0;
 $8 = (_rawnewobj_57201_1689653243(39108,$7,4032)|0);
 $9 = ((($8)) + 4|0);
 HEAP32[$9>>2] = $$$i;
 $10 = HEAP32[$0>>2]|0;
 HEAP32[$8>>2] = $10;
 $11 = ((($8)) + 8|0);
 $12 = ((($0)) + 8|0);
 $13 = HEAP32[$0>>2]|0;
 $14 = (($13) + 1)|0;
 _memcpy(($11|0),($12|0),($14|0))|0;
 $$0 = $8;
 return ($$0|0);
}
function _newObj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_rawnewobj_57201_1689653243($0,$1,4032)|0);
 _memset(($2|0),0,($1|0))|0;
 return ($2|0);
}
function _rawNewString($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)<(7);
 $$ = $1 ? 7 : $0;
 $2 = (($$) + 9)|0;
 $3 = (_rawnewobj_57201_1689653243(39108,$2,4032)|0);
 _memset(($3|0),0,($2|0))|0;
 $4 = ((($3)) + 4|0);
 HEAP32[$4>>2] = $$;
 return ($3|0);
}
function _mnewString($0) {
 $0 = $0|0;
 var $$$i = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)<(7);
 $$$i = $1 ? 7 : $0;
 $2 = (($$$i) + 9)|0;
 $3 = (_rawnewobj_57201_1689653243(39108,$2,4032)|0);
 _memset(($3|0),0,($2|0))|0;
 $4 = ((($3)) + 4|0);
 HEAP32[$4>>2] = $$$i;
 HEAP32[$3>>2] = $0;
 return ($3|0);
}
function _growobj_63003_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$051 = 0, $$051$in = 0, $$052 = 0, $$idx$i = 0, $$idx$val$i = 0, $$idx25$i = 0, $$idx25$val$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (_stacksize_70801_1689653243()|0);
 $4 = ($3|0)>(31999);
 $5 = (($3|0) / 64)&-1;
 $6 = $4 ? $5 : 500;
 $7 = ((($2)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($6|0)>($8|0);
 if ($9) {
  $$idx$i = ((($2)) + 2112|0);
  $$idx$val$i = HEAP32[$$idx$i>>2]|0;
  $$idx25$i = ((($2)) + 2120|0);
  $$idx25$val$i = HEAP32[$$idx25$i>>2]|0;
  $10 = (($$idx$val$i) - ($$idx25$val$i))|0;
  $11 = ((($2)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($12|0)>($10|0);
  if (!($13)) {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $14 = ((($2)) + 48|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = ($15|0)==(0);
  if ($16) {
   _collectctbody_74409_1689653243($2);
  }
 }
 $17 = $0;
 $18 = (($17) + -8)|0;
 $19 = $18;
 $20 = ((($2)) + 52|0);
 $21 = (($1) + 8)|0;
 $22 = (_rawalloc_36404_1689653243($20,$21)|0);
 $23 = ((($19)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ((($24)) + 4|0);
 $26 = HEAP8[$25>>0]|0;
 $27 = ($26<<24>>24)==(28);
 if ($27) {
  $$052 = 1;
 } else {
  $28 = ((($24)) + 8|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = HEAP32[$29>>2]|0;
  $$052 = $30;
 }
 $31 = HEAP32[$0>>2]|0;
 $32 = Math_imul($31, $$052)|0;
 $33 = (($32) + 8)|0;
 $34 = $18;
 $35 = (($32) + 16)|0;
 _memcpy(($22|0),($34|0),($35|0))|0;
 $36 = $22;
 $37 = (($36) + 8)|0;
 $38 = (($37) + ($33))|0;
 $39 = $38;
 $40 = (($1) - ($33))|0;
 _memset(($39|0),0,($40|0))|0;
 $41 = HEAP32[$19>>2]|0;
 $42 = ($41>>>0)<(16);
 if (!($42)) {
  HEAP32[$22>>2] = 8;
  $52 = HEAP32[$19>>2]|0;
  $53 = (($52) + -8)|0;
  HEAP32[$19>>2] = $53;
  $54 = ($53>>>0)<(8);
  if (!($54)) {
   $55 = $37;
   return ($55|0);
  }
  _addzct_51217_1689653243((4044),$19);
  $55 = $37;
  return ($55|0);
 }
 $43 = $41 & 4;
 $44 = ($43|0)==(0);
 L17: do {
  if (!($44)) {
   $45 = HEAP32[$7>>2]|0;
   $46 = ((($2)) + 20|0);
   $47 = HEAP32[$46>>2]|0;
   $$051$in = $45;
   while(1) {
    $$051 = (($$051$in) + -1)|0;
    $48 = ($$051$in|0)>(0);
    if (!($48)) {
     break L17;
    }
    $49 = (($47) + ($$051<<2)|0);
    $50 = HEAP32[$49>>2]|0;
    $51 = ($50|0)==($19|0);
    if ($51) {
     break;
    } else {
     $$051$in = $$051;
    }
   }
   HEAP32[$49>>2] = $22;
  }
 } while(0);
 _rawdealloc_42817_1689653243($20,$34);
 $55 = $37;
 return ($55|0);
}
function _resizeString($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $$0 = 0, $$0$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP32[$0>>2]|0;
 $3 = (($2) + ($1))|0;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 2147483647;
 $7 = ($3|0)>($6|0);
 if (!($7)) {
  $$0 = $0;
  return ($$0|0);
 }
 $8 = ($6|0)==(0);
 do {
  if ($8) {
   $$0$i = 4;
  } else {
   $9 = ($6>>>0)<(65536);
   if ($9) {
    $10 = $6 << 1;
    $$0$i = $10;
    break;
   } else {
    $11 = ($6*3)|0;
    $12 = $11 >>> 1;
    $$0$i = $12;
    break;
   }
  }
 } while(0);
 $13 = ($$0$i|0)<($3|0);
 $$ = $13 ? $3 : $$0$i;
 $14 = (($$) + 9)|0;
 $15 = (_growobj_63003_1689653243($0,$14,4032)|0);
 $16 = ((($15)) + 4|0);
 HEAP32[$16>>2] = $$;
 $$0 = $15;
 return ($$0|0);
}
function _nimIntToStr($0) {
 $0 = $0|0;
 var $$$i$i = 0, $$0$i = 0, $$0$i$i$i = 0, $$049$neg = 0, $$04955 = 0, $$052 = 0, $$052$off = 0, $$053 = 0, $$154 = 0, $$pn = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0;
 var stop = 0;
 sp = STACKTOP;
 $1 = (_rawnewobj_57201_1689653243(39108,25,4032)|0);
 $2 = ((($1)) + 4|0);
 dest=$2; stop=dest+21|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 $3 = ((($1)) + 4|0);
 HEAP32[$3>>2] = 16;
 HEAP32[$1>>2] = 16;
 $$052 = $0;$$053 = 0;
 while(1) {
  $4 = (($$052|0) / 10)&-1;
  $5 = Math_imul($4, -10)|0;
  $6 = (($5) + ($$052))|0;
  $7 = ($6|0)>(0);
  $8 = (0 - ($6))|0;
  $9 = $7 ? $6 : $8;
  $10 = (($9) + 48)|0;
  $11 = $10&255;
  $12 = (((($1)) + 8|0) + ($$053)|0);
  HEAP8[$12>>0] = $11;
  $13 = (($$053) + 1)|0;
  $$052$off = (($$052) + 9)|0;
  $14 = ($$052$off>>>0)<(19);
  if ($14) {
   break;
  } else {
   $$052 = $4;$$053 = $13;
  }
 }
 $15 = ($0|0)<(0);
 if ($15) {
  $16 = (($$053) + 2)|0;
  $17 = (((($1)) + 8|0) + ($13)|0);
  HEAP8[$17>>0] = 45;
  $$154 = $16;
 } else {
  $$154 = $13;
 }
 $18 = ($$154|0)<(0);
 $19 = $18 ? 0 : $$154;
 $20 = HEAP32[$3>>2]|0;
 $21 = $20 & 2147483647;
 $22 = ($19|0)>($21|0);
 if ($22) {
  $23 = HEAP32[$1>>2]|0;
  $24 = (($23) + ($19))|0;
  $25 = ($24|0)>($21|0);
  if ($25) {
   $26 = ($21|0)==(0);
   do {
    if ($26) {
     $$0$i$i$i = 4;
    } else {
     $27 = ($21>>>0)<(65536);
     if ($27) {
      $28 = $21 << 1;
      $$0$i$i$i = $28;
      break;
     } else {
      $29 = ($21*3)|0;
      $30 = $29 >>> 1;
      $$0$i$i$i = $30;
      break;
     }
    }
   } while(0);
   $31 = ($$0$i$i$i|0)<($24|0);
   $$$i$i = $31 ? $24 : $$0$i$i$i;
   $32 = (($$$i$i) + 9)|0;
   $33 = (_growobj_63003_1689653243($1,$32,4032)|0);
   $34 = ((($33)) + 4|0);
   HEAP32[$34>>2] = $$$i$i;
   $$0$i = $33;
  } else {
   $$0$i = $1;
  }
 } else {
  $$0$i = $1;
 }
 HEAP32[$$0$i>>2] = $19;
 $35 = (((($$0$i)) + 8|0) + ($19)|0);
 HEAP8[$35>>0] = 0;
 $36 = (($$154|0) / 2)&-1;
 $37 = ($$154|0)>(1);
 $38 = (($$154) + -1)|0;
 if (!($37)) {
  return ($$0$i|0);
 }
 $39 = ((($$0$i)) + 8|0);
 $$04955 = 0;$$pn = $38;$43 = $39;
 while(1) {
  $40 = (((($$0$i)) + 8|0) + ($$pn)|0);
  $41 = (($$04955) + 1)|0;
  $42 = HEAP8[$43>>0]|0;
  $44 = HEAP8[$40>>0]|0;
  HEAP8[$43>>0] = $44;
  HEAP8[$40>>0] = $42;
  $45 = ($41|0)<($36|0);
  $46 = (((($$0$i)) + 8|0) + ($41)|0);
  $$049$neg = $$04955 ^ -1;
  $47 = (($38) + ($$049$neg))|0;
  if ($45) {
   $$04955 = $41;$$pn = $47;$43 = $46;
  } else {
   break;
  }
 }
 return ($$0$i|0);
}
function _addChar($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$i = 0, $$020 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & 2147483647;
 $5 = HEAP32[$0>>2]|0;
 $6 = ($4|0)>($5|0);
 if ($6) {
  $$020 = $0;$15 = $5;
 } else {
  $7 = ($4|0)==(0);
  do {
   if ($7) {
    $$0$i = 4;
   } else {
    $8 = ($4>>>0)<(65536);
    if ($8) {
     $9 = $4 << 1;
     $$0$i = $9;
     break;
    } else {
     $10 = ($4*3)|0;
     $11 = $10 >>> 1;
     $$0$i = $11;
     break;
    }
   }
  } while(0);
  HEAP32[$2>>2] = $$0$i;
  $12 = (($$0$i) + 9)|0;
  $13 = (_growobj_63003_1689653243($0,$12,4032)|0);
  $$pre = HEAP32[$13>>2]|0;
  $$020 = $13;$15 = $$pre;
 }
 $14 = (((($$020)) + 8|0) + ($15)|0);
 HEAP8[$14>>0] = $1;
 $16 = HEAP32[$$020>>2]|0;
 $17 = (($16) + 1)|0;
 $18 = (((($$020)) + 8|0) + ($17)|0);
 HEAP8[$18>>0] = 0;
 $19 = HEAP32[$$020>>2]|0;
 $20 = (($19) + 1)|0;
 HEAP32[$$020>>2] = $20;
 return ($$020|0);
}
function _reprEnum($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$$i = 0, $$$i$i$i = 0, $$$i$i$i59 = 0, $$051 = 0, $$068 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 12|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($1)) + 5|0);
 $5 = HEAP8[$4>>0]|0;
 $6 = $5 & 4;
 $7 = ($6<<24>>24)==(0);
 $8 = ((($3)) + 20|0);
 $9 = HEAP32[$8>>2]|0;
 L1: do {
  if ($7) {
   $10 = HEAP32[$9>>2]|0;
   $11 = ((($10)) + 4|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = (($0) - ($12))|0;
   $14 = ($13|0)<(0);
   if (!($14)) {
    $15 = ((($3)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($13>>>0)<($16>>>0);
    if ($17) {
     $18 = (($9) + ($13<<2)|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($19)) + 12|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($21|0)==(0|0);
     if ($22) {
      $$051 = 0;
      return ($$051|0);
     }
     $23 = (_strlen($21)|0);
     $24 = ($23|0)<(7);
     $$$i$i$i = $24 ? 7 : $23;
     $25 = (($$$i$i$i) + 9)|0;
     $26 = (_rawnewobj_57201_1689653243(39108,$25,4032)|0);
     $27 = ((($26)) + 4|0);
     HEAP32[$27>>2] = $$$i$i$i;
     HEAP32[$26>>2] = $23;
     $28 = ((($26)) + 8|0);
     $29 = (($23) + 1)|0;
     _memcpy(($28|0),($21|0),($29|0))|0;
     $$051 = $26;
     return ($$051|0);
    }
   }
  } else {
   $30 = ((($3)) + 16|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = ($31|0)>(0);
   if ($32) {
    $$068 = 0;
    while(1) {
     $35 = (($9) + ($$068<<2)|0);
     $36 = HEAP32[$35>>2]|0;
     $37 = ((($36)) + 4|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ($38|0)==($0|0);
     $34 = (($$068) + 1)|0;
     if ($39) {
      break;
     }
     $33 = ($34|0)<($31|0);
     if ($33) {
      $$068 = $34;
     } else {
      break L1;
     }
    }
    $40 = ((($36)) + 12|0);
    $41 = HEAP32[$40>>2]|0;
    $42 = ($41|0)==(0|0);
    if ($42) {
     $$051 = 0;
     return ($$051|0);
    }
    $43 = (_strlen($41)|0);
    $44 = ($43|0)<(7);
    $$$i$i$i59 = $44 ? 7 : $43;
    $45 = (($$$i$i$i59) + 9)|0;
    $46 = (_rawnewobj_57201_1689653243(39108,$45,4032)|0);
    $47 = ((($46)) + 4|0);
    HEAP32[$47>>2] = $$$i$i$i59;
    HEAP32[$46>>2] = $43;
    $48 = ((($46)) + 8|0);
    $49 = (($43) + 1)|0;
    _memcpy(($48|0),($41|0),($49|0))|0;
    $$051 = $46;
    return ($$051|0);
   }
  }
 } while(0);
 $50 = (_nimIntToStr($0)|0);
 $51 = HEAP32[$50>>2]|0;
 $52 = (($51) + 16)|0;
 $53 = ($52|0)<(7);
 $$$i = $53 ? 7 : $52;
 $54 = (($$$i) + 9)|0;
 $55 = (_rawnewobj_57201_1689653243(39108,$54,4032)|0);
 _memset(($55|0),0,($54|0))|0;
 $56 = ((($55)) + 4|0);
 HEAP32[$56>>2] = $$$i;
 $57 = HEAP32[$55>>2]|0;
 $58 = (((($55)) + 8|0) + ($57)|0);
 $59 = ((($50)) + 8|0);
 $60 = HEAP32[$50>>2]|0;
 $61 = (($60) + 1)|0;
 _memcpy(($58|0),($59|0),($61|0))|0;
 $62 = HEAP32[$50>>2]|0;
 $63 = HEAP32[$55>>2]|0;
 $64 = (($63) + ($62))|0;
 HEAP32[$55>>2] = $64;
 $65 = (((($55)) + 8|0) + ($64)|0);
 dest=$65; src=(480); stop=dest+17|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $66 = HEAP32[$55>>2]|0;
 $67 = (($66) + 16)|0;
 HEAP32[$55>>2] = $67;
 $$051 = $55;
 return ($$051|0);
}
function _add_10638_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$i$i = 0, $$020$i = 0, $$07 = 0, $$pre = 0, $$pre$i = 0, $$pre8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$1>>0]|0;
 $3 = ($2<<24>>24)==(0);
 if ($3) {
  return;
 }
 $$pre = HEAP32[$0>>2]|0;
 $$pre8 = HEAP32[$$pre>>2]|0;
 $$07 = 0;$19 = $2;$5 = $$pre;$9 = $$pre8;
 while(1) {
  $4 = ((($5)) + 4|0);
  $6 = HEAP32[$4>>2]|0;
  $7 = $6 & 2147483647;
  $8 = ($7|0)>($9|0);
  if ($8) {
   $$020$i = $5;$18 = $9;
  } else {
   $10 = ($7|0)==(0);
   do {
    if ($10) {
     $$0$i$i = 4;
    } else {
     $11 = ($7>>>0)<(65536);
     if ($11) {
      $12 = $7 << 1;
      $$0$i$i = $12;
      break;
     } else {
      $13 = ($7*3)|0;
      $14 = $13 >>> 1;
      $$0$i$i = $14;
      break;
     }
    }
   } while(0);
   HEAP32[$4>>2] = $$0$i$i;
   $15 = (($$0$i$i) + 9)|0;
   $16 = (_growobj_63003_1689653243($5,$15,4032)|0);
   $$pre$i = HEAP32[$16>>2]|0;
   $$020$i = $16;$18 = $$pre$i;
  }
  $17 = (((($$020$i)) + 8|0) + ($18)|0);
  HEAP8[$17>>0] = $19;
  $20 = HEAP32[$$020$i>>2]|0;
  $21 = (($20) + 1)|0;
  $22 = (((($$020$i)) + 8|0) + ($21)|0);
  HEAP8[$22>>0] = 0;
  $23 = HEAP32[$$020$i>>2]|0;
  $24 = (($23) + 1)|0;
  HEAP32[$$020$i>>2] = $24;
  HEAP32[$0>>2] = $$020$i;
  $25 = (($$07) + 1)|0;
  $26 = (($1) + ($25)|0);
  $27 = HEAP8[$26>>0]|0;
  $28 = ($27<<24>>24)==(0);
  if ($28) {
   break;
  } else {
   $$07 = $25;$19 = $27;$5 = $$020$i;$9 = $24;
  }
 }
 return;
}
function _isonstack_51611_1689653243($0) {
 $0 = $0|0;
 var $$ = 0, $$0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = 0;
 HEAP32[$1>>2] = $1;
 $2 = HEAP32[(4036)>>2]|0;
 $3 = HEAP32[$1>>2]|0;
 $4 = $0;
 $5 = ($2>>>0)<=($4>>>0);
 $6 = ($3>>>0)>=($0>>>0);
 $$ = $5 & $6;
 $$0 = $$&1;
 STACKTOP = sp;return ($$0|0);
}
function _unsureAsgnRef($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_isonstack_51611_1689653243($0)|0);
 $3 = ($2<<24>>24)==(0);
 if (!($3)) {
  HEAP32[$0>>2] = $1;
  return;
 }
 $4 = ($1|0)==(0|0);
 if (!($4)) {
  $5 = $1;
  $6 = (($5) + -8)|0;
  $7 = $6;
  $8 = HEAP32[$7>>2]|0;
  $9 = (($8) + 8)|0;
  HEAP32[$7>>2] = $9;
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10>>>0)>((4095)>>>0);
 if (!($11)) {
  HEAP32[$0>>2] = $1;
  return;
 }
 $12 = $10;
 $13 = (($12) + -8)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (($15) + -8)|0;
 HEAP32[$14>>2] = $16;
 $17 = ($16>>>0)<(8);
 if (!($17)) {
  HEAP32[$0>>2] = $1;
  return;
 }
 _addzct_51217_1689653243((4044),$14);
 HEAP32[$0>>2] = $1;
 return;
}
function _T1689653243_8($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $1&255;
 _dooperation_51618_1689653243($3,$4);
 $5 = ((($0)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 _dooperation_51618_1689653243($6,$4);
 $7 = ((($0)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 _dooperation_51618_1689653243($8,$4);
 return;
}
function _copyStringRC1($0) {
 $0 = $0|0;
 var $$ = 0, $$020 = 0, $$idx$val$i$i = 0, $$idx25$val$i$i = 0, $$old$i = 0, $$old13$i = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$020 = 0;
  return ($$020|0);
 }
 $2 = HEAP32[$0>>2]|0;
 $3 = ($2|0)<(7);
 $$ = $3 ? 7 : $2;
 $4 = (($$) + 9)|0;
 $5 = (_stacksize_70801_1689653243()|0);
 $6 = ($5|0)>(31999);
 $7 = (($5|0) / 64)&-1;
 $8 = $6 ? $7 : 500;
 $9 = HEAP32[(4044)>>2]|0;
 $10 = ($8|0)>($9|0);
 if ($10) {
  $$idx$val$i$i = HEAP32[(6144)>>2]|0;
  $$idx25$val$i$i = HEAP32[(6152)>>2]|0;
  $11 = (($$idx$val$i$i) - ($$idx25$val$i$i))|0;
  $12 = HEAP32[(4040)>>2]|0;
  $13 = ($12|0)<=($11|0);
  $14 = HEAP32[(4080)>>2]|0;
  $15 = ($14|0)==(0);
  $or$cond$i = $13 & $15;
  if ($or$cond$i) {
   label = 5;
  }
 } else {
  $$old$i = HEAP32[(4080)>>2]|0;
  $$old13$i = ($$old$i|0)==(0);
  if ($$old13$i) {
   label = 5;
  }
 }
 if ((label|0) == 5) {
  _collectctbody_74409_1689653243(4032);
 }
 $16 = (($$) + 17)|0;
 $17 = (_rawalloc_36404_1689653243((4084),$16)|0);
 $18 = ((($17)) + 4|0);
 HEAP32[$18>>2] = 39108;
 HEAP32[$17>>2] = 8;
 $19 = $17;
 $20 = (($19) + 8)|0;
 $21 = $20;
 _memset(($21|0),0,($4|0))|0;
 $22 = $20;
 $23 = ((($21)) + 4|0);
 HEAP32[$23>>2] = $$;
 $24 = HEAP32[$0>>2]|0;
 $25 = $20;
 HEAP32[$25>>2] = $24;
 $26 = ((($21)) + 8|0);
 $27 = ((($0)) + 8|0);
 $28 = HEAP32[$0>>2]|0;
 $29 = (($28) + 1)|0;
 _memcpy(($26|0),($27|0),($29|0))|0;
 $$020 = $22;
 return ($$020|0);
}
function _isobjslowpath_22936_1689653243($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$0$in = 0, $$010 = 0, $$pn = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$pn = $0;
 while(1) {
  $$0$in = ((($$pn)) + 8|0);
  $$0 = HEAP32[$$0$in>>2]|0;
  $3 = ($$0|0)==($1|0);
  if ($3) {
   label = 5;
   break;
  }
  $4 = ($$0|0)==(0|0);
  if ($4) {
   label = 4;
   break;
  } else {
   $$pn = $$0;
  }
 }
 if ((label|0) == 4) {
  HEAP32[$2>>2] = $0;
  $$010 = 0;
  return ($$010|0);
 }
 else if ((label|0) == 5) {
  $5 = ((($2)) + 4|0);
  HEAP32[$5>>2] = $0;
  $$010 = 1;
  return ($$010|0);
 }
 return (0)|0;
}
function _raiseexceptionaux_19801_1689653243($0) {
 $0 = $0|0;
 var $$045 = 0, $$152 = 0, $$2 = 0, $$3 = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $not$ = 0, $not$53 = 0, $phitmp = 0;
 var $phitmp48 = 0, $phitmp49 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2016|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2016|0);
 $1 = sp;
 $2 = HEAP32[9785]|0;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  $4 = (FUNCTION_TABLE_ii[$2 & 1]($0)|0);
  $not$ = ($4<<24>>24)==(0);
  if ($not$) {
   STACKTOP = sp;return;
  }
 }
 $5 = HEAP32[9786]|0;
 $6 = ($5|0)==(0|0);
 if (!($6)) {
  $7 = (FUNCTION_TABLE_ii[$5 & 1]($0)|0);
  $not$53 = ($7<<24>>24)==(0);
  if ($not$53) {
   STACKTOP = sp;return;
  }
 }
 $8 = HEAP32[9787]|0;
 $9 = ($8|0)==(0|0);
 if (!($9)) {
  $10 = ((($8)) + 164|0);
  $11 = HEAP8[$10>>0]|0;
  $12 = ($11<<24>>24)==(0);
  $13 = $12&1;
  do {
   if ($12) {
    $$045 = $13;
   } else {
    $14 = ((($8)) + 172|0);
    $15 = HEAP32[$14>>2]|0;
    $16 = ($15|0)==(0|0);
    $17 = ((($8)) + 168|0);
    $18 = HEAP32[$17>>2]|0;
    if ($16) {
     $20 = (FUNCTION_TABLE_ii[$18 & 1]($0)|0);
     $$045 = $20;
     break;
    } else {
     $19 = (FUNCTION_TABLE_iii[$18 & 15]($0,$15)|0);
     $$045 = $19;
     break;
    }
   }
  } while(0);
  $21 = ($$045<<24>>24)==(0);
  if ($21) {
   STACKTOP = sp;return;
  }
  $22 = ((($0)) + 4|0);
  $23 = HEAP32[2774]|0;
  $24 = ($23|0)==(0|0);
  if (!($24)) {
   $25 = $23;
   $26 = (($25) + -8)|0;
   $27 = $26;
   $28 = HEAP32[$27>>2]|0;
   $29 = (($28) + 8)|0;
   HEAP32[$27>>2] = $29;
  }
  $30 = HEAP32[$22>>2]|0;
  $31 = ($30|0)==(0|0);
  if ($31) {
   $44 = $23;
  } else {
   $32 = $30;
   $33 = (($32) + -8)|0;
   $34 = $33;
   $35 = HEAP32[$34>>2]|0;
   $36 = (($35) + -8)|0;
   HEAP32[$34>>2] = $36;
   $37 = ($36>>>0)<(8);
   if ($37) {
    _addzct_51217_1689653243((4044),$34);
    $$pre = HEAP32[2774]|0;
    $44 = $$pre;
   } else {
    $44 = $23;
   }
  }
  HEAP32[$22>>2] = $23;
  $38 = $0;
  $39 = (($38) + -8)|0;
  $40 = $39;
  $41 = HEAP32[$40>>2]|0;
  $42 = (($41) + 8)|0;
  HEAP32[$40>>2] = $42;
  $43 = ($44|0)==(0|0);
  if ($43) {
   HEAP32[2774] = $0;
   $51 = HEAP32[9787]|0;
   $52 = ((($51)) + 8|0);
   _longjmp(($52|0),1);
   // unreachable;
  }
  $45 = $44;
  $46 = (($45) + -8)|0;
  $47 = $46;
  $48 = HEAP32[$47>>2]|0;
  $49 = (($48) + -8)|0;
  HEAP32[$47>>2] = $49;
  $50 = ($49>>>0)<(8);
  if (!($50)) {
   HEAP32[2774] = $0;
   $51 = HEAP32[9787]|0;
   $52 = ((($51)) + 8|0);
   _longjmp(($52|0),1);
   // unreachable;
  }
  _addzct_51217_1689653243((4044),$47);
  HEAP32[2774] = $0;
  $51 = HEAP32[9787]|0;
  $52 = ((($51)) + 8|0);
  _longjmp(($52|0),1);
  // unreachable;
 }
 $53 = HEAP32[$0>>2]|0;
 $54 = ($53|0)==(39152|0);
 if ($54) {
  $64 = ((($0)) + 8|0);
  $65 = HEAP32[$64>>2]|0;
  _showerrormessage_18606_1689653243($65);
  _quitordebug_19604_1689653243();
  // unreachable;
 }
 $55 = ((($53)) + 8|0);
 $56 = HEAP32[$55>>2]|0;
 $57 = ($56|0)==(39152|0);
 if ($57) {
  $64 = ((($0)) + 8|0);
  $65 = HEAP32[$64>>2]|0;
  _showerrormessage_18606_1689653243($65);
  _quitordebug_19604_1689653243();
  // unreachable;
 }
 $58 = HEAP32[9878]|0;
 $59 = ($58|0)==($53|0);
 if (!($59)) {
  $60 = HEAP32[(39516)>>2]|0;
  $61 = ($60|0)==($53|0);
  if ($61) {
   $64 = ((($0)) + 8|0);
   $65 = HEAP32[$64>>2]|0;
   _showerrormessage_18606_1689653243($65);
   _quitordebug_19604_1689653243();
   // unreachable;
  }
  $62 = (_isobjslowpath_22936_1689653243($53,39152,39512)|0);
  $63 = ($62<<24>>24)==(0);
  if (!($63)) {
   $64 = ((($0)) + 8|0);
   $65 = HEAP32[$64>>2]|0;
   _showerrormessage_18606_1689653243($65);
   _quitordebug_19604_1689653243();
   // unreachable;
  }
 }
 $66 = ((($1)) + 28|0);
 _memset(($66|0),0,1973)|0;
 dest=$1; src=1526; stop=dest+28|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 $67 = ((($0)) + 12|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = ($68|0)==(0|0);
 if ($69) {
  $$152 = 28;$92 = 30;
  label = 29;
 } else {
  $70 = HEAP32[$68>>2]|0;
  $phitmp = (($70) + 28)|0;
  $phitmp48 = ($phitmp|0)<(2000);
  if ($phitmp48) {
   $71 = ((($1)) + 28|0);
   $72 = ((($68)) + 8|0);
   _memcpy(($71|0),($72|0),($70|0))|0;
   $73 = HEAP32[$68>>2]|0;
   $phitmp49 = (($73) + 28)|0;
   $74 = (($73) + 30)|0;
   $75 = ($74|0)<(2000);
   if ($75) {
    $$152 = $phitmp49;$92 = $74;
    label = 29;
   } else {
    $$2 = $phitmp49;
   }
  } else {
   $$152 = 28;$92 = 30;
   label = 29;
  }
 }
 if ((label|0) == 29) {
  $76 = (($1) + ($$152)|0);
  HEAP8[$76>>0]=23328&255;HEAP8[$76+1>>0]=23328>>8;
  $$2 = $92;
 }
 $77 = ((($0)) + 8|0);
 $78 = HEAP32[$77>>2]|0;
 $79 = ($78|0)==(0|0);
 if ($79) {
  $82 = 0;
 } else {
  $80 = (_strlen($78)|0);
  $82 = $80;
 }
 $81 = (($82) + ($$2))|0;
 $83 = ($81|0)<(2000);
 if ($83) {
  if ($79) {
   $88 = 0;
  } else {
   $84 = (($1) + ($$2)|0);
   $85 = (_strlen($78)|0);
   _memcpy(($84|0),($78|0),($85|0))|0;
   $86 = (_strlen($78)|0);
   $88 = $86;
  }
  $87 = (($88) + ($$2))|0;
  $$3 = $87;
 } else {
  $$3 = $$2;
 }
 $89 = (($$3) + 2)|0;
 $90 = ($89|0)<(2000);
 if (!($90)) {
  _showerrormessage_18606_1689653243($1);
  _quitordebug_19604_1689653243();
  // unreachable;
 }
 $91 = (($1) + ($$3)|0);
 HEAP8[$91>>0]=2653&255;HEAP8[$91+1>>0]=2653>>8;
 _showerrormessage_18606_1689653243($1);
 _quitordebug_19604_1689653243();
 // unreachable;
}
function _quitordebug_19604_1689653243() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _exit(1);
 // unreachable;
}
function _raiseOverflow() {
 var $$058$i$i = 0, $$1$i1$i = 0, $$idx$val$i$i$i$i = 0, $$idx25$val$i$i$i$i = 0, $$old$i$i$i = 0, $$old13$i$i$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond$i$i$i = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 $0 = (_rawnewobj_57201_1689653243(39432,20,4032)|0);
 $1 = ((($0)) + 4|0);
 dest=$1; stop=dest+16|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 HEAP32[$0>>2] = 39404;
 $2 = ((($0)) + 12|0);
 $3 = (_stacksize_70801_1689653243()|0);
 $4 = ($3|0)>(31999);
 $5 = (($3|0) / 64)&-1;
 $6 = $4 ? $5 : 500;
 $7 = HEAP32[(4044)>>2]|0;
 $8 = ($6|0)>($7|0);
 if ($8) {
  $$idx$val$i$i$i$i = HEAP32[(6144)>>2]|0;
  $$idx25$val$i$i$i$i = HEAP32[(6152)>>2]|0;
  $9 = (($$idx$val$i$i$i$i) - ($$idx25$val$i$i$i$i))|0;
  $10 = HEAP32[(4040)>>2]|0;
  $11 = ($10|0)<=($9|0);
  $12 = HEAP32[(4080)>>2]|0;
  $13 = ($12|0)==(0);
  $or$cond$i$i$i = $11 & $13;
  if ($or$cond$i$i$i) {
   label = 4;
  }
 } else {
  $$old$i$i$i = HEAP32[(4080)>>2]|0;
  $$old13$i$i$i = ($$old$i$i$i|0)==(0);
  if ($$old13$i$i$i) {
   label = 4;
  }
 }
 if ((label|0) == 4) {
  _collectctbody_74409_1689653243(4032);
 }
 $14 = HEAP32[(4112)>>2]|0;
 $15 = ($14|0)==(0|0);
 if ($15) {
  $16 = (_getbigchunk_35014_1689653243((4084),4096)|0);
  $17 = ((($16)) + 20|0);
  HEAP32[$17>>2] = 0;
  $18 = ((($16)) + 4|0);
  HEAP32[$18>>2] = 40;
  $19 = ((($16)) + 28|0);
  HEAP32[$19>>2] = 40;
  $20 = ((($16)) + 24|0);
  HEAP32[$20>>2] = 4024;
  $21 = ((($16)) + 12|0);
  HEAP32[$21>>2] = 0;
  $22 = ((($16)) + 16|0);
  HEAP32[$22>>2] = 0;
  $23 = HEAP32[(4112)>>2]|0;
  HEAP32[$21>>2] = $23;
  $24 = HEAP32[(4112)>>2]|0;
  $25 = ($24|0)==(0|0);
  if (!($25)) {
   $26 = ((($24)) + 16|0);
   HEAP32[$26>>2] = $16;
  }
  HEAP32[(4112)>>2] = $16;
  $27 = ((($16)) + 32|0);
  $$1$i1$i = $27;
 } else {
  $28 = ((($14)) + 20|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = ($29|0)==(0|0);
  if ($30) {
   $31 = ((($14)) + 32|0);
   $32 = $31;
   $33 = ((($14)) + 28|0);
   $34 = HEAP32[$33>>2]|0;
   $35 = (($34) + ($32))|0;
   $36 = $35;
   $37 = (($34) + 40)|0;
   HEAP32[$33>>2] = $37;
   $$058$i$i = $36;
  } else {
   $38 = HEAP32[$29>>2]|0;
   HEAP32[$28>>2] = $38;
   $$058$i$i = $29;
  }
  $39 = ((($14)) + 24|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = (($40) + -40)|0;
  HEAP32[$39>>2] = $41;
  $42 = ($41|0)<(40);
  if ($42) {
   $43 = HEAP32[(4112)>>2]|0;
   $44 = ($43|0)==($14|0);
   $45 = ((($14)) + 12|0);
   $46 = HEAP32[$45>>2]|0;
   if ($44) {
    HEAP32[(4112)>>2] = $46;
    $47 = ($46|0)==(0|0);
    if (!($47)) {
     $48 = ((($46)) + 16|0);
     HEAP32[$48>>2] = 0;
    }
   } else {
    $49 = ((($14)) + 16|0);
    $50 = HEAP32[$49>>2]|0;
    $51 = ((($50)) + 12|0);
    HEAP32[$51>>2] = $46;
    $52 = HEAP32[$45>>2]|0;
    $53 = ($52|0)==(0|0);
    if (!($53)) {
     $54 = $50;
     $55 = ((($52)) + 16|0);
     HEAP32[$55>>2] = $54;
    }
   }
   HEAP32[$45>>2] = 0;
   $56 = ((($14)) + 16|0);
   HEAP32[$56>>2] = 0;
   $$1$i1$i = $$058$i$i;
  } else {
   $$1$i1$i = $$058$i$i;
  }
 }
 $57 = ((($$1$i1$i)) + 4|0);
 HEAP32[$57>>2] = 39108;
 HEAP32[$$1$i1$i>>2] = 8;
 $58 = $$1$i1$i;
 $59 = (($58) + 8)|0;
 $60 = $59;
 dest=$60; stop=dest+27|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 $61 = $59;
 $62 = ((($60)) + 4|0);
 HEAP32[$62>>2] = 18;
 $63 = $59;
 HEAP32[$63>>2] = 18;
 $64 = ((($60)) + 8|0);
 dest=$64; src=(508); stop=dest+19|0; do { HEAP8[dest>>0]=HEAP8[src>>0]|0; dest=dest+1|0; src=src+1|0; } while ((dest|0) < (stop|0));
 HEAP32[$2>>2] = $61;
 $65 = ((($0)) + 8|0);
 HEAP32[$65>>2] = 1555;
 _raiseexceptionaux_19801_1689653243($0);
 // unreachable;
}
function _newSeq($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0.0, $12 = 0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0.0, $7 = 0.0, $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 8|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$3>>2]|0;
 $5 = Math_imul($4, $1)|0;
 $6 = (+($1|0));
 $7 = (+($4|0));
 $8 = $6 * $7;
 $9 = (+($5|0));
 $10 = $9 == $8;
 if (!($10)) {
  $11 = $9 - $8;
  $12 = $11 > 0.0;
  $13 = -$11;
  $14 = $12 ? $11 : $13;
  $15 = $14 * 32.0;
  $16 = $8 > 0.0;
  $17 = -$8;
  $18 = $16 ? $8 : $17;
  $19 = !($15 <= $18);
  if ($19) {
   _raiseOverflow();
   // unreachable;
  }
 }
 $20 = (($5) + 8)|0;
 $21 = $5 ^ -2147483648;
 $22 = $20 & $21;
 $23 = ($22|0)<(0);
 if ($23) {
  _raiseOverflow();
  // unreachable;
 } else {
  $24 = (_rawnewobj_57201_1689653243($0,$20,4032)|0);
  _memset(($24|0),0,($20|0))|0;
  HEAP32[$24>>2] = $1;
  $25 = ((($24)) + 4|0);
  HEAP32[$25>>2] = $1;
  return ($24|0);
 }
 return (0)|0;
}
function _newseq_125083_1689653243($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0, $15 = 0.0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0.0, $5 = 0.0, $6 = 0.0;
 var $7 = 0.0, $8 = 0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[(10828)>>2]|0;
 $2 = HEAP32[$1>>2]|0;
 $3 = Math_imul($2, $0)|0;
 $4 = (+($0|0));
 $5 = (+($2|0));
 $6 = $4 * $5;
 $7 = (+($3|0));
 $8 = $7 == $6;
 if (!($8)) {
  $9 = $7 - $6;
  $10 = $9 > 0.0;
  $11 = -$9;
  $12 = $10 ? $9 : $11;
  $13 = $12 * 32.0;
  $14 = $6 > 0.0;
  $15 = -$6;
  $16 = $14 ? $6 : $15;
  $17 = !($13 <= $16);
  if ($17) {
   _raiseOverflow();
   // unreachable;
  }
 }
 $18 = (($3) + 8)|0;
 $19 = $3 ^ -2147483648;
 $20 = $18 & $19;
 $21 = ($20|0)<(0);
 if ($21) {
  _raiseOverflow();
  // unreachable;
 } else {
  $22 = (_rawnewobj_57201_1689653243(10820,$18,4032)|0);
  _memset(($22|0),0,($18|0))|0;
  HEAP32[$22>>2] = $0;
  $23 = ((($22)) + 4|0);
  HEAP32[$23>>2] = $0;
  return ($22|0);
 }
 return (0)|0;
}
function _incrSeqV2($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0$i = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & 2147483647;
 $5 = HEAP32[$0>>2]|0;
 $6 = ($4|0)>($5|0);
 if ($6) {
  $$015 = $0;
  return ($$015|0);
 }
 $7 = ($4|0)==(0);
 do {
  if ($7) {
   $$0$i = 4;
  } else {
   $8 = ($4>>>0)<(65536);
   if ($8) {
    $9 = $4 << 1;
    $$0$i = $9;
    break;
   } else {
    $10 = ($4*3)|0;
    $11 = $10 >>> 1;
    $$0$i = $11;
    break;
   }
  }
 } while(0);
 HEAP32[$2>>2] = $$0$i;
 $12 = Math_imul($$0$i, $1)|0;
 $13 = (($12) + 8)|0;
 $14 = (_growobj_63003_1689653243($0,$13,4032)|0);
 $$015 = $14;
 return ($$015|0);
}
function _cmp_125146_1689653243($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==($1|0);
 $3 = ($0|0)<($1|0);
 $$ = $3 ? -1 : 1;
 $$0 = $2 ? 0 : $$;
 return ($$0|0);
}
function _systemInit000() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = sp;
 $1 = HEAP32[2775]|0;
 $2 = ($1|0)<(7001);
 if ($2) {
  $4 = (11104 + ($1<<2)|0);
  HEAP32[$4>>2] = 12;
  $5 = (($1) + 1)|0;
  HEAP32[2775] = $5;
  HEAP8[42472] = 0;
  HEAP32[9777] = 4;
  HEAP8[(39112)>>0] = 28;
  HEAP8[(39113)>>0] = 2;
  dest=(39114); stop=dest+22|0; do { HEAP16[dest>>1]=0|0; dest=dest+2|0; } while ((dest|0) < (stop|0));
  HEAP32[2773] = 39492;
  HEAP32[9873] = 39492;
  HEAP32[(39496)>>2] = 39492;
  HEAP32[$0>>2] = 0;
  HEAP32[$0>>2] = $0;
  $6 = HEAP32[$0>>2]|0;
  _setStackBottom($6);
  _initgc_12201_1689653243();
  (_signal(2,(13|0))|0);
  (_signal(11,(13|0))|0);
  (_signal(6,(13|0))|0);
  (_signal(8,(13|0))|0);
  (_signal(4,(13|0))|0);
  (_signal(11,(13|0))|0);
  (_signal(13,(13|0))|0);
  STACKTOP = sp;return;
 } else {
  (_puts((408))|0);
  $3 = HEAP32[165]|0;
  (_fflush($3)|0);
  _exit(1);
  // unreachable;
 }
}
function _systemDatInit000() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[9795] = 4;
 HEAP8[(39184)>>0] = 17;
 HEAP32[(39188)>>2] = 0;
 HEAP8[(39185)>>0] = 1;
 HEAP32[(39536)>>2] = 0;
 HEAP8[39520] = 2;
 HEAP32[(39192)>>2] = 39520;
 HEAP32[9802] = 20;
 HEAP8[(39212)>>0] = 17;
 HEAP32[(39216)>>2] = 39180;
 HEAP32[9940] = (39568);
 HEAP8[(39568)>>0] = 1;
 HEAP32[(39572)>>2] = 4;
 HEAP32[(39576)>>2] = 39236;
 HEAP32[(39580)>>2] = 1569;
 HEAP32[(39764)>>2] = (39592);
 HEAP32[9816] = 4;
 HEAP8[(39268)>>0] = 29;
 HEAP32[(39272)>>2] = 0;
 HEAP8[(39269)>>0] = 3;
 HEAP8[(39592)>>0] = 1;
 HEAP32[(39596)>>2] = 8;
 HEAP32[(39600)>>2] = 39264;
 HEAP32[(39604)>>2] = 1576;
 HEAP32[(39768)>>2] = (39616);
 HEAP32[9823] = 4;
 HEAP8[(39296)>>0] = 28;
 HEAP32[(39300)>>2] = 0;
 HEAP8[(39297)>>0] = 2;
 HEAP8[(39616)>>0] = 1;
 HEAP32[(39620)>>2] = 12;
 HEAP32[(39624)>>2] = 39292;
 HEAP32[(39628)>>2] = 1581;
 HEAP32[(39772)>>2] = (39640);
 HEAP8[(39640)>>0] = 1;
 HEAP32[(39644)>>2] = 16;
 HEAP32[(39648)>>2] = 39292;
 HEAP32[(39652)>>2] = 1585;
 HEAP32[(39560)>>2] = 4;
 HEAP8[(39544)>>0] = 2;
 HEAP32[(39564)>>2] = 39760;
 HEAP32[(39220)>>2] = (39544);
 HEAP32[9809] = 4;
 HEAP8[(39240)>>0] = 22;
 HEAP32[(39244)>>2] = 39208;
 HEAP32[(39256)>>2] = 14;
 HEAP32[9830] = 4;
 HEAP8[(39324)>>0] = 31;
 HEAP32[(39328)>>2] = 0;
 HEAP8[(39325)>>0] = 3;
 HEAP32[9837] = 1;
 HEAP8[(39352)>>0] = 1;
 HEAP32[(39356)>>2] = 0;
 HEAP8[(39353)>>0] = 3;
 HEAP32[9844] = 20;
 HEAP8[(39380)>>0] = 17;
 HEAP32[(39384)>>2] = 39208;
 HEAP32[(39680)>>2] = 0;
 HEAP8[(39664)>>0] = 2;
 HEAP32[(39388)>>2] = (39664);
 HEAP32[9851] = 20;
 HEAP8[(39408)>>0] = 17;
 HEAP32[(39412)>>2] = 39376;
 HEAP32[(39704)>>2] = 0;
 HEAP8[(39688)>>0] = 2;
 HEAP32[(39416)>>2] = (39688);
 HEAP32[9858] = 4;
 HEAP8[(39436)>>0] = 22;
 HEAP32[(39440)>>2] = 39404;
 HEAP32[(39452)>>2] = 15;
 HEAP32[9865] = 20;
 HEAP8[(39464)>>0] = 17;
 HEAP32[(39468)>>2] = 39208;
 HEAP32[(39728)>>2] = 0;
 HEAP8[(39712)>>0] = 2;
 HEAP32[(39472)>>2] = (39712);
 HEAP32[9788] = 20;
 HEAP8[(39156)>>0] = 17;
 HEAP32[(39160)>>2] = 39460;
 HEAP32[(39752)>>2] = 0;
 HEAP8[(39736)>>0] = 2;
 HEAP32[(39164)>>2] = (39736);
 return;
}
function _loop_143006_901127608() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0.0, $19 = 0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _clear_134038_1183121033(39776);
 $0 = (_getdata_126643_3248314680()|0);
 $1 = HEAP32[10460]|0;
 $2 = (($1|0) % 2)&-1;
 $3 = ($2|0)==(1);
 if ($3) {
  _clear_124496_1295010462(41844);
  _render_126695_3248314680($0,41844);
  $4 = HEAP32[10461]|0;
  $5 = HEAP32[10470]|0;
  _diff_138757_1183121033(39776,$4,$5);
 } else {
  _clear_124496_1295010462(41880);
  _render_126695_3248314680($0,41880);
  $6 = HEAP32[10470]|0;
  $7 = HEAP32[10461]|0;
  _diff_138757_1183121033(39776,$6,$7);
 }
 _done_138896_1183121033(39776);
 $8 = HEAP32[(41832)>>2]|0;
 _JSrender(($8|0));
 $9 = HEAP32[(4080)>>2]|0;
 $10 = ($9|0)>(0);
 if ($10) {
  $11 = (($9) + -1)|0;
  HEAP32[(4080)>>2] = $11;
 }
 (_mnewString(0)|0);
 $12 = HEAP32[(4080)>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[(4080)>>2] = $13;
 $14 = HEAP32[10460]|0;
 $15 = (($14) + 1)|0;
 HEAP32[10460] = $15;
 $16 = (($15|0) % 1000)&-1;
 $17 = ($16|0)==(0);
 if (!($17)) {
  STACKTOP = sp;return;
 }
 $18 = (+_ntcpuTime());
 $19 = HEAP32[10460]|0;
 $20 = (+($19|0));
 $21 = +HEAPF64[909];
 $22 = $18 - $21;
 $23 = $20 / $22;
 $24 = (_nsuformatFloat($23,1,2,46)|0);
 $25 = ($24|0)!=(0|0);
 $26 = ((($24)) + 8|0);
 $27 = $25 ? $26 : 1591;
 HEAP32[$vararg_buffer>>2] = (536);
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $27;
 (_printf(1595,$vararg_buffer)|0);
 $28 = HEAP32[165]|0;
 (_fflush($28)|0);
 STACKTOP = sp;return;
}
function _PreMainInner() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _systemInit000();
 _unknown_htmltagsDatInit000();
 _unknown_dbmonsterDatInit000();
 _unknown_domInit000();
 _unknown_dbmonsterInit000();
 _stdlib_timesInit000();
 _unknown_bytesInit000();
 return;
}
function _NimMainInner() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _uiInit000();
 return;
}
function _uiInit000() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0.0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 2144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(2144|0);
 $0 = sp + 2100|0;
 $1 = sp + 2064|0;
 $2 = sp;
 $3 = HEAP32[(4080)>>2]|0;
 $4 = (($3) + 1)|0;
 HEAP32[(4080)>>2] = $4;
 _initdombuilder_124460_1295010462($0);
 dest=41880; src=$0; stop=dest+36|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 _initdombuilder_124460_1295010462($1);
 dest=41844; src=$1; stop=dest+36|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 _initpatch_134031_1183121033($2);
 _memcpy((39776|0),($2|0),2064)|0;
 HEAP32[10460] = 0;
 $5 = (+_ntcpuTime());
 HEAPF64[909] = $5;
 _emscripten_set_main_loop((16|0),60,1);
 STACKTOP = sp;return;
}
function _main($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp + 4|0;
 $4 = sp;
 HEAP32[10479] = $1;
 HEAP32[10480] = $0;
 HEAP32[10481] = $2;
 _systemDatInit000();
 HEAP32[$3>>2] = 17;
 _setStackBottom($3);
 $5 = HEAP32[$3>>2]|0;
 FUNCTION_TABLE_v[$5 & 31]();
 HEAP32[$4>>2] = 18;
 _setStackBottom($4);
 $6 = HEAP32[$4>>2]|0;
 FUNCTION_TABLE_v[$6 & 31]();
 $7 = HEAP32[9872]|0;
 STACKTOP = sp;return ($7|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 HEAP32[$vararg_buffer>>2] = $2;
 $3 = (___syscall6(6,($vararg_buffer|0))|0);
 $4 = (___syscall_ret($3)|0);
 STACKTOP = sp;return ($4|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$056 = 0, $$058 = 0, $$059 = 0, $$061 = 0, $$1 = 0, $$157 = 0, $$160 = 0, $$phi$trans$insert = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = ((($0)) + 44|0);
 $$056 = 2;$$058 = $12;$$059 = $3;
 while(1) {
  $15 = HEAP32[10482]|0;
  $16 = ($15|0)==(0|0);
  if ($16) {
   $20 = HEAP32[$13>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $20;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $$059;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $$056;
   $21 = (___syscall146(146,($vararg_buffer3|0))|0);
   $22 = (___syscall_ret($21)|0);
   $$0 = $22;
  } else {
   _pthread_cleanup_push((19|0),($0|0));
   $17 = HEAP32[$13>>2]|0;
   HEAP32[$vararg_buffer>>2] = $17;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $$059;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $$056;
   $18 = (___syscall146(146,($vararg_buffer|0))|0);
   $19 = (___syscall_ret($18)|0);
   _pthread_cleanup_pop(0);
   $$0 = $19;
  }
  $23 = ($$058|0)==($$0|0);
  if ($23) {
   label = 6;
   break;
  }
  $30 = ($$0|0)<(0);
  if ($30) {
   label = 8;
   break;
  }
  $38 = (($$058) - ($$0))|0;
  $39 = ((($$059)) + 4|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = ($$0>>>0)>($40>>>0);
  if ($41) {
   $42 = HEAP32[$14>>2]|0;
   HEAP32[$4>>2] = $42;
   HEAP32[$7>>2] = $42;
   $43 = (($$0) - ($40))|0;
   $44 = ((($$059)) + 8|0);
   $45 = (($$056) + -1)|0;
   $$phi$trans$insert = ((($$059)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $$1 = $43;$$157 = $45;$$160 = $44;$53 = $$pre;
  } else {
   $46 = ($$056|0)==(2);
   if ($46) {
    $47 = HEAP32[$4>>2]|0;
    $48 = (($47) + ($$0)|0);
    HEAP32[$4>>2] = $48;
    $$1 = $$0;$$157 = 2;$$160 = $$059;$53 = $40;
   } else {
    $$1 = $$0;$$157 = $$056;$$160 = $$059;$53 = $40;
   }
  }
  $49 = HEAP32[$$160>>2]|0;
  $50 = (($49) + ($$1)|0);
  HEAP32[$$160>>2] = $50;
  $51 = ((($$160)) + 4|0);
  $52 = (($53) - ($$1))|0;
  HEAP32[$51>>2] = $52;
  $$056 = $$157;$$058 = $38;$$059 = $$160;
 }
 if ((label|0) == 6) {
  $24 = HEAP32[$14>>2]|0;
  $25 = ((($0)) + 48|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = (($24) + ($26)|0);
  $28 = ((($0)) + 16|0);
  HEAP32[$28>>2] = $27;
  $29 = $24;
  HEAP32[$4>>2] = $29;
  HEAP32[$7>>2] = $29;
  $$061 = $2;
 }
 else if ((label|0) == 8) {
  $31 = ((($0)) + 16|0);
  HEAP32[$31>>2] = 0;
  HEAP32[$4>>2] = 0;
  HEAP32[$7>>2] = 0;
  $32 = HEAP32[$0>>2]|0;
  $33 = $32 | 32;
  HEAP32[$0>>2] = $33;
  $34 = ($$056|0)==(2);
  if ($34) {
   $$061 = 0;
  } else {
   $35 = ((($$059)) + 4|0);
   $36 = HEAP32[$35>>2]|0;
   $37 = (($2) - ($36))|0;
   $$061 = $37;
  }
 }
 STACKTOP = sp;return ($$061|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $3;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $6 = (___syscall140(140,($vararg_buffer|0))|0);
 $7 = (___syscall_ret($6)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  HEAP32[$3>>2] = -1;
  $9 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $9 = $$pre;
 }
 STACKTOP = sp;return ($9|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[10482]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 41972;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function _cleanup_387($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 68|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0);
 if ($3) {
  ___unlockfile($0);
 }
 return;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $vararg_buffer = sp;
 $3 = sp + 12|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 2;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $3;
  $10 = (___syscall54(54,($vararg_buffer|0))|0);
  $11 = ($10|0)==(0);
  if (!($11)) {
   $12 = ((($0)) + 75|0);
   HEAP8[$12>>0] = -1;
  }
 }
 $13 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($13|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _sprintf($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 HEAP32[$2>>2] = $varargs;
 $3 = (_vsprintf($0,$1,$2)|0);
 STACKTOP = sp;return ($3|0);
}
function _vsprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (_vsnprintf($0,2147483647,$1,$2)|0);
 return ($3|0);
}
function _vsnprintf($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $4 = sp + 112|0;
 $5 = sp;
 dest=$5; src=780; stop=dest+112|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $6 = (($1) + -1)|0;
 $7 = ($6>>>0)>(2147483646);
 if ($7) {
  $8 = ($1|0)==(0);
  if ($8) {
   $$014 = $4;$$015 = 1;
   label = 4;
  } else {
   $9 = (___errno_location()|0);
   HEAP32[$9>>2] = 75;
   $$0 = -1;
  }
 } else {
  $$014 = $0;$$015 = $1;
  label = 4;
 }
 if ((label|0) == 4) {
  $10 = $$014;
  $11 = (-2 - ($10))|0;
  $12 = ($$015>>>0)>($11>>>0);
  $$$015 = $12 ? $11 : $$015;
  $13 = ((($5)) + 48|0);
  HEAP32[$13>>2] = $$$015;
  $14 = ((($5)) + 20|0);
  HEAP32[$14>>2] = $$014;
  $15 = ((($5)) + 44|0);
  HEAP32[$15>>2] = $$014;
  $16 = (($$014) + ($$$015)|0);
  $17 = ((($5)) + 16|0);
  HEAP32[$17>>2] = $16;
  $18 = ((($5)) + 28|0);
  HEAP32[$18>>2] = $16;
  $19 = (_vfprintf($5,$2,$3)|0);
  $20 = ($$$015|0)==(0);
  if ($20) {
   $$0 = $19;
  } else {
   $21 = HEAP32[$14>>2]|0;
   $22 = HEAP32[$17>>2]|0;
   $23 = ($21|0)==($22|0);
   $24 = $23 << 31 >> 31;
   $25 = (($21) + ($24)|0);
   HEAP8[$25>>0] = 0;
   $$0 = $19;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 7]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$3484$i = 0, $$$3484705$i = 0, $$$3484706$i = 0, $$$3501$i = 0, $$$4266 = 0, $$$4502$i = 0, $$$5 = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$lcssa$i300 = 0, $$0228 = 0, $$0229396 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0;
 var $$0240$lcssa = 0, $$0240$lcssa460 = 0, $$0240395 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249383 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$ = 0, $$0259 = 0, $$0262342 = 0, $$0262390 = 0, $$0269 = 0, $$0269$phi = 0, $$0321 = 0, $$0463$lcssa$i = 0, $$0463594$i = 0, $$0464603$i = 0;
 var $$0466$i = 0.0, $$0470$i = 0, $$0471$i = 0.0, $$0479$i = 0, $$0487652$i = 0, $$0488$i = 0, $$0488663$i = 0, $$0488665$i = 0, $$0496$$9$i = 0, $$0497664$i = 0, $$0498$i = 0, $$05$lcssa$i = 0, $$0509592$i = 0.0, $$0510$i = 0, $$0511$i = 0, $$0514647$i = 0, $$0520$i = 0, $$0522$$i = 0, $$0522$i = 0, $$0524$i = 0;
 var $$0526$i = 0, $$0528$i = 0, $$0528639$i = 0, $$0528641$i = 0, $$0531646$i = 0, $$056$i = 0, $$06$i = 0, $$06$i290 = 0, $$06$i298 = 0, $$1 = 0, $$1230407 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241406 = 0, $$1244394 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0, $$1260 = 0;
 var $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$1322 = 0, $$1465$i = 0, $$1467$i = 0.0, $$1469$i = 0.0, $$1472$i = 0.0, $$1480$i = 0, $$1482$lcssa$i = 0, $$1482671$i = 0, $$1489651$i = 0, $$1499$lcssa$i = 0, $$1499670$i = 0, $$1508593$i = 0, $$1512$lcssa$i = 0, $$1512617$i = 0, $$1515$i = 0, $$1521$i = 0, $$1525$i = 0;
 var $$1527$i = 0, $$1529624$i = 0, $$1532$lcssa$i = 0, $$1532640$i = 0, $$1607$i = 0, $$2 = 0, $$2$i = 0, $$2234 = 0, $$2239 = 0, $$2242381 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2261 = 0, $$2271 = 0, $$2323$lcssa = 0, $$2323382 = 0, $$2473$i = 0.0, $$2476$$545$i = 0;
 var $$2476$$547$i = 0, $$2476$i = 0, $$2483$ph$i = 0, $$2490$lcssa$i = 0, $$2490632$i = 0, $$2500$i = 0, $$2513$i = 0, $$2516628$i = 0, $$2530$i = 0, $$2533627$i = 0, $$3$i = 0.0, $$3257 = 0, $$3265 = 0, $$3272 = 0, $$331 = 0, $$332 = 0, $$333 = 0, $$3379 = 0, $$3477$i = 0, $$3484$lcssa$i = 0;
 var $$3484658$i = 0, $$3501$lcssa$i = 0, $$3501657$i = 0, $$3534623$i = 0, $$4$i = 0.0, $$4258458 = 0, $$4266 = 0, $$4325 = 0, $$4478$lcssa$i = 0, $$4478600$i = 0, $$4492$i = 0, $$4502$i = 0, $$4518$i = 0, $$5 = 0, $$5$lcssa$i = 0, $$537$i = 0, $$538$$i = 0, $$538$i = 0, $$541$i = 0.0, $$544$i = 0;
 var $$546$i = 0, $$5486$lcssa$i = 0, $$5486633$i = 0, $$5493606$i = 0, $$5519$ph$i = 0, $$553$i = 0, $$554$i = 0, $$557$i = 0.0, $$5611$i = 0, $$6 = 0, $$6$i = 0, $$6268 = 0, $$6494599$i = 0, $$7 = 0, $$7495610$i = 0, $$7505$$i = 0, $$7505$i = 0, $$7505$ph$i = 0, $$8$i = 0, $$9$ph$i = 0;
 var $$lcssa683$i = 0, $$neg$i = 0, $$neg572$i = 0, $$pn$i = 0, $$pr = 0, $$pr$i = 0, $$pr571$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi704$iZ2D = 0, $$pre452 = 0, $$pre453 = 0, $$pre454 = 0, $$pre697$i = 0, $$pre700$i = 0, $$pre703$i = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0;
 var $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0.0, $372 = 0, $373 = 0, $374 = 0, $375 = 0.0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0.0, $404 = 0.0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0;
 var $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0.0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0.0, $424 = 0.0, $425 = 0.0, $426 = 0.0, $427 = 0.0, $428 = 0.0, $429 = 0, $43 = 0;
 var $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0;
 var $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0.0, $455 = 0.0, $456 = 0.0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0;
 var $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0;
 var $485 = 0, $486 = 0, $487 = 0.0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0.0, $494 = 0.0, $495 = 0.0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0;
 var $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0;
 var $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0;
 var $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0;
 var $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0;
 var $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0;
 var $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0.0, $606 = 0.0, $607 = 0, $608 = 0.0, $609 = 0, $61 = 0;
 var $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0;
 var $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0;
 var $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0;
 var $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0;
 var $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0;
 var $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0;
 var $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0;
 var $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0;
 var $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0;
 var $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0;
 var $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0;
 var $809 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $exitcond$i = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit$i = 0, $isdigit$i292 = 0, $isdigit275 = 0;
 var $isdigit277 = 0, $isdigit5$i = 0, $isdigit5$i288 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp$i = 0, $isdigittmp$i291 = 0, $isdigittmp274 = 0, $isdigittmp276 = 0, $isdigittmp4$i = 0, $isdigittmp4$i287 = 0, $isdigittmp7$i = 0, $isdigittmp7$i289 = 0, $notlhs$i = 0, $notrhs$i = 0, $or$cond = 0, $or$cond$i = 0, $or$cond280 = 0, $or$cond282 = 0, $or$cond285 = 0;
 var $or$cond3$not$i = 0, $or$cond412 = 0, $or$cond540$i = 0, $or$cond543$i = 0, $or$cond552$i = 0, $or$cond6$i = 0, $scevgep694$i = 0, $scevgep694695$i = 0, $storemerge = 0, $storemerge273345 = 0, $storemerge273389 = 0, $storemerge278 = 0, $sum = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(624|0);
 $5 = sp + 24|0;
 $6 = sp + 16|0;
 $7 = sp + 588|0;
 $8 = sp + 576|0;
 $9 = sp;
 $10 = sp + 536|0;
 $11 = sp + 8|0;
 $12 = sp + 528|0;
 $13 = ($0|0)!=(0|0);
 $14 = ((($10)) + 40|0);
 $15 = $14;
 $16 = ((($10)) + 39|0);
 $17 = ((($11)) + 4|0);
 $18 = $7;
 $19 = (0 - ($18))|0;
 $20 = ((($8)) + 12|0);
 $21 = ((($8)) + 11|0);
 $22 = $20;
 $23 = (($22) - ($18))|0;
 $24 = (-2 - ($18))|0;
 $25 = (($22) + 2)|0;
 $26 = ((($5)) + 288|0);
 $27 = ((($7)) + 9|0);
 $28 = $27;
 $29 = ((($7)) + 8|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$$0321 = $1;
 L1: while(1) {
  $30 = ($$0247|0)>(-1);
  do {
   if ($30) {
    $31 = (2147483647 - ($$0247))|0;
    $32 = ($$0243|0)>($31|0);
    if ($32) {
     $33 = (___errno_location()|0);
     HEAP32[$33>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $34 = (($$0243) + ($$0247))|0;
     $$1248 = $34;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $35 = HEAP8[$$0321>>0]|0;
  $36 = ($35<<24>>24)==(0);
  if ($36) {
   label = 243;
   break;
  } else {
   $$1322 = $$0321;$37 = $35;
  }
  L9: while(1) {
   switch ($37<<24>>24) {
   case 37:  {
    $$0249383 = $$1322;$$2323382 = $$1322;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $$1322;$$2323$lcssa = $$1322;
    break L9;
    break;
   }
   default: {
   }
   }
   $38 = ((($$1322)) + 1|0);
   $$pre = HEAP8[$38>>0]|0;
   $$1322 = $38;$37 = $$pre;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $39 = ((($$2323382)) + 1|0);
     $40 = HEAP8[$39>>0]|0;
     $41 = ($40<<24>>24)==(37);
     if (!($41)) {
      $$0249$lcssa = $$0249383;$$2323$lcssa = $$2323382;
      break L12;
     }
     $42 = ((($$0249383)) + 1|0);
     $43 = ((($$2323382)) + 2|0);
     $44 = HEAP8[$43>>0]|0;
     $45 = ($44<<24>>24)==(37);
     if ($45) {
      $$0249383 = $42;$$2323382 = $43;
      label = 9;
     } else {
      $$0249$lcssa = $42;$$2323$lcssa = $43;
      break;
     }
    }
   }
  } while(0);
  $46 = $$0249$lcssa;
  $47 = $$0321;
  $48 = (($46) - ($47))|0;
  if ($13) {
   $49 = HEAP32[$0>>2]|0;
   $50 = $49 & 32;
   $51 = ($50|0)==(0);
   if ($51) {
    (___fwritex($$0321,$48,$0)|0);
   }
  }
  $52 = ($48|0)==(0);
  if (!($52)) {
   $$0269$phi = $$0269;$$0243 = $48;$$0247 = $$1248;$$0321 = $$2323$lcssa;$$0269 = $$0269$phi;
   continue;
  }
  $53 = ((($$2323$lcssa)) + 1|0);
  $54 = HEAP8[$53>>0]|0;
  $55 = $54 << 24 >> 24;
  $isdigittmp = (($55) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $56 = ((($$2323$lcssa)) + 2|0);
   $57 = HEAP8[$56>>0]|0;
   $58 = ($57<<24>>24)==(36);
   $59 = ((($$2323$lcssa)) + 3|0);
   $$331 = $58 ? $59 : $53;
   $$$0269 = $58 ? 1 : $$0269;
   $isdigittmp$ = $58 ? $isdigittmp : -1;
   $$pre452 = HEAP8[$$331>>0]|0;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$61 = $$pre452;$storemerge = $$331;
  } else {
   $$0253 = -1;$$1270 = $$0269;$61 = $54;$storemerge = $53;
  }
  $60 = $61 << 24 >> 24;
  $62 = (($60) + -32)|0;
  $63 = ($62>>>0)<(32);
  L25: do {
   if ($63) {
    $$0262390 = 0;$65 = $62;$69 = $61;$storemerge273389 = $storemerge;
    while(1) {
     $64 = 1 << $65;
     $66 = $64 & 75913;
     $67 = ($66|0)==(0);
     if ($67) {
      $$0262342 = $$0262390;$79 = $69;$storemerge273345 = $storemerge273389;
      break L25;
     }
     $68 = $69 << 24 >> 24;
     $70 = (($68) + -32)|0;
     $71 = 1 << $70;
     $72 = $71 | $$0262390;
     $73 = ((($storemerge273389)) + 1|0);
     $74 = HEAP8[$73>>0]|0;
     $75 = $74 << 24 >> 24;
     $76 = (($75) + -32)|0;
     $77 = ($76>>>0)<(32);
     if ($77) {
      $$0262390 = $72;$65 = $76;$69 = $74;$storemerge273389 = $73;
     } else {
      $$0262342 = $72;$79 = $74;$storemerge273345 = $73;
      break;
     }
    }
   } else {
    $$0262342 = 0;$79 = $61;$storemerge273345 = $storemerge;
   }
  } while(0);
  $78 = ($79<<24>>24)==(42);
  do {
   if ($78) {
    $80 = ((($storemerge273345)) + 1|0);
    $81 = HEAP8[$80>>0]|0;
    $82 = $81 << 24 >> 24;
    $isdigittmp276 = (($82) + -48)|0;
    $isdigit277 = ($isdigittmp276>>>0)<(10);
    if ($isdigit277) {
     $83 = ((($storemerge273345)) + 2|0);
     $84 = HEAP8[$83>>0]|0;
     $85 = ($84<<24>>24)==(36);
     if ($85) {
      $86 = (($4) + ($isdigittmp276<<2)|0);
      HEAP32[$86>>2] = 10;
      $87 = HEAP8[$80>>0]|0;
      $88 = $87 << 24 >> 24;
      $89 = (($88) + -48)|0;
      $90 = (($3) + ($89<<3)|0);
      $91 = $90;
      $92 = $91;
      $93 = HEAP32[$92>>2]|0;
      $94 = (($91) + 4)|0;
      $95 = $94;
      $96 = HEAP32[$95>>2]|0;
      $97 = ((($storemerge273345)) + 3|0);
      $$0259 = $93;$$2271 = 1;$storemerge278 = $97;
     } else {
      label = 24;
     }
    } else {
     label = 24;
    }
    if ((label|0) == 24) {
     label = 0;
     $98 = ($$1270|0)==(0);
     if (!($98)) {
      $$0 = -1;
      break L1;
     }
     if (!($13)) {
      $$1260 = 0;$$1263 = $$0262342;$$3272 = 0;$$4325 = $80;$$pr = $81;
      break;
     }
     $arglist_current = HEAP32[$2>>2]|0;
     $99 = $arglist_current;
     $100 = ((0) + 4|0);
     $expanded4 = $100;
     $expanded = (($expanded4) - 1)|0;
     $101 = (($99) + ($expanded))|0;
     $102 = ((0) + 4|0);
     $expanded8 = $102;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $103 = $101 & $expanded6;
     $104 = $103;
     $105 = HEAP32[$104>>2]|0;
     $arglist_next = ((($104)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $105;$$2271 = 0;$storemerge278 = $80;
    }
    $106 = ($$0259|0)<(0);
    $107 = $$0262342 | 8192;
    $108 = (0 - ($$0259))|0;
    $$$0262 = $106 ? $107 : $$0262342;
    $$$0259 = $106 ? $108 : $$0259;
    $$pre453 = HEAP8[$storemerge278>>0]|0;
    $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$$4325 = $storemerge278;$$pr = $$pre453;
   } else {
    $109 = $79 << 24 >> 24;
    $isdigittmp4$i = (($109) + -48)|0;
    $isdigit5$i = ($isdigittmp4$i>>>0)<(10);
    if ($isdigit5$i) {
     $$06$i = 0;$113 = $storemerge273345;$isdigittmp7$i = $isdigittmp4$i;
     while(1) {
      $110 = ($$06$i*10)|0;
      $111 = (($110) + ($isdigittmp7$i))|0;
      $112 = ((($113)) + 1|0);
      $114 = HEAP8[$112>>0]|0;
      $115 = $114 << 24 >> 24;
      $isdigittmp$i = (($115) + -48)|0;
      $isdigit$i = ($isdigittmp$i>>>0)<(10);
      if ($isdigit$i) {
       $$06$i = $111;$113 = $112;$isdigittmp7$i = $isdigittmp$i;
      } else {
       break;
      }
     }
     $116 = ($111|0)<(0);
     if ($116) {
      $$0 = -1;
      break L1;
     } else {
      $$1260 = $111;$$1263 = $$0262342;$$3272 = $$1270;$$4325 = $112;$$pr = $114;
     }
    } else {
     $$1260 = 0;$$1263 = $$0262342;$$3272 = $$1270;$$4325 = $storemerge273345;$$pr = $79;
    }
   }
  } while(0);
  $117 = ($$pr<<24>>24)==(46);
  L45: do {
   if ($117) {
    $118 = ((($$4325)) + 1|0);
    $119 = HEAP8[$118>>0]|0;
    $120 = ($119<<24>>24)==(42);
    if (!($120)) {
     $147 = $119 << 24 >> 24;
     $isdigittmp4$i287 = (($147) + -48)|0;
     $isdigit5$i288 = ($isdigittmp4$i287>>>0)<(10);
     if ($isdigit5$i288) {
      $$06$i290 = 0;$151 = $118;$isdigittmp7$i289 = $isdigittmp4$i287;
     } else {
      $$0254 = 0;$$6 = $118;
      break;
     }
     while(1) {
      $148 = ($$06$i290*10)|0;
      $149 = (($148) + ($isdigittmp7$i289))|0;
      $150 = ((($151)) + 1|0);
      $152 = HEAP8[$150>>0]|0;
      $153 = $152 << 24 >> 24;
      $isdigittmp$i291 = (($153) + -48)|0;
      $isdigit$i292 = ($isdigittmp$i291>>>0)<(10);
      if ($isdigit$i292) {
       $$06$i290 = $149;$151 = $150;$isdigittmp7$i289 = $isdigittmp$i291;
      } else {
       $$0254 = $149;$$6 = $150;
       break L45;
      }
     }
    }
    $121 = ((($$4325)) + 2|0);
    $122 = HEAP8[$121>>0]|0;
    $123 = $122 << 24 >> 24;
    $isdigittmp274 = (($123) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $124 = ((($$4325)) + 3|0);
     $125 = HEAP8[$124>>0]|0;
     $126 = ($125<<24>>24)==(36);
     if ($126) {
      $127 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$127>>2] = 10;
      $128 = HEAP8[$121>>0]|0;
      $129 = $128 << 24 >> 24;
      $130 = (($129) + -48)|0;
      $131 = (($3) + ($130<<3)|0);
      $132 = $131;
      $133 = $132;
      $134 = HEAP32[$133>>2]|0;
      $135 = (($132) + 4)|0;
      $136 = $135;
      $137 = HEAP32[$136>>2]|0;
      $138 = ((($$4325)) + 4|0);
      $$0254 = $134;$$6 = $138;
      break;
     }
    }
    $139 = ($$3272|0)==(0);
    if (!($139)) {
     $$0 = -1;
     break L1;
    }
    if ($13) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $140 = $arglist_current2;
     $141 = ((0) + 4|0);
     $expanded11 = $141;
     $expanded10 = (($expanded11) - 1)|0;
     $142 = (($140) + ($expanded10))|0;
     $143 = ((0) + 4|0);
     $expanded15 = $143;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $144 = $142 & $expanded13;
     $145 = $144;
     $146 = HEAP32[$145>>2]|0;
     $arglist_next3 = ((($145)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $$0254 = $146;$$6 = $121;
    } else {
     $$0254 = 0;$$6 = $121;
    }
   } else {
    $$0254 = -1;$$6 = $$4325;
   }
  } while(0);
  $$0252 = 0;$$7 = $$6;
  while(1) {
   $154 = HEAP8[$$7>>0]|0;
   $155 = $154 << 24 >> 24;
   $156 = (($155) + -65)|0;
   $157 = ($156>>>0)>(57);
   if ($157) {
    $$0 = -1;
    break L1;
   }
   $158 = ((($$7)) + 1|0);
   $159 = ((1601 + (($$0252*58)|0)|0) + ($156)|0);
   $160 = HEAP8[$159>>0]|0;
   $161 = $160&255;
   $162 = (($161) + -1)|0;
   $163 = ($162>>>0)<(8);
   if ($163) {
    $$0252 = $161;$$7 = $158;
   } else {
    break;
   }
  }
  $164 = ($160<<24>>24)==(0);
  if ($164) {
   $$0 = -1;
   break;
  }
  $165 = ($160<<24>>24)==(19);
  $166 = ($$0253|0)>(-1);
  do {
   if ($165) {
    if ($166) {
     $$0 = -1;
     break L1;
    } else {
     label = 51;
    }
   } else {
    if ($166) {
     $167 = (($4) + ($$0253<<2)|0);
     HEAP32[$167>>2] = $161;
     $168 = (($3) + ($$0253<<3)|0);
     $169 = $168;
     $170 = $169;
     $171 = HEAP32[$170>>2]|0;
     $172 = (($169) + 4)|0;
     $173 = $172;
     $174 = HEAP32[$173>>2]|0;
     $175 = $9;
     $176 = $175;
     HEAP32[$176>>2] = $171;
     $177 = (($175) + 4)|0;
     $178 = $177;
     HEAP32[$178>>2] = $174;
     label = 51;
     break;
    }
    if (!($13)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($9,$161,$2);
   }
  } while(0);
  if ((label|0) == 51) {
   label = 0;
   if (!($13)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
    continue;
   }
  }
  $179 = HEAP8[$$7>>0]|0;
  $180 = $179 << 24 >> 24;
  $181 = ($$0252|0)!=(0);
  $182 = $180 & 15;
  $183 = ($182|0)==(3);
  $or$cond280 = $181 & $183;
  $184 = $180 & -33;
  $$0235 = $or$cond280 ? $184 : $180;
  $185 = $$1263 & 8192;
  $186 = ($185|0)==(0);
  $187 = $$1263 & -65537;
  $$1263$ = $186 ? $$1263 : $187;
  L74: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $194 = HEAP32[$9>>2]|0;
     HEAP32[$194>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 1:  {
     $195 = HEAP32[$9>>2]|0;
     HEAP32[$195>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 2:  {
     $196 = ($$1248|0)<(0);
     $197 = $196 << 31 >> 31;
     $198 = HEAP32[$9>>2]|0;
     $199 = $198;
     $200 = $199;
     HEAP32[$200>>2] = $$1248;
     $201 = (($199) + 4)|0;
     $202 = $201;
     HEAP32[$202>>2] = $197;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 3:  {
     $203 = $$1248&65535;
     $204 = HEAP32[$9>>2]|0;
     HEAP16[$204>>1] = $203;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 4:  {
     $205 = $$1248&255;
     $206 = HEAP32[$9>>2]|0;
     HEAP8[$206>>0] = $205;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 6:  {
     $207 = HEAP32[$9>>2]|0;
     HEAP32[$207>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 7:  {
     $208 = ($$1248|0)<(0);
     $209 = $208 << 31 >> 31;
     $210 = HEAP32[$9>>2]|0;
     $211 = $210;
     $212 = $211;
     HEAP32[$212>>2] = $$1248;
     $213 = (($211) + 4)|0;
     $214 = $213;
     HEAP32[$214>>2] = $209;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $215 = ($$0254>>>0)>(8);
    $216 = $215 ? $$0254 : 8;
    $217 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $216;$$3265 = $217;
    label = 63;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 63;
    break;
   }
   case 111:  {
    $257 = $9;
    $258 = $257;
    $259 = HEAP32[$258>>2]|0;
    $260 = (($257) + 4)|0;
    $261 = $260;
    $262 = HEAP32[$261>>2]|0;
    $263 = ($259|0)==(0);
    $264 = ($262|0)==(0);
    $265 = $263 & $264;
    if ($265) {
     $$0$lcssa$i300 = $14;
    } else {
     $$06$i298 = $14;$267 = $259;$271 = $262;
     while(1) {
      $266 = $267 & 7;
      $268 = $266 | 48;
      $269 = $268&255;
      $270 = ((($$06$i298)) + -1|0);
      HEAP8[$270>>0] = $269;
      $272 = (_bitshift64Lshr(($267|0),($271|0),3)|0);
      $273 = tempRet0;
      $274 = ($272|0)==(0);
      $275 = ($273|0)==(0);
      $276 = $274 & $275;
      if ($276) {
       $$0$lcssa$i300 = $270;
       break;
      } else {
       $$06$i298 = $270;$267 = $272;$271 = $273;
      }
     }
    }
    $277 = $$1263$ & 8;
    $278 = ($277|0)==(0);
    if ($278) {
     $$0228 = $$0$lcssa$i300;$$1233 = 0;$$1238 = 2081;$$2256 = $$0254;$$4266 = $$1263$;
     label = 76;
    } else {
     $279 = $$0$lcssa$i300;
     $280 = (($15) - ($279))|0;
     $281 = ($$0254|0)>($280|0);
     $282 = (($280) + 1)|0;
     $$0254$ = $281 ? $$0254 : $282;
     $$0228 = $$0$lcssa$i300;$$1233 = 0;$$1238 = 2081;$$2256 = $$0254$;$$4266 = $$1263$;
     label = 76;
    }
    break;
   }
   case 105: case 100:  {
    $283 = $9;
    $284 = $283;
    $285 = HEAP32[$284>>2]|0;
    $286 = (($283) + 4)|0;
    $287 = $286;
    $288 = HEAP32[$287>>2]|0;
    $289 = ($288|0)<(0);
    if ($289) {
     $290 = (_i64Subtract(0,0,($285|0),($288|0))|0);
     $291 = tempRet0;
     $292 = $9;
     $293 = $292;
     HEAP32[$293>>2] = $290;
     $294 = (($292) + 4)|0;
     $295 = $294;
     HEAP32[$295>>2] = $291;
     $$0232 = 1;$$0237 = 2081;$300 = $290;$301 = $291;
     label = 75;
     break L74;
    }
    $296 = $$1263$ & 2048;
    $297 = ($296|0)==(0);
    if ($297) {
     $298 = $$1263$ & 1;
     $299 = ($298|0)==(0);
     $$ = $299 ? 2081 : (2083);
     $$0232 = $298;$$0237 = $$;$300 = $285;$301 = $288;
     label = 75;
    } else {
     $$0232 = 1;$$0237 = (2082);$300 = $285;$301 = $288;
     label = 75;
    }
    break;
   }
   case 117:  {
    $188 = $9;
    $189 = $188;
    $190 = HEAP32[$189>>2]|0;
    $191 = (($188) + 4)|0;
    $192 = $191;
    $193 = HEAP32[$192>>2]|0;
    $$0232 = 0;$$0237 = 2081;$300 = $190;$301 = $193;
    label = 75;
    break;
   }
   case 99:  {
    $321 = $9;
    $322 = $321;
    $323 = HEAP32[$322>>2]|0;
    $324 = (($321) + 4)|0;
    $325 = $324;
    $326 = HEAP32[$325>>2]|0;
    $327 = $323&255;
    HEAP8[$16>>0] = $327;
    $$2 = $16;$$2234 = 0;$$2239 = 2081;$$2251 = $14;$$5 = 1;$$6268 = $187;
    break;
   }
   case 109:  {
    $328 = (___errno_location()|0);
    $329 = HEAP32[$328>>2]|0;
    $330 = (_strerror($329)|0);
    $$1 = $330;
    label = 81;
    break;
   }
   case 115:  {
    $331 = HEAP32[$9>>2]|0;
    $332 = ($331|0)!=(0|0);
    $333 = $332 ? $331 : 2091;
    $$1 = $333;
    label = 81;
    break;
   }
   case 67:  {
    $340 = $9;
    $341 = $340;
    $342 = HEAP32[$341>>2]|0;
    $343 = (($340) + 4)|0;
    $344 = $343;
    $345 = HEAP32[$344>>2]|0;
    HEAP32[$11>>2] = $342;
    HEAP32[$17>>2] = 0;
    HEAP32[$9>>2] = $11;
    $$4258458 = -1;$809 = $11;
    label = 85;
    break;
   }
   case 83:  {
    $$pre454 = HEAP32[$9>>2]|0;
    $346 = ($$0254|0)==(0);
    if ($346) {
     _pad($0,32,$$1260,0,$$1263$);
     $$0240$lcssa460 = 0;
     label = 96;
    } else {
     $$4258458 = $$0254;$809 = $$pre454;
     label = 85;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $371 = +HEAPF64[$9>>3];
    HEAP32[$6>>2] = 0;
    HEAPF64[tempDoublePtr>>3] = $371;$372 = HEAP32[tempDoublePtr>>2]|0;
    $373 = HEAP32[tempDoublePtr+4>>2]|0;
    $374 = ($373|0)<(0);
    if ($374) {
     $375 = -$371;
     $$0471$i = $375;$$0520$i = 1;$$0522$i = 2098;
    } else {
     $376 = $$1263$ & 2048;
     $377 = ($376|0)==(0);
     $378 = $$1263$ & 1;
     if ($377) {
      $379 = ($378|0)==(0);
      $$$i = $379 ? (2099) : (2104);
      $$0471$i = $371;$$0520$i = $378;$$0522$i = $$$i;
     } else {
      $$0471$i = $371;$$0520$i = 1;$$0522$i = (2101);
     }
    }
    HEAPF64[tempDoublePtr>>3] = $$0471$i;$380 = HEAP32[tempDoublePtr>>2]|0;
    $381 = HEAP32[tempDoublePtr+4>>2]|0;
    $382 = $381 & 2146435072;
    $383 = ($382>>>0)<(2146435072);
    $384 = (0)<(0);
    $385 = ($382|0)==(2146435072);
    $386 = $385 & $384;
    $387 = $383 | $386;
    do {
     if ($387) {
      $403 = (+_frexpl($$0471$i,$6));
      $404 = $403 * 2.0;
      $405 = $404 != 0.0;
      if ($405) {
       $406 = HEAP32[$6>>2]|0;
       $407 = (($406) + -1)|0;
       HEAP32[$6>>2] = $407;
      }
      $408 = $$0235 | 32;
      $409 = ($408|0)==(97);
      if ($409) {
       $410 = $$0235 & 32;
       $411 = ($410|0)==(0);
       $412 = ((($$0522$i)) + 9|0);
       $$0522$$i = $411 ? $$0522$i : $412;
       $413 = $$0520$i | 2;
       $414 = ($$0254>>>0)>(11);
       $415 = (12 - ($$0254))|0;
       $416 = ($415|0)==(0);
       $417 = $414 | $416;
       do {
        if ($417) {
         $$1472$i = $404;
        } else {
         $$0509592$i = 8.0;$$1508593$i = $415;
         while(1) {
          $418 = (($$1508593$i) + -1)|0;
          $419 = $$0509592$i * 16.0;
          $420 = ($418|0)==(0);
          if ($420) {
           break;
          } else {
           $$0509592$i = $419;$$1508593$i = $418;
          }
         }
         $421 = HEAP8[$$0522$$i>>0]|0;
         $422 = ($421<<24>>24)==(45);
         if ($422) {
          $423 = -$404;
          $424 = $423 - $419;
          $425 = $419 + $424;
          $426 = -$425;
          $$1472$i = $426;
          break;
         } else {
          $427 = $404 + $419;
          $428 = $427 - $419;
          $$1472$i = $428;
          break;
         }
        }
       } while(0);
       $429 = HEAP32[$6>>2]|0;
       $430 = ($429|0)<(0);
       $431 = (0 - ($429))|0;
       $432 = $430 ? $431 : $429;
       $433 = ($432|0)<(0);
       $434 = $433 << 31 >> 31;
       $435 = (_fmt_u($432,$434,$20)|0);
       $436 = ($435|0)==($20|0);
       if ($436) {
        HEAP8[$21>>0] = 48;
        $$0511$i = $21;
       } else {
        $$0511$i = $435;
       }
       $437 = $429 >> 31;
       $438 = $437 & 2;
       $439 = (($438) + 43)|0;
       $440 = $439&255;
       $441 = ((($$0511$i)) + -1|0);
       HEAP8[$441>>0] = $440;
       $442 = (($$0235) + 15)|0;
       $443 = $442&255;
       $444 = ((($$0511$i)) + -2|0);
       HEAP8[$444>>0] = $443;
       $notrhs$i = ($$0254|0)<(1);
       $445 = $$1263$ & 8;
       $446 = ($445|0)==(0);
       $$0524$i = $7;$$2473$i = $$1472$i;
       while(1) {
        $447 = (~~(($$2473$i)));
        $448 = (2065 + ($447)|0);
        $449 = HEAP8[$448>>0]|0;
        $450 = $449&255;
        $451 = $450 | $410;
        $452 = $451&255;
        $453 = ((($$0524$i)) + 1|0);
        HEAP8[$$0524$i>>0] = $452;
        $454 = (+($447|0));
        $455 = $$2473$i - $454;
        $456 = $455 * 16.0;
        $457 = $453;
        $458 = (($457) - ($18))|0;
        $459 = ($458|0)==(1);
        do {
         if ($459) {
          $notlhs$i = $456 == 0.0;
          $or$cond3$not$i = $notrhs$i & $notlhs$i;
          $or$cond$i = $446 & $or$cond3$not$i;
          if ($or$cond$i) {
           $$1525$i = $453;
           break;
          }
          $460 = ((($$0524$i)) + 2|0);
          HEAP8[$453>>0] = 46;
          $$1525$i = $460;
         } else {
          $$1525$i = $453;
         }
        } while(0);
        $461 = $456 != 0.0;
        if ($461) {
         $$0524$i = $$1525$i;$$2473$i = $456;
        } else {
         break;
        }
       }
       $462 = ($$0254|0)!=(0);
       $$pre700$i = $$1525$i;
       $463 = (($24) + ($$pre700$i))|0;
       $464 = ($463|0)<($$0254|0);
       $or$cond412 = $462 & $464;
       $465 = $444;
       $466 = (($25) + ($$0254))|0;
       $467 = (($466) - ($465))|0;
       $468 = (($23) - ($465))|0;
       $469 = (($468) + ($$pre700$i))|0;
       $$0526$i = $or$cond412 ? $467 : $469;
       $470 = (($$0526$i) + ($413))|0;
       _pad($0,32,$$1260,$470,$$1263$);
       $471 = HEAP32[$0>>2]|0;
       $472 = $471 & 32;
       $473 = ($472|0)==(0);
       if ($473) {
        (___fwritex($$0522$$i,$413,$0)|0);
       }
       $474 = $$1263$ ^ 65536;
       _pad($0,48,$$1260,$470,$474);
       $475 = (($$pre700$i) - ($18))|0;
       $476 = HEAP32[$0>>2]|0;
       $477 = $476 & 32;
       $478 = ($477|0)==(0);
       if ($478) {
        (___fwritex($7,$475,$0)|0);
       }
       $479 = (($22) - ($465))|0;
       $sum = (($475) + ($479))|0;
       $480 = (($$0526$i) - ($sum))|0;
       _pad($0,48,$480,0,0);
       $481 = HEAP32[$0>>2]|0;
       $482 = $481 & 32;
       $483 = ($482|0)==(0);
       if ($483) {
        (___fwritex($444,$479,$0)|0);
       }
       $484 = $$1263$ ^ 8192;
       _pad($0,32,$$1260,$470,$484);
       $485 = ($470|0)<($$1260|0);
       $$537$i = $485 ? $$1260 : $470;
       $$0470$i = $$537$i;
       break;
      }
      $486 = ($$0254|0)<(0);
      $$538$i = $486 ? 6 : $$0254;
      if ($405) {
       $487 = $404 * 268435456.0;
       $488 = HEAP32[$6>>2]|0;
       $489 = (($488) + -28)|0;
       HEAP32[$6>>2] = $489;
       $$3$i = $487;$$pr$i = $489;
      } else {
       $$pre697$i = HEAP32[$6>>2]|0;
       $$3$i = $404;$$pr$i = $$pre697$i;
      }
      $490 = ($$pr$i|0)<(0);
      $$554$i = $490 ? $5 : $26;
      $$0498$i = $$554$i;$$4$i = $$3$i;
      while(1) {
       $491 = (~~(($$4$i))>>>0);
       HEAP32[$$0498$i>>2] = $491;
       $492 = ((($$0498$i)) + 4|0);
       $493 = (+($491>>>0));
       $494 = $$4$i - $493;
       $495 = $494 * 1.0E+9;
       $496 = $495 != 0.0;
       if ($496) {
        $$0498$i = $492;$$4$i = $495;
       } else {
        break;
       }
      }
      $497 = ($$pr$i|0)>(0);
      if ($497) {
       $$1482671$i = $$554$i;$$1499670$i = $492;$499 = $$pr$i;
       while(1) {
        $498 = ($499|0)>(29);
        $500 = $498 ? 29 : $499;
        $$0488663$i = ((($$1499670$i)) + -4|0);
        $501 = ($$0488663$i>>>0)<($$1482671$i>>>0);
        do {
         if ($501) {
          $$2483$ph$i = $$1482671$i;
         } else {
          $$0488665$i = $$0488663$i;$$0497664$i = 0;
          while(1) {
           $502 = HEAP32[$$0488665$i>>2]|0;
           $503 = (_bitshift64Shl(($502|0),0,($500|0))|0);
           $504 = tempRet0;
           $505 = (_i64Add(($503|0),($504|0),($$0497664$i|0),0)|0);
           $506 = tempRet0;
           $507 = (___uremdi3(($505|0),($506|0),1000000000,0)|0);
           $508 = tempRet0;
           HEAP32[$$0488665$i>>2] = $507;
           $509 = (___udivdi3(($505|0),($506|0),1000000000,0)|0);
           $510 = tempRet0;
           $$0488$i = ((($$0488665$i)) + -4|0);
           $511 = ($$0488$i>>>0)<($$1482671$i>>>0);
           if ($511) {
            break;
           } else {
            $$0488665$i = $$0488$i;$$0497664$i = $509;
           }
          }
          $512 = ($509|0)==(0);
          if ($512) {
           $$2483$ph$i = $$1482671$i;
           break;
          }
          $513 = ((($$1482671$i)) + -4|0);
          HEAP32[$513>>2] = $509;
          $$2483$ph$i = $513;
         }
        } while(0);
        $$2500$i = $$1499670$i;
        while(1) {
         $514 = ($$2500$i>>>0)>($$2483$ph$i>>>0);
         if (!($514)) {
          break;
         }
         $515 = ((($$2500$i)) + -4|0);
         $516 = HEAP32[$515>>2]|0;
         $517 = ($516|0)==(0);
         if ($517) {
          $$2500$i = $515;
         } else {
          break;
         }
        }
        $518 = HEAP32[$6>>2]|0;
        $519 = (($518) - ($500))|0;
        HEAP32[$6>>2] = $519;
        $520 = ($519|0)>(0);
        if ($520) {
         $$1482671$i = $$2483$ph$i;$$1499670$i = $$2500$i;$499 = $519;
        } else {
         $$1482$lcssa$i = $$2483$ph$i;$$1499$lcssa$i = $$2500$i;$$pr571$i = $519;
         break;
        }
       }
      } else {
       $$1482$lcssa$i = $$554$i;$$1499$lcssa$i = $492;$$pr571$i = $$pr$i;
      }
      $521 = ($$pr571$i|0)<(0);
      if ($521) {
       $522 = (($$538$i) + 25)|0;
       $523 = (($522|0) / 9)&-1;
       $524 = (($523) + 1)|0;
       $525 = ($408|0)==(102);
       $$3484658$i = $$1482$lcssa$i;$$3501657$i = $$1499$lcssa$i;$527 = $$pr571$i;
       while(1) {
        $526 = (0 - ($527))|0;
        $528 = ($526|0)>(9);
        $529 = $528 ? 9 : $526;
        $530 = ($$3484658$i>>>0)<($$3501657$i>>>0);
        do {
         if ($530) {
          $534 = 1 << $529;
          $535 = (($534) + -1)|0;
          $536 = 1000000000 >>> $529;
          $$0487652$i = 0;$$1489651$i = $$3484658$i;
          while(1) {
           $537 = HEAP32[$$1489651$i>>2]|0;
           $538 = $537 & $535;
           $539 = $537 >>> $529;
           $540 = (($539) + ($$0487652$i))|0;
           HEAP32[$$1489651$i>>2] = $540;
           $541 = Math_imul($538, $536)|0;
           $542 = ((($$1489651$i)) + 4|0);
           $543 = ($542>>>0)<($$3501657$i>>>0);
           if ($543) {
            $$0487652$i = $541;$$1489651$i = $542;
           } else {
            break;
           }
          }
          $544 = HEAP32[$$3484658$i>>2]|0;
          $545 = ($544|0)==(0);
          $546 = ((($$3484658$i)) + 4|0);
          $$$3484$i = $545 ? $546 : $$3484658$i;
          $547 = ($541|0)==(0);
          if ($547) {
           $$$3484706$i = $$$3484$i;$$4502$i = $$3501657$i;
           break;
          }
          $548 = ((($$3501657$i)) + 4|0);
          HEAP32[$$3501657$i>>2] = $541;
          $$$3484706$i = $$$3484$i;$$4502$i = $548;
         } else {
          $531 = HEAP32[$$3484658$i>>2]|0;
          $532 = ($531|0)==(0);
          $533 = ((($$3484658$i)) + 4|0);
          $$$3484705$i = $532 ? $533 : $$3484658$i;
          $$$3484706$i = $$$3484705$i;$$4502$i = $$3501657$i;
         }
        } while(0);
        $549 = $525 ? $$554$i : $$$3484706$i;
        $550 = $$4502$i;
        $551 = $549;
        $552 = (($550) - ($551))|0;
        $553 = $552 >> 2;
        $554 = ($553|0)>($524|0);
        $555 = (($549) + ($524<<2)|0);
        $$$4502$i = $554 ? $555 : $$4502$i;
        $556 = HEAP32[$6>>2]|0;
        $557 = (($556) + ($529))|0;
        HEAP32[$6>>2] = $557;
        $558 = ($557|0)<(0);
        if ($558) {
         $$3484658$i = $$$3484706$i;$$3501657$i = $$$4502$i;$527 = $557;
        } else {
         $$3484$lcssa$i = $$$3484706$i;$$3501$lcssa$i = $$$4502$i;
         break;
        }
       }
      } else {
       $$3484$lcssa$i = $$1482$lcssa$i;$$3501$lcssa$i = $$1499$lcssa$i;
      }
      $559 = ($$3484$lcssa$i>>>0)<($$3501$lcssa$i>>>0);
      $560 = $$554$i;
      do {
       if ($559) {
        $561 = $$3484$lcssa$i;
        $562 = (($560) - ($561))|0;
        $563 = $562 >> 2;
        $564 = ($563*9)|0;
        $565 = HEAP32[$$3484$lcssa$i>>2]|0;
        $566 = ($565>>>0)<(10);
        if ($566) {
         $$1515$i = $564;
         break;
        } else {
         $$0514647$i = $564;$$0531646$i = 10;
        }
        while(1) {
         $567 = ($$0531646$i*10)|0;
         $568 = (($$0514647$i) + 1)|0;
         $569 = ($565>>>0)<($567>>>0);
         if ($569) {
          $$1515$i = $568;
          break;
         } else {
          $$0514647$i = $568;$$0531646$i = $567;
         }
        }
       } else {
        $$1515$i = 0;
       }
      } while(0);
      $570 = ($408|0)!=(102);
      $571 = $570 ? $$1515$i : 0;
      $572 = (($$538$i) - ($571))|0;
      $573 = ($408|0)==(103);
      $574 = ($$538$i|0)!=(0);
      $575 = $574 & $573;
      $$neg$i = $575 << 31 >> 31;
      $576 = (($572) + ($$neg$i))|0;
      $577 = $$3501$lcssa$i;
      $578 = (($577) - ($560))|0;
      $579 = $578 >> 2;
      $580 = ($579*9)|0;
      $581 = (($580) + -9)|0;
      $582 = ($576|0)<($581|0);
      if ($582) {
       $583 = ((($$554$i)) + 4|0);
       $584 = (($576) + 9216)|0;
       $585 = (($584|0) / 9)&-1;
       $586 = (($585) + -1024)|0;
       $587 = (($583) + ($586<<2)|0);
       $588 = (($584|0) % 9)&-1;
       $$0528639$i = (($588) + 1)|0;
       $589 = ($$0528639$i|0)<(9);
       if ($589) {
        $$0528641$i = $$0528639$i;$$1532640$i = 10;
        while(1) {
         $590 = ($$1532640$i*10)|0;
         $$0528$i = (($$0528641$i) + 1)|0;
         $exitcond$i = ($$0528$i|0)==(9);
         if ($exitcond$i) {
          $$1532$lcssa$i = $590;
          break;
         } else {
          $$0528641$i = $$0528$i;$$1532640$i = $590;
         }
        }
       } else {
        $$1532$lcssa$i = 10;
       }
       $591 = HEAP32[$587>>2]|0;
       $592 = (($591>>>0) % ($$1532$lcssa$i>>>0))&-1;
       $593 = ($592|0)==(0);
       $594 = ((($587)) + 4|0);
       $595 = ($594|0)==($$3501$lcssa$i|0);
       $or$cond540$i = $595 & $593;
       do {
        if ($or$cond540$i) {
         $$4492$i = $587;$$4518$i = $$1515$i;$$8$i = $$3484$lcssa$i;
        } else {
         $596 = (($591>>>0) / ($$1532$lcssa$i>>>0))&-1;
         $597 = $596 & 1;
         $598 = ($597|0)==(0);
         $$541$i = $598 ? 9007199254740992.0 : 9007199254740994.0;
         $599 = (($$1532$lcssa$i|0) / 2)&-1;
         $600 = ($592>>>0)<($599>>>0);
         if ($600) {
          $$0466$i = 0.5;
         } else {
          $601 = ($592|0)==($599|0);
          $or$cond543$i = $595 & $601;
          $$557$i = $or$cond543$i ? 1.0 : 1.5;
          $$0466$i = $$557$i;
         }
         $602 = ($$0520$i|0)==(0);
         do {
          if ($602) {
           $$1467$i = $$0466$i;$$1469$i = $$541$i;
          } else {
           $603 = HEAP8[$$0522$i>>0]|0;
           $604 = ($603<<24>>24)==(45);
           if (!($604)) {
            $$1467$i = $$0466$i;$$1469$i = $$541$i;
            break;
           }
           $605 = -$$541$i;
           $606 = -$$0466$i;
           $$1467$i = $606;$$1469$i = $605;
          }
         } while(0);
         $607 = (($591) - ($592))|0;
         HEAP32[$587>>2] = $607;
         $608 = $$1469$i + $$1467$i;
         $609 = $608 != $$1469$i;
         if (!($609)) {
          $$4492$i = $587;$$4518$i = $$1515$i;$$8$i = $$3484$lcssa$i;
          break;
         }
         $610 = (($607) + ($$1532$lcssa$i))|0;
         HEAP32[$587>>2] = $610;
         $611 = ($610>>>0)>(999999999);
         if ($611) {
          $$2490632$i = $587;$$5486633$i = $$3484$lcssa$i;
          while(1) {
           $612 = ((($$2490632$i)) + -4|0);
           HEAP32[$$2490632$i>>2] = 0;
           $613 = ($612>>>0)<($$5486633$i>>>0);
           if ($613) {
            $614 = ((($$5486633$i)) + -4|0);
            HEAP32[$614>>2] = 0;
            $$6$i = $614;
           } else {
            $$6$i = $$5486633$i;
           }
           $615 = HEAP32[$612>>2]|0;
           $616 = (($615) + 1)|0;
           HEAP32[$612>>2] = $616;
           $617 = ($616>>>0)>(999999999);
           if ($617) {
            $$2490632$i = $612;$$5486633$i = $$6$i;
           } else {
            $$2490$lcssa$i = $612;$$5486$lcssa$i = $$6$i;
            break;
           }
          }
         } else {
          $$2490$lcssa$i = $587;$$5486$lcssa$i = $$3484$lcssa$i;
         }
         $618 = $$5486$lcssa$i;
         $619 = (($560) - ($618))|0;
         $620 = $619 >> 2;
         $621 = ($620*9)|0;
         $622 = HEAP32[$$5486$lcssa$i>>2]|0;
         $623 = ($622>>>0)<(10);
         if ($623) {
          $$4492$i = $$2490$lcssa$i;$$4518$i = $621;$$8$i = $$5486$lcssa$i;
          break;
         } else {
          $$2516628$i = $621;$$2533627$i = 10;
         }
         while(1) {
          $624 = ($$2533627$i*10)|0;
          $625 = (($$2516628$i) + 1)|0;
          $626 = ($622>>>0)<($624>>>0);
          if ($626) {
           $$4492$i = $$2490$lcssa$i;$$4518$i = $625;$$8$i = $$5486$lcssa$i;
           break;
          } else {
           $$2516628$i = $625;$$2533627$i = $624;
          }
         }
        }
       } while(0);
       $627 = ((($$4492$i)) + 4|0);
       $628 = ($$3501$lcssa$i>>>0)>($627>>>0);
       $$$3501$i = $628 ? $627 : $$3501$lcssa$i;
       $$5519$ph$i = $$4518$i;$$7505$ph$i = $$$3501$i;$$9$ph$i = $$8$i;
      } else {
       $$5519$ph$i = $$1515$i;$$7505$ph$i = $$3501$lcssa$i;$$9$ph$i = $$3484$lcssa$i;
      }
      $629 = (0 - ($$5519$ph$i))|0;
      $$7505$i = $$7505$ph$i;
      while(1) {
       $630 = ($$7505$i>>>0)>($$9$ph$i>>>0);
       if (!($630)) {
        $$lcssa683$i = 0;
        break;
       }
       $631 = ((($$7505$i)) + -4|0);
       $632 = HEAP32[$631>>2]|0;
       $633 = ($632|0)==(0);
       if ($633) {
        $$7505$i = $631;
       } else {
        $$lcssa683$i = 1;
        break;
       }
      }
      do {
       if ($573) {
        $634 = $574&1;
        $635 = $634 ^ 1;
        $$538$$i = (($635) + ($$538$i))|0;
        $636 = ($$538$$i|0)>($$5519$ph$i|0);
        $637 = ($$5519$ph$i|0)>(-5);
        $or$cond6$i = $636 & $637;
        if ($or$cond6$i) {
         $638 = (($$0235) + -1)|0;
         $$neg572$i = (($$538$$i) + -1)|0;
         $639 = (($$neg572$i) - ($$5519$ph$i))|0;
         $$0479$i = $638;$$2476$i = $639;
        } else {
         $640 = (($$0235) + -2)|0;
         $641 = (($$538$$i) + -1)|0;
         $$0479$i = $640;$$2476$i = $641;
        }
        $642 = $$1263$ & 8;
        $643 = ($642|0)==(0);
        if (!($643)) {
         $$1480$i = $$0479$i;$$3477$i = $$2476$i;$$pre$phi704$iZ2D = $642;
         break;
        }
        do {
         if ($$lcssa683$i) {
          $644 = ((($$7505$i)) + -4|0);
          $645 = HEAP32[$644>>2]|0;
          $646 = ($645|0)==(0);
          if ($646) {
           $$2530$i = 9;
           break;
          }
          $647 = (($645>>>0) % 10)&-1;
          $648 = ($647|0)==(0);
          if ($648) {
           $$1529624$i = 0;$$3534623$i = 10;
          } else {
           $$2530$i = 0;
           break;
          }
          while(1) {
           $649 = ($$3534623$i*10)|0;
           $650 = (($$1529624$i) + 1)|0;
           $651 = (($645>>>0) % ($649>>>0))&-1;
           $652 = ($651|0)==(0);
           if ($652) {
            $$1529624$i = $650;$$3534623$i = $649;
           } else {
            $$2530$i = $650;
            break;
           }
          }
         } else {
          $$2530$i = 9;
         }
        } while(0);
        $653 = $$0479$i | 32;
        $654 = ($653|0)==(102);
        $655 = $$7505$i;
        $656 = (($655) - ($560))|0;
        $657 = $656 >> 2;
        $658 = ($657*9)|0;
        $659 = (($658) + -9)|0;
        if ($654) {
         $660 = (($659) - ($$2530$i))|0;
         $661 = ($660|0)<(0);
         $$544$i = $661 ? 0 : $660;
         $662 = ($$2476$i|0)<($$544$i|0);
         $$2476$$545$i = $662 ? $$2476$i : $$544$i;
         $$1480$i = $$0479$i;$$3477$i = $$2476$$545$i;$$pre$phi704$iZ2D = 0;
         break;
        } else {
         $663 = (($659) + ($$5519$ph$i))|0;
         $664 = (($663) - ($$2530$i))|0;
         $665 = ($664|0)<(0);
         $$546$i = $665 ? 0 : $664;
         $666 = ($$2476$i|0)<($$546$i|0);
         $$2476$$547$i = $666 ? $$2476$i : $$546$i;
         $$1480$i = $$0479$i;$$3477$i = $$2476$$547$i;$$pre$phi704$iZ2D = 0;
         break;
        }
       } else {
        $$pre703$i = $$1263$ & 8;
        $$1480$i = $$0235;$$3477$i = $$538$i;$$pre$phi704$iZ2D = $$pre703$i;
       }
      } while(0);
      $667 = $$3477$i | $$pre$phi704$iZ2D;
      $668 = ($667|0)!=(0);
      $669 = $668&1;
      $670 = $$1480$i | 32;
      $671 = ($670|0)==(102);
      if ($671) {
       $672 = ($$5519$ph$i|0)>(0);
       $673 = $672 ? $$5519$ph$i : 0;
       $$2513$i = 0;$$pn$i = $673;
      } else {
       $674 = ($$5519$ph$i|0)<(0);
       $675 = $674 ? $629 : $$5519$ph$i;
       $676 = ($675|0)<(0);
       $677 = $676 << 31 >> 31;
       $678 = (_fmt_u($675,$677,$20)|0);
       $679 = $678;
       $680 = (($22) - ($679))|0;
       $681 = ($680|0)<(2);
       if ($681) {
        $$1512617$i = $678;
        while(1) {
         $682 = ((($$1512617$i)) + -1|0);
         HEAP8[$682>>0] = 48;
         $683 = $682;
         $684 = (($22) - ($683))|0;
         $685 = ($684|0)<(2);
         if ($685) {
          $$1512617$i = $682;
         } else {
          $$1512$lcssa$i = $682;
          break;
         }
        }
       } else {
        $$1512$lcssa$i = $678;
       }
       $686 = $$5519$ph$i >> 31;
       $687 = $686 & 2;
       $688 = (($687) + 43)|0;
       $689 = $688&255;
       $690 = ((($$1512$lcssa$i)) + -1|0);
       HEAP8[$690>>0] = $689;
       $691 = $$1480$i&255;
       $692 = ((($$1512$lcssa$i)) + -2|0);
       HEAP8[$692>>0] = $691;
       $693 = $692;
       $694 = (($22) - ($693))|0;
       $$2513$i = $692;$$pn$i = $694;
      }
      $695 = (($$0520$i) + 1)|0;
      $696 = (($695) + ($$3477$i))|0;
      $$1527$i = (($696) + ($669))|0;
      $697 = (($$1527$i) + ($$pn$i))|0;
      _pad($0,32,$$1260,$697,$$1263$);
      $698 = HEAP32[$0>>2]|0;
      $699 = $698 & 32;
      $700 = ($699|0)==(0);
      if ($700) {
       (___fwritex($$0522$i,$$0520$i,$0)|0);
      }
      $701 = $$1263$ ^ 65536;
      _pad($0,48,$$1260,$697,$701);
      do {
       if ($671) {
        $702 = ($$9$ph$i>>>0)>($$554$i>>>0);
        $$0496$$9$i = $702 ? $$554$i : $$9$ph$i;
        $$5493606$i = $$0496$$9$i;
        while(1) {
         $703 = HEAP32[$$5493606$i>>2]|0;
         $704 = (_fmt_u($703,0,$27)|0);
         $705 = ($$5493606$i|0)==($$0496$$9$i|0);
         do {
          if ($705) {
           $711 = ($704|0)==($27|0);
           if (!($711)) {
            $$1465$i = $704;
            break;
           }
           HEAP8[$29>>0] = 48;
           $$1465$i = $29;
          } else {
           $706 = ($704>>>0)>($7>>>0);
           if (!($706)) {
            $$1465$i = $704;
            break;
           }
           $707 = $704;
           $708 = (($707) - ($18))|0;
           _memset(($7|0),48,($708|0))|0;
           $$0464603$i = $704;
           while(1) {
            $709 = ((($$0464603$i)) + -1|0);
            $710 = ($709>>>0)>($7>>>0);
            if ($710) {
             $$0464603$i = $709;
            } else {
             $$1465$i = $709;
             break;
            }
           }
          }
         } while(0);
         $712 = HEAP32[$0>>2]|0;
         $713 = $712 & 32;
         $714 = ($713|0)==(0);
         if ($714) {
          $715 = $$1465$i;
          $716 = (($28) - ($715))|0;
          (___fwritex($$1465$i,$716,$0)|0);
         }
         $717 = ((($$5493606$i)) + 4|0);
         $718 = ($717>>>0)>($$554$i>>>0);
         if ($718) {
          break;
         } else {
          $$5493606$i = $717;
         }
        }
        $719 = ($667|0)==(0);
        do {
         if (!($719)) {
          $720 = HEAP32[$0>>2]|0;
          $721 = $720 & 32;
          $722 = ($721|0)==(0);
          if (!($722)) {
           break;
          }
          (___fwritex(2133,1,$0)|0);
         }
        } while(0);
        $723 = ($717>>>0)<($$7505$i>>>0);
        $724 = ($$3477$i|0)>(0);
        $725 = $724 & $723;
        if ($725) {
         $$4478600$i = $$3477$i;$$6494599$i = $717;
         while(1) {
          $726 = HEAP32[$$6494599$i>>2]|0;
          $727 = (_fmt_u($726,0,$27)|0);
          $728 = ($727>>>0)>($7>>>0);
          if ($728) {
           $729 = $727;
           $730 = (($729) - ($18))|0;
           _memset(($7|0),48,($730|0))|0;
           $$0463594$i = $727;
           while(1) {
            $731 = ((($$0463594$i)) + -1|0);
            $732 = ($731>>>0)>($7>>>0);
            if ($732) {
             $$0463594$i = $731;
            } else {
             $$0463$lcssa$i = $731;
             break;
            }
           }
          } else {
           $$0463$lcssa$i = $727;
          }
          $733 = HEAP32[$0>>2]|0;
          $734 = $733 & 32;
          $735 = ($734|0)==(0);
          if ($735) {
           $736 = ($$4478600$i|0)>(9);
           $737 = $736 ? 9 : $$4478600$i;
           (___fwritex($$0463$lcssa$i,$737,$0)|0);
          }
          $738 = ((($$6494599$i)) + 4|0);
          $739 = (($$4478600$i) + -9)|0;
          $740 = ($738>>>0)<($$7505$i>>>0);
          $741 = ($$4478600$i|0)>(9);
          $742 = $741 & $740;
          if ($742) {
           $$4478600$i = $739;$$6494599$i = $738;
          } else {
           $$4478$lcssa$i = $739;
           break;
          }
         }
        } else {
         $$4478$lcssa$i = $$3477$i;
        }
        $743 = (($$4478$lcssa$i) + 9)|0;
        _pad($0,48,$743,9,0);
       } else {
        $744 = ((($$9$ph$i)) + 4|0);
        $$7505$$i = $$lcssa683$i ? $$7505$i : $744;
        $745 = ($$3477$i|0)>(-1);
        if ($745) {
         $746 = ($$pre$phi704$iZ2D|0)==(0);
         $$5611$i = $$3477$i;$$7495610$i = $$9$ph$i;
         while(1) {
          $747 = HEAP32[$$7495610$i>>2]|0;
          $748 = (_fmt_u($747,0,$27)|0);
          $749 = ($748|0)==($27|0);
          if ($749) {
           HEAP8[$29>>0] = 48;
           $$0$i = $29;
          } else {
           $$0$i = $748;
          }
          $750 = ($$7495610$i|0)==($$9$ph$i|0);
          do {
           if ($750) {
            $754 = ((($$0$i)) + 1|0);
            $755 = HEAP32[$0>>2]|0;
            $756 = $755 & 32;
            $757 = ($756|0)==(0);
            if ($757) {
             (___fwritex($$0$i,1,$0)|0);
            }
            $758 = ($$5611$i|0)<(1);
            $or$cond552$i = $746 & $758;
            if ($or$cond552$i) {
             $$2$i = $754;
             break;
            }
            $759 = HEAP32[$0>>2]|0;
            $760 = $759 & 32;
            $761 = ($760|0)==(0);
            if (!($761)) {
             $$2$i = $754;
             break;
            }
            (___fwritex(2133,1,$0)|0);
            $$2$i = $754;
           } else {
            $751 = ($$0$i>>>0)>($7>>>0);
            if (!($751)) {
             $$2$i = $$0$i;
             break;
            }
            $scevgep694$i = (($$0$i) + ($19)|0);
            $scevgep694695$i = $scevgep694$i;
            _memset(($7|0),48,($scevgep694695$i|0))|0;
            $$1607$i = $$0$i;
            while(1) {
             $752 = ((($$1607$i)) + -1|0);
             $753 = ($752>>>0)>($7>>>0);
             if ($753) {
              $$1607$i = $752;
             } else {
              $$2$i = $752;
              break;
             }
            }
           }
          } while(0);
          $762 = $$2$i;
          $763 = (($28) - ($762))|0;
          $764 = HEAP32[$0>>2]|0;
          $765 = $764 & 32;
          $766 = ($765|0)==(0);
          if ($766) {
           $767 = ($$5611$i|0)>($763|0);
           $768 = $767 ? $763 : $$5611$i;
           (___fwritex($$2$i,$768,$0)|0);
          }
          $769 = (($$5611$i) - ($763))|0;
          $770 = ((($$7495610$i)) + 4|0);
          $771 = ($770>>>0)<($$7505$$i>>>0);
          $772 = ($769|0)>(-1);
          $773 = $771 & $772;
          if ($773) {
           $$5611$i = $769;$$7495610$i = $770;
          } else {
           $$5$lcssa$i = $769;
           break;
          }
         }
        } else {
         $$5$lcssa$i = $$3477$i;
        }
        $774 = (($$5$lcssa$i) + 18)|0;
        _pad($0,48,$774,18,0);
        $775 = HEAP32[$0>>2]|0;
        $776 = $775 & 32;
        $777 = ($776|0)==(0);
        if (!($777)) {
         break;
        }
        $778 = $$2513$i;
        $779 = (($22) - ($778))|0;
        (___fwritex($$2513$i,$779,$0)|0);
       }
      } while(0);
      $780 = $$1263$ ^ 8192;
      _pad($0,32,$$1260,$697,$780);
      $781 = ($697|0)<($$1260|0);
      $$553$i = $781 ? $$1260 : $697;
      $$0470$i = $$553$i;
     } else {
      $388 = $$0235 & 32;
      $389 = ($388|0)!=(0);
      $390 = $389 ? 2117 : 2121;
      $391 = ($$0471$i != $$0471$i) | (0.0 != 0.0);
      $392 = $389 ? 2125 : 2129;
      $$1521$i = $391 ? 0 : $$0520$i;
      $$0510$i = $391 ? $392 : $390;
      $393 = (($$1521$i) + 3)|0;
      _pad($0,32,$$1260,$393,$187);
      $394 = HEAP32[$0>>2]|0;
      $395 = $394 & 32;
      $396 = ($395|0)==(0);
      if ($396) {
       (___fwritex($$0522$i,$$1521$i,$0)|0);
       $$pre$i = HEAP32[$0>>2]|0;
       $398 = $$pre$i;
      } else {
       $398 = $394;
      }
      $397 = $398 & 32;
      $399 = ($397|0)==(0);
      if ($399) {
       (___fwritex($$0510$i,3,$0)|0);
      }
      $400 = $$1263$ ^ 8192;
      _pad($0,32,$$1260,$393,$400);
      $401 = ($393|0)<($$1260|0);
      $402 = $401 ? $$1260 : $393;
      $$0470$i = $402;
     }
    } while(0);
    $$0243 = $$0470$i;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
    continue L1;
    break;
   }
   default: {
    $$2 = $$0321;$$2234 = 0;$$2239 = 2081;$$2251 = $14;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L310: do {
   if ((label|0) == 63) {
    label = 0;
    $218 = $9;
    $219 = $218;
    $220 = HEAP32[$219>>2]|0;
    $221 = (($218) + 4)|0;
    $222 = $221;
    $223 = HEAP32[$222>>2]|0;
    $224 = $$1236 & 32;
    $225 = ($220|0)==(0);
    $226 = ($223|0)==(0);
    $227 = $225 & $226;
    if ($227) {
     $$05$lcssa$i = $14;$249 = 0;$251 = 0;
    } else {
     $$056$i = $14;$229 = $220;$236 = $223;
     while(1) {
      $228 = $229 & 15;
      $230 = (2065 + ($228)|0);
      $231 = HEAP8[$230>>0]|0;
      $232 = $231&255;
      $233 = $232 | $224;
      $234 = $233&255;
      $235 = ((($$056$i)) + -1|0);
      HEAP8[$235>>0] = $234;
      $237 = (_bitshift64Lshr(($229|0),($236|0),4)|0);
      $238 = tempRet0;
      $239 = ($237|0)==(0);
      $240 = ($238|0)==(0);
      $241 = $239 & $240;
      if ($241) {
       break;
      } else {
       $$056$i = $235;$229 = $237;$236 = $238;
      }
     }
     $242 = $9;
     $243 = $242;
     $244 = HEAP32[$243>>2]|0;
     $245 = (($242) + 4)|0;
     $246 = $245;
     $247 = HEAP32[$246>>2]|0;
     $$05$lcssa$i = $235;$249 = $244;$251 = $247;
    }
    $248 = ($249|0)==(0);
    $250 = ($251|0)==(0);
    $252 = $248 & $250;
    $253 = $$3265 & 8;
    $254 = ($253|0)==(0);
    $or$cond282 = $254 | $252;
    $255 = $$1236 >> 4;
    $256 = (2081 + ($255)|0);
    $$332 = $or$cond282 ? 2081 : $256;
    $$333 = $or$cond282 ? 0 : 2;
    $$0228 = $$05$lcssa$i;$$1233 = $$333;$$1238 = $$332;$$2256 = $$1255;$$4266 = $$3265;
    label = 76;
   }
   else if ((label|0) == 75) {
    label = 0;
    $302 = (_fmt_u($300,$301,$14)|0);
    $$0228 = $302;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;
    label = 76;
   }
   else if ((label|0) == 81) {
    label = 0;
    $334 = (_memchr($$1,0,$$0254)|0);
    $335 = ($334|0)==(0|0);
    $336 = $334;
    $337 = $$1;
    $338 = (($336) - ($337))|0;
    $339 = (($$1) + ($$0254)|0);
    $$3257 = $335 ? $$0254 : $338;
    $$1250 = $335 ? $339 : $334;
    $$2 = $$1;$$2234 = 0;$$2239 = 2081;$$2251 = $$1250;$$5 = $$3257;$$6268 = $187;
   }
   else if ((label|0) == 85) {
    label = 0;
    $$0229396 = $809;$$0240395 = 0;$$1244394 = 0;
    while(1) {
     $347 = HEAP32[$$0229396>>2]|0;
     $348 = ($347|0)==(0);
     if ($348) {
      $$0240$lcssa = $$0240395;$$2245 = $$1244394;
      break;
     }
     $349 = (_wctomb($12,$347)|0);
     $350 = ($349|0)<(0);
     $351 = (($$4258458) - ($$0240395))|0;
     $352 = ($349>>>0)>($351>>>0);
     $or$cond285 = $350 | $352;
     if ($or$cond285) {
      $$0240$lcssa = $$0240395;$$2245 = $349;
      break;
     }
     $353 = ((($$0229396)) + 4|0);
     $354 = (($349) + ($$0240395))|0;
     $355 = ($$4258458>>>0)>($354>>>0);
     if ($355) {
      $$0229396 = $353;$$0240395 = $354;$$1244394 = $349;
     } else {
      $$0240$lcssa = $354;$$2245 = $349;
      break;
     }
    }
    $356 = ($$2245|0)<(0);
    if ($356) {
     $$0 = -1;
     break L1;
    }
    _pad($0,32,$$1260,$$0240$lcssa,$$1263$);
    $357 = ($$0240$lcssa|0)==(0);
    if ($357) {
     $$0240$lcssa460 = 0;
     label = 96;
    } else {
     $$1230407 = $809;$$1241406 = 0;
     while(1) {
      $358 = HEAP32[$$1230407>>2]|0;
      $359 = ($358|0)==(0);
      if ($359) {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break L310;
      }
      $360 = ((($$1230407)) + 4|0);
      $361 = (_wctomb($12,$358)|0);
      $362 = (($361) + ($$1241406))|0;
      $363 = ($362|0)>($$0240$lcssa|0);
      if ($363) {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break L310;
      }
      $364 = HEAP32[$0>>2]|0;
      $365 = $364 & 32;
      $366 = ($365|0)==(0);
      if ($366) {
       (___fwritex($12,$361,$0)|0);
      }
      $367 = ($362>>>0)<($$0240$lcssa>>>0);
      if ($367) {
       $$1230407 = $360;$$1241406 = $362;
      } else {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 96) {
   label = 0;
   $368 = $$1263$ ^ 8192;
   _pad($0,32,$$1260,$$0240$lcssa460,$368);
   $369 = ($$1260|0)>($$0240$lcssa460|0);
   $370 = $369 ? $$1260 : $$0240$lcssa460;
   $$0243 = $370;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
   continue;
  }
  if ((label|0) == 76) {
   label = 0;
   $303 = ($$2256|0)>(-1);
   $304 = $$4266 & -65537;
   $$$4266 = $303 ? $304 : $$4266;
   $305 = $9;
   $306 = $305;
   $307 = HEAP32[$306>>2]|0;
   $308 = (($305) + 4)|0;
   $309 = $308;
   $310 = HEAP32[$309>>2]|0;
   $311 = ($307|0)!=(0);
   $312 = ($310|0)!=(0);
   $313 = $311 | $312;
   $314 = ($$2256|0)!=(0);
   $or$cond = $314 | $313;
   if ($or$cond) {
    $315 = $$0228;
    $316 = (($15) - ($315))|0;
    $317 = $313&1;
    $318 = $317 ^ 1;
    $319 = (($318) + ($316))|0;
    $320 = ($$2256|0)>($319|0);
    $$2256$ = $320 ? $$2256 : $319;
    $$2 = $$0228;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $14;$$5 = $$2256$;$$6268 = $$$4266;
   } else {
    $$2 = $14;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $14;$$5 = 0;$$6268 = $$$4266;
   }
  }
  $782 = $$2251;
  $783 = $$2;
  $784 = (($782) - ($783))|0;
  $785 = ($$5|0)<($784|0);
  $$$5 = $785 ? $784 : $$5;
  $786 = (($$$5) + ($$2234))|0;
  $787 = ($$1260|0)<($786|0);
  $$2261 = $787 ? $786 : $$1260;
  _pad($0,32,$$2261,$786,$$6268);
  $788 = HEAP32[$0>>2]|0;
  $789 = $788 & 32;
  $790 = ($789|0)==(0);
  if ($790) {
   (___fwritex($$2239,$$2234,$0)|0);
  }
  $791 = $$6268 ^ 65536;
  _pad($0,48,$$2261,$786,$791);
  _pad($0,48,$$$5,$784,0);
  $792 = HEAP32[$0>>2]|0;
  $793 = $792 & 32;
  $794 = ($793|0)==(0);
  if ($794) {
   (___fwritex($$2,$784,$0)|0);
  }
  $795 = $$6268 ^ 8192;
  _pad($0,32,$$2261,$786,$795);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
 }
 L345: do {
  if ((label|0) == 243) {
   $796 = ($0|0)==(0|0);
   if ($796) {
    $797 = ($$0269|0)==(0);
    if ($797) {
     $$0 = 0;
    } else {
     $$2242381 = 1;
     while(1) {
      $798 = (($4) + ($$2242381<<2)|0);
      $799 = HEAP32[$798>>2]|0;
      $800 = ($799|0)==(0);
      if ($800) {
       $$3379 = $$2242381;
       break;
      }
      $801 = (($3) + ($$2242381<<3)|0);
      _pop_arg($801,$799,$2);
      $802 = (($$2242381) + 1)|0;
      $803 = ($802|0)<(10);
      if ($803) {
       $$2242381 = $802;
      } else {
       $$0 = 1;
       break L345;
      }
     }
     while(1) {
      $806 = (($4) + ($$3379<<2)|0);
      $807 = HEAP32[$806>>2]|0;
      $808 = ($807|0)==(0);
      $805 = (($$3379) + 1)|0;
      if (!($808)) {
       $$0 = -1;
       break L345;
      }
      $804 = ($805|0)<(10);
      if ($804) {
       $$3379 = $805;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$032 = 0, $$033 = 0, $$034 = 0, $$1 = 0, $$pre = 0, $$pre38 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$032 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 7]($2,$0,$1)|0);
    $$032 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$0 = $1;
     while(1) {
      $21 = ($$0|0)==(0);
      if ($21) {
       $$033 = $1;$$034 = $0;$$1 = 0;$32 = $14;
       break L10;
      }
      $22 = (($$0) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$0 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 7]($2,$0,$$0)|0);
     $29 = ($28>>>0)<($$0>>>0);
     if ($29) {
      $$032 = $$0;
      break L5;
     }
     $30 = (($0) + ($$0)|0);
     $31 = (($1) - ($$0))|0;
     $$pre38 = HEAP32[$9>>2]|0;
     $$033 = $31;$$034 = $30;$$1 = $$0;$32 = $$pre38;
    } else {
     $$033 = $1;$$034 = $0;$$1 = 0;$32 = $14;
    }
   } while(0);
   _memcpy(($32|0),($$034|0),($$033|0))|0;
   $33 = HEAP32[$9>>2]|0;
   $34 = (($33) + ($$033)|0);
   HEAP32[$9>>2] = $34;
   $35 = (($$1) + ($$033))|0;
   $$032 = $35;
  }
 } while(0);
 return ($$032|0);
}
function _pop_arg($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10 | 48;
   $13 = $12&255;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $$011$lcssa = 0, $$01113 = 0, $$015 = 0, $$112 = 0, $$114 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$015 = 0;
 while(1) {
  $2 = (2135 + ($$015)|0);
  $3 = HEAP8[$2>>0]|0;
  $4 = $3&255;
  $5 = ($4|0)==($0|0);
  if ($5) {
   label = 2;
   break;
  }
  $6 = (($$015) + 1)|0;
  $7 = ($6|0)==(87);
  if ($7) {
   $$01113 = 2223;$$114 = 87;
   label = 5;
   break;
  } else {
   $$015 = $6;
  }
 }
 if ((label|0) == 2) {
  $1 = ($$015|0)==(0);
  if ($1) {
   $$011$lcssa = 2223;
  } else {
   $$01113 = 2223;$$114 = $$015;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$112 = $$01113;
   while(1) {
    $8 = HEAP8[$$112>>0]|0;
    $9 = ($8<<24>>24)==(0);
    $10 = ((($$112)) + 1|0);
    if ($9) {
     break;
    } else {
     $$112 = $10;
    }
   }
   $11 = (($$114) + -1)|0;
   $12 = ($11|0)==(0);
   if ($12) {
    $$011$lcssa = $10;
    break;
   } else {
    $$01113 = $10;$$114 = $11;
    label = 5;
   }
  }
 }
 return ($$011$lcssa|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa16 = 0, $$012 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 do {
  if ($or$cond) {
   $9 = (($2) - ($3))|0;
   $10 = ($9>>>0)>(256);
   $11 = $10 ? 256 : $9;
   _memset(($5|0),($1|0),($11|0))|0;
   $12 = ($9>>>0)>(255);
   $13 = HEAP32[$0>>2]|0;
   $14 = $13 & 32;
   $15 = ($14|0)==(0);
   if ($12) {
    $16 = (($2) - ($3))|0;
    $$012 = $9;$23 = $13;$24 = $15;
    while(1) {
     if ($24) {
      (___fwritex($5,256,$0)|0);
      $$pre = HEAP32[$0>>2]|0;
      $20 = $$pre;
     } else {
      $20 = $23;
     }
     $17 = (($$012) + -256)|0;
     $18 = ($17>>>0)>(255);
     $19 = $20 & 32;
     $21 = ($19|0)==(0);
     if ($18) {
      $$012 = $17;$23 = $20;$24 = $21;
     } else {
      break;
     }
    }
    $22 = $16 & 255;
    if ($21) {
     $$0$lcssa16 = $22;
    } else {
     break;
    }
   } else {
    if ($15) {
     $$0$lcssa16 = $9;
    } else {
     break;
    }
   }
   (___fwritex($5,$$0$lcssa16,$0)|0);
  }
 } while(0);
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = ($1>>>0)<(2048);
   if ($6) {
    $7 = $1 >>> 6;
    $8 = $7 | 192;
    $9 = $8&255;
    $10 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $9;
    $11 = $1 & 63;
    $12 = $11 | 128;
    $13 = $12&255;
    HEAP8[$10>>0] = $13;
    $$0 = 2;
    break;
   }
   $14 = ($1>>>0)<(55296);
   $15 = $1 & -8192;
   $16 = ($15|0)==(57344);
   $or$cond = $14 | $16;
   if ($or$cond) {
    $17 = $1 >>> 12;
    $18 = $17 | 224;
    $19 = $18&255;
    $20 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $19;
    $21 = $1 >>> 6;
    $22 = $21 & 63;
    $23 = $22 | 128;
    $24 = $23&255;
    $25 = ((($0)) + 2|0);
    HEAP8[$20>>0] = $24;
    $26 = $1 & 63;
    $27 = $26 | 128;
    $28 = $27&255;
    HEAP8[$25>>0] = $28;
    $$0 = 3;
    break;
   }
   $29 = (($1) + -65536)|0;
   $30 = ($29>>>0)<(1048576);
   if ($30) {
    $31 = $1 >>> 18;
    $32 = $31 | 240;
    $33 = $32&255;
    $34 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $33;
    $35 = $1 >>> 12;
    $36 = $35 & 63;
    $37 = $36 | 128;
    $38 = $37&255;
    $39 = ((($0)) + 2|0);
    HEAP8[$34>>0] = $38;
    $40 = $1 >>> 6;
    $41 = $40 & 63;
    $42 = $41 | 128;
    $43 = $42&255;
    $44 = ((($0)) + 3|0);
    HEAP8[$39>>0] = $43;
    $45 = $1 & 63;
    $46 = $45 | 128;
    $47 = $46&255;
    HEAP8[$44>>0] = $47;
    $$0 = 4;
    break;
   } else {
    $48 = (___errno_location()|0);
    HEAP32[$48>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = $14;
  $18 = ((($0)) + 48|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($17) + ($19)|0);
  $21 = ((($0)) + 16|0);
  HEAP32[$21>>2] = $20;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _sn_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$cast = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 20|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) - ($6))|0;
 $8 = ($7>>>0)>($2>>>0);
 $$ = $8 ? $2 : $7;
 $$cast = $6;
 _memcpy(($$cast|0),($1|0),($$|0))|0;
 $9 = HEAP32[$5>>2]|0;
 $10 = (($9) + ($$)|0);
 HEAP32[$5>>2] = $10;
 return ($2|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$014 = 0, $$015$lcssa = 0, $$01518 = 0, $$1$lcssa = 0, $$pn = 0, $$pn29 = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01518 = $0;$22 = $1;
   while(1) {
    $4 = HEAP8[$$01518>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$pn = $22;
     break L1;
    }
    $6 = ((($$01518)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01518 = $6;$22 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn29 = $$0;
   while(1) {
    $19 = ((($$pn29)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn29 = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$pn = $21;
 }
 $$014 = (($$pn) - ($1))|0;
 return ($$014|0);
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[194]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $28 = 0;
   } else {
    $10 = HEAP32[194]|0;
    $11 = (_fflush($10)|0);
    $28 = $11;
   }
   ___lock(((41956)|0));
   $$02325 = HEAP32[(41952)>>2]|0;
   $12 = ($$02325|0)==(0|0);
   if ($12) {
    $$024$lcssa = $28;
   } else {
    $$02327 = $$02325;$$02426 = $28;
    while(1) {
     $13 = ((($$02327)) + 76|0);
     $14 = HEAP32[$13>>2]|0;
     $15 = ($14|0)>(-1);
     if ($15) {
      $16 = (___lockfile($$02327)|0);
      $25 = $16;
     } else {
      $25 = 0;
     }
     $17 = ((($$02327)) + 20|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ((($$02327)) + 28|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($18>>>0)>($20>>>0);
     if ($21) {
      $22 = (___fflush_unlocked($$02327)|0);
      $23 = $22 | $$02426;
      $$1 = $23;
     } else {
      $$1 = $$02426;
     }
     $24 = ($25|0)==(0);
     if (!($24)) {
      ___unlockfile($$02327);
     }
     $26 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$26>>2]|0;
     $27 = ($$023|0)==(0|0);
     if ($27) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___unlock(((41956)|0));
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 7]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = ((($0)) + 40|0);
   $16 = HEAP32[$15>>2]|0;
   $17 = $11;
   $18 = $13;
   $19 = (($17) - ($18))|0;
   (FUNCTION_TABLE_iiii[$16 & 7]($0,$19,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function ___mmap($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr3 = 0, $vararg_ptr4 = 0, $vararg_ptr5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $6 = ($5|0)<(0);
 $7 = $6 << 31 >> 31;
 $8 = $5 & 4095;
 $9 = $7 & -4096;
 $10 = ($8|0)==(0);
 $11 = ($9|0)==(0);
 $12 = $10 & $11;
 do {
  if ($12) {
   $14 = ($1>>>0)>(2147483646);
   if ($14) {
    $15 = (___errno_location()|0);
    HEAP32[$15>>2] = 12;
    $$0 = (-1);
    break;
   }
   $16 = $3 & 16;
   $17 = ($16|0)!=(0);
   if ($17) {
    _dummy1(-1);
   }
   $18 = $5 >> 12;
   HEAP32[$vararg_buffer>>2] = $0;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $1;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $2;
   $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
   HEAP32[$vararg_ptr3>>2] = $3;
   $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
   HEAP32[$vararg_ptr4>>2] = $4;
   $vararg_ptr5 = ((($vararg_buffer)) + 20|0);
   HEAP32[$vararg_ptr5>>2] = $18;
   $19 = (___syscall192(192,($vararg_buffer|0))|0);
   $20 = (___syscall_ret($19)|0);
   $21 = $20;
   if ($17) {
    _dummy0();
    $$0 = $21;
   } else {
    $$0 = $21;
   }
  } else {
   $13 = (___errno_location()|0);
   HEAP32[$13>>2] = 22;
   $$0 = (-1);
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _dummy0() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _dummy1($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___munmap($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _dummy1(-1);
 HEAP32[$vararg_buffer>>2] = $0;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $1;
 $2 = (___syscall91(91,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 _dummy0();
 STACKTOP = sp;return ($3|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 7]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _fputs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($0)|0);
 $3 = (_fwrite($0,$2,1,$1)|0);
 $4 = (($3) + -1)|0;
 return ($4|0);
}
function _fwrite($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = Math_imul($2, $1)|0;
 $5 = ((($3)) + 76|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)>(-1);
 if ($7) {
  $9 = (___lockfile($3)|0);
  $phitmp = ($9|0)==(0);
  $10 = (___fwritex($0,$4,$3)|0);
  if ($phitmp) {
   $12 = $10;
  } else {
   ___unlockfile($3);
   $12 = $10;
  }
 } else {
  $8 = (___fwritex($0,$4,$3)|0);
  $12 = $8;
 }
 $11 = ($12|0)==($4|0);
 if ($11) {
  $14 = $2;
 } else {
  $13 = (($12>>>0) / ($1>>>0))&-1;
  $14 = $13;
 }
 return ($14|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[165]|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 STACKTOP = sp;return ($3|0);
}
function _puts($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[165]|0;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)>(-1);
 if ($4) {
  $5 = (___lockfile($1)|0);
  $21 = $5;
 } else {
  $21 = 0;
 }
 $6 = (_fputs($0,$1)|0);
 $7 = ($6|0)<(0);
 do {
  if ($7) {
   $19 = 1;
  } else {
   $8 = ((($1)) + 75|0);
   $9 = HEAP8[$8>>0]|0;
   $10 = ($9<<24>>24)==(10);
   if (!($10)) {
    $11 = ((($1)) + 20|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ((($1)) + 16|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($12>>>0)<($14>>>0);
    if ($15) {
     $16 = ((($12)) + 1|0);
     HEAP32[$11>>2] = $16;
     HEAP8[$12>>0] = 10;
     $19 = 0;
     break;
    }
   }
   $17 = (___overflow($1,10)|0);
   $phitmp = ($17|0)<(0);
   $19 = $phitmp;
  }
 } while(0);
 $18 = $19 << 31 >> 31;
 $20 = ($21|0)==(0);
 if (!($20)) {
  ___unlockfile($1);
 }
 return ($18|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0190$i = 0, $$$0191$i = 0, $$$4349$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0$i18$i = 0, $$01$i$i = 0, $$0187$i = 0, $$0189$i = 0, $$0190$i = 0, $$0191$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0;
 var $$024370$i = 0, $$0286$i$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0294$i$i = 0, $$0295$i$i = 0, $$0340$i = 0, $$0342$i = 0, $$0343$i = 0, $$0345$i = 0, $$0351$i = 0, $$0356$i = 0, $$0357$$i = 0, $$0357$i = 0, $$0359$i = 0, $$0360$i = 0, $$0366$i = 0, $$1194$i = 0, $$1196$i = 0, $$124469$i = 0;
 var $$1290$i$i = 0, $$1292$i$i = 0, $$1341$i = 0, $$1346$i = 0, $$1361$i = 0, $$1368$i = 0, $$1372$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2353$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i201 = 0, $$3348$i = 0, $$3370$i = 0, $$4$lcssa$i = 0, $$413$i = 0, $$4349$lcssa$i = 0, $$434912$i = 0, $$4355$$4$i = 0;
 var $$4355$ph$i = 0, $$435511$i = 0, $$5256$i = 0, $$723947$i = 0, $$748$i = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i19$i = 0, $$pre$i205 = 0, $$pre$i208 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i20$iZ2D = 0, $$pre$phi$i206Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre9$i$i = 0, $1 = 0;
 var $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0;
 var $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0;
 var $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0;
 var $1053 = 0, $1054 = 0, $1055 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0;
 var $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0;
 var $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0;
 var $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0;
 var $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0;
 var $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0;
 var $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0;
 var $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0;
 var $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0;
 var $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0;
 var $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0;
 var $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0;
 var $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0;
 var $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0;
 var $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0;
 var $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0;
 var $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0;
 var $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0;
 var $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0;
 var $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0;
 var $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0;
 var $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0;
 var $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0;
 var $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0;
 var $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0;
 var $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0;
 var $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0;
 var $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0;
 var $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0;
 var $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0;
 var $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0;
 var $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0;
 var $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0;
 var $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0;
 var $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0;
 var $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0;
 var $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0;
 var $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0;
 var $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0;
 var $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0;
 var $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0;
 var $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0;
 var $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0;
 var $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0;
 var $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i204 = 0, $exitcond$i$i = 0, $not$$i$i = 0, $not$$i22$i = 0;
 var $not$7$i = 0, $or$cond$i = 0, $or$cond$i211 = 0, $or$cond1$i = 0, $or$cond1$i210 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[10494]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (42016 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[10494] = $24;
     } else {
      $25 = HEAP32[(41992)>>2]|0;
      $26 = ($20>>>0)<($25>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(41984)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (42016 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($69|0)==($73|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[10494] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(41992)>>2]|0;
       $79 = ($73>>>0)<($78>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($87) + ($84)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(41996)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (42016 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[10494] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(41992)>>2]|0;
       $104 = ($102>>>0)<($103>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(41984)>>2] = $84;
     HEAP32[(41996)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(41980)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (42280 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $$0189$i = $134;$$0190$i = $134;$$0191$i = $138;
     while(1) {
      $139 = ((($$0189$i)) + 16|0);
      $140 = HEAP32[$139>>2]|0;
      $141 = ($140|0)==(0|0);
      if ($141) {
       $142 = ((($$0189$i)) + 20|0);
       $143 = HEAP32[$142>>2]|0;
       $144 = ($143|0)==(0|0);
       if ($144) {
        break;
       } else {
        $146 = $143;
       }
      } else {
       $146 = $140;
      }
      $145 = ((($146)) + 4|0);
      $147 = HEAP32[$145>>2]|0;
      $148 = $147 & -8;
      $149 = (($148) - ($6))|0;
      $150 = ($149>>>0)<($$0191$i>>>0);
      $$$0191$i = $150 ? $149 : $$0191$i;
      $$$0190$i = $150 ? $146 : $$0190$i;
      $$0189$i = $146;$$0190$i = $$$0190$i;$$0191$i = $$$0191$i;
     }
     $151 = HEAP32[(41992)>>2]|0;
     $152 = ($$0190$i>>>0)<($151>>>0);
     if ($152) {
      _abort();
      // unreachable;
     }
     $153 = (($$0190$i) + ($6)|0);
     $154 = ($$0190$i>>>0)<($153>>>0);
     if (!($154)) {
      _abort();
      // unreachable;
     }
     $155 = ((($$0190$i)) + 24|0);
     $156 = HEAP32[$155>>2]|0;
     $157 = ((($$0190$i)) + 12|0);
     $158 = HEAP32[$157>>2]|0;
     $159 = ($158|0)==($$0190$i|0);
     do {
      if ($159) {
       $169 = ((($$0190$i)) + 20|0);
       $170 = HEAP32[$169>>2]|0;
       $171 = ($170|0)==(0|0);
       if ($171) {
        $172 = ((($$0190$i)) + 16|0);
        $173 = HEAP32[$172>>2]|0;
        $174 = ($173|0)==(0|0);
        if ($174) {
         $$3$i = 0;
         break;
        } else {
         $$1194$i = $173;$$1196$i = $172;
        }
       } else {
        $$1194$i = $170;$$1196$i = $169;
       }
       while(1) {
        $175 = ((($$1194$i)) + 20|0);
        $176 = HEAP32[$175>>2]|0;
        $177 = ($176|0)==(0|0);
        if (!($177)) {
         $$1194$i = $176;$$1196$i = $175;
         continue;
        }
        $178 = ((($$1194$i)) + 16|0);
        $179 = HEAP32[$178>>2]|0;
        $180 = ($179|0)==(0|0);
        if ($180) {
         break;
        } else {
         $$1194$i = $179;$$1196$i = $178;
        }
       }
       $181 = ($$1196$i>>>0)<($151>>>0);
       if ($181) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1196$i>>2] = 0;
        $$3$i = $$1194$i;
        break;
       }
      } else {
       $160 = ((($$0190$i)) + 8|0);
       $161 = HEAP32[$160>>2]|0;
       $162 = ($161>>>0)<($151>>>0);
       if ($162) {
        _abort();
        // unreachable;
       }
       $163 = ((($161)) + 12|0);
       $164 = HEAP32[$163>>2]|0;
       $165 = ($164|0)==($$0190$i|0);
       if (!($165)) {
        _abort();
        // unreachable;
       }
       $166 = ((($158)) + 8|0);
       $167 = HEAP32[$166>>2]|0;
       $168 = ($167|0)==($$0190$i|0);
       if ($168) {
        HEAP32[$163>>2] = $158;
        HEAP32[$166>>2] = $161;
        $$3$i = $158;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $182 = ($156|0)==(0|0);
     do {
      if (!($182)) {
       $183 = ((($$0190$i)) + 28|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = (42280 + ($184<<2)|0);
       $186 = HEAP32[$185>>2]|0;
       $187 = ($$0190$i|0)==($186|0);
       if ($187) {
        HEAP32[$185>>2] = $$3$i;
        $cond$i = ($$3$i|0)==(0|0);
        if ($cond$i) {
         $188 = 1 << $184;
         $189 = $188 ^ -1;
         $190 = $108 & $189;
         HEAP32[(41980)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(41992)>>2]|0;
        $192 = ($156>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($156)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($$0190$i|0);
        if ($195) {
         HEAP32[$193>>2] = $$3$i;
        } else {
         $196 = ((($156)) + 20|0);
         HEAP32[$196>>2] = $$3$i;
        }
        $197 = ($$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(41992)>>2]|0;
       $199 = ($$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($$3$i)) + 24|0);
       HEAP32[$200>>2] = $156;
       $201 = ((($$0190$i)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($$0190$i)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(41992)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($$0191$i>>>0)<(16);
     if ($214) {
      $215 = (($$0191$i) + ($6))|0;
      $216 = $215 | 3;
      $217 = ((($$0190$i)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($$0190$i) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $6 | 3;
      $223 = ((($$0190$i)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $$0191$i | 1;
      $225 = ((($153)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($153) + ($$0191$i)|0);
      HEAP32[$226>>2] = $$0191$i;
      $227 = ($37|0)==(0);
      if (!($227)) {
       $228 = HEAP32[(41996)>>2]|0;
       $229 = $37 >>> 3;
       $230 = $229 << 1;
       $231 = (42016 + ($230<<2)|0);
       $232 = 1 << $229;
       $233 = $8 & $232;
       $234 = ($233|0)==(0);
       if ($234) {
        $235 = $8 | $232;
        HEAP32[10494] = $235;
        $$pre$i = ((($231)) + 8|0);
        $$0187$i = $231;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $236 = ((($231)) + 8|0);
        $237 = HEAP32[$236>>2]|0;
        $238 = HEAP32[(41992)>>2]|0;
        $239 = ($237>>>0)<($238>>>0);
        if ($239) {
         _abort();
         // unreachable;
        } else {
         $$0187$i = $237;$$pre$phi$iZ2D = $236;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $228;
       $240 = ((($$0187$i)) + 12|0);
       HEAP32[$240>>2] = $228;
       $241 = ((($228)) + 8|0);
       HEAP32[$241>>2] = $$0187$i;
       $242 = ((($228)) + 12|0);
       HEAP32[$242>>2] = $231;
      }
      HEAP32[(41984)>>2] = $$0191$i;
      HEAP32[(41996)>>2] = $153;
     }
     $243 = ((($$0190$i)) + 8|0);
     $$0 = $243;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $244 = ($0>>>0)>(4294967231);
   if ($244) {
    $$0197 = -1;
   } else {
    $245 = (($0) + 11)|0;
    $246 = $245 & -8;
    $247 = HEAP32[(41980)>>2]|0;
    $248 = ($247|0)==(0);
    if ($248) {
     $$0197 = $246;
    } else {
     $249 = (0 - ($246))|0;
     $250 = $245 >>> 8;
     $251 = ($250|0)==(0);
     if ($251) {
      $$0356$i = 0;
     } else {
      $252 = ($246>>>0)>(16777215);
      if ($252) {
       $$0356$i = 31;
      } else {
       $253 = (($250) + 1048320)|0;
       $254 = $253 >>> 16;
       $255 = $254 & 8;
       $256 = $250 << $255;
       $257 = (($256) + 520192)|0;
       $258 = $257 >>> 16;
       $259 = $258 & 4;
       $260 = $259 | $255;
       $261 = $256 << $259;
       $262 = (($261) + 245760)|0;
       $263 = $262 >>> 16;
       $264 = $263 & 2;
       $265 = $260 | $264;
       $266 = (14 - ($265))|0;
       $267 = $261 << $264;
       $268 = $267 >>> 15;
       $269 = (($266) + ($268))|0;
       $270 = $269 << 1;
       $271 = (($269) + 7)|0;
       $272 = $246 >>> $271;
       $273 = $272 & 1;
       $274 = $273 | $270;
       $$0356$i = $274;
      }
     }
     $275 = (42280 + ($$0356$i<<2)|0);
     $276 = HEAP32[$275>>2]|0;
     $277 = ($276|0)==(0|0);
     L123: do {
      if ($277) {
       $$2353$i = 0;$$3$i201 = 0;$$3348$i = $249;
       label = 86;
      } else {
       $278 = ($$0356$i|0)==(31);
       $279 = $$0356$i >>> 1;
       $280 = (25 - ($279))|0;
       $281 = $278 ? 0 : $280;
       $282 = $246 << $281;
       $$0340$i = 0;$$0345$i = $249;$$0351$i = $276;$$0357$i = $282;$$0360$i = 0;
       while(1) {
        $283 = ((($$0351$i)) + 4|0);
        $284 = HEAP32[$283>>2]|0;
        $285 = $284 & -8;
        $286 = (($285) - ($246))|0;
        $287 = ($286>>>0)<($$0345$i>>>0);
        if ($287) {
         $288 = ($286|0)==(0);
         if ($288) {
          $$413$i = $$0351$i;$$434912$i = 0;$$435511$i = $$0351$i;
          label = 90;
          break L123;
         } else {
          $$1341$i = $$0351$i;$$1346$i = $286;
         }
        } else {
         $$1341$i = $$0340$i;$$1346$i = $$0345$i;
        }
        $289 = ((($$0351$i)) + 20|0);
        $290 = HEAP32[$289>>2]|0;
        $291 = $$0357$i >>> 31;
        $292 = (((($$0351$i)) + 16|0) + ($291<<2)|0);
        $293 = HEAP32[$292>>2]|0;
        $294 = ($290|0)==(0|0);
        $295 = ($290|0)==($293|0);
        $or$cond1$i = $294 | $295;
        $$1361$i = $or$cond1$i ? $$0360$i : $290;
        $296 = ($293|0)==(0|0);
        $297 = $296&1;
        $298 = $297 ^ 1;
        $$0357$$i = $$0357$i << $298;
        if ($296) {
         $$2353$i = $$1361$i;$$3$i201 = $$1341$i;$$3348$i = $$1346$i;
         label = 86;
         break;
        } else {
         $$0340$i = $$1341$i;$$0345$i = $$1346$i;$$0351$i = $293;$$0357$i = $$0357$$i;$$0360$i = $$1361$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $299 = ($$2353$i|0)==(0|0);
      $300 = ($$3$i201|0)==(0|0);
      $or$cond$i = $299 & $300;
      if ($or$cond$i) {
       $301 = 2 << $$0356$i;
       $302 = (0 - ($301))|0;
       $303 = $301 | $302;
       $304 = $247 & $303;
       $305 = ($304|0)==(0);
       if ($305) {
        $$0197 = $246;
        break;
       }
       $306 = (0 - ($304))|0;
       $307 = $304 & $306;
       $308 = (($307) + -1)|0;
       $309 = $308 >>> 12;
       $310 = $309 & 16;
       $311 = $308 >>> $310;
       $312 = $311 >>> 5;
       $313 = $312 & 8;
       $314 = $313 | $310;
       $315 = $311 >>> $313;
       $316 = $315 >>> 2;
       $317 = $316 & 4;
       $318 = $314 | $317;
       $319 = $315 >>> $317;
       $320 = $319 >>> 1;
       $321 = $320 & 2;
       $322 = $318 | $321;
       $323 = $319 >>> $321;
       $324 = $323 >>> 1;
       $325 = $324 & 1;
       $326 = $322 | $325;
       $327 = $323 >>> $325;
       $328 = (($326) + ($327))|0;
       $329 = (42280 + ($328<<2)|0);
       $330 = HEAP32[$329>>2]|0;
       $$4355$ph$i = $330;
      } else {
       $$4355$ph$i = $$2353$i;
      }
      $331 = ($$4355$ph$i|0)==(0|0);
      if ($331) {
       $$4$lcssa$i = $$3$i201;$$4349$lcssa$i = $$3348$i;
      } else {
       $$413$i = $$3$i201;$$434912$i = $$3348$i;$$435511$i = $$4355$ph$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $332 = ((($$435511$i)) + 4|0);
       $333 = HEAP32[$332>>2]|0;
       $334 = $333 & -8;
       $335 = (($334) - ($246))|0;
       $336 = ($335>>>0)<($$434912$i>>>0);
       $$$4349$i = $336 ? $335 : $$434912$i;
       $$4355$$4$i = $336 ? $$435511$i : $$413$i;
       $337 = ((($$435511$i)) + 16|0);
       $338 = HEAP32[$337>>2]|0;
       $339 = ($338|0)==(0|0);
       if (!($339)) {
        $$413$i = $$4355$$4$i;$$434912$i = $$$4349$i;$$435511$i = $338;
        label = 90;
        continue;
       }
       $340 = ((($$435511$i)) + 20|0);
       $341 = HEAP32[$340>>2]|0;
       $342 = ($341|0)==(0|0);
       if ($342) {
        $$4$lcssa$i = $$4355$$4$i;$$4349$lcssa$i = $$$4349$i;
        break;
       } else {
        $$413$i = $$4355$$4$i;$$434912$i = $$$4349$i;$$435511$i = $341;
        label = 90;
       }
      }
     }
     $343 = ($$4$lcssa$i|0)==(0|0);
     if ($343) {
      $$0197 = $246;
     } else {
      $344 = HEAP32[(41984)>>2]|0;
      $345 = (($344) - ($246))|0;
      $346 = ($$4349$lcssa$i>>>0)<($345>>>0);
      if ($346) {
       $347 = HEAP32[(41992)>>2]|0;
       $348 = ($$4$lcssa$i>>>0)<($347>>>0);
       if ($348) {
        _abort();
        // unreachable;
       }
       $349 = (($$4$lcssa$i) + ($246)|0);
       $350 = ($$4$lcssa$i>>>0)<($349>>>0);
       if (!($350)) {
        _abort();
        // unreachable;
       }
       $351 = ((($$4$lcssa$i)) + 24|0);
       $352 = HEAP32[$351>>2]|0;
       $353 = ((($$4$lcssa$i)) + 12|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ($354|0)==($$4$lcssa$i|0);
       do {
        if ($355) {
         $365 = ((($$4$lcssa$i)) + 20|0);
         $366 = HEAP32[$365>>2]|0;
         $367 = ($366|0)==(0|0);
         if ($367) {
          $368 = ((($$4$lcssa$i)) + 16|0);
          $369 = HEAP32[$368>>2]|0;
          $370 = ($369|0)==(0|0);
          if ($370) {
           $$3370$i = 0;
           break;
          } else {
           $$1368$i = $369;$$1372$i = $368;
          }
         } else {
          $$1368$i = $366;$$1372$i = $365;
         }
         while(1) {
          $371 = ((($$1368$i)) + 20|0);
          $372 = HEAP32[$371>>2]|0;
          $373 = ($372|0)==(0|0);
          if (!($373)) {
           $$1368$i = $372;$$1372$i = $371;
           continue;
          }
          $374 = ((($$1368$i)) + 16|0);
          $375 = HEAP32[$374>>2]|0;
          $376 = ($375|0)==(0|0);
          if ($376) {
           break;
          } else {
           $$1368$i = $375;$$1372$i = $374;
          }
         }
         $377 = ($$1372$i>>>0)<($347>>>0);
         if ($377) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1372$i>>2] = 0;
          $$3370$i = $$1368$i;
          break;
         }
        } else {
         $356 = ((($$4$lcssa$i)) + 8|0);
         $357 = HEAP32[$356>>2]|0;
         $358 = ($357>>>0)<($347>>>0);
         if ($358) {
          _abort();
          // unreachable;
         }
         $359 = ((($357)) + 12|0);
         $360 = HEAP32[$359>>2]|0;
         $361 = ($360|0)==($$4$lcssa$i|0);
         if (!($361)) {
          _abort();
          // unreachable;
         }
         $362 = ((($354)) + 8|0);
         $363 = HEAP32[$362>>2]|0;
         $364 = ($363|0)==($$4$lcssa$i|0);
         if ($364) {
          HEAP32[$359>>2] = $354;
          HEAP32[$362>>2] = $357;
          $$3370$i = $354;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $378 = ($352|0)==(0|0);
       do {
        if ($378) {
         $470 = $247;
        } else {
         $379 = ((($$4$lcssa$i)) + 28|0);
         $380 = HEAP32[$379>>2]|0;
         $381 = (42280 + ($380<<2)|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = ($$4$lcssa$i|0)==($382|0);
         if ($383) {
          HEAP32[$381>>2] = $$3370$i;
          $cond$i204 = ($$3370$i|0)==(0|0);
          if ($cond$i204) {
           $384 = 1 << $380;
           $385 = $384 ^ -1;
           $386 = $247 & $385;
           HEAP32[(41980)>>2] = $386;
           $470 = $386;
           break;
          }
         } else {
          $387 = HEAP32[(41992)>>2]|0;
          $388 = ($352>>>0)<($387>>>0);
          if ($388) {
           _abort();
           // unreachable;
          }
          $389 = ((($352)) + 16|0);
          $390 = HEAP32[$389>>2]|0;
          $391 = ($390|0)==($$4$lcssa$i|0);
          if ($391) {
           HEAP32[$389>>2] = $$3370$i;
          } else {
           $392 = ((($352)) + 20|0);
           HEAP32[$392>>2] = $$3370$i;
          }
          $393 = ($$3370$i|0)==(0|0);
          if ($393) {
           $470 = $247;
           break;
          }
         }
         $394 = HEAP32[(41992)>>2]|0;
         $395 = ($$3370$i>>>0)<($394>>>0);
         if ($395) {
          _abort();
          // unreachable;
         }
         $396 = ((($$3370$i)) + 24|0);
         HEAP32[$396>>2] = $352;
         $397 = ((($$4$lcssa$i)) + 16|0);
         $398 = HEAP32[$397>>2]|0;
         $399 = ($398|0)==(0|0);
         do {
          if (!($399)) {
           $400 = ($398>>>0)<($394>>>0);
           if ($400) {
            _abort();
            // unreachable;
           } else {
            $401 = ((($$3370$i)) + 16|0);
            HEAP32[$401>>2] = $398;
            $402 = ((($398)) + 24|0);
            HEAP32[$402>>2] = $$3370$i;
            break;
           }
          }
         } while(0);
         $403 = ((($$4$lcssa$i)) + 20|0);
         $404 = HEAP32[$403>>2]|0;
         $405 = ($404|0)==(0|0);
         if ($405) {
          $470 = $247;
         } else {
          $406 = HEAP32[(41992)>>2]|0;
          $407 = ($404>>>0)<($406>>>0);
          if ($407) {
           _abort();
           // unreachable;
          } else {
           $408 = ((($$3370$i)) + 20|0);
           HEAP32[$408>>2] = $404;
           $409 = ((($404)) + 24|0);
           HEAP32[$409>>2] = $$3370$i;
           $470 = $247;
           break;
          }
         }
        }
       } while(0);
       $410 = ($$4349$lcssa$i>>>0)<(16);
       do {
        if ($410) {
         $411 = (($$4349$lcssa$i) + ($246))|0;
         $412 = $411 | 3;
         $413 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$413>>2] = $412;
         $414 = (($$4$lcssa$i) + ($411)|0);
         $415 = ((($414)) + 4|0);
         $416 = HEAP32[$415>>2]|0;
         $417 = $416 | 1;
         HEAP32[$415>>2] = $417;
        } else {
         $418 = $246 | 3;
         $419 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$419>>2] = $418;
         $420 = $$4349$lcssa$i | 1;
         $421 = ((($349)) + 4|0);
         HEAP32[$421>>2] = $420;
         $422 = (($349) + ($$4349$lcssa$i)|0);
         HEAP32[$422>>2] = $$4349$lcssa$i;
         $423 = $$4349$lcssa$i >>> 3;
         $424 = ($$4349$lcssa$i>>>0)<(256);
         if ($424) {
          $425 = $423 << 1;
          $426 = (42016 + ($425<<2)|0);
          $427 = HEAP32[10494]|0;
          $428 = 1 << $423;
          $429 = $427 & $428;
          $430 = ($429|0)==(0);
          if ($430) {
           $431 = $427 | $428;
           HEAP32[10494] = $431;
           $$pre$i205 = ((($426)) + 8|0);
           $$0366$i = $426;$$pre$phi$i206Z2D = $$pre$i205;
          } else {
           $432 = ((($426)) + 8|0);
           $433 = HEAP32[$432>>2]|0;
           $434 = HEAP32[(41992)>>2]|0;
           $435 = ($433>>>0)<($434>>>0);
           if ($435) {
            _abort();
            // unreachable;
           } else {
            $$0366$i = $433;$$pre$phi$i206Z2D = $432;
           }
          }
          HEAP32[$$pre$phi$i206Z2D>>2] = $349;
          $436 = ((($$0366$i)) + 12|0);
          HEAP32[$436>>2] = $349;
          $437 = ((($349)) + 8|0);
          HEAP32[$437>>2] = $$0366$i;
          $438 = ((($349)) + 12|0);
          HEAP32[$438>>2] = $426;
          break;
         }
         $439 = $$4349$lcssa$i >>> 8;
         $440 = ($439|0)==(0);
         if ($440) {
          $$0359$i = 0;
         } else {
          $441 = ($$4349$lcssa$i>>>0)>(16777215);
          if ($441) {
           $$0359$i = 31;
          } else {
           $442 = (($439) + 1048320)|0;
           $443 = $442 >>> 16;
           $444 = $443 & 8;
           $445 = $439 << $444;
           $446 = (($445) + 520192)|0;
           $447 = $446 >>> 16;
           $448 = $447 & 4;
           $449 = $448 | $444;
           $450 = $445 << $448;
           $451 = (($450) + 245760)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 2;
           $454 = $449 | $453;
           $455 = (14 - ($454))|0;
           $456 = $450 << $453;
           $457 = $456 >>> 15;
           $458 = (($455) + ($457))|0;
           $459 = $458 << 1;
           $460 = (($458) + 7)|0;
           $461 = $$4349$lcssa$i >>> $460;
           $462 = $461 & 1;
           $463 = $462 | $459;
           $$0359$i = $463;
          }
         }
         $464 = (42280 + ($$0359$i<<2)|0);
         $465 = ((($349)) + 28|0);
         HEAP32[$465>>2] = $$0359$i;
         $466 = ((($349)) + 16|0);
         $467 = ((($466)) + 4|0);
         HEAP32[$467>>2] = 0;
         HEAP32[$466>>2] = 0;
         $468 = 1 << $$0359$i;
         $469 = $470 & $468;
         $471 = ($469|0)==(0);
         if ($471) {
          $472 = $470 | $468;
          HEAP32[(41980)>>2] = $472;
          HEAP32[$464>>2] = $349;
          $473 = ((($349)) + 24|0);
          HEAP32[$473>>2] = $464;
          $474 = ((($349)) + 12|0);
          HEAP32[$474>>2] = $349;
          $475 = ((($349)) + 8|0);
          HEAP32[$475>>2] = $349;
          break;
         }
         $476 = HEAP32[$464>>2]|0;
         $477 = ($$0359$i|0)==(31);
         $478 = $$0359$i >>> 1;
         $479 = (25 - ($478))|0;
         $480 = $477 ? 0 : $479;
         $481 = $$4349$lcssa$i << $480;
         $$0342$i = $481;$$0343$i = $476;
         while(1) {
          $482 = ((($$0343$i)) + 4|0);
          $483 = HEAP32[$482>>2]|0;
          $484 = $483 & -8;
          $485 = ($484|0)==($$4349$lcssa$i|0);
          if ($485) {
           label = 148;
           break;
          }
          $486 = $$0342$i >>> 31;
          $487 = (((($$0343$i)) + 16|0) + ($486<<2)|0);
          $488 = $$0342$i << 1;
          $489 = HEAP32[$487>>2]|0;
          $490 = ($489|0)==(0|0);
          if ($490) {
           label = 145;
           break;
          } else {
           $$0342$i = $488;$$0343$i = $489;
          }
         }
         if ((label|0) == 145) {
          $491 = HEAP32[(41992)>>2]|0;
          $492 = ($487>>>0)<($491>>>0);
          if ($492) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$487>>2] = $349;
           $493 = ((($349)) + 24|0);
           HEAP32[$493>>2] = $$0343$i;
           $494 = ((($349)) + 12|0);
           HEAP32[$494>>2] = $349;
           $495 = ((($349)) + 8|0);
           HEAP32[$495>>2] = $349;
           break;
          }
         }
         else if ((label|0) == 148) {
          $496 = ((($$0343$i)) + 8|0);
          $497 = HEAP32[$496>>2]|0;
          $498 = HEAP32[(41992)>>2]|0;
          $499 = ($497>>>0)>=($498>>>0);
          $not$7$i = ($$0343$i>>>0)>=($498>>>0);
          $500 = $499 & $not$7$i;
          if ($500) {
           $501 = ((($497)) + 12|0);
           HEAP32[$501>>2] = $349;
           HEAP32[$496>>2] = $349;
           $502 = ((($349)) + 8|0);
           HEAP32[$502>>2] = $497;
           $503 = ((($349)) + 12|0);
           HEAP32[$503>>2] = $$0343$i;
           $504 = ((($349)) + 24|0);
           HEAP32[$504>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $505 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $505;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $246;
      }
     }
    }
   }
  }
 } while(0);
 $506 = HEAP32[(41984)>>2]|0;
 $507 = ($506>>>0)<($$0197>>>0);
 if (!($507)) {
  $508 = (($506) - ($$0197))|0;
  $509 = HEAP32[(41996)>>2]|0;
  $510 = ($508>>>0)>(15);
  if ($510) {
   $511 = (($509) + ($$0197)|0);
   HEAP32[(41996)>>2] = $511;
   HEAP32[(41984)>>2] = $508;
   $512 = $508 | 1;
   $513 = ((($511)) + 4|0);
   HEAP32[$513>>2] = $512;
   $514 = (($511) + ($508)|0);
   HEAP32[$514>>2] = $508;
   $515 = $$0197 | 3;
   $516 = ((($509)) + 4|0);
   HEAP32[$516>>2] = $515;
  } else {
   HEAP32[(41984)>>2] = 0;
   HEAP32[(41996)>>2] = 0;
   $517 = $506 | 3;
   $518 = ((($509)) + 4|0);
   HEAP32[$518>>2] = $517;
   $519 = (($509) + ($506)|0);
   $520 = ((($519)) + 4|0);
   $521 = HEAP32[$520>>2]|0;
   $522 = $521 | 1;
   HEAP32[$520>>2] = $522;
  }
  $523 = ((($509)) + 8|0);
  $$0 = $523;
  STACKTOP = sp;return ($$0|0);
 }
 $524 = HEAP32[(41988)>>2]|0;
 $525 = ($524>>>0)>($$0197>>>0);
 if ($525) {
  $526 = (($524) - ($$0197))|0;
  HEAP32[(41988)>>2] = $526;
  $527 = HEAP32[(42000)>>2]|0;
  $528 = (($527) + ($$0197)|0);
  HEAP32[(42000)>>2] = $528;
  $529 = $526 | 1;
  $530 = ((($528)) + 4|0);
  HEAP32[$530>>2] = $529;
  $531 = $$0197 | 3;
  $532 = ((($527)) + 4|0);
  HEAP32[$532>>2] = $531;
  $533 = ((($527)) + 8|0);
  $$0 = $533;
  STACKTOP = sp;return ($$0|0);
 }
 $534 = HEAP32[10612]|0;
 $535 = ($534|0)==(0);
 if ($535) {
  HEAP32[(42456)>>2] = 4096;
  HEAP32[(42452)>>2] = 4096;
  HEAP32[(42460)>>2] = -1;
  HEAP32[(42464)>>2] = -1;
  HEAP32[(42468)>>2] = 0;
  HEAP32[(42420)>>2] = 0;
  $536 = $1;
  $537 = $536 & -16;
  $538 = $537 ^ 1431655768;
  HEAP32[$1>>2] = $538;
  HEAP32[10612] = $538;
  $542 = 4096;
 } else {
  $$pre$i208 = HEAP32[(42456)>>2]|0;
  $542 = $$pre$i208;
 }
 $539 = (($$0197) + 48)|0;
 $540 = (($$0197) + 47)|0;
 $541 = (($542) + ($540))|0;
 $543 = (0 - ($542))|0;
 $544 = $541 & $543;
 $545 = ($544>>>0)>($$0197>>>0);
 if (!($545)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $546 = HEAP32[(42416)>>2]|0;
 $547 = ($546|0)==(0);
 if (!($547)) {
  $548 = HEAP32[(42408)>>2]|0;
  $549 = (($548) + ($544))|0;
  $550 = ($549>>>0)<=($548>>>0);
  $551 = ($549>>>0)>($546>>>0);
  $or$cond1$i210 = $550 | $551;
  if ($or$cond1$i210) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $552 = HEAP32[(42420)>>2]|0;
 $553 = $552 & 4;
 $554 = ($553|0)==(0);
 L255: do {
  if ($554) {
   $555 = HEAP32[(42000)>>2]|0;
   $556 = ($555|0)==(0|0);
   L257: do {
    if ($556) {
     label = 172;
    } else {
     $$0$i17$i = (42424);
     while(1) {
      $557 = HEAP32[$$0$i17$i>>2]|0;
      $558 = ($557>>>0)>($555>>>0);
      if (!($558)) {
       $559 = ((($$0$i17$i)) + 4|0);
       $560 = HEAP32[$559>>2]|0;
       $561 = (($557) + ($560)|0);
       $562 = ($561>>>0)>($555>>>0);
       if ($562) {
        break;
       }
      }
      $563 = ((($$0$i17$i)) + 8|0);
      $564 = HEAP32[$563>>2]|0;
      $565 = ($564|0)==(0|0);
      if ($565) {
       label = 172;
       break L257;
      } else {
       $$0$i17$i = $564;
      }
     }
     $588 = (($541) - ($524))|0;
     $589 = $588 & $543;
     $590 = ($589>>>0)<(2147483647);
     if ($590) {
      $591 = (_sbrk(($589|0))|0);
      $592 = HEAP32[$$0$i17$i>>2]|0;
      $593 = HEAP32[$559>>2]|0;
      $594 = (($592) + ($593)|0);
      $595 = ($591|0)==($594|0);
      if ($595) {
       $596 = ($591|0)==((-1)|0);
       if (!($596)) {
        $$723947$i = $589;$$748$i = $591;
        label = 190;
        break L255;
       }
      } else {
       $$2247$ph$i = $591;$$2253$ph$i = $589;
       label = 180;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 172) {
     $566 = (_sbrk(0)|0);
     $567 = ($566|0)==((-1)|0);
     if (!($567)) {
      $568 = $566;
      $569 = HEAP32[(42452)>>2]|0;
      $570 = (($569) + -1)|0;
      $571 = $570 & $568;
      $572 = ($571|0)==(0);
      $573 = (($570) + ($568))|0;
      $574 = (0 - ($569))|0;
      $575 = $573 & $574;
      $576 = (($575) - ($568))|0;
      $577 = $572 ? 0 : $576;
      $$$i = (($577) + ($544))|0;
      $578 = HEAP32[(42408)>>2]|0;
      $579 = (($$$i) + ($578))|0;
      $580 = ($$$i>>>0)>($$0197>>>0);
      $581 = ($$$i>>>0)<(2147483647);
      $or$cond$i211 = $580 & $581;
      if ($or$cond$i211) {
       $582 = HEAP32[(42416)>>2]|0;
       $583 = ($582|0)==(0);
       if (!($583)) {
        $584 = ($579>>>0)<=($578>>>0);
        $585 = ($579>>>0)>($582>>>0);
        $or$cond2$i = $584 | $585;
        if ($or$cond2$i) {
         break;
        }
       }
       $586 = (_sbrk(($$$i|0))|0);
       $587 = ($586|0)==($566|0);
       if ($587) {
        $$723947$i = $$$i;$$748$i = $566;
        label = 190;
        break L255;
       } else {
        $$2247$ph$i = $586;$$2253$ph$i = $$$i;
        label = 180;
       }
      }
     }
    }
   } while(0);
   L274: do {
    if ((label|0) == 180) {
     $597 = (0 - ($$2253$ph$i))|0;
     $598 = ($$2247$ph$i|0)!=((-1)|0);
     $599 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $599 & $598;
     $600 = ($539>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $600 & $or$cond7$i;
     do {
      if ($or$cond10$i) {
       $601 = HEAP32[(42456)>>2]|0;
       $602 = (($540) - ($$2253$ph$i))|0;
       $603 = (($602) + ($601))|0;
       $604 = (0 - ($601))|0;
       $605 = $603 & $604;
       $606 = ($605>>>0)<(2147483647);
       if ($606) {
        $607 = (_sbrk(($605|0))|0);
        $608 = ($607|0)==((-1)|0);
        if ($608) {
         (_sbrk(($597|0))|0);
         break L274;
        } else {
         $609 = (($605) + ($$2253$ph$i))|0;
         $$5256$i = $609;
         break;
        }
       } else {
        $$5256$i = $$2253$ph$i;
       }
      } else {
       $$5256$i = $$2253$ph$i;
      }
     } while(0);
     $610 = ($$2247$ph$i|0)==((-1)|0);
     if (!($610)) {
      $$723947$i = $$5256$i;$$748$i = $$2247$ph$i;
      label = 190;
      break L255;
     }
    }
   } while(0);
   $611 = HEAP32[(42420)>>2]|0;
   $612 = $611 | 4;
   HEAP32[(42420)>>2] = $612;
   label = 187;
  } else {
   label = 187;
  }
 } while(0);
 if ((label|0) == 187) {
  $613 = ($544>>>0)<(2147483647);
  if ($613) {
   $614 = (_sbrk(($544|0))|0);
   $615 = (_sbrk(0)|0);
   $616 = ($614|0)!=((-1)|0);
   $617 = ($615|0)!=((-1)|0);
   $or$cond5$i = $616 & $617;
   $618 = ($614>>>0)<($615>>>0);
   $or$cond11$i = $618 & $or$cond5$i;
   if ($or$cond11$i) {
    $619 = $615;
    $620 = $614;
    $621 = (($619) - ($620))|0;
    $622 = (($$0197) + 40)|0;
    $$not$i = ($621>>>0)>($622>>>0);
    if ($$not$i) {
     $$723947$i = $621;$$748$i = $614;
     label = 190;
    }
   }
  }
 }
 if ((label|0) == 190) {
  $623 = HEAP32[(42408)>>2]|0;
  $624 = (($623) + ($$723947$i))|0;
  HEAP32[(42408)>>2] = $624;
  $625 = HEAP32[(42412)>>2]|0;
  $626 = ($624>>>0)>($625>>>0);
  if ($626) {
   HEAP32[(42412)>>2] = $624;
  }
  $627 = HEAP32[(42000)>>2]|0;
  $628 = ($627|0)==(0|0);
  do {
   if ($628) {
    $629 = HEAP32[(41992)>>2]|0;
    $630 = ($629|0)==(0|0);
    $631 = ($$748$i>>>0)<($629>>>0);
    $or$cond12$i = $630 | $631;
    if ($or$cond12$i) {
     HEAP32[(41992)>>2] = $$748$i;
    }
    HEAP32[(42424)>>2] = $$748$i;
    HEAP32[(42428)>>2] = $$723947$i;
    HEAP32[(42436)>>2] = 0;
    $632 = HEAP32[10612]|0;
    HEAP32[(42012)>>2] = $632;
    HEAP32[(42008)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $633 = $$01$i$i << 1;
     $634 = (42016 + ($633<<2)|0);
     $635 = ((($634)) + 12|0);
     HEAP32[$635>>2] = $634;
     $636 = ((($634)) + 8|0);
     HEAP32[$636>>2] = $634;
     $637 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($637|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $637;
     }
    }
    $638 = (($$723947$i) + -40)|0;
    $639 = ((($$748$i)) + 8|0);
    $640 = $639;
    $641 = $640 & 7;
    $642 = ($641|0)==(0);
    $643 = (0 - ($640))|0;
    $644 = $643 & 7;
    $645 = $642 ? 0 : $644;
    $646 = (($$748$i) + ($645)|0);
    $647 = (($638) - ($645))|0;
    HEAP32[(42000)>>2] = $646;
    HEAP32[(41988)>>2] = $647;
    $648 = $647 | 1;
    $649 = ((($646)) + 4|0);
    HEAP32[$649>>2] = $648;
    $650 = (($646) + ($647)|0);
    $651 = ((($650)) + 4|0);
    HEAP32[$651>>2] = 40;
    $652 = HEAP32[(42464)>>2]|0;
    HEAP32[(42004)>>2] = $652;
   } else {
    $$024370$i = (42424);
    while(1) {
     $653 = HEAP32[$$024370$i>>2]|0;
     $654 = ((($$024370$i)) + 4|0);
     $655 = HEAP32[$654>>2]|0;
     $656 = (($653) + ($655)|0);
     $657 = ($$748$i|0)==($656|0);
     if ($657) {
      label = 200;
      break;
     }
     $658 = ((($$024370$i)) + 8|0);
     $659 = HEAP32[$658>>2]|0;
     $660 = ($659|0)==(0|0);
     if ($660) {
      break;
     } else {
      $$024370$i = $659;
     }
    }
    if ((label|0) == 200) {
     $661 = ((($$024370$i)) + 12|0);
     $662 = HEAP32[$661>>2]|0;
     $663 = $662 & 8;
     $664 = ($663|0)==(0);
     if ($664) {
      $665 = ($627>>>0)>=($653>>>0);
      $666 = ($627>>>0)<($$748$i>>>0);
      $or$cond50$i = $666 & $665;
      if ($or$cond50$i) {
       $667 = (($655) + ($$723947$i))|0;
       HEAP32[$654>>2] = $667;
       $668 = HEAP32[(41988)>>2]|0;
       $669 = ((($627)) + 8|0);
       $670 = $669;
       $671 = $670 & 7;
       $672 = ($671|0)==(0);
       $673 = (0 - ($670))|0;
       $674 = $673 & 7;
       $675 = $672 ? 0 : $674;
       $676 = (($627) + ($675)|0);
       $677 = (($$723947$i) - ($675))|0;
       $678 = (($677) + ($668))|0;
       HEAP32[(42000)>>2] = $676;
       HEAP32[(41988)>>2] = $678;
       $679 = $678 | 1;
       $680 = ((($676)) + 4|0);
       HEAP32[$680>>2] = $679;
       $681 = (($676) + ($678)|0);
       $682 = ((($681)) + 4|0);
       HEAP32[$682>>2] = 40;
       $683 = HEAP32[(42464)>>2]|0;
       HEAP32[(42004)>>2] = $683;
       break;
      }
     }
    }
    $684 = HEAP32[(41992)>>2]|0;
    $685 = ($$748$i>>>0)<($684>>>0);
    if ($685) {
     HEAP32[(41992)>>2] = $$748$i;
     $749 = $$748$i;
    } else {
     $749 = $684;
    }
    $686 = (($$748$i) + ($$723947$i)|0);
    $$124469$i = (42424);
    while(1) {
     $687 = HEAP32[$$124469$i>>2]|0;
     $688 = ($687|0)==($686|0);
     if ($688) {
      label = 208;
      break;
     }
     $689 = ((($$124469$i)) + 8|0);
     $690 = HEAP32[$689>>2]|0;
     $691 = ($690|0)==(0|0);
     if ($691) {
      $$0$i$i$i = (42424);
      break;
     } else {
      $$124469$i = $690;
     }
    }
    if ((label|0) == 208) {
     $692 = ((($$124469$i)) + 12|0);
     $693 = HEAP32[$692>>2]|0;
     $694 = $693 & 8;
     $695 = ($694|0)==(0);
     if ($695) {
      HEAP32[$$124469$i>>2] = $$748$i;
      $696 = ((($$124469$i)) + 4|0);
      $697 = HEAP32[$696>>2]|0;
      $698 = (($697) + ($$723947$i))|0;
      HEAP32[$696>>2] = $698;
      $699 = ((($$748$i)) + 8|0);
      $700 = $699;
      $701 = $700 & 7;
      $702 = ($701|0)==(0);
      $703 = (0 - ($700))|0;
      $704 = $703 & 7;
      $705 = $702 ? 0 : $704;
      $706 = (($$748$i) + ($705)|0);
      $707 = ((($686)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($686) + ($713)|0);
      $715 = $714;
      $716 = $706;
      $717 = (($715) - ($716))|0;
      $718 = (($706) + ($$0197)|0);
      $719 = (($717) - ($$0197))|0;
      $720 = $$0197 | 3;
      $721 = ((($706)) + 4|0);
      HEAP32[$721>>2] = $720;
      $722 = ($714|0)==($627|0);
      do {
       if ($722) {
        $723 = HEAP32[(41988)>>2]|0;
        $724 = (($723) + ($719))|0;
        HEAP32[(41988)>>2] = $724;
        HEAP32[(42000)>>2] = $718;
        $725 = $724 | 1;
        $726 = ((($718)) + 4|0);
        HEAP32[$726>>2] = $725;
       } else {
        $727 = HEAP32[(41996)>>2]|0;
        $728 = ($714|0)==($727|0);
        if ($728) {
         $729 = HEAP32[(41984)>>2]|0;
         $730 = (($729) + ($719))|0;
         HEAP32[(41984)>>2] = $730;
         HEAP32[(41996)>>2] = $718;
         $731 = $730 | 1;
         $732 = ((($718)) + 4|0);
         HEAP32[$732>>2] = $731;
         $733 = (($718) + ($730)|0);
         HEAP32[$733>>2] = $730;
         break;
        }
        $734 = ((($714)) + 4|0);
        $735 = HEAP32[$734>>2]|0;
        $736 = $735 & 3;
        $737 = ($736|0)==(1);
        if ($737) {
         $738 = $735 & -8;
         $739 = $735 >>> 3;
         $740 = ($735>>>0)<(256);
         L326: do {
          if ($740) {
           $741 = ((($714)) + 8|0);
           $742 = HEAP32[$741>>2]|0;
           $743 = ((($714)) + 12|0);
           $744 = HEAP32[$743>>2]|0;
           $745 = $739 << 1;
           $746 = (42016 + ($745<<2)|0);
           $747 = ($742|0)==($746|0);
           do {
            if (!($747)) {
             $748 = ($742>>>0)<($749>>>0);
             if ($748) {
              _abort();
              // unreachable;
             }
             $750 = ((($742)) + 12|0);
             $751 = HEAP32[$750>>2]|0;
             $752 = ($751|0)==($714|0);
             if ($752) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $753 = ($744|0)==($742|0);
           if ($753) {
            $754 = 1 << $739;
            $755 = $754 ^ -1;
            $756 = HEAP32[10494]|0;
            $757 = $756 & $755;
            HEAP32[10494] = $757;
            break;
           }
           $758 = ($744|0)==($746|0);
           do {
            if ($758) {
             $$pre9$i$i = ((($744)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $759 = ($744>>>0)<($749>>>0);
             if ($759) {
              _abort();
              // unreachable;
             }
             $760 = ((($744)) + 8|0);
             $761 = HEAP32[$760>>2]|0;
             $762 = ($761|0)==($714|0);
             if ($762) {
              $$pre$phi10$i$iZ2D = $760;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $763 = ((($742)) + 12|0);
           HEAP32[$763>>2] = $744;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $742;
          } else {
           $764 = ((($714)) + 24|0);
           $765 = HEAP32[$764>>2]|0;
           $766 = ((($714)) + 12|0);
           $767 = HEAP32[$766>>2]|0;
           $768 = ($767|0)==($714|0);
           do {
            if ($768) {
             $778 = ((($714)) + 16|0);
             $779 = ((($778)) + 4|0);
             $780 = HEAP32[$779>>2]|0;
             $781 = ($780|0)==(0|0);
             if ($781) {
              $782 = HEAP32[$778>>2]|0;
              $783 = ($782|0)==(0|0);
              if ($783) {
               $$3$i$i = 0;
               break;
              } else {
               $$1290$i$i = $782;$$1292$i$i = $778;
              }
             } else {
              $$1290$i$i = $780;$$1292$i$i = $779;
             }
             while(1) {
              $784 = ((($$1290$i$i)) + 20|0);
              $785 = HEAP32[$784>>2]|0;
              $786 = ($785|0)==(0|0);
              if (!($786)) {
               $$1290$i$i = $785;$$1292$i$i = $784;
               continue;
              }
              $787 = ((($$1290$i$i)) + 16|0);
              $788 = HEAP32[$787>>2]|0;
              $789 = ($788|0)==(0|0);
              if ($789) {
               break;
              } else {
               $$1290$i$i = $788;$$1292$i$i = $787;
              }
             }
             $790 = ($$1292$i$i>>>0)<($749>>>0);
             if ($790) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1292$i$i>>2] = 0;
              $$3$i$i = $$1290$i$i;
              break;
             }
            } else {
             $769 = ((($714)) + 8|0);
             $770 = HEAP32[$769>>2]|0;
             $771 = ($770>>>0)<($749>>>0);
             if ($771) {
              _abort();
              // unreachable;
             }
             $772 = ((($770)) + 12|0);
             $773 = HEAP32[$772>>2]|0;
             $774 = ($773|0)==($714|0);
             if (!($774)) {
              _abort();
              // unreachable;
             }
             $775 = ((($767)) + 8|0);
             $776 = HEAP32[$775>>2]|0;
             $777 = ($776|0)==($714|0);
             if ($777) {
              HEAP32[$772>>2] = $767;
              HEAP32[$775>>2] = $770;
              $$3$i$i = $767;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $791 = ($765|0)==(0|0);
           if ($791) {
            break;
           }
           $792 = ((($714)) + 28|0);
           $793 = HEAP32[$792>>2]|0;
           $794 = (42280 + ($793<<2)|0);
           $795 = HEAP32[$794>>2]|0;
           $796 = ($714|0)==($795|0);
           do {
            if ($796) {
             HEAP32[$794>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $797 = 1 << $793;
             $798 = $797 ^ -1;
             $799 = HEAP32[(41980)>>2]|0;
             $800 = $799 & $798;
             HEAP32[(41980)>>2] = $800;
             break L326;
            } else {
             $801 = HEAP32[(41992)>>2]|0;
             $802 = ($765>>>0)<($801>>>0);
             if ($802) {
              _abort();
              // unreachable;
             }
             $803 = ((($765)) + 16|0);
             $804 = HEAP32[$803>>2]|0;
             $805 = ($804|0)==($714|0);
             if ($805) {
              HEAP32[$803>>2] = $$3$i$i;
             } else {
              $806 = ((($765)) + 20|0);
              HEAP32[$806>>2] = $$3$i$i;
             }
             $807 = ($$3$i$i|0)==(0|0);
             if ($807) {
              break L326;
             }
            }
           } while(0);
           $808 = HEAP32[(41992)>>2]|0;
           $809 = ($$3$i$i>>>0)<($808>>>0);
           if ($809) {
            _abort();
            // unreachable;
           }
           $810 = ((($$3$i$i)) + 24|0);
           HEAP32[$810>>2] = $765;
           $811 = ((($714)) + 16|0);
           $812 = HEAP32[$811>>2]|0;
           $813 = ($812|0)==(0|0);
           do {
            if (!($813)) {
             $814 = ($812>>>0)<($808>>>0);
             if ($814) {
              _abort();
              // unreachable;
             } else {
              $815 = ((($$3$i$i)) + 16|0);
              HEAP32[$815>>2] = $812;
              $816 = ((($812)) + 24|0);
              HEAP32[$816>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $817 = ((($811)) + 4|0);
           $818 = HEAP32[$817>>2]|0;
           $819 = ($818|0)==(0|0);
           if ($819) {
            break;
           }
           $820 = HEAP32[(41992)>>2]|0;
           $821 = ($818>>>0)<($820>>>0);
           if ($821) {
            _abort();
            // unreachable;
           } else {
            $822 = ((($$3$i$i)) + 20|0);
            HEAP32[$822>>2] = $818;
            $823 = ((($818)) + 24|0);
            HEAP32[$823>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $824 = (($714) + ($738)|0);
         $825 = (($738) + ($719))|0;
         $$0$i18$i = $824;$$0286$i$i = $825;
        } else {
         $$0$i18$i = $714;$$0286$i$i = $719;
        }
        $826 = ((($$0$i18$i)) + 4|0);
        $827 = HEAP32[$826>>2]|0;
        $828 = $827 & -2;
        HEAP32[$826>>2] = $828;
        $829 = $$0286$i$i | 1;
        $830 = ((($718)) + 4|0);
        HEAP32[$830>>2] = $829;
        $831 = (($718) + ($$0286$i$i)|0);
        HEAP32[$831>>2] = $$0286$i$i;
        $832 = $$0286$i$i >>> 3;
        $833 = ($$0286$i$i>>>0)<(256);
        if ($833) {
         $834 = $832 << 1;
         $835 = (42016 + ($834<<2)|0);
         $836 = HEAP32[10494]|0;
         $837 = 1 << $832;
         $838 = $836 & $837;
         $839 = ($838|0)==(0);
         do {
          if ($839) {
           $840 = $836 | $837;
           HEAP32[10494] = $840;
           $$pre$i19$i = ((($835)) + 8|0);
           $$0294$i$i = $835;$$pre$phi$i20$iZ2D = $$pre$i19$i;
          } else {
           $841 = ((($835)) + 8|0);
           $842 = HEAP32[$841>>2]|0;
           $843 = HEAP32[(41992)>>2]|0;
           $844 = ($842>>>0)<($843>>>0);
           if (!($844)) {
            $$0294$i$i = $842;$$pre$phi$i20$iZ2D = $841;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i20$iZ2D>>2] = $718;
         $845 = ((($$0294$i$i)) + 12|0);
         HEAP32[$845>>2] = $718;
         $846 = ((($718)) + 8|0);
         HEAP32[$846>>2] = $$0294$i$i;
         $847 = ((($718)) + 12|0);
         HEAP32[$847>>2] = $835;
         break;
        }
        $848 = $$0286$i$i >>> 8;
        $849 = ($848|0)==(0);
        do {
         if ($849) {
          $$0295$i$i = 0;
         } else {
          $850 = ($$0286$i$i>>>0)>(16777215);
          if ($850) {
           $$0295$i$i = 31;
           break;
          }
          $851 = (($848) + 1048320)|0;
          $852 = $851 >>> 16;
          $853 = $852 & 8;
          $854 = $848 << $853;
          $855 = (($854) + 520192)|0;
          $856 = $855 >>> 16;
          $857 = $856 & 4;
          $858 = $857 | $853;
          $859 = $854 << $857;
          $860 = (($859) + 245760)|0;
          $861 = $860 >>> 16;
          $862 = $861 & 2;
          $863 = $858 | $862;
          $864 = (14 - ($863))|0;
          $865 = $859 << $862;
          $866 = $865 >>> 15;
          $867 = (($864) + ($866))|0;
          $868 = $867 << 1;
          $869 = (($867) + 7)|0;
          $870 = $$0286$i$i >>> $869;
          $871 = $870 & 1;
          $872 = $871 | $868;
          $$0295$i$i = $872;
         }
        } while(0);
        $873 = (42280 + ($$0295$i$i<<2)|0);
        $874 = ((($718)) + 28|0);
        HEAP32[$874>>2] = $$0295$i$i;
        $875 = ((($718)) + 16|0);
        $876 = ((($875)) + 4|0);
        HEAP32[$876>>2] = 0;
        HEAP32[$875>>2] = 0;
        $877 = HEAP32[(41980)>>2]|0;
        $878 = 1 << $$0295$i$i;
        $879 = $877 & $878;
        $880 = ($879|0)==(0);
        if ($880) {
         $881 = $877 | $878;
         HEAP32[(41980)>>2] = $881;
         HEAP32[$873>>2] = $718;
         $882 = ((($718)) + 24|0);
         HEAP32[$882>>2] = $873;
         $883 = ((($718)) + 12|0);
         HEAP32[$883>>2] = $718;
         $884 = ((($718)) + 8|0);
         HEAP32[$884>>2] = $718;
         break;
        }
        $885 = HEAP32[$873>>2]|0;
        $886 = ($$0295$i$i|0)==(31);
        $887 = $$0295$i$i >>> 1;
        $888 = (25 - ($887))|0;
        $889 = $886 ? 0 : $888;
        $890 = $$0286$i$i << $889;
        $$0287$i$i = $890;$$0288$i$i = $885;
        while(1) {
         $891 = ((($$0288$i$i)) + 4|0);
         $892 = HEAP32[$891>>2]|0;
         $893 = $892 & -8;
         $894 = ($893|0)==($$0286$i$i|0);
         if ($894) {
          label = 278;
          break;
         }
         $895 = $$0287$i$i >>> 31;
         $896 = (((($$0288$i$i)) + 16|0) + ($895<<2)|0);
         $897 = $$0287$i$i << 1;
         $898 = HEAP32[$896>>2]|0;
         $899 = ($898|0)==(0|0);
         if ($899) {
          label = 275;
          break;
         } else {
          $$0287$i$i = $897;$$0288$i$i = $898;
         }
        }
        if ((label|0) == 275) {
         $900 = HEAP32[(41992)>>2]|0;
         $901 = ($896>>>0)<($900>>>0);
         if ($901) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$896>>2] = $718;
          $902 = ((($718)) + 24|0);
          HEAP32[$902>>2] = $$0288$i$i;
          $903 = ((($718)) + 12|0);
          HEAP32[$903>>2] = $718;
          $904 = ((($718)) + 8|0);
          HEAP32[$904>>2] = $718;
          break;
         }
        }
        else if ((label|0) == 278) {
         $905 = ((($$0288$i$i)) + 8|0);
         $906 = HEAP32[$905>>2]|0;
         $907 = HEAP32[(41992)>>2]|0;
         $908 = ($906>>>0)>=($907>>>0);
         $not$$i22$i = ($$0288$i$i>>>0)>=($907>>>0);
         $909 = $908 & $not$$i22$i;
         if ($909) {
          $910 = ((($906)) + 12|0);
          HEAP32[$910>>2] = $718;
          HEAP32[$905>>2] = $718;
          $911 = ((($718)) + 8|0);
          HEAP32[$911>>2] = $906;
          $912 = ((($718)) + 12|0);
          HEAP32[$912>>2] = $$0288$i$i;
          $913 = ((($718)) + 24|0);
          HEAP32[$913>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1044 = ((($706)) + 8|0);
      $$0 = $1044;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0$i$i$i = (42424);
     }
    }
    while(1) {
     $914 = HEAP32[$$0$i$i$i>>2]|0;
     $915 = ($914>>>0)>($627>>>0);
     if (!($915)) {
      $916 = ((($$0$i$i$i)) + 4|0);
      $917 = HEAP32[$916>>2]|0;
      $918 = (($914) + ($917)|0);
      $919 = ($918>>>0)>($627>>>0);
      if ($919) {
       break;
      }
     }
     $920 = ((($$0$i$i$i)) + 8|0);
     $921 = HEAP32[$920>>2]|0;
     $$0$i$i$i = $921;
    }
    $922 = ((($918)) + -47|0);
    $923 = ((($922)) + 8|0);
    $924 = $923;
    $925 = $924 & 7;
    $926 = ($925|0)==(0);
    $927 = (0 - ($924))|0;
    $928 = $927 & 7;
    $929 = $926 ? 0 : $928;
    $930 = (($922) + ($929)|0);
    $931 = ((($627)) + 16|0);
    $932 = ($930>>>0)<($931>>>0);
    $933 = $932 ? $627 : $930;
    $934 = ((($933)) + 8|0);
    $935 = ((($933)) + 24|0);
    $936 = (($$723947$i) + -40)|0;
    $937 = ((($$748$i)) + 8|0);
    $938 = $937;
    $939 = $938 & 7;
    $940 = ($939|0)==(0);
    $941 = (0 - ($938))|0;
    $942 = $941 & 7;
    $943 = $940 ? 0 : $942;
    $944 = (($$748$i) + ($943)|0);
    $945 = (($936) - ($943))|0;
    HEAP32[(42000)>>2] = $944;
    HEAP32[(41988)>>2] = $945;
    $946 = $945 | 1;
    $947 = ((($944)) + 4|0);
    HEAP32[$947>>2] = $946;
    $948 = (($944) + ($945)|0);
    $949 = ((($948)) + 4|0);
    HEAP32[$949>>2] = 40;
    $950 = HEAP32[(42464)>>2]|0;
    HEAP32[(42004)>>2] = $950;
    $951 = ((($933)) + 4|0);
    HEAP32[$951>>2] = 27;
    ;HEAP32[$934>>2]=HEAP32[(42424)>>2]|0;HEAP32[$934+4>>2]=HEAP32[(42424)+4>>2]|0;HEAP32[$934+8>>2]=HEAP32[(42424)+8>>2]|0;HEAP32[$934+12>>2]=HEAP32[(42424)+12>>2]|0;
    HEAP32[(42424)>>2] = $$748$i;
    HEAP32[(42428)>>2] = $$723947$i;
    HEAP32[(42436)>>2] = 0;
    HEAP32[(42432)>>2] = $934;
    $$0$i$i = $935;
    while(1) {
     $952 = ((($$0$i$i)) + 4|0);
     HEAP32[$952>>2] = 7;
     $953 = ((($952)) + 4|0);
     $954 = ($953>>>0)<($918>>>0);
     if ($954) {
      $$0$i$i = $952;
     } else {
      break;
     }
    }
    $955 = ($933|0)==($627|0);
    if (!($955)) {
     $956 = $933;
     $957 = $627;
     $958 = (($956) - ($957))|0;
     $959 = HEAP32[$951>>2]|0;
     $960 = $959 & -2;
     HEAP32[$951>>2] = $960;
     $961 = $958 | 1;
     $962 = ((($627)) + 4|0);
     HEAP32[$962>>2] = $961;
     HEAP32[$933>>2] = $958;
     $963 = $958 >>> 3;
     $964 = ($958>>>0)<(256);
     if ($964) {
      $965 = $963 << 1;
      $966 = (42016 + ($965<<2)|0);
      $967 = HEAP32[10494]|0;
      $968 = 1 << $963;
      $969 = $967 & $968;
      $970 = ($969|0)==(0);
      if ($970) {
       $971 = $967 | $968;
       HEAP32[10494] = $971;
       $$pre$i$i = ((($966)) + 8|0);
       $$0211$i$i = $966;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $972 = ((($966)) + 8|0);
       $973 = HEAP32[$972>>2]|0;
       $974 = HEAP32[(41992)>>2]|0;
       $975 = ($973>>>0)<($974>>>0);
       if ($975) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $973;$$pre$phi$i$iZ2D = $972;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $627;
      $976 = ((($$0211$i$i)) + 12|0);
      HEAP32[$976>>2] = $627;
      $977 = ((($627)) + 8|0);
      HEAP32[$977>>2] = $$0211$i$i;
      $978 = ((($627)) + 12|0);
      HEAP32[$978>>2] = $966;
      break;
     }
     $979 = $958 >>> 8;
     $980 = ($979|0)==(0);
     if ($980) {
      $$0212$i$i = 0;
     } else {
      $981 = ($958>>>0)>(16777215);
      if ($981) {
       $$0212$i$i = 31;
      } else {
       $982 = (($979) + 1048320)|0;
       $983 = $982 >>> 16;
       $984 = $983 & 8;
       $985 = $979 << $984;
       $986 = (($985) + 520192)|0;
       $987 = $986 >>> 16;
       $988 = $987 & 4;
       $989 = $988 | $984;
       $990 = $985 << $988;
       $991 = (($990) + 245760)|0;
       $992 = $991 >>> 16;
       $993 = $992 & 2;
       $994 = $989 | $993;
       $995 = (14 - ($994))|0;
       $996 = $990 << $993;
       $997 = $996 >>> 15;
       $998 = (($995) + ($997))|0;
       $999 = $998 << 1;
       $1000 = (($998) + 7)|0;
       $1001 = $958 >>> $1000;
       $1002 = $1001 & 1;
       $1003 = $1002 | $999;
       $$0212$i$i = $1003;
      }
     }
     $1004 = (42280 + ($$0212$i$i<<2)|0);
     $1005 = ((($627)) + 28|0);
     HEAP32[$1005>>2] = $$0212$i$i;
     $1006 = ((($627)) + 20|0);
     HEAP32[$1006>>2] = 0;
     HEAP32[$931>>2] = 0;
     $1007 = HEAP32[(41980)>>2]|0;
     $1008 = 1 << $$0212$i$i;
     $1009 = $1007 & $1008;
     $1010 = ($1009|0)==(0);
     if ($1010) {
      $1011 = $1007 | $1008;
      HEAP32[(41980)>>2] = $1011;
      HEAP32[$1004>>2] = $627;
      $1012 = ((($627)) + 24|0);
      HEAP32[$1012>>2] = $1004;
      $1013 = ((($627)) + 12|0);
      HEAP32[$1013>>2] = $627;
      $1014 = ((($627)) + 8|0);
      HEAP32[$1014>>2] = $627;
      break;
     }
     $1015 = HEAP32[$1004>>2]|0;
     $1016 = ($$0212$i$i|0)==(31);
     $1017 = $$0212$i$i >>> 1;
     $1018 = (25 - ($1017))|0;
     $1019 = $1016 ? 0 : $1018;
     $1020 = $958 << $1019;
     $$0206$i$i = $1020;$$0207$i$i = $1015;
     while(1) {
      $1021 = ((($$0207$i$i)) + 4|0);
      $1022 = HEAP32[$1021>>2]|0;
      $1023 = $1022 & -8;
      $1024 = ($1023|0)==($958|0);
      if ($1024) {
       label = 304;
       break;
      }
      $1025 = $$0206$i$i >>> 31;
      $1026 = (((($$0207$i$i)) + 16|0) + ($1025<<2)|0);
      $1027 = $$0206$i$i << 1;
      $1028 = HEAP32[$1026>>2]|0;
      $1029 = ($1028|0)==(0|0);
      if ($1029) {
       label = 301;
       break;
      } else {
       $$0206$i$i = $1027;$$0207$i$i = $1028;
      }
     }
     if ((label|0) == 301) {
      $1030 = HEAP32[(41992)>>2]|0;
      $1031 = ($1026>>>0)<($1030>>>0);
      if ($1031) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1026>>2] = $627;
       $1032 = ((($627)) + 24|0);
       HEAP32[$1032>>2] = $$0207$i$i;
       $1033 = ((($627)) + 12|0);
       HEAP32[$1033>>2] = $627;
       $1034 = ((($627)) + 8|0);
       HEAP32[$1034>>2] = $627;
       break;
      }
     }
     else if ((label|0) == 304) {
      $1035 = ((($$0207$i$i)) + 8|0);
      $1036 = HEAP32[$1035>>2]|0;
      $1037 = HEAP32[(41992)>>2]|0;
      $1038 = ($1036>>>0)>=($1037>>>0);
      $not$$i$i = ($$0207$i$i>>>0)>=($1037>>>0);
      $1039 = $1038 & $not$$i$i;
      if ($1039) {
       $1040 = ((($1036)) + 12|0);
       HEAP32[$1040>>2] = $627;
       HEAP32[$1035>>2] = $627;
       $1041 = ((($627)) + 8|0);
       HEAP32[$1041>>2] = $1036;
       $1042 = ((($627)) + 12|0);
       HEAP32[$1042>>2] = $$0207$i$i;
       $1043 = ((($627)) + 24|0);
       HEAP32[$1043>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1045 = HEAP32[(41988)>>2]|0;
  $1046 = ($1045>>>0)>($$0197>>>0);
  if ($1046) {
   $1047 = (($1045) - ($$0197))|0;
   HEAP32[(41988)>>2] = $1047;
   $1048 = HEAP32[(42000)>>2]|0;
   $1049 = (($1048) + ($$0197)|0);
   HEAP32[(42000)>>2] = $1049;
   $1050 = $1047 | 1;
   $1051 = ((($1049)) + 4|0);
   HEAP32[$1051>>2] = $1050;
   $1052 = $$0197 | 3;
   $1053 = ((($1048)) + 4|0);
   HEAP32[$1053>>2] = $1052;
   $1054 = ((($1048)) + 8|0);
   $$0 = $1054;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1055 = (___errno_location()|0);
 HEAP32[$1055>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0211$i = 0, $$0211$in$i = 0, $$0381 = 0, $$0382 = 0, $$0394 = 0, $$0401 = 0, $$1 = 0, $$1380 = 0, $$1385 = 0, $$1388 = 0, $$1396 = 0, $$1400 = 0, $$2 = 0, $$3 = 0, $$3398 = 0, $$pre = 0, $$pre$phi439Z2D = 0, $$pre$phi441Z2D = 0, $$pre$phiZ2D = 0, $$pre438 = 0;
 var $$pre440 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $cond418 = 0, $cond419 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(41992)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(41996)>>2]|0;
   $20 = ($16|0)==($19|0);
   if ($20) {
    $105 = ((($10)) + 4|0);
    $106 = HEAP32[$105>>2]|0;
    $107 = $106 & 3;
    $108 = ($107|0)==(3);
    if (!($108)) {
     $$1 = $16;$$1380 = $17;
     break;
    }
    HEAP32[(41984)>>2] = $17;
    $109 = $106 & -2;
    HEAP32[$105>>2] = $109;
    $110 = $17 | 1;
    $111 = ((($16)) + 4|0);
    HEAP32[$111>>2] = $110;
    $112 = (($16) + ($17)|0);
    HEAP32[$112>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (42016 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($24>>>0)<($3>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[10494]|0;
     $38 = $37 & $36;
     HEAP32[10494] = $38;
     $$1 = $16;$$1380 = $17;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre440 = ((($26)) + 8|0);
     $$pre$phi441Z2D = $$pre440;
    } else {
     $40 = ($26>>>0)<($3>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi441Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi441Z2D>>2] = $24;
    $$1 = $16;$$1380 = $17;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1385 = $63;$$1388 = $59;
      }
     } else {
      $$1385 = $61;$$1388 = $60;
     }
     while(1) {
      $65 = ((($$1385)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1385 = $66;$$1388 = $65;
       continue;
      }
      $68 = ((($$1385)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1385 = $69;$$1388 = $68;
      }
     }
     $71 = ($$1388>>>0)<($3>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1388>>2] = 0;
      $$3 = $$1385;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($51>>>0)<($3>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1380 = $17;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (42280 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($16|0)==($76|0);
    if ($77) {
     HEAP32[$75>>2] = $$3;
     $cond418 = ($$3|0)==(0|0);
     if ($cond418) {
      $78 = 1 << $74;
      $79 = $78 ^ -1;
      $80 = HEAP32[(41980)>>2]|0;
      $81 = $80 & $79;
      HEAP32[(41980)>>2] = $81;
      $$1 = $16;$$1380 = $17;
      break;
     }
    } else {
     $82 = HEAP32[(41992)>>2]|0;
     $83 = ($46>>>0)<($82>>>0);
     if ($83) {
      _abort();
      // unreachable;
     }
     $84 = ((($46)) + 16|0);
     $85 = HEAP32[$84>>2]|0;
     $86 = ($85|0)==($16|0);
     if ($86) {
      HEAP32[$84>>2] = $$3;
     } else {
      $87 = ((($46)) + 20|0);
      HEAP32[$87>>2] = $$3;
     }
     $88 = ($$3|0)==(0|0);
     if ($88) {
      $$1 = $16;$$1380 = $17;
      break;
     }
    }
    $89 = HEAP32[(41992)>>2]|0;
    $90 = ($$3>>>0)<($89>>>0);
    if ($90) {
     _abort();
     // unreachable;
    }
    $91 = ((($$3)) + 24|0);
    HEAP32[$91>>2] = $46;
    $92 = ((($16)) + 16|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = ($93|0)==(0|0);
    do {
     if (!($94)) {
      $95 = ($93>>>0)<($89>>>0);
      if ($95) {
       _abort();
       // unreachable;
      } else {
       $96 = ((($$3)) + 16|0);
       HEAP32[$96>>2] = $93;
       $97 = ((($93)) + 24|0);
       HEAP32[$97>>2] = $$3;
       break;
      }
     }
    } while(0);
    $98 = ((($92)) + 4|0);
    $99 = HEAP32[$98>>2]|0;
    $100 = ($99|0)==(0|0);
    if ($100) {
     $$1 = $16;$$1380 = $17;
    } else {
     $101 = HEAP32[(41992)>>2]|0;
     $102 = ($99>>>0)<($101>>>0);
     if ($102) {
      _abort();
      // unreachable;
     } else {
      $103 = ((($$3)) + 20|0);
      HEAP32[$103>>2] = $99;
      $104 = ((($99)) + 24|0);
      HEAP32[$104>>2] = $$3;
      $$1 = $16;$$1380 = $17;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1380 = $9;
  }
 } while(0);
 $113 = ($$1>>>0)<($10>>>0);
 if (!($113)) {
  _abort();
  // unreachable;
 }
 $114 = ((($10)) + 4|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = $115 & 1;
 $117 = ($116|0)==(0);
 if ($117) {
  _abort();
  // unreachable;
 }
 $118 = $115 & 2;
 $119 = ($118|0)==(0);
 if ($119) {
  $120 = HEAP32[(42000)>>2]|0;
  $121 = ($10|0)==($120|0);
  if ($121) {
   $122 = HEAP32[(41988)>>2]|0;
   $123 = (($122) + ($$1380))|0;
   HEAP32[(41988)>>2] = $123;
   HEAP32[(42000)>>2] = $$1;
   $124 = $123 | 1;
   $125 = ((($$1)) + 4|0);
   HEAP32[$125>>2] = $124;
   $126 = HEAP32[(41996)>>2]|0;
   $127 = ($$1|0)==($126|0);
   if (!($127)) {
    return;
   }
   HEAP32[(41996)>>2] = 0;
   HEAP32[(41984)>>2] = 0;
   return;
  }
  $128 = HEAP32[(41996)>>2]|0;
  $129 = ($10|0)==($128|0);
  if ($129) {
   $130 = HEAP32[(41984)>>2]|0;
   $131 = (($130) + ($$1380))|0;
   HEAP32[(41984)>>2] = $131;
   HEAP32[(41996)>>2] = $$1;
   $132 = $131 | 1;
   $133 = ((($$1)) + 4|0);
   HEAP32[$133>>2] = $132;
   $134 = (($$1) + ($131)|0);
   HEAP32[$134>>2] = $131;
   return;
  }
  $135 = $115 & -8;
  $136 = (($135) + ($$1380))|0;
  $137 = $115 >>> 3;
  $138 = ($115>>>0)<(256);
  do {
   if ($138) {
    $139 = ((($10)) + 8|0);
    $140 = HEAP32[$139>>2]|0;
    $141 = ((($10)) + 12|0);
    $142 = HEAP32[$141>>2]|0;
    $143 = $137 << 1;
    $144 = (42016 + ($143<<2)|0);
    $145 = ($140|0)==($144|0);
    if (!($145)) {
     $146 = HEAP32[(41992)>>2]|0;
     $147 = ($140>>>0)<($146>>>0);
     if ($147) {
      _abort();
      // unreachable;
     }
     $148 = ((($140)) + 12|0);
     $149 = HEAP32[$148>>2]|0;
     $150 = ($149|0)==($10|0);
     if (!($150)) {
      _abort();
      // unreachable;
     }
    }
    $151 = ($142|0)==($140|0);
    if ($151) {
     $152 = 1 << $137;
     $153 = $152 ^ -1;
     $154 = HEAP32[10494]|0;
     $155 = $154 & $153;
     HEAP32[10494] = $155;
     break;
    }
    $156 = ($142|0)==($144|0);
    if ($156) {
     $$pre438 = ((($142)) + 8|0);
     $$pre$phi439Z2D = $$pre438;
    } else {
     $157 = HEAP32[(41992)>>2]|0;
     $158 = ($142>>>0)<($157>>>0);
     if ($158) {
      _abort();
      // unreachable;
     }
     $159 = ((($142)) + 8|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ($160|0)==($10|0);
     if ($161) {
      $$pre$phi439Z2D = $159;
     } else {
      _abort();
      // unreachable;
     }
    }
    $162 = ((($140)) + 12|0);
    HEAP32[$162>>2] = $142;
    HEAP32[$$pre$phi439Z2D>>2] = $140;
   } else {
    $163 = ((($10)) + 24|0);
    $164 = HEAP32[$163>>2]|0;
    $165 = ((($10)) + 12|0);
    $166 = HEAP32[$165>>2]|0;
    $167 = ($166|0)==($10|0);
    do {
     if ($167) {
      $178 = ((($10)) + 16|0);
      $179 = ((($178)) + 4|0);
      $180 = HEAP32[$179>>2]|0;
      $181 = ($180|0)==(0|0);
      if ($181) {
       $182 = HEAP32[$178>>2]|0;
       $183 = ($182|0)==(0|0);
       if ($183) {
        $$3398 = 0;
        break;
       } else {
        $$1396 = $182;$$1400 = $178;
       }
      } else {
       $$1396 = $180;$$1400 = $179;
      }
      while(1) {
       $184 = ((($$1396)) + 20|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($185|0)==(0|0);
       if (!($186)) {
        $$1396 = $185;$$1400 = $184;
        continue;
       }
       $187 = ((($$1396)) + 16|0);
       $188 = HEAP32[$187>>2]|0;
       $189 = ($188|0)==(0|0);
       if ($189) {
        break;
       } else {
        $$1396 = $188;$$1400 = $187;
       }
      }
      $190 = HEAP32[(41992)>>2]|0;
      $191 = ($$1400>>>0)<($190>>>0);
      if ($191) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1400>>2] = 0;
       $$3398 = $$1396;
       break;
      }
     } else {
      $168 = ((($10)) + 8|0);
      $169 = HEAP32[$168>>2]|0;
      $170 = HEAP32[(41992)>>2]|0;
      $171 = ($169>>>0)<($170>>>0);
      if ($171) {
       _abort();
       // unreachable;
      }
      $172 = ((($169)) + 12|0);
      $173 = HEAP32[$172>>2]|0;
      $174 = ($173|0)==($10|0);
      if (!($174)) {
       _abort();
       // unreachable;
      }
      $175 = ((($166)) + 8|0);
      $176 = HEAP32[$175>>2]|0;
      $177 = ($176|0)==($10|0);
      if ($177) {
       HEAP32[$172>>2] = $166;
       HEAP32[$175>>2] = $169;
       $$3398 = $166;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $192 = ($164|0)==(0|0);
    if (!($192)) {
     $193 = ((($10)) + 28|0);
     $194 = HEAP32[$193>>2]|0;
     $195 = (42280 + ($194<<2)|0);
     $196 = HEAP32[$195>>2]|0;
     $197 = ($10|0)==($196|0);
     if ($197) {
      HEAP32[$195>>2] = $$3398;
      $cond419 = ($$3398|0)==(0|0);
      if ($cond419) {
       $198 = 1 << $194;
       $199 = $198 ^ -1;
       $200 = HEAP32[(41980)>>2]|0;
       $201 = $200 & $199;
       HEAP32[(41980)>>2] = $201;
       break;
      }
     } else {
      $202 = HEAP32[(41992)>>2]|0;
      $203 = ($164>>>0)<($202>>>0);
      if ($203) {
       _abort();
       // unreachable;
      }
      $204 = ((($164)) + 16|0);
      $205 = HEAP32[$204>>2]|0;
      $206 = ($205|0)==($10|0);
      if ($206) {
       HEAP32[$204>>2] = $$3398;
      } else {
       $207 = ((($164)) + 20|0);
       HEAP32[$207>>2] = $$3398;
      }
      $208 = ($$3398|0)==(0|0);
      if ($208) {
       break;
      }
     }
     $209 = HEAP32[(41992)>>2]|0;
     $210 = ($$3398>>>0)<($209>>>0);
     if ($210) {
      _abort();
      // unreachable;
     }
     $211 = ((($$3398)) + 24|0);
     HEAP32[$211>>2] = $164;
     $212 = ((($10)) + 16|0);
     $213 = HEAP32[$212>>2]|0;
     $214 = ($213|0)==(0|0);
     do {
      if (!($214)) {
       $215 = ($213>>>0)<($209>>>0);
       if ($215) {
        _abort();
        // unreachable;
       } else {
        $216 = ((($$3398)) + 16|0);
        HEAP32[$216>>2] = $213;
        $217 = ((($213)) + 24|0);
        HEAP32[$217>>2] = $$3398;
        break;
       }
      }
     } while(0);
     $218 = ((($212)) + 4|0);
     $219 = HEAP32[$218>>2]|0;
     $220 = ($219|0)==(0|0);
     if (!($220)) {
      $221 = HEAP32[(41992)>>2]|0;
      $222 = ($219>>>0)<($221>>>0);
      if ($222) {
       _abort();
       // unreachable;
      } else {
       $223 = ((($$3398)) + 20|0);
       HEAP32[$223>>2] = $219;
       $224 = ((($219)) + 24|0);
       HEAP32[$224>>2] = $$3398;
       break;
      }
     }
    }
   }
  } while(0);
  $225 = $136 | 1;
  $226 = ((($$1)) + 4|0);
  HEAP32[$226>>2] = $225;
  $227 = (($$1) + ($136)|0);
  HEAP32[$227>>2] = $136;
  $228 = HEAP32[(41996)>>2]|0;
  $229 = ($$1|0)==($228|0);
  if ($229) {
   HEAP32[(41984)>>2] = $136;
   return;
  } else {
   $$2 = $136;
  }
 } else {
  $230 = $115 & -2;
  HEAP32[$114>>2] = $230;
  $231 = $$1380 | 1;
  $232 = ((($$1)) + 4|0);
  HEAP32[$232>>2] = $231;
  $233 = (($$1) + ($$1380)|0);
  HEAP32[$233>>2] = $$1380;
  $$2 = $$1380;
 }
 $234 = $$2 >>> 3;
 $235 = ($$2>>>0)<(256);
 if ($235) {
  $236 = $234 << 1;
  $237 = (42016 + ($236<<2)|0);
  $238 = HEAP32[10494]|0;
  $239 = 1 << $234;
  $240 = $238 & $239;
  $241 = ($240|0)==(0);
  if ($241) {
   $242 = $238 | $239;
   HEAP32[10494] = $242;
   $$pre = ((($237)) + 8|0);
   $$0401 = $237;$$pre$phiZ2D = $$pre;
  } else {
   $243 = ((($237)) + 8|0);
   $244 = HEAP32[$243>>2]|0;
   $245 = HEAP32[(41992)>>2]|0;
   $246 = ($244>>>0)<($245>>>0);
   if ($246) {
    _abort();
    // unreachable;
   } else {
    $$0401 = $244;$$pre$phiZ2D = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $247 = ((($$0401)) + 12|0);
  HEAP32[$247>>2] = $$1;
  $248 = ((($$1)) + 8|0);
  HEAP32[$248>>2] = $$0401;
  $249 = ((($$1)) + 12|0);
  HEAP32[$249>>2] = $237;
  return;
 }
 $250 = $$2 >>> 8;
 $251 = ($250|0)==(0);
 if ($251) {
  $$0394 = 0;
 } else {
  $252 = ($$2>>>0)>(16777215);
  if ($252) {
   $$0394 = 31;
  } else {
   $253 = (($250) + 1048320)|0;
   $254 = $253 >>> 16;
   $255 = $254 & 8;
   $256 = $250 << $255;
   $257 = (($256) + 520192)|0;
   $258 = $257 >>> 16;
   $259 = $258 & 4;
   $260 = $259 | $255;
   $261 = $256 << $259;
   $262 = (($261) + 245760)|0;
   $263 = $262 >>> 16;
   $264 = $263 & 2;
   $265 = $260 | $264;
   $266 = (14 - ($265))|0;
   $267 = $261 << $264;
   $268 = $267 >>> 15;
   $269 = (($266) + ($268))|0;
   $270 = $269 << 1;
   $271 = (($269) + 7)|0;
   $272 = $$2 >>> $271;
   $273 = $272 & 1;
   $274 = $273 | $270;
   $$0394 = $274;
  }
 }
 $275 = (42280 + ($$0394<<2)|0);
 $276 = ((($$1)) + 28|0);
 HEAP32[$276>>2] = $$0394;
 $277 = ((($$1)) + 16|0);
 $278 = ((($$1)) + 20|0);
 HEAP32[$278>>2] = 0;
 HEAP32[$277>>2] = 0;
 $279 = HEAP32[(41980)>>2]|0;
 $280 = 1 << $$0394;
 $281 = $279 & $280;
 $282 = ($281|0)==(0);
 do {
  if ($282) {
   $283 = $279 | $280;
   HEAP32[(41980)>>2] = $283;
   HEAP32[$275>>2] = $$1;
   $284 = ((($$1)) + 24|0);
   HEAP32[$284>>2] = $275;
   $285 = ((($$1)) + 12|0);
   HEAP32[$285>>2] = $$1;
   $286 = ((($$1)) + 8|0);
   HEAP32[$286>>2] = $$1;
  } else {
   $287 = HEAP32[$275>>2]|0;
   $288 = ($$0394|0)==(31);
   $289 = $$0394 >>> 1;
   $290 = (25 - ($289))|0;
   $291 = $288 ? 0 : $290;
   $292 = $$2 << $291;
   $$0381 = $292;$$0382 = $287;
   while(1) {
    $293 = ((($$0382)) + 4|0);
    $294 = HEAP32[$293>>2]|0;
    $295 = $294 & -8;
    $296 = ($295|0)==($$2|0);
    if ($296) {
     label = 130;
     break;
    }
    $297 = $$0381 >>> 31;
    $298 = (((($$0382)) + 16|0) + ($297<<2)|0);
    $299 = $$0381 << 1;
    $300 = HEAP32[$298>>2]|0;
    $301 = ($300|0)==(0|0);
    if ($301) {
     label = 127;
     break;
    } else {
     $$0381 = $299;$$0382 = $300;
    }
   }
   if ((label|0) == 127) {
    $302 = HEAP32[(41992)>>2]|0;
    $303 = ($298>>>0)<($302>>>0);
    if ($303) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$298>>2] = $$1;
     $304 = ((($$1)) + 24|0);
     HEAP32[$304>>2] = $$0382;
     $305 = ((($$1)) + 12|0);
     HEAP32[$305>>2] = $$1;
     $306 = ((($$1)) + 8|0);
     HEAP32[$306>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $307 = ((($$0382)) + 8|0);
    $308 = HEAP32[$307>>2]|0;
    $309 = HEAP32[(41992)>>2]|0;
    $310 = ($308>>>0)>=($309>>>0);
    $not$ = ($$0382>>>0)>=($309>>>0);
    $311 = $310 & $not$;
    if ($311) {
     $312 = ((($308)) + 12|0);
     HEAP32[$312>>2] = $$1;
     HEAP32[$307>>2] = $$1;
     $313 = ((($$1)) + 8|0);
     HEAP32[$313>>2] = $308;
     $314 = ((($$1)) + 12|0);
     HEAP32[$314>>2] = $$0382;
     $315 = ((($$1)) + 24|0);
     HEAP32[$315>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $316 = HEAP32[(42008)>>2]|0;
 $317 = (($316) + -1)|0;
 HEAP32[(42008)>>2] = $317;
 $318 = ($317|0)==(0);
 if ($318) {
  $$0211$in$i = (42432);
 } else {
  return;
 }
 while(1) {
  $$0211$i = HEAP32[$$0211$in$i>>2]|0;
  $319 = ($$0211$i|0)==(0|0);
  $320 = ((($$0211$i)) + 8|0);
  if ($319) {
   break;
  } else {
   $$0211$in$i = $320;
  }
 }
 HEAP32[(42008)>>2] = -1;
 return;
}
function _realloc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $3 = (_malloc($1)|0);
  $$1 = $3;
  return ($$1|0);
 }
 $4 = ($1>>>0)>(4294967231);
 if ($4) {
  $5 = (___errno_location()|0);
  HEAP32[$5>>2] = 12;
  $$1 = 0;
  return ($$1|0);
 }
 $6 = ($1>>>0)<(11);
 $7 = (($1) + 11)|0;
 $8 = $7 & -8;
 $9 = $6 ? 16 : $8;
 $10 = ((($0)) + -8|0);
 $11 = (_try_realloc_chunk($10,$9)|0);
 $12 = ($11|0)==(0|0);
 if (!($12)) {
  $13 = ((($11)) + 8|0);
  $$1 = $13;
  return ($$1|0);
 }
 $14 = (_malloc($1)|0);
 $15 = ($14|0)==(0|0);
 if ($15) {
  $$1 = 0;
  return ($$1|0);
 }
 $16 = ((($0)) + -4|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = $17 & -8;
 $19 = $17 & 3;
 $20 = ($19|0)==(0);
 $21 = $20 ? 8 : 4;
 $22 = (($18) - ($21))|0;
 $23 = ($22>>>0)<($1>>>0);
 $24 = $23 ? $22 : $1;
 _memcpy(($14|0),($0|0),($24|0))|0;
 _free($0);
 $$1 = $14;
 return ($$1|0);
}
function _try_realloc_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1271 = 0, $$1274 = 0, $$2 = 0, $$3 = 0, $$pre = 0, $$pre$phiZ2D = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0;
 var $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0;
 var $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0;
 var $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0;
 var $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $cond = 0, $notlhs = 0, $notrhs = 0, $or$cond$not = 0, $or$cond3 = 0, $storemerge = 0, $storemerge1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & -8;
 $5 = (($0) + ($4)|0);
 $6 = HEAP32[(41992)>>2]|0;
 $7 = $3 & 3;
 $notlhs = ($0>>>0)>=($6>>>0);
 $notrhs = ($7|0)!=(1);
 $or$cond$not = $notrhs & $notlhs;
 $8 = ($0>>>0)<($5>>>0);
 $or$cond3 = $or$cond$not & $8;
 if (!($or$cond3)) {
  _abort();
  // unreachable;
 }
 $9 = ((($5)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $10 & 1;
 $12 = ($11|0)==(0);
 if ($12) {
  _abort();
  // unreachable;
 }
 $13 = ($7|0)==(0);
 if ($13) {
  $14 = ($1>>>0)<(256);
  if ($14) {
   $$2 = 0;
   return ($$2|0);
  }
  $15 = (($1) + 4)|0;
  $16 = ($4>>>0)<($15>>>0);
  if (!($16)) {
   $17 = (($4) - ($1))|0;
   $18 = HEAP32[(42456)>>2]|0;
   $19 = $18 << 1;
   $20 = ($17>>>0)>($19>>>0);
   if (!($20)) {
    $$2 = $0;
    return ($$2|0);
   }
  }
  $$2 = 0;
  return ($$2|0);
 }
 $21 = ($4>>>0)<($1>>>0);
 if (!($21)) {
  $22 = (($4) - ($1))|0;
  $23 = ($22>>>0)>(15);
  if (!($23)) {
   $$2 = $0;
   return ($$2|0);
  }
  $24 = (($0) + ($1)|0);
  $25 = $3 & 1;
  $26 = $25 | $1;
  $27 = $26 | 2;
  HEAP32[$2>>2] = $27;
  $28 = ((($24)) + 4|0);
  $29 = $22 | 3;
  HEAP32[$28>>2] = $29;
  $30 = (($24) + ($22)|0);
  $31 = ((($30)) + 4|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = $32 | 1;
  HEAP32[$31>>2] = $33;
  _dispose_chunk($24,$22);
  $$2 = $0;
  return ($$2|0);
 }
 $34 = HEAP32[(42000)>>2]|0;
 $35 = ($5|0)==($34|0);
 if ($35) {
  $36 = HEAP32[(41988)>>2]|0;
  $37 = (($36) + ($4))|0;
  $38 = ($37>>>0)>($1>>>0);
  if (!($38)) {
   $$2 = 0;
   return ($$2|0);
  }
  $39 = (($37) - ($1))|0;
  $40 = (($0) + ($1)|0);
  $41 = $3 & 1;
  $42 = $41 | $1;
  $43 = $42 | 2;
  HEAP32[$2>>2] = $43;
  $44 = ((($40)) + 4|0);
  $45 = $39 | 1;
  HEAP32[$44>>2] = $45;
  HEAP32[(42000)>>2] = $40;
  HEAP32[(41988)>>2] = $39;
  $$2 = $0;
  return ($$2|0);
 }
 $46 = HEAP32[(41996)>>2]|0;
 $47 = ($5|0)==($46|0);
 if ($47) {
  $48 = HEAP32[(41984)>>2]|0;
  $49 = (($48) + ($4))|0;
  $50 = ($49>>>0)<($1>>>0);
  if ($50) {
   $$2 = 0;
   return ($$2|0);
  }
  $51 = (($49) - ($1))|0;
  $52 = ($51>>>0)>(15);
  if ($52) {
   $53 = (($0) + ($1)|0);
   $54 = (($53) + ($51)|0);
   $55 = $3 & 1;
   $56 = $55 | $1;
   $57 = $56 | 2;
   HEAP32[$2>>2] = $57;
   $58 = ((($53)) + 4|0);
   $59 = $51 | 1;
   HEAP32[$58>>2] = $59;
   HEAP32[$54>>2] = $51;
   $60 = ((($54)) + 4|0);
   $61 = HEAP32[$60>>2]|0;
   $62 = $61 & -2;
   HEAP32[$60>>2] = $62;
   $storemerge = $53;$storemerge1 = $51;
  } else {
   $63 = $3 & 1;
   $64 = $63 | $49;
   $65 = $64 | 2;
   HEAP32[$2>>2] = $65;
   $66 = (($0) + ($49)|0);
   $67 = ((($66)) + 4|0);
   $68 = HEAP32[$67>>2]|0;
   $69 = $68 | 1;
   HEAP32[$67>>2] = $69;
   $storemerge = 0;$storemerge1 = 0;
  }
  HEAP32[(41984)>>2] = $storemerge1;
  HEAP32[(41996)>>2] = $storemerge;
  $$2 = $0;
  return ($$2|0);
 }
 $70 = $10 & 2;
 $71 = ($70|0)==(0);
 if (!($71)) {
  $$2 = 0;
  return ($$2|0);
 }
 $72 = $10 & -8;
 $73 = (($72) + ($4))|0;
 $74 = ($73>>>0)<($1>>>0);
 if ($74) {
  $$2 = 0;
  return ($$2|0);
 }
 $75 = (($73) - ($1))|0;
 $76 = $10 >>> 3;
 $77 = ($10>>>0)<(256);
 do {
  if ($77) {
   $78 = ((($5)) + 8|0);
   $79 = HEAP32[$78>>2]|0;
   $80 = ((($5)) + 12|0);
   $81 = HEAP32[$80>>2]|0;
   $82 = $76 << 1;
   $83 = (42016 + ($82<<2)|0);
   $84 = ($79|0)==($83|0);
   if (!($84)) {
    $85 = ($79>>>0)<($6>>>0);
    if ($85) {
     _abort();
     // unreachable;
    }
    $86 = ((($79)) + 12|0);
    $87 = HEAP32[$86>>2]|0;
    $88 = ($87|0)==($5|0);
    if (!($88)) {
     _abort();
     // unreachable;
    }
   }
   $89 = ($81|0)==($79|0);
   if ($89) {
    $90 = 1 << $76;
    $91 = $90 ^ -1;
    $92 = HEAP32[10494]|0;
    $93 = $92 & $91;
    HEAP32[10494] = $93;
    break;
   }
   $94 = ($81|0)==($83|0);
   if ($94) {
    $$pre = ((($81)) + 8|0);
    $$pre$phiZ2D = $$pre;
   } else {
    $95 = ($81>>>0)<($6>>>0);
    if ($95) {
     _abort();
     // unreachable;
    }
    $96 = ((($81)) + 8|0);
    $97 = HEAP32[$96>>2]|0;
    $98 = ($97|0)==($5|0);
    if ($98) {
     $$pre$phiZ2D = $96;
    } else {
     _abort();
     // unreachable;
    }
   }
   $99 = ((($79)) + 12|0);
   HEAP32[$99>>2] = $81;
   HEAP32[$$pre$phiZ2D>>2] = $79;
  } else {
   $100 = ((($5)) + 24|0);
   $101 = HEAP32[$100>>2]|0;
   $102 = ((($5)) + 12|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ($103|0)==($5|0);
   do {
    if ($104) {
     $114 = ((($5)) + 16|0);
     $115 = ((($114)) + 4|0);
     $116 = HEAP32[$115>>2]|0;
     $117 = ($116|0)==(0|0);
     if ($117) {
      $118 = HEAP32[$114>>2]|0;
      $119 = ($118|0)==(0|0);
      if ($119) {
       $$3 = 0;
       break;
      } else {
       $$1271 = $118;$$1274 = $114;
      }
     } else {
      $$1271 = $116;$$1274 = $115;
     }
     while(1) {
      $120 = ((($$1271)) + 20|0);
      $121 = HEAP32[$120>>2]|0;
      $122 = ($121|0)==(0|0);
      if (!($122)) {
       $$1271 = $121;$$1274 = $120;
       continue;
      }
      $123 = ((($$1271)) + 16|0);
      $124 = HEAP32[$123>>2]|0;
      $125 = ($124|0)==(0|0);
      if ($125) {
       break;
      } else {
       $$1271 = $124;$$1274 = $123;
      }
     }
     $126 = ($$1274>>>0)<($6>>>0);
     if ($126) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1274>>2] = 0;
      $$3 = $$1271;
      break;
     }
    } else {
     $105 = ((($5)) + 8|0);
     $106 = HEAP32[$105>>2]|0;
     $107 = ($106>>>0)<($6>>>0);
     if ($107) {
      _abort();
      // unreachable;
     }
     $108 = ((($106)) + 12|0);
     $109 = HEAP32[$108>>2]|0;
     $110 = ($109|0)==($5|0);
     if (!($110)) {
      _abort();
      // unreachable;
     }
     $111 = ((($103)) + 8|0);
     $112 = HEAP32[$111>>2]|0;
     $113 = ($112|0)==($5|0);
     if ($113) {
      HEAP32[$108>>2] = $103;
      HEAP32[$111>>2] = $106;
      $$3 = $103;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $127 = ($101|0)==(0|0);
   if (!($127)) {
    $128 = ((($5)) + 28|0);
    $129 = HEAP32[$128>>2]|0;
    $130 = (42280 + ($129<<2)|0);
    $131 = HEAP32[$130>>2]|0;
    $132 = ($5|0)==($131|0);
    if ($132) {
     HEAP32[$130>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $133 = 1 << $129;
      $134 = $133 ^ -1;
      $135 = HEAP32[(41980)>>2]|0;
      $136 = $135 & $134;
      HEAP32[(41980)>>2] = $136;
      break;
     }
    } else {
     $137 = HEAP32[(41992)>>2]|0;
     $138 = ($101>>>0)<($137>>>0);
     if ($138) {
      _abort();
      // unreachable;
     }
     $139 = ((($101)) + 16|0);
     $140 = HEAP32[$139>>2]|0;
     $141 = ($140|0)==($5|0);
     if ($141) {
      HEAP32[$139>>2] = $$3;
     } else {
      $142 = ((($101)) + 20|0);
      HEAP32[$142>>2] = $$3;
     }
     $143 = ($$3|0)==(0|0);
     if ($143) {
      break;
     }
    }
    $144 = HEAP32[(41992)>>2]|0;
    $145 = ($$3>>>0)<($144>>>0);
    if ($145) {
     _abort();
     // unreachable;
    }
    $146 = ((($$3)) + 24|0);
    HEAP32[$146>>2] = $101;
    $147 = ((($5)) + 16|0);
    $148 = HEAP32[$147>>2]|0;
    $149 = ($148|0)==(0|0);
    do {
     if (!($149)) {
      $150 = ($148>>>0)<($144>>>0);
      if ($150) {
       _abort();
       // unreachable;
      } else {
       $151 = ((($$3)) + 16|0);
       HEAP32[$151>>2] = $148;
       $152 = ((($148)) + 24|0);
       HEAP32[$152>>2] = $$3;
       break;
      }
     }
    } while(0);
    $153 = ((($147)) + 4|0);
    $154 = HEAP32[$153>>2]|0;
    $155 = ($154|0)==(0|0);
    if (!($155)) {
     $156 = HEAP32[(41992)>>2]|0;
     $157 = ($154>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     } else {
      $158 = ((($$3)) + 20|0);
      HEAP32[$158>>2] = $154;
      $159 = ((($154)) + 24|0);
      HEAP32[$159>>2] = $$3;
      break;
     }
    }
   }
  }
 } while(0);
 $160 = ($75>>>0)<(16);
 if ($160) {
  $161 = $3 & 1;
  $162 = $73 | $161;
  $163 = $162 | 2;
  HEAP32[$2>>2] = $163;
  $164 = (($0) + ($73)|0);
  $165 = ((($164)) + 4|0);
  $166 = HEAP32[$165>>2]|0;
  $167 = $166 | 1;
  HEAP32[$165>>2] = $167;
  $$2 = $0;
  return ($$2|0);
 } else {
  $168 = (($0) + ($1)|0);
  $169 = $3 & 1;
  $170 = $169 | $1;
  $171 = $170 | 2;
  HEAP32[$2>>2] = $171;
  $172 = ((($168)) + 4|0);
  $173 = $75 | 3;
  HEAP32[$172>>2] = $173;
  $174 = (($168) + ($75)|0);
  $175 = ((($174)) + 4|0);
  $176 = HEAP32[$175>>2]|0;
  $177 = $176 | 1;
  HEAP32[$175>>2] = $177;
  _dispose_chunk($168,$75);
  $$2 = $0;
  return ($$2|0);
 }
 return (0)|0;
}
function _dispose_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0417 = 0, $$0418 = 0, $$0429 = 0, $$0436 = 0, $$1 = 0, $$1416 = 0, $$1424 = 0, $$1427 = 0, $$1431 = 0, $$1435 = 0, $$2 = 0, $$3 = 0, $$3433 = 0, $$pre = 0, $$pre$phi22Z2D = 0, $$pre$phi24Z2D = 0, $$pre$phiZ2D = 0, $$pre21 = 0, $$pre23 = 0, $10 = 0;
 var $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0;
 var $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0;
 var $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0;
 var $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0;
 var $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0;
 var $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond = 0, $cond16 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($0) + ($1)|0);
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = $4 & 1;
 $6 = ($5|0)==(0);
 do {
  if ($6) {
   $7 = HEAP32[$0>>2]|0;
   $8 = $4 & 3;
   $9 = ($8|0)==(0);
   if ($9) {
    return;
   }
   $10 = (0 - ($7))|0;
   $11 = (($0) + ($10)|0);
   $12 = (($7) + ($1))|0;
   $13 = HEAP32[(41992)>>2]|0;
   $14 = ($11>>>0)<($13>>>0);
   if ($14) {
    _abort();
    // unreachable;
   }
   $15 = HEAP32[(41996)>>2]|0;
   $16 = ($11|0)==($15|0);
   if ($16) {
    $101 = ((($2)) + 4|0);
    $102 = HEAP32[$101>>2]|0;
    $103 = $102 & 3;
    $104 = ($103|0)==(3);
    if (!($104)) {
     $$1 = $11;$$1416 = $12;
     break;
    }
    HEAP32[(41984)>>2] = $12;
    $105 = $102 & -2;
    HEAP32[$101>>2] = $105;
    $106 = $12 | 1;
    $107 = ((($11)) + 4|0);
    HEAP32[$107>>2] = $106;
    $108 = (($11) + ($12)|0);
    HEAP32[$108>>2] = $12;
    return;
   }
   $17 = $7 >>> 3;
   $18 = ($7>>>0)<(256);
   if ($18) {
    $19 = ((($11)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ((($11)) + 12|0);
    $22 = HEAP32[$21>>2]|0;
    $23 = $17 << 1;
    $24 = (42016 + ($23<<2)|0);
    $25 = ($20|0)==($24|0);
    if (!($25)) {
     $26 = ($20>>>0)<($13>>>0);
     if ($26) {
      _abort();
      // unreachable;
     }
     $27 = ((($20)) + 12|0);
     $28 = HEAP32[$27>>2]|0;
     $29 = ($28|0)==($11|0);
     if (!($29)) {
      _abort();
      // unreachable;
     }
    }
    $30 = ($22|0)==($20|0);
    if ($30) {
     $31 = 1 << $17;
     $32 = $31 ^ -1;
     $33 = HEAP32[10494]|0;
     $34 = $33 & $32;
     HEAP32[10494] = $34;
     $$1 = $11;$$1416 = $12;
     break;
    }
    $35 = ($22|0)==($24|0);
    if ($35) {
     $$pre23 = ((($22)) + 8|0);
     $$pre$phi24Z2D = $$pre23;
    } else {
     $36 = ($22>>>0)<($13>>>0);
     if ($36) {
      _abort();
      // unreachable;
     }
     $37 = ((($22)) + 8|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ($38|0)==($11|0);
     if ($39) {
      $$pre$phi24Z2D = $37;
     } else {
      _abort();
      // unreachable;
     }
    }
    $40 = ((($20)) + 12|0);
    HEAP32[$40>>2] = $22;
    HEAP32[$$pre$phi24Z2D>>2] = $20;
    $$1 = $11;$$1416 = $12;
    break;
   }
   $41 = ((($11)) + 24|0);
   $42 = HEAP32[$41>>2]|0;
   $43 = ((($11)) + 12|0);
   $44 = HEAP32[$43>>2]|0;
   $45 = ($44|0)==($11|0);
   do {
    if ($45) {
     $55 = ((($11)) + 16|0);
     $56 = ((($55)) + 4|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==(0|0);
     if ($58) {
      $59 = HEAP32[$55>>2]|0;
      $60 = ($59|0)==(0|0);
      if ($60) {
       $$3 = 0;
       break;
      } else {
       $$1424 = $59;$$1427 = $55;
      }
     } else {
      $$1424 = $57;$$1427 = $56;
     }
     while(1) {
      $61 = ((($$1424)) + 20|0);
      $62 = HEAP32[$61>>2]|0;
      $63 = ($62|0)==(0|0);
      if (!($63)) {
       $$1424 = $62;$$1427 = $61;
       continue;
      }
      $64 = ((($$1424)) + 16|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if ($66) {
       break;
      } else {
       $$1424 = $65;$$1427 = $64;
      }
     }
     $67 = ($$1427>>>0)<($13>>>0);
     if ($67) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1427>>2] = 0;
      $$3 = $$1424;
      break;
     }
    } else {
     $46 = ((($11)) + 8|0);
     $47 = HEAP32[$46>>2]|0;
     $48 = ($47>>>0)<($13>>>0);
     if ($48) {
      _abort();
      // unreachable;
     }
     $49 = ((($47)) + 12|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50|0)==($11|0);
     if (!($51)) {
      _abort();
      // unreachable;
     }
     $52 = ((($44)) + 8|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($11|0);
     if ($54) {
      HEAP32[$49>>2] = $44;
      HEAP32[$52>>2] = $47;
      $$3 = $44;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $68 = ($42|0)==(0|0);
   if ($68) {
    $$1 = $11;$$1416 = $12;
   } else {
    $69 = ((($11)) + 28|0);
    $70 = HEAP32[$69>>2]|0;
    $71 = (42280 + ($70<<2)|0);
    $72 = HEAP32[$71>>2]|0;
    $73 = ($11|0)==($72|0);
    if ($73) {
     HEAP32[$71>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $74 = 1 << $70;
      $75 = $74 ^ -1;
      $76 = HEAP32[(41980)>>2]|0;
      $77 = $76 & $75;
      HEAP32[(41980)>>2] = $77;
      $$1 = $11;$$1416 = $12;
      break;
     }
    } else {
     $78 = HEAP32[(41992)>>2]|0;
     $79 = ($42>>>0)<($78>>>0);
     if ($79) {
      _abort();
      // unreachable;
     }
     $80 = ((($42)) + 16|0);
     $81 = HEAP32[$80>>2]|0;
     $82 = ($81|0)==($11|0);
     if ($82) {
      HEAP32[$80>>2] = $$3;
     } else {
      $83 = ((($42)) + 20|0);
      HEAP32[$83>>2] = $$3;
     }
     $84 = ($$3|0)==(0|0);
     if ($84) {
      $$1 = $11;$$1416 = $12;
      break;
     }
    }
    $85 = HEAP32[(41992)>>2]|0;
    $86 = ($$3>>>0)<($85>>>0);
    if ($86) {
     _abort();
     // unreachable;
    }
    $87 = ((($$3)) + 24|0);
    HEAP32[$87>>2] = $42;
    $88 = ((($11)) + 16|0);
    $89 = HEAP32[$88>>2]|0;
    $90 = ($89|0)==(0|0);
    do {
     if (!($90)) {
      $91 = ($89>>>0)<($85>>>0);
      if ($91) {
       _abort();
       // unreachable;
      } else {
       $92 = ((($$3)) + 16|0);
       HEAP32[$92>>2] = $89;
       $93 = ((($89)) + 24|0);
       HEAP32[$93>>2] = $$3;
       break;
      }
     }
    } while(0);
    $94 = ((($88)) + 4|0);
    $95 = HEAP32[$94>>2]|0;
    $96 = ($95|0)==(0|0);
    if ($96) {
     $$1 = $11;$$1416 = $12;
    } else {
     $97 = HEAP32[(41992)>>2]|0;
     $98 = ($95>>>0)<($97>>>0);
     if ($98) {
      _abort();
      // unreachable;
     } else {
      $99 = ((($$3)) + 20|0);
      HEAP32[$99>>2] = $95;
      $100 = ((($95)) + 24|0);
      HEAP32[$100>>2] = $$3;
      $$1 = $11;$$1416 = $12;
      break;
     }
    }
   }
  } else {
   $$1 = $0;$$1416 = $1;
  }
 } while(0);
 $109 = HEAP32[(41992)>>2]|0;
 $110 = ($2>>>0)<($109>>>0);
 if ($110) {
  _abort();
  // unreachable;
 }
 $111 = ((($2)) + 4|0);
 $112 = HEAP32[$111>>2]|0;
 $113 = $112 & 2;
 $114 = ($113|0)==(0);
 if ($114) {
  $115 = HEAP32[(42000)>>2]|0;
  $116 = ($2|0)==($115|0);
  if ($116) {
   $117 = HEAP32[(41988)>>2]|0;
   $118 = (($117) + ($$1416))|0;
   HEAP32[(41988)>>2] = $118;
   HEAP32[(42000)>>2] = $$1;
   $119 = $118 | 1;
   $120 = ((($$1)) + 4|0);
   HEAP32[$120>>2] = $119;
   $121 = HEAP32[(41996)>>2]|0;
   $122 = ($$1|0)==($121|0);
   if (!($122)) {
    return;
   }
   HEAP32[(41996)>>2] = 0;
   HEAP32[(41984)>>2] = 0;
   return;
  }
  $123 = HEAP32[(41996)>>2]|0;
  $124 = ($2|0)==($123|0);
  if ($124) {
   $125 = HEAP32[(41984)>>2]|0;
   $126 = (($125) + ($$1416))|0;
   HEAP32[(41984)>>2] = $126;
   HEAP32[(41996)>>2] = $$1;
   $127 = $126 | 1;
   $128 = ((($$1)) + 4|0);
   HEAP32[$128>>2] = $127;
   $129 = (($$1) + ($126)|0);
   HEAP32[$129>>2] = $126;
   return;
  }
  $130 = $112 & -8;
  $131 = (($130) + ($$1416))|0;
  $132 = $112 >>> 3;
  $133 = ($112>>>0)<(256);
  do {
   if ($133) {
    $134 = ((($2)) + 8|0);
    $135 = HEAP32[$134>>2]|0;
    $136 = ((($2)) + 12|0);
    $137 = HEAP32[$136>>2]|0;
    $138 = $132 << 1;
    $139 = (42016 + ($138<<2)|0);
    $140 = ($135|0)==($139|0);
    if (!($140)) {
     $141 = ($135>>>0)<($109>>>0);
     if ($141) {
      _abort();
      // unreachable;
     }
     $142 = ((($135)) + 12|0);
     $143 = HEAP32[$142>>2]|0;
     $144 = ($143|0)==($2|0);
     if (!($144)) {
      _abort();
      // unreachable;
     }
    }
    $145 = ($137|0)==($135|0);
    if ($145) {
     $146 = 1 << $132;
     $147 = $146 ^ -1;
     $148 = HEAP32[10494]|0;
     $149 = $148 & $147;
     HEAP32[10494] = $149;
     break;
    }
    $150 = ($137|0)==($139|0);
    if ($150) {
     $$pre21 = ((($137)) + 8|0);
     $$pre$phi22Z2D = $$pre21;
    } else {
     $151 = ($137>>>0)<($109>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = ((($137)) + 8|0);
     $153 = HEAP32[$152>>2]|0;
     $154 = ($153|0)==($2|0);
     if ($154) {
      $$pre$phi22Z2D = $152;
     } else {
      _abort();
      // unreachable;
     }
    }
    $155 = ((($135)) + 12|0);
    HEAP32[$155>>2] = $137;
    HEAP32[$$pre$phi22Z2D>>2] = $135;
   } else {
    $156 = ((($2)) + 24|0);
    $157 = HEAP32[$156>>2]|0;
    $158 = ((($2)) + 12|0);
    $159 = HEAP32[$158>>2]|0;
    $160 = ($159|0)==($2|0);
    do {
     if ($160) {
      $170 = ((($2)) + 16|0);
      $171 = ((($170)) + 4|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==(0|0);
      if ($173) {
       $174 = HEAP32[$170>>2]|0;
       $175 = ($174|0)==(0|0);
       if ($175) {
        $$3433 = 0;
        break;
       } else {
        $$1431 = $174;$$1435 = $170;
       }
      } else {
       $$1431 = $172;$$1435 = $171;
      }
      while(1) {
       $176 = ((($$1431)) + 20|0);
       $177 = HEAP32[$176>>2]|0;
       $178 = ($177|0)==(0|0);
       if (!($178)) {
        $$1431 = $177;$$1435 = $176;
        continue;
       }
       $179 = ((($$1431)) + 16|0);
       $180 = HEAP32[$179>>2]|0;
       $181 = ($180|0)==(0|0);
       if ($181) {
        break;
       } else {
        $$1431 = $180;$$1435 = $179;
       }
      }
      $182 = ($$1435>>>0)<($109>>>0);
      if ($182) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1435>>2] = 0;
       $$3433 = $$1431;
       break;
      }
     } else {
      $161 = ((($2)) + 8|0);
      $162 = HEAP32[$161>>2]|0;
      $163 = ($162>>>0)<($109>>>0);
      if ($163) {
       _abort();
       // unreachable;
      }
      $164 = ((($162)) + 12|0);
      $165 = HEAP32[$164>>2]|0;
      $166 = ($165|0)==($2|0);
      if (!($166)) {
       _abort();
       // unreachable;
      }
      $167 = ((($159)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = ($168|0)==($2|0);
      if ($169) {
       HEAP32[$164>>2] = $159;
       HEAP32[$167>>2] = $162;
       $$3433 = $159;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $183 = ($157|0)==(0|0);
    if (!($183)) {
     $184 = ((($2)) + 28|0);
     $185 = HEAP32[$184>>2]|0;
     $186 = (42280 + ($185<<2)|0);
     $187 = HEAP32[$186>>2]|0;
     $188 = ($2|0)==($187|0);
     if ($188) {
      HEAP32[$186>>2] = $$3433;
      $cond16 = ($$3433|0)==(0|0);
      if ($cond16) {
       $189 = 1 << $185;
       $190 = $189 ^ -1;
       $191 = HEAP32[(41980)>>2]|0;
       $192 = $191 & $190;
       HEAP32[(41980)>>2] = $192;
       break;
      }
     } else {
      $193 = HEAP32[(41992)>>2]|0;
      $194 = ($157>>>0)<($193>>>0);
      if ($194) {
       _abort();
       // unreachable;
      }
      $195 = ((($157)) + 16|0);
      $196 = HEAP32[$195>>2]|0;
      $197 = ($196|0)==($2|0);
      if ($197) {
       HEAP32[$195>>2] = $$3433;
      } else {
       $198 = ((($157)) + 20|0);
       HEAP32[$198>>2] = $$3433;
      }
      $199 = ($$3433|0)==(0|0);
      if ($199) {
       break;
      }
     }
     $200 = HEAP32[(41992)>>2]|0;
     $201 = ($$3433>>>0)<($200>>>0);
     if ($201) {
      _abort();
      // unreachable;
     }
     $202 = ((($$3433)) + 24|0);
     HEAP32[$202>>2] = $157;
     $203 = ((($2)) + 16|0);
     $204 = HEAP32[$203>>2]|0;
     $205 = ($204|0)==(0|0);
     do {
      if (!($205)) {
       $206 = ($204>>>0)<($200>>>0);
       if ($206) {
        _abort();
        // unreachable;
       } else {
        $207 = ((($$3433)) + 16|0);
        HEAP32[$207>>2] = $204;
        $208 = ((($204)) + 24|0);
        HEAP32[$208>>2] = $$3433;
        break;
       }
      }
     } while(0);
     $209 = ((($203)) + 4|0);
     $210 = HEAP32[$209>>2]|0;
     $211 = ($210|0)==(0|0);
     if (!($211)) {
      $212 = HEAP32[(41992)>>2]|0;
      $213 = ($210>>>0)<($212>>>0);
      if ($213) {
       _abort();
       // unreachable;
      } else {
       $214 = ((($$3433)) + 20|0);
       HEAP32[$214>>2] = $210;
       $215 = ((($210)) + 24|0);
       HEAP32[$215>>2] = $$3433;
       break;
      }
     }
    }
   }
  } while(0);
  $216 = $131 | 1;
  $217 = ((($$1)) + 4|0);
  HEAP32[$217>>2] = $216;
  $218 = (($$1) + ($131)|0);
  HEAP32[$218>>2] = $131;
  $219 = HEAP32[(41996)>>2]|0;
  $220 = ($$1|0)==($219|0);
  if ($220) {
   HEAP32[(41984)>>2] = $131;
   return;
  } else {
   $$2 = $131;
  }
 } else {
  $221 = $112 & -2;
  HEAP32[$111>>2] = $221;
  $222 = $$1416 | 1;
  $223 = ((($$1)) + 4|0);
  HEAP32[$223>>2] = $222;
  $224 = (($$1) + ($$1416)|0);
  HEAP32[$224>>2] = $$1416;
  $$2 = $$1416;
 }
 $225 = $$2 >>> 3;
 $226 = ($$2>>>0)<(256);
 if ($226) {
  $227 = $225 << 1;
  $228 = (42016 + ($227<<2)|0);
  $229 = HEAP32[10494]|0;
  $230 = 1 << $225;
  $231 = $229 & $230;
  $232 = ($231|0)==(0);
  if ($232) {
   $233 = $229 | $230;
   HEAP32[10494] = $233;
   $$pre = ((($228)) + 8|0);
   $$0436 = $228;$$pre$phiZ2D = $$pre;
  } else {
   $234 = ((($228)) + 8|0);
   $235 = HEAP32[$234>>2]|0;
   $236 = HEAP32[(41992)>>2]|0;
   $237 = ($235>>>0)<($236>>>0);
   if ($237) {
    _abort();
    // unreachable;
   } else {
    $$0436 = $235;$$pre$phiZ2D = $234;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $238 = ((($$0436)) + 12|0);
  HEAP32[$238>>2] = $$1;
  $239 = ((($$1)) + 8|0);
  HEAP32[$239>>2] = $$0436;
  $240 = ((($$1)) + 12|0);
  HEAP32[$240>>2] = $228;
  return;
 }
 $241 = $$2 >>> 8;
 $242 = ($241|0)==(0);
 if ($242) {
  $$0429 = 0;
 } else {
  $243 = ($$2>>>0)>(16777215);
  if ($243) {
   $$0429 = 31;
  } else {
   $244 = (($241) + 1048320)|0;
   $245 = $244 >>> 16;
   $246 = $245 & 8;
   $247 = $241 << $246;
   $248 = (($247) + 520192)|0;
   $249 = $248 >>> 16;
   $250 = $249 & 4;
   $251 = $250 | $246;
   $252 = $247 << $250;
   $253 = (($252) + 245760)|0;
   $254 = $253 >>> 16;
   $255 = $254 & 2;
   $256 = $251 | $255;
   $257 = (14 - ($256))|0;
   $258 = $252 << $255;
   $259 = $258 >>> 15;
   $260 = (($257) + ($259))|0;
   $261 = $260 << 1;
   $262 = (($260) + 7)|0;
   $263 = $$2 >>> $262;
   $264 = $263 & 1;
   $265 = $264 | $261;
   $$0429 = $265;
  }
 }
 $266 = (42280 + ($$0429<<2)|0);
 $267 = ((($$1)) + 28|0);
 HEAP32[$267>>2] = $$0429;
 $268 = ((($$1)) + 16|0);
 $269 = ((($$1)) + 20|0);
 HEAP32[$269>>2] = 0;
 HEAP32[$268>>2] = 0;
 $270 = HEAP32[(41980)>>2]|0;
 $271 = 1 << $$0429;
 $272 = $270 & $271;
 $273 = ($272|0)==(0);
 if ($273) {
  $274 = $270 | $271;
  HEAP32[(41980)>>2] = $274;
  HEAP32[$266>>2] = $$1;
  $275 = ((($$1)) + 24|0);
  HEAP32[$275>>2] = $266;
  $276 = ((($$1)) + 12|0);
  HEAP32[$276>>2] = $$1;
  $277 = ((($$1)) + 8|0);
  HEAP32[$277>>2] = $$1;
  return;
 }
 $278 = HEAP32[$266>>2]|0;
 $279 = ($$0429|0)==(31);
 $280 = $$0429 >>> 1;
 $281 = (25 - ($280))|0;
 $282 = $279 ? 0 : $281;
 $283 = $$2 << $282;
 $$0417 = $283;$$0418 = $278;
 while(1) {
  $284 = ((($$0418)) + 4|0);
  $285 = HEAP32[$284>>2]|0;
  $286 = $285 & -8;
  $287 = ($286|0)==($$2|0);
  if ($287) {
   label = 127;
   break;
  }
  $288 = $$0417 >>> 31;
  $289 = (((($$0418)) + 16|0) + ($288<<2)|0);
  $290 = $$0417 << 1;
  $291 = HEAP32[$289>>2]|0;
  $292 = ($291|0)==(0|0);
  if ($292) {
   label = 124;
   break;
  } else {
   $$0417 = $290;$$0418 = $291;
  }
 }
 if ((label|0) == 124) {
  $293 = HEAP32[(41992)>>2]|0;
  $294 = ($289>>>0)<($293>>>0);
  if ($294) {
   _abort();
   // unreachable;
  }
  HEAP32[$289>>2] = $$1;
  $295 = ((($$1)) + 24|0);
  HEAP32[$295>>2] = $$0418;
  $296 = ((($$1)) + 12|0);
  HEAP32[$296>>2] = $$1;
  $297 = ((($$1)) + 8|0);
  HEAP32[$297>>2] = $$1;
  return;
 }
 else if ((label|0) == 127) {
  $298 = ((($$0418)) + 8|0);
  $299 = HEAP32[$298>>2]|0;
  $300 = HEAP32[(41992)>>2]|0;
  $301 = ($299>>>0)>=($300>>>0);
  $not$ = ($$0418>>>0)>=($300>>>0);
  $302 = $301 & $not$;
  if (!($302)) {
   _abort();
   // unreachable;
  }
  $303 = ((($299)) + 12|0);
  HEAP32[$303>>2] = $$1;
  HEAP32[$298>>2] = $$1;
  $304 = ((($$1)) + 8|0);
  HEAP32[$304>>2] = $299;
  $305 = ((($$1)) + 12|0);
  HEAP32[$305>>2] = $$0418;
  $306 = ((($$1)) + 24|0);
  HEAP32[$306>>2] = 0;
  return;
 }
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _pthread_self() {
    return 0;
}
function _saveSetjmp(env, label, table, size) {
    // Not particularly fast: slow table lookup of setjmpId to label. But setjmp
    // prevents relooping anyhow, so slowness is to be expected. And typical case
    // is 1 setjmp per invocation, or less.
    env = env|0;
    label = label|0;
    table = table|0;
    size = size|0;
    var i = 0;
    setjmpId = (setjmpId+1)|0;
    HEAP32[((env)>>2)]=setjmpId;
    while ((i|0) < (size|0)) {
      if (((HEAP32[(((table)+((i<<3)))>>2)])|0) == 0) {
        HEAP32[(((table)+((i<<3)))>>2)]=setjmpId;
        HEAP32[(((table)+((i<<3)+4))>>2)]=label;
        // prepare next slot
        HEAP32[(((table)+((i<<3)+8))>>2)]=0;
        tempRet0 = size;
        return table | 0;
      }
      i = i+1|0;
    }
    // grow the table
    size = (size*2)|0;
    table = _realloc(table|0, 8*(size+1|0)|0) | 0;
    table = _saveSetjmp(env|0, label|0, table|0, size|0) | 0;
    tempRet0 = size;
    return table | 0;
}
function _testSetjmp(id, table, size) {
    id = id|0;
    table = table|0;
    size = size|0;
    var i = 0, curr = 0;
    while ((i|0) < (size|0)) {
      curr = ((HEAP32[(((table)+((i<<3)))>>2)])|0);
      if ((curr|0) == 0) break;
      if ((curr|0) == (id|0)) {
        return ((HEAP32[(((table)+((i<<3)+4))>>2)])|0);
      }
      i = i+1|0;
    }
    return 0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        ___setErrNo(12);
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&31](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&15](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&1](a1|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&31]();
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&15](a1|0,a2|0)|0;
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0) {
 p0 = p0|0; nullFunc_vi(1);
}
function b2(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(2);
}
function b3(p0) {
 p0 = p0|0; nullFunc_ii(3);return 0;
}
function b4() {
 ; nullFunc_v(4);
}
function b5(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(5);return 0;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdio_write,___stdio_seek,___stdout_write,_sn_write,b0,b0];
var FUNCTION_TABLE_vi = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,_signalHandler,b1,b1,b1,b1,b1,_cleanup_387,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_vii = [b2,b2,b2,b2,b2,b2,b2,_T3248314680_4,_T3248314680_5,b2,b2,_rawdealloc_42817_1689653243,b2,b2,_T1689653243_4,_T1689653243_8];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_v = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,_T1689653243_5,b4,b4,b4,_loop_143006_901127608,_PreMainInner,_NimMainInner,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4];
var FUNCTION_TABLE_iii = [b5,b5,b5,b5,b5,b5,_HEX3Aanonymous_125140_3248314680,b5,b5,_interiorallocatedptr_44492_1689653243,_rawalloc_36404_1689653243,b5,b5,b5,b5,b5];

  return { _testSetjmp: _testSetjmp, _i64Subtract: _i64Subtract, _free: _free, _main: _main, _realloc: _realloc, _i64Add: _i64Add, _pthread_self: _pthread_self, _memset: _memset, _llvm_cttz_i32: _llvm_cttz_i32, _malloc: _malloc, _saveSetjmp: _saveSetjmp, _memcpy: _memcpy, _sbrk: _sbrk, _bitshift64Lshr: _bitshift64Lshr, _fflush: _fflush, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Shl: _bitshift64Shl, ___errno_location: ___errno_location, ___udivmoddi4: ___udivmoddi4, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_v: dynCall_v, dynCall_iii: dynCall_iii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real__testSetjmp = asm["_testSetjmp"]; asm["_testSetjmp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__testSetjmp.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__main.apply(null, arguments);
};

var real__realloc = asm["_realloc"]; asm["_realloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__realloc.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real____udivmoddi4 = asm["___udivmoddi4"]; asm["___udivmoddi4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivmoddi4.apply(null, arguments);
};

var real__pthread_self = asm["_pthread_self"]; asm["_pthread_self"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__pthread_self.apply(null, arguments);
};

var real__llvm_cttz_i32 = asm["_llvm_cttz_i32"]; asm["_llvm_cttz_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_cttz_i32.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real__saveSetjmp = asm["_saveSetjmp"]; asm["_saveSetjmp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__saveSetjmp.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____uremdi3.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};
var _testSetjmp = Module["_testSetjmp"] = asm["_testSetjmp"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _free = Module["_free"] = asm["_free"];
var _main = Module["_main"] = asm["_main"];
var _realloc = Module["_realloc"] = asm["_realloc"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var ___udivmoddi4 = Module["___udivmoddi4"] = asm["___udivmoddi4"];
var _pthread_self = Module["_pthread_self"] = asm["_pthread_self"];
var _memset = Module["_memset"] = asm["_memset"];
var _llvm_cttz_i32 = Module["_llvm_cttz_i32"] = asm["_llvm_cttz_i32"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _saveSetjmp = Module["_saveSetjmp"] = asm["_saveSetjmp"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===





function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



