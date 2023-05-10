pico-8 cartridge // http://www.pico-8.com
version 29
__lua__
cartdata("eggnog_ttj8-1")
function _init()t,c,y,yd,b,f,a,h=0,0,123,0,{},flr,dget(1),0end
function _update60()
t+=1if(t%30==0)add(b,{x=128+f(rnd(35)),h=max(t/-30-5,-20)})
y+=yd
if(y<123)then
yd+=1else
yd,y=0,123if(btnp(4))yd=-7end
for k,v in pairs(b)do
if(v.x<-130)del(b,v)else
v.x-=2end
end
function _draw()cls(7)for k,v in pairs(b)do
if(v.x==10 or v.x==9)c+=1
rectfill(v.x,127,v.x+5,127+v.h,14)end
if(pget(13,y+2)!=7)dset(1,max(a,c))_init()
?"웃",10,y
?"hop springs eternal:"..c.."\nhi:"..a,10,10
end