/* The glass.
   One fragment shader per kind of mirror. Each receives the reflected person as a texture that is
   pinned to the middle of the viewport, plus the mirror's own rectangle, so the person stays put while
   the glass slides past. All coordinates are device pixels with the origin at the bottom left. */
(function () {
  'use strict';
  const SK = (window.SK = window.SK || {});

  SK.glassPrelude = `#version 300 es
precision highp float;
uniform sampler2D uHead, uAux;
uniform vec4 uHeadRect, uRect, uA, uB;
uniform vec2 uRes, uPtr;
uniform float uTime, uProg, uDpr, uIdx, uPtrIn;
uniform vec4 uRip[8];
out vec4 outColor;
vec2 P, L, C, F; float HH;
#define PX(x) ((x)*uDpr)
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n=h21(p); return vec2(n, h21(p+n+3.1)); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+17.1; a*=.5; } return s; }
vec4 headAt(vec2 px){ vec2 uv=(px-uHeadRect.xy)/uHeadRect.zw;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return vec4(0.); return texture(uHead,uv); }
vec4 headLod(vec2 px, float l){ vec2 uv=(px-uHeadRect.xy)/uHeadRect.zw;
  vec4 c=textureLod(uHead,clamp(uv,0.,1.),l);
  float e=smoothstep(0.,.05,uv.x)*smoothstep(1.,.95,uv.x)*smoothstep(0.,.05,uv.y)*smoothstep(1.,.95,uv.y); return c*e; }
vec3 comp(vec4 h, vec3 bg){ return h.rgb+bg*(1.-h.a); }
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
float sdBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
/* distance to the edge of a round-topped arch, in pixels; negative inside */
float sdArch(vec2 p, vec2 size){
  float w=size.x*.5; vec2 q=p-vec2(w,0.);
  float top=size.y-w;
  if(q.y>top) return length(q-vec2(0.,top))-w;
  return max(abs(q.x)-w, max(-q.y, q.y-size.y));
}
void init(){
  P=gl_FragCoord.xy; L=(P-uRect.xy)/uRect.zw; C=uRect.xy+uRect.zw*.5;
  F=uHeadRect.xy+uHeadRect.zw*vec2(.5,.6); HH=uHeadRect.w;
}
void finish(vec3 col, float a){ a=clamp(a,0.,1.); outColor=vec4(clamp(col,0.,1.)*a, a); }
`;

  const G = {};

  /* 0 · convex mirror after Parmigianino: the centre swells, the rim crowds the room together */
  G.convex = `
vec3 room(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.10,.07,.05), vec3(.20,.14,.09), smoothstep(-.8,.6,q.y));
  /* window on the left, as in the painting */
  vec2 w=q-vec2(-.95,.32);
  float win=step(abs(w.x),.24)*step(abs(w.y),.36);
  float mull=step(abs(w.x),.012)+step(abs(w.y-.05),.012);
  vec3 sky=mix(vec3(.95,.92,.82), vec3(.70,.80,.90), smoothstep(-.3,.4,w.y));
  c=mix(c, sky*(1.-mull*.85), win);
  c+=vec3(.55,.42,.28)*.35*exp(-dot(w,w)*3.5);
  /* ceiling beams */
  float beams=smoothstep(.4,.5,q.y)*smoothstep(.06,.02,abs(fract(q.x*2.6)-.5));
  c=mix(c, vec3(.05,.035,.025), beams*.8);
  /* a chair back and a doorframe to the right */
  float door=step(.72,q.x)*step(q.x,.78)*step(q.y,.9);
  c=mix(c, vec3(.06,.04,.03), door);
  return c;
}
void main(){ init();
  vec2 d=P-C; float R=min(uRect.z,uRect.w)*.5; float r=length(d)/R;
  float k=.80+.62*r*r;
  vec2 s=C+d*k;
  vec3 bg=room(s);
  vec4 h=headAt(s);
  vec3 col=comp(h,bg);
  /* old glass: a little green, darker towards the rim, a soft window highlight */
  col*=vec3(.96,1.,.97);
  col*=mix(1.,.45,smoothstep(.55,1.,r));
  col+=vec3(1.,.97,.9)*.16*smoothstep(.42,.0,length((L-vec2(.30,.70))*vec2(1.,1.5)));
  col+=vec3(1.)*.05*smoothstep(.97,.9,r)*smoothstep(.75,.95,r);
  finish(col, (1.-r)*R/1.5);
}`;

  /* 1 · steamed-up bathroom mirror; uAux holds the fog (1 = steamed) */
  G.fog = `
vec3 tiles(vec2 s, float blur){
  vec2 q=(s-F)/HH;
  vec2 t=q/.16+vec2(.5,.2);
  vec2 id=floor(t), f=fract(t);
  float grout=smoothstep(.035+blur*.2,.012,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
  vec3 c=vec3(.80,.83,.82)*(.93+.07*h21(id));
  c=mix(c, vec3(.55,.57,.56), grout*(1.-blur));
  c*=.72+.28*smoothstep(-.9,.9,q.y);
  c+=vec3(1.,.93,.8)*.28*exp(-pow(length(q-vec2(.0,1.05)),2.)*2.5);
  /* towel on the right */
  float tw=smoothstep(.01,0.,sdBox(q-vec2(.92,-.18),vec2(.16,.48),.05));
  c=mix(c, vec3(.42,.52,.58)*(.85+.15*sin(q.y*90.)), tw);
  return c;
}
void main(){ init();
  float m=texture(uAux,L).r;
  vec3 clear=comp(headAt(P), tiles(P,0.));
  vec3 soft=comp(headLod(P,4.6), tiles(P,1.)*.9+.06);
  vec2 lp=(P-uRect.xy)/uDpr;
  float beads=smoothstep(.62,.9,n2(lp*.35))*.5+smoothstep(.7,.95,n2(lp*.9+7.))*.4;
  vec3 fogc=mix(soft, vec3(.86,.88,.90), .58)+beads*.06;
  float edge=smoothstep(.15,.5,m)*smoothstep(.85,.5,m);
  /* drops along the wiped edge, a few running down */
  float drops=smoothstep(.55,.9,n2(lp*.5+3.))*edge;
  float run=smoothstep(.85,1.,n2(vec2(lp.x*.25,lp.y*.012+uTime*.02)))*smoothstep(.4,.9,1.-m)*.0;
  vec3 col=mix(clear, fogc, smoothstep(.12,.8,m));
  col+=vec3(.9)*drops*.35;
  col*=1.-.06*run;
  /* a cold reflection streak across the glass */
  col+=vec3(1.)*.05*smoothstep(.12,.0,abs(L.x*.8+L.y-1.05));
  float dEdge=sdBox(P-C, uRect.zw*.5, PX(6.));
  finish(col, -dEdge);
}`;

  /* fog mask update: regrows slowly, wiped along the pointer stroke */
  SK.fogMaskFrag = `#version 300 es
precision highp float;
uniform sampler2D uPrev; uniform vec2 uSize, uA0, uA1; uniform float uRad, uDt, uWipe, uAspect, uReset;
out vec4 outColor;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv=gl_FragCoord.xy/uSize;
  float m=texture(uPrev,uv).r;
  m+=uDt*(.028+.03*h21(floor(uv*24.)));
  vec2 a=uA0*vec2(uAspect,1.), b=uA1*vec2(uAspect,1.), p=uv*vec2(uAspect,1.);
  vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);
  float d=length(pa-ba*h);
  if(uWipe>.5) m=min(m, smoothstep(uRad*.55,uRad,d));
  if(uReset>.5) m=1.;
  outColor=vec4(clamp(m,0.,1.));
}`;

  /* 2 · a pond: Narcissus. Ripples from the pointer, leaves on the surface */
  G.water = `
vec3 sky(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.58,.70,.78), vec3(.86,.88,.84), smoothstep(.9,-.6,q.y));
  float cl=fbm(q*vec2(2.,3.5)+vec2(uTime*.01,0.));
  c=mix(c, vec3(.96,.95,.92), smoothstep(.5,.85,cl)*.6);
  /* willow branches hanging in from above */
  float br=0.;
  for(int i=0;i<5;i++){
    float fi=float(i);
    float x0=-1.25+fi*.62+.1*sin(fi*4.1);
    float sway=.03*sin(uTime*.4+fi);
    float dx=q.x-(x0+sway*(1.2-q.y)+.05*sin(q.y*6.+fi));
    float leaf=smoothstep(.06,.0,abs(dx))*smoothstep(-.4,.5,q.y+.25*h21(vec2(fi,1.)));
    leaf*=.4+.6*smoothstep(.3,.7,n2(vec2(q.x*40.,q.y*14.)+fi*9.));
    br=max(br,leaf);
  }
  c=mix(c, vec3(.10,.17,.08), br*.85);
  return c;
}
void main(){ init();
  vec2 lp=(P-uRect.xy)/uDpr;
  vec2 cl=L-.5;
  float th=atan(cl.y,cl.x);
  float rad=1.+.05*sin(3.*th+1.)+.035*sin(5.*th+2.3)+.02*sin(9.*th);
  float e=length(cl/.5)/rad;
  vec2 g=vec2(0.);
  for(int i=0;i<8;i++){
    vec4 r=uRip[i]; if(r.w<=0.) continue;
    float age=uTime-r.z; if(age<0.||age>6.) continue;
    vec2 dv=lp-r.xy; float dist=length(dv)+1e-3;
    float front=age*140.;
    float env=exp(-pow((dist-front)/(38.+age*30.),2.))*exp(-age*.9)*r.w;
    g+=dv/dist*cos(dist*.11-age*10.)*env;
  }
  vec2 wp=lp*.012+vec2(uTime*.05,uTime*.03);
  g+=(vec2(n2(wp),n2(wp+7.3))-.5)*.35+(vec2(n2(wp*3.1+2.),n2(wp*3.1+9.))-.5)*.15;
  vec2 s=P+g*PX(18.);
  vec3 refl=comp(headAt(s), sky(s));
  vec3 body=vec3(.03,.07,.06);
  vec3 col=mix(body, refl*vec3(.78,.88,.86), .8);
  vec3 n=normalize(vec3(-g*.9,1.));
  col+=vec3(1.,.97,.9)*pow(max(dot(n,normalize(vec3(.35,.4,1.))),0.),220.)*.9;
  /* leaves floating on top */
  for(int i=0;i<6;i++){
    float fi=float(i);
    vec2 base=vec2(h21(vec2(fi,3.)), h21(vec2(fi,7.)))*uRect.zw/uDpr;
    vec2 pos=base+vec2(sin(uTime*.05+fi*2.),cos(uTime*.043+fi))*40.+g*6.;
    vec2 lq=rot(fi*1.7+uTime*.03)*(lp-pos);
    float sz=16.+10.*h21(vec2(fi,11.));
    float lf=length(lq/vec2(sz,sz*.48))-1.+.35*abs(lq.x)/sz;
    vec3 lc=mix(vec3(.62,.42,.08), vec3(.36,.42,.10), h21(vec2(fi,5.)));
    lc*=.8+.2*smoothstep(.0,2.,abs(lq.y));
    float shadow=smoothstep(4.,-6.,length((lq+vec2(3.,-4.))/vec2(sz,sz*.48))*sz-sz);
    col*=1.-.35*shadow*step(0.,lf);
    col=mix(col, lc, smoothstep(1.,-1.,lf*sz));
  }
  /* muddy shore, wet rim */
  float shore=smoothstep(.86,1.,e);
  col=mix(col, vec3(.07,.06,.04), shore*.85);
  col+=vec3(.5,.55,.45)*.15*smoothstep(.93,.97,e)*smoothstep(1.,.97,e);
  finish(col, (1.-e)*min(uRect.z,uRect.w)*.5/1.5);
}`;

  /* 3 · fairground mirrors; uIdx picks the warp, uProg and time drive it */
  G.funhouse = `
vec3 tent(vec2 s){
  vec2 q=(s-F)/HH;
  float conv=1.+.35*max(q.y,0.);
  float st=fract(q.x*conv*2.8);
  vec3 c=mix(vec3(.50,.05,.07), vec3(.88,.80,.64), step(.5,st));
  c*=.55+.45*smoothstep(-1.,.8,q.y);
  /* a string of bulbs */
  float y0=.68-.10*cos(q.x*2.6);
  for(int i=-6;i<=6;i++){
    vec2 b=vec2(float(i)*.24, y0+.01*float(i%2));
    float d=length(q-b);
    float tw=.6+.4*sin(uTime*3.+float(i)*1.7);
    c+=vec3(1.,.78,.38)*(smoothstep(.03,.0,d)*1.4+exp(-d*d*120.)*.5)*tw;
  }
  return c;
}
void main(){ init();
  vec2 lp=P-uRect.xy;
  float sd=sdArch(lp, uRect.zw);
  vec2 u=(P-F)/HH;
  float ph=uProg*6.283+uTime*.35;
  vec2 w;
  if(uIdx<.5){
    w=vec2(u.x*(1.75+.15*sin(ph)), u.y*(.62+.08*sin(u.y*5.+ph)));
  } else if(uIdx<1.5){
    w=u+vec2(.13*sin(u.y*8.+ph*2.), .05*sin(u.x*6.+ph));
    w*=.78+.55*dot(u,u)*(1.+.3*sin(ph));
  } else {
    w=vec2(u.x*(.56+.06*sin(ph+1.)), u.y*(1.55+.15*cos(ph))+.18*u.x*u.x);
  }
  vec2 s=F+w*HH;
  vec3 col=comp(headAt(s), tent(s));
  col*=vec3(.95,.97,1.)*(.93+.07*n2(lp/PX(60.)));
  col+=vec3(1.)*.06*smoothstep(.15,.0,abs(L.x-L.y*.4-.25));
  finish(col, -sd/uDpr);
}`;

  /* 4 · the portrait that ages: brush strokes, varnish, craquelure; uA.x = age */
  G.portrait = `
vec3 drape(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.05,.035,.02), vec3(.22,.16,.08), smoothstep(1.2,-.4,length(q-vec2(-.55,.5))));
  float fold=sin(q.x*7.+fbm(q*3.)*3.);
  c*=.85+.15*fold;
  return c;
}
vec2 vor(vec2 x){
  vec2 n=floor(x), f=fract(x); float d1=8., d2=8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j); vec2 o=h22(n+g); vec2 r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}
void main(){ init();
  float age=uA.x;
  float ang=fbm(P/PX(150.))*6.283;
  vec2 dir=vec2(cos(ang),sin(ang));
  vec2 cell=floor(rot(ang)*P/PX(vec2(12.,4.5)));
  vec2 jit=(h22(cell)-.5)*PX(4.);
  vec4 acc=vec4(0.); vec3 bg=vec3(0.);
  for(int i=-2;i<=2;i++){
    vec2 s=P+jit+dir*float(i)*PX(2.6);
    acc+=headLod(s,1.3); bg+=drape(s);
  }
  acc/=5.; bg/=5.;
  vec3 col=comp(acc,bg);
  col=mix(col, floor(col*12.+.5)/12., .22);
  float l=lum(col);
  /* impasto: light catches the ridges of paint */
  float ridge=n2(rot(ang)*P/PX(vec2(9.,2.)));
  col*=.9+.2*ridge;
  float weave=sin(P.x/PX(1.3))*sin(P.y/PX(1.3));
  col*=.95+.05*weave;
  /* varnish yellows, cracks spread with age */
  col=mix(col, col*vec3(1.05,.82,.52), .25+.45*age);
  vec2 lp=(P-uRect.xy)/uDpr;
  vec2 v=vor(lp/22.);
  float crack=smoothstep(.07,.0,v.y-v.x)*smoothstep(.15,.6,age+.2*n2(lp*.02));
  col*=1.-.55*crack;
  col*=mix(1.,.55,smoothstep(.25,.75,length(L-.5)*1.15));
  col=mix(col, vec3(lum(col))*vec3(.9,.8,.6), age*.25);
  finish(col, 1.);
}`;

  /* 5 · broken mirror; uA.xy = impact (local css px), uA.z = seed */
  G.shards = `
vec3 corridor(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.20,.21,.22), vec3(.40,.41,.42), smoothstep(-1.,1.,q.y));
  c*=.9+.1*n2(q*20.);
  float tube=smoothstep(.02,.0,abs(q.y-1.02))*step(abs(q.x),.7);
  c+=vec3(.9,1.,.95)*tube+vec3(.25,.3,.28)*exp(-pow(q.y-1.02,2.)*30.);
  float door=smoothstep(.01,.0,sdBox(q-vec2(-.95,-.15),vec2(.22,.75),.0));
  c=mix(c, vec3(.08,.09,.1), door*.9);
  return c;
}
void main(){ init();
  vec2 lp=(P-uRect.xy)/uDpr;
  vec2 I=uA.xy; float seed=uA.z;
  vec2 v=lp-I; float r=length(v); float th=atan(v.y,v.x);
  float rc=log(r/14.+1.)*2.4+.5*n2(vec2(th*3.,seed));
  float ri=floor(rc);
  float N=15.;
  float sc=(th/6.2831+.5)*N+h21(vec2(ri,seed))*1.7+.25*n2(vec2(r*.03,ri+seed));
  float si=floor(sc);
  vec2 id=vec2(ri,mod(si,N));
  float dS=(.5-abs(fract(sc)-.5))*r*6.2831/N;
  float dR=(.5-abs(fract(rc)-.5))*(r+14.)/2.4;
  float dC=min(dS,dR);
  vec2 hv=h22(id+seed);
  float near=smoothstep(10.,90.,r);
  vec2 off=(hv-.5)*PX(22.)*near;
  float sc2=1.+(h21(id*1.3+seed)-.5)*.10*near;
  vec2 s=F+(P+off-F)*sc2;
  vec3 col=comp(headAt(s), corridor(s));
  col*=.78+.4*h21(id*2.1+seed);
  col=mix(col, col*vec3(.92,1.,1.05), step(.6,hv.x)*.5);
  float missing=step(.9,h21(id*1.7+seed))*step(r,170.)*step(1.,ri);
  col=mix(col, vec3(.04,.04,.045)+.03*n2(lp*.3), missing);
  /* crack lines and crushed glass at the impact */
  col=mix(col, vec3(1.), smoothstep(1.4,.2,dC)*.8*step(.5,r));
  col*=1.-.4*smoothstep(3.,1.4,dC);
  col=mix(col, vec3(.85)+.15*n2(lp*1.5), smoothstep(14.,6.,r));
  float dEdge=sdBox(P-C, uRect.zw*.5, 0.);
  finish(col, -dEdge);
}`;

  /* 6 · black mirror: a phone with its screen off; uA.x = screen on (0..1) */
  G.phone = `
vec3 dim(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=vec3(.10,.10,.12)*smoothstep(-1.2,1.,q.y);
  c+=vec3(.9,.9,1.)*.5*exp(-pow(length((q-vec2(.25,1.05))*vec2(1.,3.)),2.)*6.);
  return c;
}
void main(){ init();
  vec2 lp=P-uRect.xy;
  float rr=uRect.z*.13;
  float sd=sdBox(P-C, uRect.zw*.5, rr);
  float on=uA.x;
  vec4 h=headAt(P);
  vec3 refl=comp(h, dim(P));
  refl=mix(vec3(lum(refl)), refl, .55);
  vec2 sl=lp/uDpr;
  float smudge=fbm(sl*vec2(.02,.03)+3.)*.8+smoothstep(.5,.0,length((L-vec2(.62,.32))*vec2(1.,1.6)))*.5;
  float print=smoothstep(.3,.0,abs(sin(length((L-vec2(.35,.55))*vec2(1.,.6))*260.)))*smoothstep(.12,.0,length((L-vec2(.35,.55))*vec2(1.,.6)));
  vec3 off=vec3(.008,.009,.012)+refl*.30*(.75+.5*smudge)+print*.03;
  off+=vec3(.8,.85,1.)*.05*smoothstep(.07,.0,abs(L.x*.9+L.y-1.12));
  float t=uTime*.08;
  vec2 wq=L*vec2(1.,2.1);
  float b1=fbm(wq*1.6+vec2(t,-t));
  vec3 wall=mix(vec3(.08,.05,.30), vec3(.75,.20,.48), smoothstep(.35,.75,b1));
  wall=mix(wall, vec3(.98,.58,.32), smoothstep(.62,.9,fbm(wq*2.2-vec2(t*.7,0.)+5.))*.8);
  wall*=.55+.45*smoothstep(1.,.3,L.y);
  vec3 col=mix(off, wall+refl*.04, on);
  finish(col, -sd/uDpr);
}`;

  /* 7 · through the looking-glass: liquid mercury, the far side is a chessboard world */
  G.portal = `
vec3 world(vec2 s){
  vec2 q=(s-F)/HH;
  float hz=-.42;
  vec3 c=mix(vec3(.42,.30,.55), vec3(.05,.08,.20), smoothstep(hz,1.2,q.y));
  vec2 st=floor(q*60.); float star=step(.985,h21(st))*smoothstep(hz,hz+.3,q.y);
  c+=star*(.5+.5*sin(uTime*2.+h21(st)*20.));
  c+=vec3(1.,.95,.8)*smoothstep(.13,.12,length(q-vec2(.72,.72)))*.9;
  if(q.y<hz){
    float z=.35/(hz-q.y);
    vec2 w=vec2(q.x*z, z+uTime*.08);
    float ch=mod(floor(w.x*2.)+floor(w.y*2.),2.);
    vec3 fl=mix(vec3(.75,.08,.10), vec3(.92,.88,.80), ch);
    c=mix(fl, c, smoothstep(.8,5.,z));
  }
  return c;
}
void main(){ init();
  vec2 lp=P-uRect.xy;
  float sd=sdArch(lp, uRect.zw);
  vec2 d=P-C; float R=uRect.z*.5; float r=length(d)/R;
  float a=1.3*exp(-r*r*1.1)*sin(uTime*.22+uProg*5.);
  vec2 dd=rot(a)*d;
  if(uPtrIn>.5){
    vec2 pv=P-uPtr; float pd=length(pv)+1.;
    dd+=pv/pd*sin(pd/PX(10.)-uTime*6.)*exp(-pd/PX(130.))*PX(6.);
  }
  vec2 s=C+dd;
  vec2 m=vec2(2.*F.x-s.x, s.y);
  vec2 ca=normalize(d+1e-3)*PX(2.5)*r;
  vec3 col;
  col.r=comp(headAt(m+ca), world(m+ca)).r;
  col.g=comp(headAt(m), world(m)).g;
  col.b=comp(headAt(m-ca), world(m-ca)).b;
  col=mix(col, col*vec3(.8,.95,1.15), .5);
  float rim=smoothstep(-PX(40.),0.,sd);
  float liquid=fbm(lp/PX(26.)+vec2(uTime*.3,-uTime*.2));
  vec3 merc=vec3(.55,.58,.62)*(.5+.8*liquid)+pow(liquid,6.)*1.5;
  col=mix(col, merc, rim*.9);
  finish(col, -sd/uDpr);
}`;

  /* 8 · the magic mirror of the queen: smoke, candles; uA.x = how much the face shows */
  G.magic = `
vec3 vault(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.02,.01,.03), vec3(.10,.05,.14), smoothstep(-1.,1.,q.y));
  for(int i=0;i<3;i++){
    vec2 cp=vec2(-.75+.75*float(i), -.55+.08*float(i==1?1:0));
    float fl=.8+.2*sin(uTime*9.+float(i)*3.)*sin(uTime*5.3+float(i));
    c+=vec3(1.,.55,.18)*exp(-dot(q-cp,q-cp)*9.)*.55*fl;
    c+=vec3(1.,.8,.4)*smoothstep(.03,.0,length((q-cp-vec2(0.,.05))*vec2(2.2,1.)))*fl;
  }
  return c;
}
void main(){ init();
  vec2 cl=(L-.5)*2.;
  float e=length(cl);
  vec2 sl=(P-uRect.xy)/uDpr;
  float smoke=fbm(sl/170.+vec2(uTime*.03,-uTime*.05)+fbm(sl/90.-uTime*.04));
  vec2 s=P+(vec2(smoke)-.5)*PX(10.);
  vec4 h=headAt(s);
  float show=clamp(uA.x*1.3+smoke*.9-.55,0.,1.);
  h*=show;
  vec3 bg=vault(s)+vec3(.30,.22,.42)*smoothstep(.4,.9,smoke)*.5;
  vec3 col=comp(h*vec4(.85,1.,.95,1.), bg);
  col+=vec3(.25,.55,.45)*h.a*.12;
  col*=mix(1.,.3,smoothstep(.55,1.,e));
  col+=vec3(.8,.9,1.)*.08*smoothstep(.3,.0,length((L-vec2(.32,.76))*vec2(1.3,1.)));
  finish(col, (1.-e)*min(uRect.z,uRect.w)*.5/1.5);
}`;

  /* 9 · a plain, honest mirror */
  G.plain = `
vec3 studio(vec2 s){
  vec2 q=(s-F)/HH;
  vec3 c=mix(vec3(.16,.17,.18), vec3(.42,.43,.44), smoothstep(-1.,1.2,q.y));
  c+=vec3(.25)*exp(-pow(length((q-vec2(-.6,.6))*vec2(1.,.7)),2.)*3.);
  return c;
}
void main(){ init();
  vec3 col=comp(headAt(P), studio(P));
  float dEdge=sdBox(P-C, uRect.zw*.5, PX(4.));
  col=mix(col, col*vec3(.75,.92,.85), smoothstep(-PX(10.),0.,dEdge));
  col+=vec3(1.)*.035*smoothstep(.2,.0,abs(L.x*.7+L.y-1.2));
  finish(col, -dEdge/uDpr);
}`;

  /* the camera or a photo as the reflected person. A photo gets a little life: it turns towards the
     pointer on an ellipsoid depth proxy, breathes, and the troll and age of each mirror are graded in. */
  SK.photoFrag = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uRes, uSrcSize; uniform vec3 uFrame;
uniform float uFlip, uTroll, uAge, uGlow, uYaw, uPitch, uTime;
out vec4 outColor;
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float ar=uRes.x/uRes.y, sar=uSrcSize.x/uSrcSize.y;
  vec2 d=(uv-vec2(.5,.6))*vec2(ar,1.);
  d*=1.-.004*sin(uTime*1.3);
  vec2 dn=d-vec2(0.,.02);
  float z=sqrt(max(0.,1.-dot(dn/vec2(.34,.44),dn/vec2(.34,.44))));
  d-=vec2(sin(uYaw),-sin(uPitch))*z*.10;
  /* troll: the nose swells */
  vec2 nose=vec2(0.,-.06); vec2 dv=d-nose;
  d=nose+dv*(1.-.5*uTroll*exp(-dot(dv,dv)/.006));
  if(uFlip>.5) d.x=-d.x;
  vec2 s=vec2(uFrame.x+d.x/(uFrame.z*sar), uFrame.y-d.y/uFrame.z);
  vec3 c=texture(uSrc,s).rgb;
  float l=dot(c,vec3(.3,.59,.11));
  c=mix(c, vec3(l)*vec3(.55,.95,.35)+c*vec3(.1,.25,.05), uTroll*.75);
  c=mix(c, vec3(l)*vec3(1.05,.88,.66), uAge*.7);
  c=mix(c, c*vec3(.55,.7,1.1), uGlow*.5);
  float inside=smoothstep(0.,.03,s.x)*smoothstep(0.,.03,s.y)*smoothstep(1.,.97,s.x)*smoothstep(1.,.97,s.y);
  float a=smoothstep(1.,.78,length((d-vec2(0.,.0))/vec2(.40,.52)))*inside;
  a=max(a, smoothstep(1.,.8,length((d-vec2(0.,-.62))/vec2(.62,.3)))*inside*smoothstep(-1.,-.6,d.y));
  outColor=vec4(c*a, a);
}`;

  SK.glass = G;
})();
