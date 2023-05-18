pico-8 cartridge // http://www.pico-8.com
version 29
__lua__
x=0y=24405z=4a=.3g=0h=64v=.2q=127w=16p=poke2
p(y,0)☉=camera
for i=0,512 do
circfill(i%q,rnd(q),rnd(w),i%2)mset(i%w,i/w,i)
end
pal({2})spr(0,2,2,w,w)p(y,96)p(y-29,4112)::_::b=btn()g+=v*((b&2)/2-(b&1))>>9g*=.9a+=g
h+=(b&8)/8-(b&4)/4j=h/64-1z+=v*sin(j/4)v-=j/40s=sin(a)c=cos(a)x-=s*v
y-=c*v
k=z
cls(12)pal({7,6})for i=0,q do
if(i==h)pal({9,3})k-=w
p=k/(h-i)*32tline(0,i,q,i,x-p*c-p*s,y+p*s-p*c,p*c>>6,-p*s>>6)end
l=g*999☉(l-64,j*w-80)?"\b⬆️",14
line(w,l,-w,-l,8)?"¥",-2-l,j*9
☉()if(z>w)run()
flip()goto _