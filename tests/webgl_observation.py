"""Read real WebGL1/2 pixels after an actual frame, independent of renderer internals."""
OBSERVE = r"""
(() => {
  const evidence = window.__flowerEvidence = {serial:0, sampled:0, draws:[], errors:[]};
  window.__renderPasses = evidence.draws;
  window.__surfaceDraws = 0;
  for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Context) continue;
    const proto = Context.prototype;
    for (const name of ['drawArrays','drawElements']) {
      const original = proto[name];
      if (!original || original.__flowerObserver) continue;
      const wrapped = function(...args) {
        const count = name === 'drawElements' ? args[1] : args[2];
        const draw = {mode:args[0], count, indexed:name === 'drawElements',
          color:Array.from(this.getParameter(this.COLOR_WRITEMASK)),
          writeDepth:this.getParameter(this.DEPTH_WRITEMASK), testDepth:this.isEnabled(this.DEPTH_TEST)};
        const result = original.apply(this,args);
        evidence.gl = this; evidence.serial++;
        evidence.draws.push(draw);
        if (evidence.draws.length > 256) evidence.draws.shift();
        if (args[0] === this.TRIANGLES) window.__surfaceDraws++;
        return result;
      };
      wrapped.__flowerObserver = true; proto[name] = wrapped;
    }
  }
  window.__sampleFlowerFrame = () => {
    // Never overwrite the last genuine frame with a cleared default buffer
    // when a UI-only RAF runs later or the renderer is deliberately paused.
    if (evidence.sampled === evidence.serial || !evidence.gl) return;
    const gl=evidence.gl, canvas=document.querySelector('#bouquet');
    if (!canvas || canvas.dataset.rendered !== 'true') return;
    evidence.sampled=evidence.serial;
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const pixels=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const error=gl.getError(); if(error) evidence.errors.push(error);
    let minY=h,maxY=-1,minX=w,maxX=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(pixels[(y*w+x)*4+3]>180){minY=Math.min(minY,y);maxY=Math.max(maxY,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
    }
    const cutoff=Math.round(minY+(maxY-minY)*.40),rows=new Uint32Array(h),cols=new Uint32Array(w);
    let flowers=0,crown=0;
    for(let y=cutoff;y<=maxY;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;if(pixels[i+3]<=180)continue;crown++;
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      const neutral=Math.min(r,g,b)>140&&Math.max(r,g,b)-Math.min(r,g,b)<55;
      if((r>g*1.06&&r>85)||(b>g*1.08&&b>85)||neutral){flowers++;rows[y]++;cols[x]++;}
    }
    const quantile=(counts,fraction)=>{let sum=0;for(let i=0;i<counts.length;i++){sum+=counts[i];if(sum>=flowers*fraction)return i;}return counts.length-1;};
    const left=quantile(cols,.02),right=quantile(cols,.98),bottom=quantile(rows,.02),top=quantile(rows,.98);
    const bounds={height:(maxY-minY+1)/h,width:(maxX-minX+1)/w,minX,maxX,minY,maxY,w,h,
      coloredArea:flowers/(w*h),coloredWidth:(right-left+1)/w,
      crownFill:flowers*.92/Math.max(1,(right-left+1)*(top-bottom+1)),flowerShare:flowers/Math.max(1,crown)};
    window.__flowerBounds=bounds;window.__growthPixels=bounds;
    const mix=Number(canvas.dataset.mixProgress);
    if(Number.isFinite(mix)) window.__growthMix=mix;
    else {
      const program=gl.getParameter(gl.CURRENT_PROGRAM);
      const location=program&&gl.getUniformLocation(program,'uMix');
      if(location)window.__growthMix=gl.getUniform(program,location);
    }
    const program=gl.getParameter(gl.CURRENT_PROGRAM);
    evidence.attributes=program?gl.getProgramParameter(program,gl.ACTIVE_ATTRIBUTES):0;
    evidence.maxAttributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    evidence.webgl2=!!window.WebGL2RenderingContext&&gl instanceof WebGL2RenderingContext;
    evidence.engine=canvas.dataset.engine||'legacy-webgl1';
    evidence.lastFrame=Object.assign({},bounds);
  };
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>raf(now=>{cb(now);window.__sampleFlowerFrame();});
})();
"""

SYNTHETIC_CLOCK = r"""
let clock=1000,next=0;
const callbacks=new Map();
window.requestAnimationFrame=cb=>{callbacks.set(++next,cb);return next;};
window.cancelAnimationFrame=id=>callbacks.delete(id);
window.__advanceBloom=ms=>{
  clock+=ms;
  const pending=[...callbacks.values()];callbacks.clear();
  for(const cb of pending){cb(clock);window.__sampleFlowerFrame();}
};
"""
