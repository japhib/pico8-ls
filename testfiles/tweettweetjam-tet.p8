pico-8 cartridge // http://www.pico-8.com
version 29
__lua__
poke(0x5f2c,3)a={18,28,38,28}b={22,22,22,32}p=0g=4i=1l=0c=color q=btnp
::_::c(0)for j=0,4096do
if(rnd()>.7)pset(j\64,j%64)end
c(7)l=t()?p,0,0
line(0,63,l,63)for j=1,4do c(5)
if(j==g)c(3)?"x",a[j]+3,b[j]+2
if(j==i)c(7)
if(l>63)c(8)
rect(a[j],b[j],a[j]+8,b[j]+8)end if(l<63)then
if(q(0) and i%4>1)i-=1
if(q(1) and i<3)i+=1
if(q(2) and i>3)i=2
if(q(3) and i==2)i=4
if(g==i)p+=1 g=rnd(4)\1+1 rectfill(a[i],b[i],a[i]+8,b[i]+8,3)
if(g==i)g+=1 g%=4 g+=1
end flip()goto _