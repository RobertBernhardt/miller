/* The reflected person.
   A head sculpted from signed distance functions and ray-marched into a texture once per frame.
   Every feature is a parameter (gaze, lids, smile, nose, ears, age, troll ...), so each mirror can
   show the same person a little differently and the page can morph between them while scrolling. */
(function () {
  'use strict';
  const SK = (window.SK = window.SK || {});

  /* parameter slots, shared by the shader (#define) and the JS blending */
  const KEYS = ['yaw', 'pitch', 'roll', 'gazeX', 'gazeY', 'blink', 'lid', 'smile', 'open', 'brow',
    'worry', 'nose', 'ear', 'jaw', 'cheek', 'age', 'troll', 'hairVol', 'hairMess', 'eye',
    'glow', 'under', 'wet', 'stubble'];
  const IDX = {}; KEYS.forEach((k, i) => (IDX[k] = i));
  SK.HEAD_KEYS = KEYS; SK.HEAD_IDX = IDX;

  const defines = KEYS.map((k, i) => `#define ${k.toUpperCase()} P[${i}]`).join('\n');

  SK.headFrag = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float P[${KEYS.length}];
uniform vec3 uSkin, uHair, uIris, uCloth;
uniform vec3 uKeyDir, uKeyCol, uFillCol, uRimCol, uAmb;
uniform float uTime;
out vec4 outColor;
${defines}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float sdE(vec3 p, vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.)/max(k1,1e-5); }
float smin(float a, float b, float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float smax(float a, float b, float k){ return -smin(-a,-b,k); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
float sdCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba=b-a, pa=p-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return length(pa-ba*h)-mix(r1,r2,h);
}

const vec3 PIVOT = vec3(0.,-.55,-.08);
mat3 headRot;
vec3 toHead(vec3 p){ return headRot*(p-PIVOT)+PIVOT; }

vec3 eyeC(){ return vec3(.232,.135,.585); }
float eyeR(){ return .118*EYE*(1.-.18*TROLL); }

/* the head without eyes; m receives a material hint */
float skin(vec3 p, out float m){
  float t=TROLL;
  vec3 q=vec3(abs(p.x),p.y,p.z);
  float d=sdE(p-vec3(0.,.30,-.07), vec3(.71+.05*t,.81,.82));
  d=smin(d, sdE(p-vec3(0.,-.15,.13), vec3(.57+.05*CHEEK,.66,.62)), .28);
  float jw=.29+.08*JAW+.07*t;
  d=smin(d, sdE(q-vec3(jw+.02,-.43-.05*AGE,-.03), vec3(.26,.27+.03*AGE,.44)), .2);
  d=smin(d, sdE(p-vec3(0.,-.78-.02*t,.36+.06*t), vec3(.19+.05*t,.15,.17)), .18);
  d=smin(d, sdE(q-vec3(.335,-.10-.05*CHEEK-.04*AGE,.45), vec3(.19,.14+.04*CHEEK,.16)), .16);
  float sm=max(SMILE,0.);
  d=smin(d, sdE(q-vec3(.25+.02*sm,-.36+.03*sm,.55), vec3(.12,.10,.10)*(.55+.55*sm)), .12);
  /* brow ridge, pushed by brow raise and worry */
  float by=.30+.035*BROW+.03*WORRY*(1.-smoothstep(.05,.3,q.x));
  d=smin(d, sdE(p-vec3(0.,by,.62), vec3(.42,.075+.035*t,.115+.05*t)), .12);
  /* eye sockets */
  d=smax(d, -sdE(q-vec3(.232,.13,.69), vec3(.165,.10,.135)*(.9+.1*EYE)), .09);
  /* nose */
  float ns=NOSE*(1.+1.0*t);
  vec3 T=vec3(0., .03-.22*ns-.06*t, .73+.20*ns);
  float nose=sdCone(p, vec3(0.,.20,.70), T, .045, .066*ns);
  nose=smin(nose, length(p-T)-.08*ns, .05);
  nose=smin(nose, sdE(q-vec3(.078*ns+.01*t, T.y-.05, T.z-.12*ns), vec3(.045,.04,.045)*ns), .05);
  nose=smax(nose, -sdE(q-vec3(.048*ns, T.y-.08*ns, T.z-.055*ns), vec3(.022,.014,.03)*ns), .012);
  d=smin(d, nose, .055);
  /* lips, curving around the face */
  float bend=1.15*q.x*q.x;
  vec3 lp=p-vec3(0.,-.43+SMILE*.75*q.x*q.x-.015*t,.752); lp.z+=bend;
  float up=sdE(lp, vec3(.14,.024,.04));
  float lo=sdE(lp-vec3(0.,-.072-.03*OPEN,-.008+.02*t), vec3(.125+.03*t,.034+.012*t,.05));
  float lips=min(up,lo);
  d=smin(d, lips, .05);
  float gap=sdE(lp-vec3(0.,-.036-.015*OPEN,.022), vec3(.145+.02*abs(SMILE), .005+.045*OPEN, .09));
  d=smax(d, -gap, .014);
  /* ears */
  float es=EAR*(1.+.7*t);
  vec3 ep=q-vec3(.715+.03*t,.06+.06*t,-.05);
  ep.xy=rot(.12+.85*t)*ep.xy;
  ep.yz=rot(-.18)*ep.yz;
  float ear=sdE(ep-vec3(0.,.1*t*es,0.), vec3(.065,.21*es*(1.+.5*t),.14*es));
  ear=smax(ear, -sdE(ep-vec3(.045,.02,.015), vec3(.04,.14*es,.085*es)), .03);
  d=smin(d, ear, .05);
  /* warts for the troll */
  if(t>.01){
    float w=length(p-vec3(.07,T.y+.05,T.z-.02))-.032*t;
    w=min(w, length(p-vec3(-.36,-.24,.55))-.03*t);
    w=min(w, length(p-vec3(.10,-.88,.47))-.026*t);
    d=smin(d, w, .015);
  }
  /* material hints: 1 skin, 6 mouth inside, 7 lips */
  m = 1.;
  if (gap < .006) m = 6.;
  else if (lips < .012) m = 7.;
  return d;
}

float eyelids(vec3 p){
  vec3 q=vec3(abs(p.x),p.y,p.z);
  vec3 e=q-eyeC(); float r=eyeR();
  float a=mix(-.32, 1.45, clamp(LID*.55+BLINK,0.,1.));
  a-= .18*max(BROW,0.);
  vec3 nu=vec3(0.,cos(a),sin(a));
  float upper=max(length(e)-r*1.1, -dot(e,nu));
  float b=-.40+.30*BLINK+.18*max(SMILE,0.)+.15*UNDER;
  vec3 nl=vec3(0.,-cos(b),sin(b));
  float lower=max(length(e)-r*1.08, -dot(e,nl));
  return min(upper,lower);
}

float hair(vec3 p){
  vec3 q=vec3(abs(p.x),p.y,p.z);
  float hv=HAIRVOL, hm=HAIRMESS;
  float n=noise(p*7.+vec3(0.,0.,1.3))*.6+noise(p*15.)*.4;
  float d=sdE(p-vec3(0.,.35+.05*hv,-.10), vec3(.745,.865,.875)+.04*hv)-.012*n-.018*hm*(n-.4);
  float h=.64-.26*smoothstep(.28,.66,q.x)-.95*smoothstep(.05,-.55,p.z);
  h+= .025*hm*sin(p.x*21.+4.*n)-.05*hm*smoothstep(.0,.3,p.z)*n;
  d=smax(d, (h-p.y)*.8, .05);
  /* swept-up quiff: volume on top and at the front, pushed back and to one side */
  float sp=noise(vec3(p.x*11.,p.y*4.,p.z*11.)+3.);
  float quiff=sdE(p-vec3(-.06,.98+.04*hv,.36), vec3(.46,.20+.05*hv,.36))-.05*hm*(sp-.35);
  quiff=smax(quiff, (.66-p.y)*.8, .08);
  d=smin(d, quiff, .18);
  d-=.05*hm*smoothstep(.9,1.25,p.y)*(sp-.3);
  /* keep the ears free */
  d=smax(d, -sdE(q-vec3(.74,.08,-.05), vec3(.16,.27,.2)), .04);
  return d;
}

float collar(vec3 p){
  float c=abs(sdCap(p, vec3(0.,-1.14,-.15), vec3(0.,-1.62,-.17), .40))-.035;
  c=max(c, p.y-(-1.12-.10*smoothstep(.0,.5,p.z)));
  float open=abs(p.x)-(.07+.42*clamp(-1.16-p.y,0.,1.));
  c=smax(c, -max(open, -p.z), .02);
  return c;
}
float body(vec3 p){
  float d=sdCap(p, vec3(0.,-.48,-.14), vec3(0.,-1.6,-.16), .33+.05*TROLL);
  d=smin(d, sdE(p-vec3(0.,-1.98,-.22), vec3(1.45,.62,.62)), .32);
  return d;
}

float gMat;
float map(vec3 p){
  vec3 h=toHead(p);
  float m;
  float s=skin(h,m);
  float lids=eyelids(h);
  s=smin(s, lids, .022);
  vec3 q=vec3(abs(h.x),h.y,h.z);
  float eye=length(q-eyeC())-eyeR();
  float hr=hair(h);
  float bd=body(p);
  float all=smin(s, bd, .16);
  gMat=m;
  /* track jacket: open zip shows the neck in a V */
  float vee=abs(p.x)-(.06+.45*clamp(-1.30-p.y,0.,1.));
  if (p.y<-1.30+.05*p.x*p.x && bd<all+.02 && !(vee<0. && p.z>.05)) gMat=4.;
  float cl=collar(p);
  if (cl<all){ all=cl; gMat=4.; }
  float d=all;
  if (hr<d){ d=hr; gMat=3.; }
  if (eye<d){ d=eye; gMat=2.; }
  return d;
}
float mapD(vec3 p){
  vec3 h=toHead(p); float m;
  float s=smin(skin(h,m), eyelids(h), .022);
  vec3 q=vec3(abs(h.x),h.y,h.z);
  return min(min(min(smin(s, body(p), .16), collar(p)), hair(h)), length(q-eyeC())-eyeR());
}
vec3 calcN(vec3 p){
  const vec2 k=vec2(1.,-1.); float e=.0012;
  return normalize(k.xyy*mapD(p+k.xyy*e)+k.yyx*mapD(p+k.yyx*e)+k.yxy*mapD(p+k.yxy*e)+k.xxx*mapD(p+k.xxx*e));
}
float calcAO(vec3 p, vec3 n){
  float o=0., s=1.;
  for(int i=0;i<5;i++){ float h=.015+.06*float(i); o+=(h-mapD(p+n*h))*s; s*=.75; }
  return clamp(1.-2.2*o,0.,1.);
}
float shadow(vec3 ro, vec3 rd){
  float r=1., t=.02;
  for(int i=0;i<22;i++){
    float h=mapD(ro+rd*t); r=min(r, 9.*h/t); t+=clamp(h,.02,.2);
    if(r<.01||t>2.5) break;
  }
  return clamp(r,0.,1.);
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }

void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 p=(uv*2.-1.)*vec2(uRes.x/uRes.y,1.);
  float cy=cos(YAW), sy=sin(YAW), cx=cos(PITCH), sx=sin(PITCH), cz=cos(ROLL), sz=sin(ROLL);
  mat3 RY=mat3(cy,0.,-sy, 0.,1.,0., sy,0.,cy);
  mat3 RX=mat3(1.,0.,0., 0.,cx,sx, 0.,-sx,cx);
  mat3 RZ=mat3(cz,sz,0., -sz,cz,0., 0.,0.,1.);
  headRot=transpose(RY*RX*RZ);

  vec3 ro=vec3(0.,-.05,6.);
  vec3 rd=normalize(vec3(p*.26,-1.));
  /* bounding sphere */
  vec3 bc=vec3(0.,-.5,0.); float br=2.5;
  vec3 oc=ro-bc; float b=dot(oc,rd); float c=dot(oc,oc)-br*br; float hdisc=b*b-c;
  outColor=vec4(0.);
  if(hdisc<0.) return;
  float t=-b-sqrt(hdisc), tmax=-b+sqrt(hdisc);
  float minD=1e9, tc=t; bool hit=false;
  float pix=2.*.26/uRes.y;
  for(int i=0;i<110;i++){
    float d=map(ro+rd*t);
    float dr=d/(pix*t);
    if(dr<minD){ minD=dr; tc=t; }
    if(d<.0009*t){ hit=true; break; }
    t+=d*.85;
    if(t>tmax) break;
  }
  if(!hit){
    float a=clamp(1.-minD,0.,1.)*.8;
    if(a<=0.) return;
    t=tc; /* soft silhouette fringe: shade the closest approach */
    map(ro+rd*t);
  }
  vec3 pos=ro+rd*t;
  float mat=gMat;
  vec3 n=calcN(pos);
  vec3 hp=toHead(pos);
  vec3 hn=headRot*n;
  vec3 q=vec3(abs(hp.x),hp.y,hp.z);
  float ao=calcAO(pos,n);
  vec3 L=normalize(uKeyDir);
  float sh=shadow(pos+n*.004, L);

  vec3 alb=uSkin; float spec=.14, shin=20., sss=1., rim=.7;
  float age=AGE, tr=TROLL;
  if(mat<1.5 || mat>6.5){
    /* skin: blush on cheeks, nose and ears, darker around the eyes, stubble, age spots, wrinkles */
    float bl=smoothstep(.22,.0,length(q.xy-vec2(.33,-.2)))*.5 + smoothstep(.12,.0,length(hp.xy-vec2(0.,-.18)))*.45;
    bl+=smoothstep(.6,.75,q.x)*smoothstep(-.2,.0,hp.y)*.35;
    alb=mix(alb, alb*vec3(1.12,.78,.74), bl*.55);
    float socket=smoothstep(.16,.04,length((q.xy-vec2(.235,.11))*vec2(1.,1.5)));
    alb*=1.-.18*socket*(1.+UNDER);
    float stub=STUBBLE*smoothstep(-.35,-.6,hp.y+.25*q.x)*smoothstep(.0,.3,hp.z)*(.6+.4*noise(hp*140.));
    alb=mix(alb, alb*vec3(.55,.55,.6), stub*.6);
    if(mat>6.5){ alb=mix(alb, vec3(.42,.10,.10)*(1.-.5*tr)+vec3(.0,.06,.0)*tr, .65); spec=.45; shin=40.; }
    /* eyebrows: painted strands above the ridge */
    float bx=q.x;
    float bcurve=.335+.035*BROW+.045*WORRY*(1.-smoothstep(.06,.30,bx))-.9*(bx-.22)*(bx-.22)-.02*smoothstep(.25,.4,bx);
    float bw=(.048+.012*tr)*(1.-.4*smoothstep(.14,.39,bx));
    float brow=smoothstep(bw,bw*.35,abs(hp.y-bcurve))*smoothstep(.40,.34,bx)*smoothstep(.045,.085,bx)*step(.4,hp.z);
    brow*=.8+.2*noise(vec3(hp.x*40.+hp.y*90.,hp.y*20.,1.));
    alb=mix(alb, uHair*.9, brow*.95);
    /* wrinkles with age */
    if(age>.01){
      float fore=smoothstep(.75,.0,abs(sin(hp.y*70.)))*smoothstep(.4,.48,hp.y)*smoothstep(.62,.5,hp.y)*smoothstep(.35,.1,q.x);
      float crow=smoothstep(.8,.0,abs(sin(atan(hp.y-.13,q.x-.232)*9.)))*smoothstep(.13,.19,length(q.xy-vec2(.232,.13)))*smoothstep(.27,.2,length(q.xy-vec2(.232,.13)))*step(.28,q.x);
      float fold=smoothstep(.016,.0,abs(length(q.xy-vec2(.0,-.28))-.17))*smoothstep(.0,.1,q.x)*smoothstep(-.52,-.3,hp.y)*smoothstep(-.12,-.25,hp.y);
      float under=smoothstep(.03,.0,abs(length((q.xy-vec2(.232,.05))*vec2(1.,1.6))-.11))*step(hp.y,.06);
      float wr=(fore*.8+crow*.7+fold*1.2+under*.7)*age;
      alb*=1.-.35*wr;
      float spots=smoothstep(.72,.8,noise(hp*22.))*age*.5;
      alb=mix(alb, alb*vec3(.7,.55,.42), spots);
      alb=mix(alb, vec3(dot(alb,vec3(.33))), age*.25);
      n=normalize(n+(vec3(noise(hp*90.),noise(hp*90.+7.),noise(hp*90.+3.))-.5)*.15*age);
    }
    /* troll skin: mottled, bumpy */
    if(tr>.01){
      float mot=noise(hp*9.)*.6+noise(hp*31.)*.4;
      alb=mix(alb, alb*(.7+.6*mot), tr*.6);
      n=normalize(n+(vec3(noise(hp*45.),noise(hp*45.+5.),noise(hp*45.+9.))-.5)*.35*tr);
    }
    /* pores */
    n=normalize(n+(vec3(noise(hp*260.),noise(hp*260.+4.),noise(hp*260.+8.))-.5)*.05);
    spec*=1.+WET;
  } else if(mat<2.5){
    /* eye */
    vec3 e=q-eyeC(); vec3 en=normalize(vec3(hp.x>0.?e.x:-e.x, e.y, e.z));
    vec3 g=normalize(vec3(GAZEX*.55+(hp.x>0.?-.035:.035), GAZEY*.45, 1.));
    float c=dot(normalize(hp-vec3(sign(hp.x)*eyeC().x,eyeC().yz)), g);
    float ang=acos(clamp(c,-1.,1.));
    float ir=.54, pr=.16+.05*(1.-length(uKeyCol)*.4);
    vec3 sclera=mix(vec3(.72,.68,.64), vec3(.7,.4,.36), smoothstep(.9,1.6,ang)*.6+.15*UNDER);
    sclera=mix(sclera, vec3(.85,.82,.55), tr*.5);
    vec3 up=normalize(cross(g, vec3(1.,0.,0.)));
    vec3 v=normalize(hp-vec3(sign(hp.x)*eyeC().x,eyeC().yz));
    float phi=atan(dot(v,up), dot(v,cross(up,g)));
    float streak=noise(vec3(phi*9.,ang*30.,1.))*.5+noise(vec3(phi*23.,ang*60.,4.))*.5;
    vec3 iris=uIris*(.55+.7*streak)*mix(1.,.45,smoothstep(ir*.75,ir,ang));
    iris=mix(iris, uIris*1.6, smoothstep(pr+.12,pr,ang)*.5);
    alb=mix(sclera, iris, smoothstep(ir+.03,ir-.02,ang));
    alb=mix(alb, vec3(.01), smoothstep(pr+.02,pr-.01,ang));
    spec=1.6; shin=180.; sss=0.; rim=.25;
    ao=mix(ao, ao*ao, .5);
  } else if(mat<3.5){
    /* hair: strands along the head, grey with age */
    vec3 hc=mix(uHair, vec3(.62,.6,.58), smoothstep(.2,.9,age));
    float st=noise(vec3(hp.x*150.,hp.y*30.,hp.z*55.))*.5+noise(vec3(hp.x*330.,hp.y*55.,hp.z*120.))*.5;
    alb=hc*(.75+.5*st);
    n=normalize(n+(vec3(noise(hp*30.),noise(hp*30.+2.),noise(hp*30.+6.))-.5)*.25);
    spec=.07; shin=16.; sss=.2; rim=.22;
  } else if(mat<4.5){
    /* track jacket: smooth polyester, blue piping along the zip edge, two white stripes on the shoulders */
    alb=uCloth*(.9+.1*noise(pos*40.));
    float edge=abs(abs(pos.x)-(.06+.45*clamp(-1.30-pos.y,0.,1.)));
    float zipEdge=step(.05,pos.z)*smoothstep(.035,.02,edge)*step(pos.y,-1.15);
    float collarEdge=smoothstep(.03,.015,abs(pos.y-(-1.12-.10*smoothstep(.0,.5,pos.z))));
    alb=mix(alb, vec3(.02,.06,.32), max(zipEdge,collarEdge*step(.0,pos.z))*.9);
    float ax=abs(pos.x);
    float sh=atan(pos.y+1.98, ax*.62);
    float stripes=smoothstep(.45,.6,ax)*(smoothstep(.03,.015,abs(sh-1.18))+smoothstep(.03,.015,abs(sh-1.07)));
    alb=mix(alb, vec3(.72,.72,.74), clamp(stripes,0.,1.));
    spec=.22; shin=26.; sss=0.; rim=.7;
  } else {
    /* inside of the mouth, with a hint of teeth near the top */
    alb=vec3(.18,.04,.04);
    float teeth=smoothstep(.02,.005,abs(hp.y+.445+.01*OPEN))*smoothstep(.13,.1,q.x);
    alb=mix(alb, vec3(.85,.82,.72)*(1.-.4*tr), teeth*.8);
    spec=.2; sss=0.; ao*=.6;
  }

  float ndl=dot(n,L);
  float dif=clamp((ndl+.3)/1.3,0.,1.)*mix(1.,sh,.9);
  float term=(smoothstep(-.35,.15,ndl)-smoothstep(.15,.7,ndl))*sss;
  vec3 F=normalize(vec3(.75,.15,.65));
  float fdif=clamp(dot(n,F)*.5+.5,0.,1.);
  vec3 col=alb*uKeyCol*dif;
  col+=alb*vec3(1.,.32,.22)*uKeyCol*term*.35*mix(.4,1.,sh);
  col+=alb*uFillCol*fdif*fdif*ao;
  col+=alb*uAmb*ao*(.55+.45*n.y);
  /* light from below, e.g. a phone screen */
  col+=alb*vec3(.35,.55,1.)*GLOW*clamp(-n.y*.7+n.z*.5,0.,1.)*ao;
  vec3 H=normalize(L-rd);
  col+=uKeyCol*pow(max(dot(n,H),0.),shin)*spec*sh*(shin>100.?3.:1.);
  if(mat>1.5&&mat<2.5){
    /* soft box reflected in the cornea */
    vec3 R=reflect(rd,n);
    col+=vec3(1.)*smoothstep(.92,.97,dot(R,normalize(vec3(-.45,.55,.7))))*.9*ao;
    col+=vec3(1.)*smoothstep(.97,.99,dot(R,normalize(vec3(.5,.3,.8))))*.35*ao;
  }
  float fr=pow(1.-max(dot(n,-rd),0.),3.);
  col+=uRimCol*fr*rim*(.4+.6*ao);
  col=aces(col*1.05);
  col=pow(col, vec3(1./2.2));
  float alpha=1.;
  if(!hit) alpha=clamp(1.-minD,0.,1.)*.8;
  /* the bust fades out towards the bottom of the picture */
  alpha*=smoothstep(.0,.16,uv.y);
  outColor=vec4(col*alpha, alpha);
}`;

  /* ---------- people ---------- */
  const base = {
    yaw: 0, pitch: 0, roll: 0.05, gazeX: 0, gazeY: 0, blink: 0, lid: 0.1, smile: 0.28, open: 0, brow: -0.1,
    worry: 0, nose: 0.95, ear: 1.05, jaw: -0.55, cheek: -0.45, age: 0, troll: 0, hairVol: 0.8, hairMess: 0.7, eye: 1,
    glow: 0, under: 0.15, wet: 0, stubble: 0
  };
  const look = {
    skin: [0.60, 0.37, 0.28], hair: [0.016, 0.011, 0.008], iris: [0.13, 0.065, 0.025], cloth: [0.012, 0.016, 0.034],
    keyDir: [-0.55, 0.55, 0.75], keyCol: [1.30, 1.20, 1.08], fillCol: [0.20, 0.22, 0.28],
    rimCol: [0.38, 0.40, 0.48], amb: [0.08, 0.08, 0.09]
  };
  SK.headBase = base;
  SK.lookBase = look;
  SK.makeVariant = (p, l) => ({ p: Object.assign({}, base, p || {}), l: Object.assign({}, look, l || {}) });
})();
