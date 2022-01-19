pico-8 cartridge // http://www.pico-8.com
version 29
__lua__
g_debug=false

-------------------------------
-- helper functions
-------------------------------

-- creates a deep copy of a
-- table and all its properties
function deep_copy(obj)
 if (type(obj)~="table") return obj
 local cpy={}
 setmetatable(cpy,getmetatable(obj))
 for k,v in pairs(obj) do
  cpy[k]=deep_copy(v)
 end
 return cpy
end

-- adds an element to an index,
-- creating a new table in the
-- index if needed
function index_add(idx,prop,elem)
 if (not idx[prop]) idx[prop]={}
 add(idx[prop],elem)
end

-- calls a method on an object,
-- if it exists
function event(e,evt,p1,p2)
 local fn=e[evt]
 if fn then
  return fn(e,p1,p2)
 end
end

-- returns an entity's property
-- depending on entity state
-- e.g. hitbox can be specified
-- as {hitbox=box(...)}
-- or {hitbox={
--  walking=box(...),
--  crouching=box(...)
-- }
function state_dependent(e,prop)
 local p=e[prop]
 if (not p) return nil
 if type(p)=="table" and p[e.state] then
  p=p[e.state]
 end
 if type(p)=="table" and p[1] then
  p=p[1]
 end
 return p
end

-- round to nearest whole number
function round(x)
 return flr(x+0.5)
end

function lerp(a,b,t)
 return b*t+a*(1-t)
end

function aprint(a,s,x,...)
 x-=#s*a*4
 print(s,x,...)
end

-------------------------------
-- deserialization
-------------------------------

-- sets everything in props
-- onto the object o
function set(o,props)
 for k,v in pairs(props or {}) do
  o[k]=v
 end
 return o
end

-- helper, calls a given func
-- with a table of arguments
-- if fn is nil, returns the
-- arguments themselves - handy
-- for the o(...) serialization
-- trick
function call(fn,a)
 return fn
  and fn(a[1],a[2],a[3],a[4],a[5])
  or a
end

--lets us define constant
--objects with a single
--token by using multiline
--strings
function ob(str,props)
 local result,s,n,inpar=
  {},1,1,0
 each_char(str,function(c,i)
  local sc,nxt=sub(str,s,s),i+1
  if c=="(" then
   inpar+=1
  elseif c==")" then
   inpar-=1
  elseif inpar==0 then
   if c=="=" then
    n,s=sub(str,s,i-1),nxt
   elseif c=="," and s<i then
	   result[n]=sc=='"'
	    and sub(str,s+1,i-2)
	    or sub(str,s+1,s+1)=="("
	    and call(obfn[sc],ob(
	     sub(str,s+2,i-2)..","
	    ))
	    or sc!="f"
	    and band(sub(str,s,i-1)+0,0xffff.fffe)
	   s=nxt
	   if (type(n)=="number") n+=1
   elseif sc!='"' and c==" " or c=="\n" then
    s=nxt
   end
  end
 end)
 return set(result,props)
end

-- calls fn(character,index)
-- for each character in str
function each_char(str,fn)
 local rs={}
 for i=1,#str do
  add(rs,fn(sub(str,i,i),i) or nil)
 end
 return rs
end

-------------------------------
-- objects and classes
-------------------------------

-- "object" is the base class
-- for all other classes
-- new classes are declared
-- by using object:extend({...})
object={}
 function object:extend(kob)
  if type(kob)=="string" then kob=ob(kob) end
  kob=kob or {}
  kob.extends=self
  -- spawning
  for tile in all(kob.spawns_from) do
   entity.spawns[tile]=kob
  end
  -- prepare class
  return setmetatable(kob,{
   __index=self,
   __call=function(self,ob)
	   ob=setmetatable(ob or {},{__index=kob})
	   local ko,init_fn=kob
	   while ko do
	    if ko.init and ko.init~=init_fn then
	     init_fn=ko.init
	     init_fn(ob)
	    end
	    ko=ko.extends
	   end
	   return ob
  	end
  })
 end

-------------------------------
-- palettes
-------------------------------

function init_palettes()
 local a=0x5d00
 for p=0,15 do
  for c=0,15 do
   poke(a,bor(sget(p,c),c==14 and 0x80))
   a+=1
  end
 end
end

function set_palette(no,off)
 memcpy(off or 0x5f00,
  0x5d00+shl(flr(no),4),
  16)
end

-------------------------------
-- vectors
-------------------------------

vector={}
vector.__index=vector
 -- operators: +, -, *, /
 function vector:__add(b)
  return v(self.x+b.x,self.y+b.y)
 end
 function vector:__sub(b)
  return v(self.x-b.x,self.y-b.y)
 end
 function vector:__mul(m)
  return v(self.x*m,self.y*m)
 end
 function vector:__div(d)
  return v(self.x/d,self.y/d)
 end
 function vector:__unm()
  return v(-self.x,-self.y)
 end
 -- dot product
 function vector:dot(v2)
  return self.x*v2.x+self.y*v2.y
 end
 -- normalization
 function vector:norm()
  return self/sqrt(#self)
 end
 function vector:rot()
  return v(-self.y,self.x)
 end
 function vector:round()
  return v(round(self.x),round(self.y))
 end
 -- length
 function vector:len()
  return sqrt(#self)
 end
 -- the # operator returns
 -- length squared since
 -- that's easier to calculate
 function vector:__len()
  return self.x^2+self.y^2
 end
 -- printable string
 function vector:str()
  return self.x..","..self.y
 end

-- creates a new vector with
-- the x,y coords specified
function v(x,y)
 return setmetatable({
  x=x,y=y
 },vector)
end

function mav(magnitude,angle)
 return v(
  cos(angle)*magnitude,
  sin(angle)*magnitude
 )
end

-------------------------------
-- collision boxes
-------------------------------

-- collision boxes are just
-- axis-aligned rectangles
cbox=object:extend()
 -- moves the box by the
 -- vector v and returns
 -- the result
 function cbox:translate(v)
  return cbox({
   xl=self.xl+v.x,
   yt=self.yt+v.y,
   xr=self.xr+v.x,
   yb=self.yb+v.y
  })
 end

 function cbox:middle()
  return v(self.xl+self.xr,self.yt+self.yb)*0.5
 end

 -- checks if two boxes
 -- overlap
 function cbox:overlaps(b)
  return
   self.xr>b.xl and
   b.xr>self.xl and
   self.yb>b.yt and
   b.yb>self.yt
 end
 
 -- checks if box contains
 -- a point
 function cbox:contains(p)
  return self:overlaps(vbox(p,p+v(0.01,0.01)))
 end

 -- calculates a vector that
 -- neatly separates this box
 -- from another. optionally
 -- takes a table of allowed
 -- directions
 function cbox:sepv(b,allowed)
  local candidates={
   v(b.xl-self.xr,0),
   v(b.xr-self.xl,0),
   v(0,b.yt-self.yb),
   v(0,b.yb-self.yt)
  }
  if type(allowed)~="table" then
   allowed={true,true,true,true}
  end
  local ml,mv=32767
  for d,v in pairs(candidates) do
   if allowed[d] and #v<ml then
    ml,mv=#v,v
   end
  end
  return mv
 end

 -- printable representation
 function cbox:str()
  return self.xl..","..self.yt..":"..self.xr..","..self.yb
 end

-- makes a new box
function box(xl,yt,xr,yb)
 return cbox({
  xl=min(xl,xr),xr=max(xl,xr),
  yt=min(yt,yb),yb=max(yt,yb)
 })
end
-- makes a box from two corners
function vbox(v1,v2)
 return box(v1.x,v1.y,v2.x,v2.y)
end

-------------------------------
-- deserialization fns
-------------------------------

obfn={v=v,b=box}

-------------------------------
-- direction vectors
-------------------------------

v0=v(0,0)

-------------------------------
-- entities
-------------------------------

-- every entity has some
-- basic properties
-- entities have an embedded
-- state that control how
-- they display and how they
-- update each frame
-- if entity is in state "xx",
-- its method "xx" will be called
-- each frame
entity=object:extend([[
 state="idle",t=0,
 dynamic=1,
 spawns=o(),
 spawn_rep=0,
]])
 -- common initialization
 -- for all entity types
 function entity:init()
  if self.sprite then
   self.sprite=deep_copy(self.sprite)
   if not self.render then
    self.render=spr_render
   end
   self.timer=deep_copy(self.timer)
  end
 end
 -- called to transition to
 -- a new state - has no effect
 -- if the entity was in that
 -- state already
 function entity:become(state)
  if state~=self.state then
   self.state,self.t=state,0
  end
 end
 -- checks if entity has 'tag'
 -- on its list of tags
 function entity:is_a(tag)
  if (not self.tags) return false
  for i=1,#self.tags do
   if (self.tags[i]==tag) return true
  end
  return false
 end

 -- draw a sprite relative
 -- to own position
 function entity:rel_sprs(sprs)
  for s in all(sprs) do
   local p=self.pos+s[2]
   spr(s[1],p.x,p.y,1,1,s[3],s[4])
  end
 end

 function entity:splash(c,s,r,vl)
  vl=vl or 0.5
  local col=c_collider(self)
  if (not col) return
  local p=col.b:middle()
  for i=1,24*s do
   local vel=mav(rnd(vl),rnd())
   g_particles:spawn({
    p=p,v=vel,
    radius=rnd(r),clr=c,
    drag=1-vl*0.03,
    l=s+rnd(0.5)
   })
  end
 end


-- static entities never move
-- like the level's walls -
-- this lets us optimize a bit,
-- especially for collision
-- detection.
static=entity:extend([[
 dynamic=f,
]])

-------------------------------
-- rendering from the "sprite"
-- property
-------------------------------

function spr_render(e)
 local s,p=e.sprite,e.pos
 -- helper function for
 -- retrieving sprite data
 -- taking entity state into
 -- account, or a default value
 local stt=event(e,"anim_state") or e.state
 function s_get(prop,dflt)
  local st=s[stt]
  if (st~=nil and st[prop]~=nil) return st[prop]
  if (s[prop]~=nil) return s[prop]
  return dflt
 end
 -- sprite position
 local sp=p+s_get("offset",v0)
 -- width and height
 local w,h=
  s.width or 1,s.height or 1
 -- orientation
 local flip_x,flip_y
 local frames=e.sp
  and {e.sp}
  or s[stt]
  or s.idle
 if s_get("flips") then
  flip_x,flip_y=e.flipped,e.vflipped
 end
 -- animation
 local delay=frames.delay or 1
 if (type(frames)~="table") frames={frames}
 local frm_index=flr(e.t/delay) % #frames + 1
 local frm=frames[frm_index]
 -- actual drawing
 if (e.plt) set_palette(e.plt)
 spr(frm,round(sp.x),round(sp.y),w,h,flip_x,flip_y)
 -- head render
 if (e.head_spr) head_render(e,p)
end

function head_render(self,p)
 local d,ho=
  self.vel.x,
  state_dependent(self,"head_off")
 local focus=self.focusing and 3 or 0
 d=d~=0 and d/1.4 or 0
 self.hdisp=lerp(
  self.hdisp or ho,
  ho+v(d,abs(d)+round(self.vel.y)+focus)*self.head_m,
  0.2
 )
 local hp=p+self.hdisp
 local hf=self.flipped
 if self.clings_to then
  hf=not hf
 end
 spr(
  state_dependent(self,"head_spr"),
  round(hp.x),round(hp.y),
  1,1,
  hf)
end

-------------------------------
-- entity registry
-------------------------------

-- entities are indexed for
-- easy access.
-- "entities" is a table with
-- all active entities.
-- "entities_with.<property>"
-- holds all entities that
-- have that property (used by
-- various systems to find
-- entities that move, collide,
-- etc.)
-- "entities_tagged.<tag>"
-- holds all entities with a
-- given tag, and is used for
-- collisions, among other
-- things.

-- resets the entity registry
function entity_reset()
 entities,entities_with,
  entities_tagged={},{},{}
 -- hack: reload mem
 reload(0x1000,0x1000,0x800)
end

-- registers a new entity,
-- making it appear in all
-- indices and update each
-- frame
function e_add(e)
 add(entities,e)
 for p in all(indexed_properties) do
  if (e[p]) index_add(entities_with,p,e)
 end
 if e.tags then
  for t in all(e.tags) do
   index_add(entities_tagged,t,e)
  end
  c_update_bucket(e)
 end
 return e
end

-- removes an entity,
-- effectively making it
-- disappear
function e_remove(e)
 del(entities,e)
 for p in all(indexed_properties) do
  if (e[p]) del(entities_with[p],e)
 end
 if e.tags then
  for t in all(e.tags) do
   del(entities_tagged[t],e)
   if e.bkt then
    del(c_bucket(t,e.bkt.x,e.bkt.y),e)
   end
  end
 end
 e.bkt=nil
end

-- a list of properties that
-- need an "entities_with"
-- index
indexed_properties={
 "dynamic",
  -- entites that should update
  -- each frame
 "render","render_hud",
  -- entities that render
  -- themselves or a hud
 "vel",
  -- entities that move
  -- (have a velocity)
 "collides_with",
  -- entities that actively
  -- check for collisions
 "feetbox",
  -- entities that can be
  -- supported by a floor
 "timer"
  -- entities with timers
}

-------------------------------
-- system:
--  entity updating
-------------------------------

-- updates all entities
-- according to their state
function e_update_all()
 for ent in all(entities_with.dynamic) do
  -- call the method with the
  -- name corresponding to
  -- this entity's current
  -- state
  local state=ent.state
  if ent[state] then
   ent[state](ent,ent.t)
  end
  if state~=ent.state then
   -- changed state, restart
   -- the "t" counter that
   -- tracks how much time
   -- an entity has spent
   -- in its current state
   ent.t=0
  else
   ent.t+=1
  end
 end
end

function e_remove_done()
 for ent in all(entities_with.dynamic) do
  if ent.done then
   e_remove(ent)
  end
 end
end

-- schedules a function to be
-- called between udpates -
-- needed for e.g. level
-- changes that reset the
-- entity indexes
function schedule(fn)
 if (not scheduled) scheduled=fn
end

-------------------------------
-- system:
--  rendering the world
-------------------------------

function r_render_all(prop)
 -- collect all drawables
 -- and sort them into buckets
 -- separated by draw_order
 local drawables={}
 for ent in all(entities_with[prop]) do
  local order=ent.draw_order or 0
  if not drawables[order] then
   drawables[order]={}
  end
  add(drawables[order],ent)
 end
 -- render the drawable
 -- entities in the right
 -- order (z-indexing)
 for o=0,15 do
  for ent in all(drawables[o]) do
   r_reset(prop)
   ent[prop](ent,ent.pos)
  end
 end
end

-- helper function that resets
-- pico-8 draw state before
-- each entity
function r_reset(prop)
 set_palette()
 if (prop~="render_hud" and g_cam) g_cam:apply()
end

-------------------------------
-- system:
--  movement
-------------------------------

function do_movement()
 for ent in all(entities_with.vel) do
  -- entities that have velocity
  -- move by that much each frame
  local ev=ent.vel
  ent.pos+=ev
  -- orientation:
  -- flipped tracks left/right
  -- 'true' is facing left
  if (ent.way or ev.x~=0 or ent.flipped==nil) then
   ent.orient=sgn(ent.way or ev.x)
   ent.flipped=ent.orient<0
  end
  -- gravity affects velocity
  -- for all entities
  -- define a "weight" property
  if ent.weight then
   local w=state_dependent(ent,"weight")
   ent.vel+=v(0,w)
  end
 end
end

-------------------------------
-- system:
--  collision detection
-------------------------------

-- for efficiency, objects
-- requiring collisions are
-- sorted into 16x16 buckets
-- based on their position

-- find bucket coordinates
-- for entity "e"
function c_bkt_coords(e)
 local p=e.pos
 return flr(shr(p.x,4)),flr(shr(p.y,4))
end

-- get the bucket of entities
-- with tag "t" at coords x,y
function c_bucket(t,x,y)
 local key=t..":"..x..","..y
 if not c_buckets[key] then
  c_buckets[key]={}
 end
 return c_buckets[key]
end

-- updates bucket positions
-- for dynamic entities
function c_update_buckets()
 for e in all(entities_with.dynamic) do
  c_update_bucket(e)
 end
end

-- actual bucket update for
-- entity "e". takes care to
-- only update when needed,
-- as switching buckets is
-- costly.
function c_update_bucket(e)
 if (not e.pos or not e.tags) return
 local bx,by=c_bkt_coords(e)
 if not e.bkt or e.bkt.x~=bx or e.bkt.y~=by then
  if e.bkt then
   for t in all(e.tags) do
    local old=c_bucket(t,e.bkt.x,e.bkt.y)
    del(old,e)
   end
  end
  e.bkt=v(bx,by)
  for t in all(e.tags) do
   add(c_bucket(t,bx,by),e)
  end
 end
end

-- iterator that goes over
-- all entities with tag "tag"
-- that can potentially collide
-- with "e" - uses the bucket
-- structure described earlier.
function c_potentials(e,tag)
 local cx,cy=c_bkt_coords(e)
 local bx,by=cx-2,cy-1
 local bkt,nbkt,bi={},0,1
 return function()
  -- ran out of current bucket,
  -- find next non-empty one
  while bi>nbkt do
   bx+=1
   if (bx>cx+1) bx,by=cx-1,by+1
   if (by>cy+1) return nil
   bkt=c_bucket(tag,bx,by)
   nbkt,bi=#bkt,1
  end
  -- return next entity in
  -- current bucket and
  -- increment index
  local e=bkt[bi]
  bi+=1
  return e
 end
end

-- resets the collision system,
-- making all collision buckets
-- empty again
function collision_reset()
 c_buckets={}
end

-- collision detection main
-- function - detects all
-- requested collisions
function do_collisions()
 -- make sure our bucket
 -- structure is up to date
 c_update_buckets()
 -- iterate over all entities
 -- looking for collisions
 for e in all(entities_with.collides_with) do
  -- ...and all tags they're
  -- interested in
  for tag in all(e.collides_with) do
   -- choose the more efficient
   -- path depending on how
   -- many potential collisions
   -- there are
   local tagged=entities_tagged[tag] or {}
   local nothers=
    #tagged
   if nothers>4 then
    -- for a large number of
    -- possible colliders,
    -- we iterate over our
    -- bucket structure, since
    -- it's more efficient
    for o in c_potentials(e,tag) do
     if o~=e then
      -- get the colliders for
      -- each object
      local ec,oc=
       c_collider(e),c_collider(o)
      -- if both have one,
      -- check for collision
      -- between them
      if ec and oc then
       c_one_collision(ec,oc)
      end
     end
    end
   else
    -- for small numbers, we
    -- just iterate the
    -- entities directly
    for oi=1,nothers do
     local o=tagged[oi]
     -- quick check to rule out
     -- collisions quickly
     local dx,dy=
      abs(e.pos.x-o.pos.x),
      abs(e.pos.y-o.pos.y)
     if dx<=32 and dy<=32 then
      -- quick check passed,
      -- do proper collisions
      -- using hitboxes
      local ec,oc=
       c_collider(e),c_collider(o)
      if ec and oc then
       c_one_collision(ec,oc)
      end
     end
    end
   end
  end
 end
end

-- manually check for collision
-- between "box" and object with
-- one of the given "tags"
function c_check(box,tags)
 local fake_e={pos=v(box.xl,box.yt)}
 for tag in all(tags) do
  for o in c_potentials(fake_e,tag) do
   local oc=c_collider(o)
   if oc and box:overlaps(oc.b) then
    return oc.e
   end
  end
 end
 return nil
end

-- checks for one collision
-- and calls the reaction
-- callbacks on each object
function c_one_collision(ec,oc)
 if ec.b:overlaps(oc.b) then
  c_reaction(ec,oc)
  c_reaction(oc,ec)
 end
end

-- calls the :collide() method
-- on a colliding object, if
-- one exists. if the return
-- value is c_push_out or
-- c_move_out, it acts on
-- that - separating the
-- colliding entities by moving
-- one of them.
function c_reaction(ec,oc)
 local reaction,param=
  event(ec.e,"collide",oc.e)
 if type(reaction)=="function" then
  reaction(ec,oc,param)
 end
end

-- returns the collider for
-- a given entity.
function c_collider(ent)
 -- colliders are cached
 -- for efficiency, but they
 -- are only valid for one
 -- frame
 if ent.collider then
  if ent.coll_ts==g_time or not ent.dynamic then
   return ent.collider
  end
 end
 -- nothing cached, create
 -- new collider
 local hb=state_dependent(ent,"hitbox")
 if (not hb) return nil
 local coll={
  b=hb:translate(ent.pos),
  e=ent
 }
 -- cache it and return
 ent.collider,ent.coll_ts=
  coll,g_time
 return coll
end

-- reaction function, used by
-- returning it from :collide().
-- cause the other object to
-- be pushed out so it no
-- longer collides.
function c_push_out(oc,ec,allowed_dirs)
 local e=ec.e
 if (e.virtual) return
 local sepv=ec.b:sepv(oc.b,allowed_dirs)
 e.pos+=sepv
 if e.vel then
  local vdot=e.vel:dot(sepv)
  if vdot<0 then
   if (sepv.y~=0) e.vel.y=0
   if (sepv.x~=0) e.vel.x=0
  end
  if e.swap and sepv.x~=0 then
   e:swap()
  end
 end
 ec.b=ec.b:translate(sepv)
end
-- inverse of c_push_out - moves
-- the object with the :collide()
-- method out of the other object.
function c_move_out(oc,ec,allowed)
 return c_push_out(ec,oc,allowed)
end

-------------------------------
-- system:
--  support
--  basically objects being
--  supported by floors
-------------------------------

function do_supports()
 -- entities that want support
 -- have a special collision box
 -- called the "feetbox"
 for e in all(entities_with.feetbox) do
  local fb=e.feetbox
  if fb then
   -- look for support
   fb=fb:translate(e.pos)
   local support=c_check(fb,{"walls"})
   -- if found, store it for
   -- later - entity update
   -- functions can use the
   -- information
   e.supported_by=support
  end
 end
end

-------------------------------
-- system:
--  timers that count down
-------------------------------

function do_timers()
 for e in all(entities_with.timer) do
  for name,time in pairs(e.timer) do
   e.timer[name]=max(time-1,0)
   e[name.."_lasts"]=time>1
  end
 end
end

-------------------------------
-- backgrounds
-------------------------------

bg=entity:extend([[
 draw_order=0,
]])
 function bg:render()
  -- applies the camera
  -- with a small multiplier
  -- so the background moves
  -- less than the foreground
  local plx=0.5
  local mh=g_room.no_b and 10 or 20
  for i=0,4,4 do
   g_cam:apply(plx)
   map(109,0,-2,i,19,mh)
   map(109,0,150,i,19,mh)
   plx*=0.5
  end
 end

water=entity:extend([[
 draw_order=15,
]])
wrnd={}
for i=0,23 do
 wrnd[i]=sin(i/40)
end
 function water:render()
  local t=self.t*0.02
  set_palette(2)
  local dy=g_cam.p.y-g_level.size.y*8+128
  memcpy(0x1000,0x6000+0x40*(72-flr(dy*0.8)),0x800)
  camera(0,dy)
  for y=0,23 do
   local dx=sin(t+wrnd[y])*(y/6)
   sspr(0,95-y*1.3,128,1,dx,104+y,128+y,1)
  end
  set_palette()
  rectfill(0,103,127,103,13)
 end

-------------------------------
-- entity:
--  level map
-------------------------------

-- the level entity only draws
-- the level using map().
-- collisions are taken care of
-- by individual solid/support
-- entities created on level
-- initialization.
level=entity:extend([[
 draw_order=2,
]])
 function level:init()
  unpack_room(self)
  local s=self.size
  for x=-1,s.x do
   for y=-1,s.y do
    -- get tile number
    local blk=mget(x,y)
    -- wall of solids
    -- around the level
    if x<0 or y<0 or
     x>=s.x or y>=s.y then
      blk=103
    end
    -- does this tile spawn
    -- an entity?
    local eclass=entity.spawns[blk]
    if eclass then
     -- yes, it spawns one
     -- calculate object id
     local oid=(x+self.base.x).."_"..(y+self.base.y)
     -- was this oid collected?
     local e=eclass{
      pos=v(x,y)*8+(eclass.spawns_at or v0),
      map_pos=v(x,y),
      oid=oid,
      tile=blk
     }
     e.sprite=e.sprite or {idle={blk}}
     if e.render==nil then
      e.render=spr_render
     end
     if not e.spurious then
      -- register the entity
      -- if it's not collected
      if not g_game.collected[oid] and not g_game.killed[oid] then
       e_add(e)
      end
      -- replace the tile
      -- with empty space
      -- in the map
      if (not e.spawn_and_keep) mset(x,y,e.spawn_rep)
     end
     blk=0
    end
    -- check what type of tile
    -- this is
    local btype=block_type(blk)
    if btype then
     -- it's not empty,
     -- so it gets an entity
     local b=btype({
      pos=v(x,y)*8,
      map_pos=v(x,y),
      typ=bt,
      slip=fget(blk,1)
     })
     -- register only if needed
     -- (walls completely
     -- surrouned by other
     -- walls aren't)
     if (not b.spurious) e_add(b)
    end
   end
  end
 end
 -- renders the level
 function level:render()
  map(0,0,0,0,self.size.x,self.size.y)
 end

-- solid blocks push everything
-- out
solid=static:extend([[
 tags=o("walls"),
 hitbox=b(0,0,8,8),
 inertia=0,
]])
 function solid:init()
  -- magic for collision detection
  -- basically, each block
  -- will only push the player
  -- out in the direction of
  -- empty space
  local dirs=ob[[v(-1,0),v(1,0),v(0,-1),v(0,1),]]
  local allowed={}
  local needed=false
  for i=1,4 do
   local np=self.map_pos+dirs[i]
   local neighbor=block_type(mget(np.x,np.y))
   if np.x<0 or np.y<0 or np.x>=g_room.size.x or np.y>=g_room.size.y then
    neighbor=solid
   end   
   allowed[i]=not neighbor
   needed=needed or allowed[i]
  end
  self.allowed=allowed
  self.spurious=not needed
 end

 -- solids push the player
 -- out
 function solid:collide(e)
  return c_push_out,self.allowed
 end

-- block types depend on the
-- sprite flags set in the
-- sprite editor. flag 0 set
-- means a solid block, flag 1 -
-- a support, bridge-type block
function block_type(blk)
 return fget(blk,0) and solid
end

-------------------------------
-- spikes
-------------------------------
spikes=solid:extend([[
 spawns_from=o(50,51,52,53,88,90,120,121,122),
 spawn_and_keep=1,
 render=f,
 kill=o(
  d50=v(-1,0),
  d51=v(1,0),
  d52=v(0,-1),
  d53=v(0,1),
  d88=v(-1,-1),
  d90=v(1,-1),
  d120=v(-1,1),
  d121=v(0,1),
  d122=v(1,1),
 ),
 tag=o("walls"),
 hitbox=b(0,0,7,7),
 draw_order=7,
]])
 function spikes:collide(o)
  if o:is_a("guy") and o.vel:dot(spikes.kill["d"..self.tile])<0 then
   o:despawn()
  else
   return c_push_out
  end
 end

-------------------------------
-- particles
-------------------------------

particle=object:extend([[
 drag=1,l=1,
]])
particles=entity:extend([[
 draw_order=14,
]])
 function particles:init()
  self.ps={}
 end
 function particles:idle()
  for k,p in pairs(self.ps) do
   p.p+=p.v
   p.v*=p.drag
   p.l-=0.016666
   if (p.l<=0) self.ps[k]=nil
  end
 end
 -- spawns a new particle
 function particles:spawn(props)
  self.ps[rnd()]=particle(props)
 end
 -- renders them all
 function particles:render()
  for _,p in pairs(self.ps) do
   local pos=p.p
   if p.radius then
    circfill(pos.x,pos.y,p.radius*p.l,p.clr)
   end
  end
 end

-------------------------------
-- entity:
--  game
-------------------------------

-- things that persist
-- from screen to screen
game=object:extend([[
 hp=2,
 soul=12,
 nail_dmg=5,
 collected=o(),
 killed=o(),
]])
 function game:max_hp()
  return self.i10 and 6 or 5
 end

-------------------------------
-- entity:
--  knight
-------------------------------

-- the main player entity
guy=entity:extend([[
 tags=o("guy"),
 state="free",
 vel=v(0,0),
 way=-1,
 weight=0.3,inertia=1,
 timer=o(air=0),
 move_mul=0,
 sprite=o(
  idle=o(78),
  cling=o(74),
  move=o(76),
  dash=o(72),
  asleep=o(213,offset=v(-8,-6)),
  offset=v(-8,-4),
  width=2,
  flips=1,
 ),
 jump_strength=o(0.75,0.6),
 head_off=o(
  v(-4,-12),
  sit=v(-4,-10),
 ),
 head_spr=o(
  47,sit=46,asleep=225,
 ),
 head_m=1,
 draw_order=10,
 collides_with=o("walls"),
 hitbox=o(
  b(-3,-10,3,0),
  despawned=b(-256,-256,-257,-257),
 ),
 clingbox=b(0,0,1,1),
 feetbox=b(-2,0,2,0.1),
]])
 function guy:init()
  self.last_safe_spot=self.pos
  if #g_spawn_vel>0 then
   self.timer.float=30
  end
 end

 function guy:asleep()
  for i=0,5 do
   if (btn(i)) self:become("free")
  end
 end
 
 function guy:free()
  local airborne=
   not self.supported_by
  local move_sign=0
  -- down to focus
  -- (has to be pressed
  --  on the ground
  --  to initiate)
  self.focusing=not airborne and (g_inp.p3 or (self.focusing and g_inp.b3))
  -- horizontal control
  if (g_inp.b0 or g_inp.b1) and not self.focusing then
   -- clinging to walls
   local cb=self.clingbox:translate(self.pos+v(self.way*4,-1))
   local cw=c_check(cb,{"walls"})
   if airborne and cw and not cw.slip and g_game.i35 then
    if not self.clings_to then
     self.timer.grip=16
    end
    self.clings_to=cw
    self.vel=v(0,self.grip_lasts and 0 or 0.125)
   else
    self.clings_to=nil
   end
   -- moving
   self.move_mul=min(self.move_mul+0.2,1)
   -- direction
   if (g_inp.b0) move_sign-=1
   if (g_inp.b1) move_sign+=1
   self.way=move_sign
   -- acceleration
   local accel=move_sign*self.move_mul*0.75
   self.vel.x+=accel
  else
   self.move_mul=0
   if self.clings_to then
				local s=sgn(self.pos.x-self.clings_to.pos.x)
    self.vel.x=s
    self.clings_to=nil
   end
  end
  -- speed limits
  if abs(self.vel.y)>4 then
   self.vel.y=sgn(self.vel.y)*4
  end
  -- horizontal friction
  if not self.dash_lasts then
   self.vel.x*=1/1.5
  end
  -- attacks
  if g_inp.p5 and g_game.i111 and not (self.clings_to or self.focusing or self.cooldown_lasts) then
   local sc,sv=slash,v(self.way*2,0)
   if g_inp.b2 then
    sc,sv=vslash,v(0,airborne and -0.1 or -2)
   end
   if airborne and g_inp.b3 then
    sc,sv=vslash,v(0,1)
   end
   e_add(sc({
    owner=self,
    aim=sv:norm(),
    vflipped=sv.y>0
   }))
   self.timer.cooldown=14
   slash.reverse=not slash.reverse
   self.vel+=sv
   -- dashes
   if airborne and g_game.i3 and move_sign~=0 and sc~=vslash and self.dash then
    self.vel=v(sgn(move_sign)*2.25,-0.2)
    self.timer.dash,self.dash=5
   end
  end
  -- jumps
  if self.clings_to or not airborne then
   -- reset
   self.jumps,self.timer.air,self.dash=
    1,30,true
  else
   self.weight=max(0.3,-0.5*self.vel.y)
   -- grace period for first
   -- jump only last so long
   if self.timer.air<26 and self.jumps==1 then
    self.jumps=2
   end
  end
  local jump=self.jump_strength[self.jumps]
  if g_inp.p4 and jump and (g_game.i19 or self.jumps==1) then
   -- walljump
   if self.clings_to then
    local s=sgn(self.pos.x-self.clings_to.pos.x)
    self.vel.x=2.25*s
   end
   -- double jumps
   if self.jumps>1 then
    e_add(wings({
     owner=self
    }))
   end
   -- jumping resets a lot
   self.vel.y=0
   self.timer.lift,self.timer.air=5,30
   self.jumps+=1
   self.jumpstr=jump
  end
  if g_inp.b4 then
   if self.lift_lasts then
    self.vel.y-=self.jumpstr
   end
   if self.air_lasts then
    self.weight=0.1
   end
  end
  -- floaty stuff
  if self.float_lasts then
   self.weight=0.1
  end
  -- safe spots
  if not airborne and #self.vel<0.01 then
   self.last_safe_spot=deep_copy(self.pos)
  end
  -- focus
  local heal_time=
   g_game.i7 and 25 or 40
  if self.focusing and g_game.soul>0 and g_game.hp<g_game:max_hp() then
   g_game.soul-=4/heal_time
   if g_time%2==0 then
    g_particles:spawn({
     p=self.pos+v(rnd(8)-4,0),
     v=v(0,-0.5),
     clr=7,radius=1,
     l=0.4+rnd(0.2)
    })
   end
   if not self.focus_lasts then
    self:splash(7,0.5,5)
    g_game.hp+=1
    g_shake=1
    self.timer.focus=heal_time
   end
  else
   self.timer.focus=heal_time
  end
  -- invariants
  g_game.soul=mid(g_game.soul,0,12)
  g_game.hp=mid(g_game.hp,0,g_game:max_hp())
 end

 function guy:sit()
  self.weight=0
  self.vel*=0.75
 end

 function guy:hurt(dmg,force)
  if (g_debug) return
  g_game.hp-=1
  self.vel=force*5
  self.timer.immune,self.focusing=
   g_game.i11 and 100 or 60
  self:splash(0,1,5)
  if g_game.hp<=0 then
   self:despawn()
  end
  g_dim,g_freeze=5.5,12
 end

 function guy:despawn()
  if (g_debug or self.state=="despawned") return
  self:become("despawned")
  self:hurt(1,v0)
 end

 function guy:despawned(t)
  self.vel=v0
  if t==60 and g_game.hp>0 then
   self.pos=self.last_safe_spot
   self.vel=v(0,-2)
   self:splash(7,0.5,5)
   self.timer.immune=120
   self:become("free")
  end
  if t==120 then
   g_game.hp,g_game.soul,g_game.killed,
    g_spawn_at,g_spawn_state=
     g_game:max_hp(),0,{},
     g_game.last_bench,"sit"   
   schedule(co_transition(v(0,1)))
  end
 end

 function guy:anim_state()
  if (self.clings_to) return "cling"
  local spd=abs(self.vel.x)
  if (spd>2.25) return "dash"
  if (spd>1) return "move"
 end

 function guy:render(p)
  -- dead?
  if (self.state=="despawned") return
  -- flicker?
  if (self.immune_lasts and g_time%4<2) return
  -- render body and head
  spr_render(self)
 end

 function guy:render_hud()
  for i=1,g_game:max_hp() do
   spr(i<=g_game.hp and 92 or 91,i*6+11,2)
  end
  spr(66,1,1,2,2)
  local sh=1+g_game.soul*0.834
  if sh<5 then
   set_palette(6)
  end
  sspr(0,45-sh,14,sh,1,14-sh)
 end

-------------------------------
-- input
-------------------------------

g_inp={}
function do_input()
 for i=0,5 do
  local b=btn(i)
  local n="b"..i
  g_inp["p"..i]=b and not g_inp[n]
  g_inp[n]=b
 end
end

-------------------------------
-- camera
-------------------------------

cam=object:extend([[
 window_size=v(20,20),
 p=v(0,0),
]])
 function cam:init()
  local ws=self.window_size
  self.window=vbox(
   -ws*0.5-v(64,64),
    ws*0.5-v(64,64)
  )
  self.limits=vbox(
   v0,
   self.level.size*8-v(128,128)
  )
 end
 function cam:track(lerp_f)
  local gp,w,l=self.focus and self.focus.pos or g_guy.pos,
   self.window,self.limits
  gp=v(round(gp.x),round(gp.y))
  -- player tracking
  local desired=v(
   mid(self.p.x,
       gp.x+w.xl,gp.x+w.xr),
   mid(self.p.y,
       gp.y+w.yt,gp.y+w.yb)
  )
  -- limit to map size
  desired.x=mid(desired.x,l.xl,l.xr)
  desired.y=mid(desired.y,l.yt,l.yb)
  -- lerp or jump
  if #(desired-self.p)>4 then
   self.p=lerp(self.p,desired,lerp_f or 0.25)
  else
   self.p=desired
  end
  -- screenshake!
  if g_shake>0 then
   self.p+=mav(g_shake,g_time*0.34)
   g_shake-=0.25
  end
 end
 -- apply the camera
 -- transformation
 function cam:apply(magnitude)
  if (not magnitude) magnitude=1
  local d=self.p*magnitude
  camera(d.x,d.y)
 end

-------------------------------
-- animated slashes
-------------------------------

slash_clr=ob([[7,7,6,13,5,]])
function slash_plt(frm)
 for i=0,13 do
  local c=slash_clr[abs(i-flr(frm))+1]
  palt(i,not c)
  pal(i,c)
 end
end

slash=entity:extend([[
 virtual=1,
 draw_order=12,
 vel=v(0,0),
 frm=0,
 sprite=o(
  offset=v(-8,-4),
  idle=o(59),
  flips=1,
  width=2,
 ),
 basebox=b(-3,-3,3,3),
 collides_with=o("enemy"),
]])
vslash=slash:extend([[
 sprite=o(
  offset=v(-4,-8),
  idle=o(45),
  flips=1,
  height=2
 ),
]])
 function slash:idle(t)
  local a=self.aim
  local extra=g_game.i6 and 2 or 0
  self.way=a.x
  self.pos=
   self.owner.pos+
   v(a.x*(12+extra),a.y*(14+extra)-4)+
   self.owner.vel*2
  local ext=
   3-abs(self.frm-6)
  self.hitbox=self.basebox:translate(a*ext*2)
  self.frm+=1.5-t*0.04
  self.done=self.frm>14
 end
 function slash:render(p)
  slash_plt(self.reverse and 13-self.frm or self.frm)
  spr_render(self)
 end
 function slash:collide(o)
  for h in all(self.hurt) do
   if (h==o) return
  end
  index_add(self,"hurt",o)
  hurt(self.owner,o,
   g_game.nail_dmg+(g_game.i9 and 1.5 or 0),
   self)
 end

function hurt(source,target,dmg,tool)
 if (target.immune_lasts) return
 local sc,tc=
  c_collider(source),
  c_collider(target)
 local sm,tm=sc.b:middle(),tc.b:middle()
 local force=(tm-sm):norm()
 if target:is_a("walls") then
  if abs(force.x)>abs(force.y) then
   force=v(sgn(force.x),0)
  else
   force=v(0,sgn(force.y))
  end
 end
 -- hurt target
 if (target.hurt) target:hurt(dmg,force)
 -- bounce off
 local inertia=target.inertia or 0
 -- bouncing while aiming down
 -- is special
 if tool and tool.aim.y>0 then
  inertia,source.timer.float=2,14
 end
 source.vel=-force*inertia
end

-------------------------------
-- other animated effects
-------------------------------

wings=slash:extend([[
 draw_order=9,
 frm=0,
 reverse=f,
 sprite=o(
  offset=v(-12,-10),
  idle=o(27),
  width=3,
 ),
 collides_with=f,
]])
 function wings:idle(t)
  self.pos=self.owner.pos
  self.done=t>30
  self.frm+=1.5-t/25
 end

-------------------------------
-- portals
-------------------------------

portal=static:extend([[
 tags=o("walls"),
 spawns_from=o(12,13,14,15), 
 render=f,
 p12=o(hitbox=b(0,0,2,8),way=v(-1,0)),
 p13=o(hitbox=b(6,0,8,8),way=v(1,0)),
 p14=o(hitbox=b(0,0,8,2),way=v(0,-2)),
 p15=o(hitbox=b(0,6,8,8),way=v(0,1)),
]])
 function portal:init()
  set(self,self["p"..self.tile])
 end
 function portal:collide(g)
  if g==g_guy and self.way:dot(g.vel)>0 then
   g_spawn_at=g_room.base*8+g.pos+self.way*9
   g_spawn_vel=self.way*(self.tile==14 and 1.6 or 0.1)
   schedule(co_transition(self.way))
  end
 end


-------------------------------
-- rooms
-------------------------------

room=object:extend()
 function room:init()
  self.crnr=self.base+self.size
 end

obfn.r=room

-------------------------------
-- title
-------------------------------

title=entity:extend([[
 draw_order=10,
]])
title_text=--[[prot]]ob[[
 o(t="a loving homage to",y=52,c=13),
 o(t="- hollow knight -",y=59,c=6),
 o(t="by jakub wasilewski",y=71,c=5),
 o(t="original by team cherry",y=78,c=5),
]]--[[protend]]
 function title:init()
  g_dim=5.9
 end
 function title:render_hud()
  cls()
  spr(160,40,24,6,2)
  for t in all(title_text) do
   aprint(0.5,t.t,64,t.y,t.c)
  end
  set_palette(mid(abs(g_time%60/6-5)-1,0,5))
  aprint(0.5,--[[prot]]"press [z] to start"--[[protend]],64,100,7)
  if g_inp.p4 then
   start_game()
  end
 end
 
-------------------------------
-- initialization
-------------------------------

function _init()
 extcmd("rec")
 init_palettes()
 g_freeze,g_shake,g_dim,g_glow=0,0,0,0
 g_game=game()
 g_clip=v0
 entity_reset()
 collision_reset()
 e_add(title())
end

function start_game()
-- g_spawn_at,g_spawn_vel=v(632,193),v(0,0)
 g_spawn_at,g_spawn_vel,g_spawn_state=v(892,583),v0,"asleep"
 g_game.last_bench=v(739,589)
 transition_rooms()
end

function co_transition(way)
 local d=way*16
 return cocreate(function()
  repeat
   if (g_room) g_clip+=d
   yield()
   if #g_clip==16384 then
    g_clip=-g_clip
    -- freeze updates cause
    -- pico-8 will start new
    -- _update60()'s even though
    -- ours is still stuck in
    -- coroutine
    g_freeze=16384
    transition_rooms()
    g_freeze=g_room and 0 or 16384
   end
  until #g_clip==0
  scheduled=nil
 end)
end

function transition_rooms()
 local ts=
  g_spawn_at/8
 g_room=nil
 for r in all(rms) do
  if mid(r.base.x,r.crnr.x,ts.x)==ts.x
   and mid(r.base.y,r.crnr.y,ts.y)==ts.y then
    g_room=r
  end
 end
 if not g_room then
  _init()
  return
 end
 -- reset systems
 entity_reset()
 collision_reset()
 -- create entities
 e_add(bg())
 if g_room.w then
  e_add(water())
 end
 g_particles=e_add(particles())
 g_level=e_add(level(g_room))
 -- create the player
 g_guy=e_add(guy({
  pos=g_spawn_at-g_room.base*8,
  vel=g_spawn_vel,
  state=g_spawn_state,
  way=sgn(g_spawn_vel.x)
 }))
 -- and the camera
 g_cam=cam({
  guy=g_guy,
  level=g_level
 })
 g_cam:track(1)
 g_spawn_at,g_spawn_state=nil
end

-------------------------------
-- main loop, just
-- calls the other systems
-------------------------------

g_time=0
function _update60()
 do_input()
 if scheduled and costatus(scheduled) then
  assert(coresume(scheduled))
 end
 if g_freeze==0 then
  local tu=stat(1)
  e_update_all()
  g_upd_time=stat(1)-tu
  do_movement()
  local tc=stat(1)
  do_collisions()
  g_coll_time=stat(1)-tc
  do_supports()
  do_timers()
 else
  g_freeze-=1
 end
 e_remove_done()
 g_time+=1
end

function _draw()
 if g_focus then
  g_focus:render_hud()
  return
 end
 if #g_clip>0 then
  cls(0)
  clip(g_clip.x,g_clip.y,128,128)
  rectfill(0,0,127,127,1)
 else
  cls(1)
 end
 if g_glow>0 then
  set_palette(10+g_glow,0x5f10)
 else
  set_palette(g_dim,0x5f10)
 end
 if (g_cam) g_cam:track()
 r_render_all("render")
 camera()
 r_render_all("render_hud")
 g_dim=max(g_dim-0.25,0)
 g_glow=max(g_glow-0.25,0)
--[[ print(g_upd_time,0,110,11)
 print(g_coll_time,0,116,9)
 print(stat(1),0,122,8)]]
end

-->8
-------------------------------
-- enemies
-------------------------------

enemy=entity:extend[[
 tags=o("enemy"),
 draw_order=10,
 vel=v(0,0),drag=0.9,
 timer=o(),
 plt=10,
 auto_swap=1,
 blood=9,blood_r=5,
 stun_len=20,
 aggro_len=25,
 aggro_angle=0.987,aggro_range=1,
 collides_with=o("walls","guy"),
]]
 function enemy:idle(t)
  -- fading after hits
  self.plt=max(10,self.plt-0.15)
  -- individual ai
  if self.state=="idle" and not self.stun_lasts and not (self.feetbox and not self.supported_by) then
   if check_aggro(self) then
    self.timer.aggro=self.aggro_len
   end
   self:ai(t)
  end
  -- velocity stuff
  if self.desired then
   self.vel=lerp(self.vel,self.desired,0.1)
  end
  self.vel*=self.drag
  -- preventing falls
  if self.feelv then
   local mapc=(self.pos+v(self.feelv.x*self.way,self.feelv.y))/8
   self.fall_imminent=not block_type(mget(mapc.x,mapc.y))
   if self.fall_imminent and self.auto_swap then
    self:swap()
   end
  end
 end

 function enemy:reset()
  self.timer.aggro,self.desired=0
  self:become("idle")
 end

 function enemy:swap()
  if (not self.supported_by) return
  self.way*=-1
  if (self.swap_stop) self.vel=v0
  self.fall_imminent=false
  self:reset()
 end

 function enemy:limp(freq,vel)
  if g_time%freq==0 then
   if (self.fall_imminent) self:swap()
   self.vel=v(self.way*vel,0)
  end
 end

 function enemy:shoot(v,added,spread)
  for i=-added,added do
   local vel=v+v:rot()*i*spread
   e_add(projectile({
    pos=self.pos+self.shoot_offset,
    vel=vel,
    sp=i~=0 and 195
   }))
  end
 end

 function enemy:hurt(dmg,force)
  -- screen effects
  g_freeze,g_shake=4,1.5
  -- soul
  g_game.soul+=(g_game.i8 and 1 or 0.667)
  -- damage and dying
  self.hp-=dmg
  if self.hp<=0 then
   self:splash(self.blood,self.blood_s,self.blood_r,1)
   self.done=true
   if (self.oid) g_game.killed[self.oid]=true
  else
   self:splash(self.blood,0.2,3)
  end
  -- stun
  self.timer.stun,self.timer.aggro=
   self.stun_len,0
  self.desired=v0
  -- turning
  if self.way then
   self.way=sgn(g_guy.pos.x-self.pos.x)
  end
  -- being hurt
  self.plt=15.9
  self.vel+=force/self.inertia
 end

 function enemy:collide(o)
  if (o==g_guy) hurt(self,o)
 end



fly=enemy:extend[[
 spawns_from=o(71),
 hp=7,
 desired=v(0,0),
 inertia=0.25,
 blood_s=0.56,
 aggro_range=1.8,
 aggro_angle=0,
 ambi_aggro=1,
 sprite=o(
  idle=o(70,68,delay=3),
  width=2,
  offset=v(-8,-6),
  flips=1,
 ),
 hitbox=b(-4,-5,4,0),
]]

 function fly:ai(t)
  if t%60==0 or #self.desired==0 then
   local attack=self.aggro_lasts and rnd()<0.5
   if attack then
    self.desired=self.guy_d:norm()*1.6
   else
    self.desired=mav(0.6,rnd())
   end
  end
 end

-------------------------------
-- bee
-------------------------------

bee=fly:extend[[
 spawns_from=o(192),
 inertia=0.75,
 shoot_offset=v(0,0),
 blood_s=0.7,
 sprite=o(
  idle=o(192),
  recoil=o(208),
  offset=v(-4,-4),
 ),
 hp=20,
 wing_spr=o(
  o(
   o(193,v(3,-4)),
   o(193,v(-10,-4),1),
  ),
  o(
   o(193,v(3,-7),f,1),
   o(193,v(-10,-7),1,1),
  ),
 ),
 hitbox=b(-4,-4,4,4),
 way=1,switch=0,
]]
 function bee:ai(t)
  if rnd()<(t-self.switch)*0.0005 then
   self.way=-self.way
   self.switch=t+45
   if rnd()<0.5 then
    local d=self.guy_d.x*0.83
    if abs(d)>1 then
     d=sgn(d)
    end
    self:shoot(
     v(d,0.1),
     0,0
    )
    self.vel-=v(0,3)
    self.timer.recoil=15
   end
  end
  local d=v(self.way*16,g_guy.pos.y-42-self.pos.y)
  self.desired=d:norm()
 end
 function bee:anim_state()
  return self.recoil_lasts and "recoil"
 end
 function bee:render(p)
  local frm=flr(self.t%4/2)+1
  self:rel_sprs(self.wing_spr[frm])
  spr_render(self)
 end

-------------------------------
-- projectiles
-------------------------------

projectile=entity:extend([[
 virtual=1,
 draw_order=12,
 weight=0.075,
 sprite=o(
  idle=o(194),
  offset=v(-4,-4),
 ),
 hitbox=b(-2,-2,2,2),
 collides_with=o("guy","walls"),
]])
 function projectile:collide(o)
  self.done=true
  self.pos+=self.vel
  self:splash(9,0.4,5)
  hurt(self,o)
 end

-------------------------------
-- bushes
-------------------------------

bush=enemy:extend[[
 spawns_from=o(207),
 vel=v(0,0),
 hp=13,
 weight=0.5,
 inertia=0.425,drag=0.9,
 auto_swap=f,
 way=1,
 blood=3,blood_s=0.64,blood_r=2,
 sprite=o(
  idle=o(207),
  offset=v(-4,-4),
  flips=1,
 ),
 hitbox=b(-4,-4,4,2),
 feetbox=b(-4,2,4,3),
 feelv=v(8,8.5),
]]
 function bush:render(p)
  local vel=self.vel.x
  local d=v(-self.way*0.5-vel*1.5,0)
  p=p:round()
  local p1,p2=p+d,p+d*3
  set_palette(self.plt)
  spr(205,p2.x-4,p2.y-4,1,1,vel<0)
  spr(206,p1.x-4,p1.y-4,1,1,vel<0)
  spr_render(self)
 end

 function bush:ai(t)
  if self.aggro_lasts then
   self:limp(1,0.8+sin(g_time*0.06)*0.4)
  else
   self:limp(60,0.8)
  end
 end

ambush=entity:extend[[
 draw_order=10,
 spawns_from=o(108),
 spawn_rep=124,
]]
 function ambush:idle()
  if g_guy.pos.y>self.pos.y and abs(g_guy.pos.x-self.pos.x-4)<12 then
   e_add(bush{pos=self.pos+v(0,4),way=-g_guy.way})
   self.done=true
  end
 end

-------------------------------
-- limper
-------------------------------

limper=enemy:extend[[
 spawns_from=o(204),
 weight=0.3,
 hp=7,inertia=2,
 blood_s=0.6,
 stun_len=0,
 swap_stop=1,
 auto_swap=f,
 way=1,
 sprite=o(
  idle=o(203),
  offset=v(-8,-8),
  width=2,
  flips=1,
 ),
 hitbox=b(-4,-8,4,-1),
 feetbox=b(-4,-1,4,0),
 feelv=v(10,0),
]]
 function limper:ai(t)
  self:limp(30,0.5)
 end

-------------------------------
-- fatguy
-------------------------------

fatguy=enemy:extend[[
 spawns_from=o(210),
 hp=30,weight=0.3,
 stun_len=3,
 aggro_len=60,aggro_range=1.6,
 ambi_aggro=1,
 shoot_offset=v(0,-12),
 inertia=1,
 blood_s=0.83,
 way=1,drag=0.9,
 sprite=o(
  idle=o(224),
  dash=o(226),
  width=2,height=2,
  offset=v(-8,-16),
  flips=1,
 ),
 head_off=v(-4,-16),
 head_m=1.5,
 head_spr=o(
  210,spit=209,
 ),
 hitbox=b(-6,-16,6,0),
 feetbox=b(-6,0,6,1),
 feelv=v(12,1),
]]
 function fatguy:dash(t)
  self.desired=v(self.way*2-t*0.03,0)
  self:idle(t)
  if (t>30) self:reset()
 end
 function fatguy:spit(t)
  self:idle(t)
  if t==0 then
   self.vel=v(-self.way*0.5,-2)
  elseif t==40 then
   self:shoot(v(self.way,rnd(0.5)-1.35)*0.87,1,0.5)
  elseif t>80 then
   self:reset()
  end
 end
 function fatguy:ai(t)
  if self.aggro_lasts then
   local spit=
    rnd()>((g_guy.supported_by and self.guy_a>0.99) and 0.75 or 0.05)
   self.way=sgn(self.guy_d.x)
   self:become(spit and "spit" or "dash")
  else
   self:limp(30,0.5)
  end
 end
 
-------------------------------
-- ballguy
-------------------------------

ballguy=enemy:extend[[
 spawns_from=o(248),
 hp=25,weight=0.3,
 stun_len=3,
 aggro_len=60,aggro_range=2.1,
 ambi_aggro=1,aggro_angle=0.2, 
 limp_r=1,
 inertia=1,
 blood_s=0.83,
 way=1,drag=0.9,
 sprite=o(
  idle=o(230),
  width=2,height=2,
  offset=v(-8,-16),
  flips=1,
 ),
 head_off=v(-4,-14),
 head_m=1.5,
 head_spr=248,
 hitbox=b(-6,-16,6,0),
 feetbox=b(-6,0,6,1),
 feelv=v(12,1),
]]
 function ballguy:init()
  if self.oid and g_game.killed[self.oid] then
   return
  end
  self.ball=e_add(self.weapon{
   owner=self,pos=self.pos
  })
 end
 
 function ballguy:throw(t)
  self:idle(t)
  if (t<10) self.ball.vel*=0.6
  if (abs(t-10)<2) self.ball.vel=-self.aim
  if (abs(t-22)<8) self.ball.vel=self.aim*3
  if (t==15) self.vel+=v(self.aim.x*1.5,self.aim.y*3)
  if (t>60) self:reset()
 end
 
 function ballguy:ai()
  if self.aggro_lasts and self.guy_d.y<0.16 then
   local d=self.guy_d
   self.way=sgn(d.x)
   if #d<self.limp_r then
    self.aim=self:take_aim(d)
    self:become("throw")
    self.t=-rnd(10)
   else
    self:limp(15,1)
   end
  else
   self:limp(60,1)
  end
 end
 
 function ballguy:take_aim(d)
  return d:norm()*0.85-v(0,0.1)
 end
 
ball=entity:extend[[
 draw_order=11,
 vel=v(0,0),weight=0,
 sprite=o(
  idle=o(211),
  offset=v(-4,-4),
 ), 
 hitbox=b(-3,-3,3,3),
 collides_with=o("guy"),
 spring=0.04,side=0.01,damp=0.91,hold=4,
]]
 function ball:idle()
  local owner=self.owner
  if owner then   
   if owner.done then
    self.done=true
   else
    self.way=owner.way
    local d=owner.pos-v(owner.way*self.hold,4)-self.pos
    self.vel+=d*self.spring+d:rot()*self.side
    self.d=d
   end
  end
  self.vel*=self.damp
 end
 function ball:render()
  for i=0.25,0.75,0.25 do
   local p=self.pos+(self.d or v0)*i-v(4,4)
   spr(212,p.x,p.y)
  end
  spr_render(self)
 end
 function ball:collide(g)
  hurt(self,g)
 end

moss=ballguy:extend[[
 spawns_from=o(172),
 hp=30,
 blood=3,
 inertia=1,
 limp_r=0.6,
 sprite=o(
  idle=o(172),
  dash=o(174),
  width=2,height=2,
  offset=v(-8,-16),
  flips=1,
 ),
 aggro_angle=0.7,aggro_range=1.8,
 head_spr=f,
]]
 function moss:anim_state()
  if (self.state=="throw" and abs(self.vel.x)>0.3) return "dash"
 end
 function moss:throw(t)
  self:idle(t)
  if (t==30) self.vel=self.aim*(1.5+rnd())
  if (abs(t-35)<5) self.ball.vel=self.aim*3
  if (t>60) self:reset()
 end
 function moss:take_aim(d)
  return v(sgn(d.x),0)
 end
 
spike=ball:extend[[
 sprite=o(
  idle=o(187),
  throw=o(187),
  offset=v(-4,-4),
  flips=1,
 ),
 spring=0.12,side=0.0,damp=0.7,
 hold=1,
]]
 spike.render=spr_render

ballguy.weapon,moss.weapon=
 ball,spike

-------------------------------
-- checking for aggro
-------------------------------

function check_aggro(e)
 local w=e.way or 1
 local d=(g_guy.pos-e.pos)/48
 e.guy_a=d:norm().x*w
 e.guy_d=d
 if (e.ambi_aggro) e.guy_a=abs(e.guy_a)
 return e.guy_a>e.aggro_angle and #d<e.aggro_range
end

-------------------------------
-- boss fights
-------------------------------

bossfight=entity:extend[[
 tags=o("bossfight"),
 spawns_from=o(66),
 round=1,
 render=f,
 83_18=o(
  o(o(
   t=64,p=v(0,0),
   s=o(
    text="you've come far/ little bug.",
   ),
  )),
  o(o(
   t=64,p=v(0,0),
   s=o(
    text="now/ prove yourself.",
   ),
  )),
  o(
   o(t=71,p=v(16,-35)),
   o(t=71,p=v(-16,-35)),
   o(t=71,p=v(32,-48)),
   o(t=71,p=v(-32,-48)),
   o(t=71,p=v(0,-38)),
   o(t=172,p=v(40,16),s=o(hp=40)),
   o(t=172,p=v(-40,16),s=o(hp=40)),
  ),  
  o(),o(),
  o(
   o(t=210,p=v(40,-16),s=o(hp=50)),
   o(t=210,p=v(-40,-16),s=o(hp=50)),
   o(t=204,p=v(-24,16)),
   o(t=204,p=v(40,16)),
   o(t=71,p=v(56,-8)),
   o(t=71,p=v(-56,-8)),
  ),
  o(),o(),
  o(
   o(t=248,p=v(40,-16),s=o(hp=50)),
   o(t=248,p=v(-40,-16),s=o(hp=50)),
   o(t=192,p=v(-40,-32)),
   o(t=192,p=v(40,-32)),
  ),
  o(),
  o(o(
   t=64,p=v(0,0),
   s=o(
    text="go/ vessel.",
   ),
  )),
  o(o(
   t=64,p=v(0,0),
   s=o(
    text="claim your destiny.",
   ),
  )),
 ),
 100_32=o(
  o(
   o(t=210,p=v(-48,0),s=o(hp=40)),
   o(t=248,p=v(24,0),s=o(hp=40)),
  ),
  o(
   o(t=35,p=v(-16,0)),
  ),
 ),
 15_86=o(
  o(
   o(t=172,p=v(-32,-16)),
  ), 
  o(
   o(t=172,p=v(40,-16)),
   o(t=172,p=v(-32,-16)),
  ),
 ),
 106_68=o(
  o(o(
   t=64,p=v(0,0),
   s=o(
    text="wake up/ little bug.",
    clr=7,
    spd=2.5,wiggle=1.75,
   ),
  )),  
 ),
]]
 function bossfight:idle()
  if self.box:contains(g_guy.pos) then
   g_cam.focus=self
   self:become("spawn")
  end
 end
 function bossfight:spawn(t)
  if t==60 then
   local spawns=bossfight[self.oid][self.round]
   if not spawns then
    g_game.collected[self.oid]=true
    self.done,g_cam.focus=
     true,nil
   end
   self.round+=1  
   self.tracked={} 
   for s in all(spawns) do
    etype=entity.spawns[s.t]
    local e=e_add(etype(set({
     pos=self.pos+s.p,
     vel=etype.weight and v(0,-1),    
     tile=s.t 
    },s.s or {})))
    if not e.sprite then
     e.sprite={idle={s.t}}
    end
    add(self.tracked,e)
    e:splash(7,1,3)
   end
   self:become("during")
  end
 end
 function bossfight:during()
  for t in all(self.tracked) do
   if (not t.done) return
  end
  self:become("spawn")
 end

bosscrnr=entity:extend[[
 spawns_from=o(83),
 render=f,
]]
 function bosscrnr:init()
  if (not entities_tagged.bossfight) return
  local bf=entities_tagged.bossfight[1]
  bf.box=
   vbox(bf.pos,self.pos+v(9,9))
  bf.pos=bf.box:middle()
 end
 
bossgate=entity:extend[[
 tags=o("walls"),
 spawns_from=o(2,18),
 draw_order=1,
 sprite=o(
  idle=o(2),
  height=2,
 ),
 slip=1,
 hitbox=b(0,0,8,16),
]]
 bossgate.collide=solid.collide
 function bossgate:init()
  self.bp=self.pos-v(0,15)
  self.pos=self.bp
  self.slam=self.tile==2 and 0 or 16.5
 end
 function bossgate:idle()
  if g_cam.focus and self.slam<15 then
   self.slam+=1.5
   if (self.slam==15) g_shake=2
  end
  if not g_cam.focus and self.slam>0 then
   self.slam-=0.5
  end
  self.pos=self.bp+v(0,self.slam)
 end
-->8
-- autogenerated by the
-- tiled import script
rms=ob([[
 r(o(data_x=0,data_y=0,base=v(84,64),w=1,size=v(20,16),)),
 r(o(data_x=33,data_y=1,base=v(56,64),w=1,size=v(28,16),)),
 r(o(data_x=44,data_y=3,base=v(0,58),w=1,size=v(16,22),)),
 r(o(data_x=20,data_y=6,base=v(0,42),size=v(16,16),)),
 r(o(data_x=88,data_y=7,base=v(36,56),w=1,size=v(20,24),)),
 r(o(data_x=15,data_y=11,base=v(16,42),size=v(20,22),)),
 r(o(data_x=71,data_y=13,base=v(16,64),size=v(20,16),)),
 r(o(data_x=86,data_y=15,base=v(36,36),size=v(20,20),)),
 r(o(data_x=85,data_y=17,base=v(56,46),size=v(48,18),)),
 r(o(data_x=89,data_y=22,base=v(104,64),w=1,size=v(16,16),)),
 r(o(data_x=72,data_y=23,base=v(104,47),size=v(16,16),)),
 r(o(data_x=98,data_y=23,base=v(82,30),size=v(29,16),)),
 r(o(data_x=70,data_y=25,base=v(56,28),no_b=1,size=v(26,18),)),
 r(o(data_x=64,data_y=27,base=v(11,80),size=v(23,16),)),
 r(o(data_x=34,data_y=30,base=v(0,26),size=v(16,16),)),
 r(o(data_x=101,data_y=30,base=v(36,15),no_b=1,size=v(20,21),)),
 r(o(data_x=12,data_y=33,base=v(56,12),no_b=1,size=v(26,16),)),
 r(o(data_x=23,data_y=35,base=v(67,6),size=v(0,0),)),
 r(o(data_x=24,data_y=35,base=v(82,12),no_b=1,size=v(16,16),)),
]])
-- end autogenerated

function map_read(ox, oy)
 local mx, my = ox, oy
 return function()
  local v=mget(mx,my)
  mx+=1
  if (mx==104) mx,my=0,my+1
  return v
 end
end

function unpack_room(r)
  local w,h=r.size.x,r.size.y
 -- get clean data
 reload(0x2000,0x2000,0x1000)
 local mread=map_read(r.data_x, r.data_y)
 -- unpack to 0x4300
 local addr=0x4300
 local limit=addr+w*h
 while addr < limit do
  local header=mread()
  if header > 128 then
   local val,len=mread(),header-128
   memset(addr,val,len)
   addr+=len
  else
   for i=1,header do
    poke(addr,mread())
    addr+=1
   end
  end
 end
 -- copy it back to the map region
 for l=0,h-1 do
  memcpy(0x2000+l*128,0x4300+l*w,w)
 end
end

-->8
item=entity:extend[[
 draw_order=11,
 spawns_from=o(3,19,35,4,5,6,7,8,9,10,11),
 spawns_at=v(4,12),
 plt=10,frm=0,
 hitbox=o(
  b(0,0,8,4),
  collected=b(-256,-256,-257,-257),
 ), 
 collides_with=o("guy"),
]]
nail=item:extend[[
 spawns_from=o(111),
 spawns_at=v(4,20),
 sprite=o(
  idle=o(95),
  offset=v(0,-8),
  height=2,
 ),
]]

texts=ob--[[prot]][[
 i6=o(
  n="longnail charm",
  d=o(
   "your nail reaches farther.",
  ),
 ),
 i7=o(
  n="stoutscale charm",
  d=o(
   "you heal faster.",
  ),
 ),
 i8=o(
  n="soulseek charm",
  d=o(
   "you gain soul faster.",
  ),
 ),
 i9=o(
  n="goldnail charm",
  d=o(
   "you hit harder.",
  ),
 ),
 i10=o(
  n="bloodbloom charm",
  d=o(
   "you have more life.",
  ),
 ),
 i11=o(
  n="ghostshell charm",
  d=o(
   "you are immune for longer",
   "when you get hit.",
  ),
 ),
 i111=o(
  n="discarded nail",
  d=o(
   "",
   "[z] to jump",
   "[x] to strike",
   "[down] to heal",
   "[up] to sit on benches",
  ),
 ),
 i3=o(
  n="windgust",
  d=o(
   "press left/right+[x]", 
   "while airborne",
   "to dash sideways.",
  ),
 ),
 i19=o(
  n="soulwings",
  d=o(
   "jump again by pressing",
   "[z] while airborne",
  ),
 ),
 i35=o(
  n="heart of rock",
  d=o(
   "climb vertical walls",
   "by jumping onto them",
  ),
 ),
 nail_st=o(
 )
]]--[[protend]]
 function item:idle()
  self.plt=max(self.plt-0.15,10)
  if g_time%100==0 then
   self.plt=15.9
   self.frm=0
  end
 end
 function item:collected(t)
  g_glow=min(g_glow+0.5,5)
  g_guy.vel=v(0,0)
  if t>25 then
   g_focus=self
   self.plt,self.pos=
    10,v(60,32)
   self:become("showcase")
  end
 end
 function item:render(p)
  if self.state=="collected" then
   circfill(p.x,p.y,self.t*5,7)
  else
   spr_render(self)
   self.frm+=1-self.frm*0.04
   slash_plt(self.frm)
   spr(41,p.x-4,p.y-4,2,2)
  end
 end
 function item:render_hud()
  if self.state=="showcase" then
   -- ugly hack:
   -- updates moved here
   -- so we can work despite
   -- g_freeze being on
   g_freeze=1
   self.t+=1
   self.out=self.out or g_inp.p4
   if self.out then
    g_dim+=0.25
    if g_dim>=5.75 then
     self.done,g_glow,g_focus=
      true,0
    end
   end
   -- actual rendering
   cls(0)
   set_palette(g_dim,0x5f10)
   local t=self.t
   local th=mid(0,1,1-t/60)
   local d=th^3*128
   spr_render(self)
   item_info(self.tile,v(64,48),d)
   local t,b=80-d,48+d
   if t<b then
    rectfill(0,t,127,b,7)
   end
  end
 end
 function item:collide(g)
  if g==g_guy then
   self:become("collected")
   g_game["i"..self.tile]=true
   if self.oid then
    g_game.collected[self.oid]=true    
   end
  end
 end

remnant=entity:extend[[
 spawns_from=o(49),
 spawns_at=v(-1,4),
 spawn_rep=49,
 hitbox=b(-2,-2,2,4),
 collides_with=o("guy"),
 banr=o(
  text="nail strengthened",
  clr=12,
  spd=2,wiggle=0,
 ),
]]
 function remnant:idle()
  if rnd()<0.2 then
   g_particles:spawn({
    p=self.pos+v(rnd(4)-2,0),
    clr=rnd()<0.5 and 7 or 12,
    v=v(0,-0.3),
    drag=0.97,
    radius=1,l=rnd(0.5)+0.5,
   })
  end
 end
 function remnant:collide()
  self:splash(12,0.6,5,2)
  self.done=true
  g_glow=5.5
  g_game.nail_dmg+=0.5
  g_game.collected[self.oid]=true
  e_add(banner(deep_copy(self.banr)))
 end

bench=entity:extend[[
 spawns_from=o(33),
 spawn_rep=33,
 box=b(-4,0,12,8),
 draw_order=15,
 angle=0,sel=0,
 cursor=o(
  o(108,v(-3,-33)),
 ),
 render=f,
]]
 function bench:idle()
  if g_inp.p2 and g_guy.state~="sit" and c_check(self.box:translate(self.pos),{"guy"}) then
   g_game.last_bench=g_level.base*8+g_guy.pos-v(0,3)
   g_guy:become("sit")
   g_guy.vel=v(0,-1)
   g_game.hp=g_game:max_hp()
   g_game.killed={}
   g_guy:splash(7,0.5,2)
  elseif g_guy.state=="sit" then
   for i=0,5 do
    if g_inp["p"..i] then
     g_guy:become("free")
    end
   end
  end
 end
 
 all_charms=ob[[6,7,8,9,10,11,]]
 function bench:render()
  if g_guy.state=="sit" then
   for a,c in pairs(all_charms) do
    local p=g_guy.pos-
     v(4,8)+
     mav(min(19,sqrt(g_guy.t*30)),
         0.071*a)
    spr(g_game["i"..c] and c or 5,p.x,p.y)
   end
  end
 end

------------------------------
-- printing item info
------------------------------

function item_info(no,p,d)
 local text=texts["i"..no]
 aprint(0.5,text.n,p.x+d,p.y,9)
 for i=1,#text.d do
  aprint(0.5,text.d[i],p.x-d,p.y+2+i*7,13)
 end
end

------------------------------
-- banners
------------------------------

banner=entity:extend[[
 spawns_from=o(64),
 draw_order=15,
 clr=7,wiggle=1.5,
 spd=2.5,
 td=o(),
]]
 function banner:init()
  self.pos,self.c=
   v(64-#self.text*2,32),
   20+self.spd*#self.text
  local d=0
  for i=1,#self.text do
   self.td[i]={
    o=rnd(),d=d
   }
   d+=self.spd*(sub(self.text,i,i)=="/" and 4 or 1)
  end
 end
 function banner:render_hud(p)
  local t=self.t
  self.done=t>self.c*3
  local d=transition(t,self.c,self.c-15,15)
  if d>0 then
   rectfill(0,p.y+d,127,p.y+4*d,0)
  end
  for i=1,#self.text do
   local td=self.td[i]
   local d=1-transition(t,self.c+td.d,self.c-6,6)
   if d<1 then
    local c=sub(self.text,i,i)
    print(
     c=="/" and "," or c,
     p.x+i*4-4,
     p.y-d*6+
      self.wiggle*sin(t*0.01+td.o),
     self.clr
    )
   end
  end
 end

function transition(t,c,wc,wt)
 local diff=abs(t-c)
 return min(1-(diff-wc)/wt,1)
end

 --[[
 [0-30] 0..1
 [30-210] 1
 [210-240] 1..0
 ]]
__gfx__
0000000000001156eed0ed0eeeeeeeee00000000eeeeeeeeee1110eeee0000eeee1111eeeee71eeeee51e0eeee5551ee00000000000000000000000000000000
11100010001155d7ee70e70eee555eee00000000eeeeeeeee176160ee0d1150ee128221ee4e70e2ee5b31b0ee57ff71e00009000000900000000000000099000
22110020002288e7ee70e70ee577755500000000eee00eeee11d61600d17c150128210004a270290e5311350577447d000099000000990000009900000099000
333110300033bb77ee77770e5765676d00000000ee0550ee179061d00177cc001211076022470a20111781507007700d00999990099999000099990009999990
42211040004499a7ee00000e575e555500000000ee05d0ee0920d1d001ccdd00100077602a470a401b1821100117711000999990099999000999999000999900
55111050005dd677ee70e70e57d5d75e00000000eee00eeee005d1d0051cd01017777660294519400b3103001f77774000099000000990000009900000099000
66d510d000677777ee7dd60ee57775ee00000000eeeeeeeee05d150ee051010ee166660ee246140ee055050ee144440e00009000000900000009900000000000
776d106000777777eed7700eee555eee00000000eeeeeeeeee0000eeee0000eeee0000eeee0000eeee00e0eeee0000ee00000000000000000000000000000000
882210800088e777eed7600ee5eee5e0eeeeeeeeeee0eeeeeeeeeeee000000000000000000000000eeeeeeeeee2222211eeeeee1122222ee0000000000000000
94221090009aa777ee06600e575e5750eeeeeeeeeee00eeeeeeeeeee00000000e000000ee000e000eeeeeeeee333333221eeee122333333e0000000000000000
a94210a000aa7777eed00d0e575e575000eeee0ee0ee0000e0eeeeee00000000e00000eee000ee00eeeeeeee44444443321ee123344444440000000000000000
bb3310b000bb7777ee67760e57757750000ee00e000ee000000eee000000000eee0000eeee0eee00eeeeeeeee5555554432ee2344555555e0000000000000000
ccd510c000c77777ee00000e56757650000000ee000e0000000ee000e000000eee0000eeee0eeee0eeeeeeeeee666666557ee755666666ee0000000000000000
d55110d000d66777ee60ed0e557575e0000000e000ee00000000e00eee000e0eeee00eeeeeeeeee0eeeeeeeeeee7777778aeea8777777eee0000000000000000
ee8210e000ef7777ee70e70ee55e55e000000000000000000000e00eee00ee0eeee0eeeeeeeeeee0eeeeeeeeeeeee8889aeeeea9888eeeee0000000000000000
f94210f000f77777ee00e00eeeeeeeee000000000000000000000000eee0eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee99aeeeeeea99eeeeee0000000000000000
eeeeeeeeeeeeeeeeeeeeeeeee5e55e5e00000000e0000eee222222222222222200000000eeeeeeeeeeeeeeee0000000000000000eee665ee070ee070070ee070
eeeeeeeeeeeeeeeeeeeeeeee5656656500000000eee000ee000000000000000000000000eeeeeeee89eeeeee0000000000000000ee76655e07d00d7007d00070
eeee000000000000000eeeee56777765e0000000eeee0000101000011111111100000000eeeeeee8eeaeeeee0000000000000000e776655e0777777007777770
eee0ddddddd555555550eeee51777715e0000000eeeee000001000000000000000000000eeeecd766eebeeee0000000000000000e776655e0117711007117710
ee0d666666666d6dddd50eee56d77d65e0000000eeee0000001000000000000000000000eeebe765577eceee0000000000000000777665540007700007007700
ee0000000000000000000eeee567765eee00e000eeee0000201000022222222200000000eeae76534467deee0000000000000000778ee5440777776007777770
eee05050eeeeeee05050eeeeee5665eeee0ee000e0000000201000022222222200000000e9ee743223567eee0000000000000000888eee44e077760e10777710
eee06000eeeeeee00060eeeeeee55eeeeeeeee0000000000201000022222222200000000e8e65421123568ee000000000000000088eeee34ee0000ee1100000e
eeeeeeeee0d50eeeeed76010010d67dddeeedeee0000000020100002eeeeeeeeeeeeeeeeee86532112456e8eedcbaa99887777ee89eeee330000000000000000
eeeeeeee06650eeeeee000100100000e70de70ee0011100020100002eeeeeeeeeee0000eeee765322347ee9eeeeeeeee9887777e99eeee330000000000000000
eeeeeee06006000edd76d0100107deee607060de000000002010000200000eee00e0000eeeed76443567eaeeeeeeeeeeeee66666aeeeeee30000000000000000
eee0000dd006d0d0e0000010010000eed060d06060d060d020100002e000e00e00e0000eeeece775567ebeeeeeeeeeeeeee66666aeeeeee20000000000000000
ee05510dddddd500eeed7000000d67de00000000d0606060201000020000000000000000eeeebee667dceeeeeeeeeeeeee555555beeeeee20000000000000000
e0551510d55d000eee000000000000000d511111ee60d060201000020000000000000000eeeeeaee8eeeeeeeeeeeee333445555eceeeeee10000000000000000
05100000055500eeed76d00000067dee00000000eed0eed0201000020000000000000000eeeeee98eeeeeeeee11223334444eeeeeeeeeee10000000000000000
0000000000000eee0000000000000eee00111110eeeeeeee20100002e000000e00e0000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000
eeeee6666eeeeeeeeeeee6666eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee05ddd00010eeeeeeee0100005070eeeeee05000010eeeeeeee05000010eeee
eee775555ddeeeeeeee775555ddeeeeeeeeeee1111eeeeeeeeeeee1111eeeeeeee0111115010eeeeeeee01051dd000eeeee05dd15010eeeeeeee0dd15010eeee
ee7dd7777115eeeeee7550000115eeeeeeeee155551e5eeeeeeee155551eeeeeee55d555010eeeeeeeeee010d1d0eeeeeee01115010eeeeeeeee0d15010eeeee
e7d6777777d15eeee750000000005eeeeeee1715959075eeeeee111595905eeeee01111000eeeeeeeeeeee010d00eeeeee055d5000eeeeeeeeee0150110eeeee
e7d7777777715eeee750000000105eeeeeeee17511105eeeeeee1775111075eeee1000000eeeeeeeeeeeeee01050eeeeeee011100eeeeeeeeeee050110eeeeee
65777777777615ee65000000011005eeeeeeee015550eeeeeeee110155505eeeee00eeeeeeeeeeeeeeeeeee01050eeeeee01000eeeeeeeeeeeee00000eeeeeee
65777777777615ee65000000111005eeeeeeee01110eeeeeeeeeee01110eeeeeeeeeeeeeeeeeeeeeeeeeeeee0e0eeeeeeee00eeeeeeeeeeeeeeeeeeeeeeeeeee
65777777776615ee65000001111005eeeeeeeee000eeeeeeeeeeeee000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
65777777776d15ee65000011111005ee0000000000000000000000000000000000e099000b30000000990e00eeeeeeeee0000eee0000000000000000eee000ee
ed17777776615eeeed10111111005eee07d55110551111101111155016dd51110900088b0310bb3038800090ee00eeee067760ee0000000000000000eee020ee
ed1d777666515eeeed10011110005eee00000000000000000000000000000000e0980000000013300100890ee0110eee077760ee0000000000000000eee050ee
eed11666d115eeeeeed110000005eeee0011111000111100001111000011110000088b302003000201388000015510ee0d77d0ee0000000000000000eee050ee
eeedd111155eeeeeeeedd000055eeeeeee0000000000000000000000000000009000b3002101100220130009055550ee077760ee0000000000000000ee00d00e
eeeee5555eeeeeeeeeeee5555eeeeeeee0d51001000000000010110e00000000098000000000020000010890e0550eeee0660eee0000000000000000ee06770e
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0511100000000000000110e00000000008b00030030000320301800ee00eeeeee00eeee0000000000000000ee07770e
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee010000000000000100000e000000000bb002010111000000100130eeeeeeeeeeeeeeee0000000000000000ee07760e
00000000eeeeeeeeee0000eeee0000eee00000000000000000000000000000000b300030011000000000133300000bb0000b3b100b31000000020030ee0760ee
00000000ee0000ee00000000ee0110ee00d510000000000000015d100000000000000000110011000133013001bb033102b333300031300001001000ee0760ee
00000000e000000ee000000eee0100ee00510000000000000000151000808000033002101000100000100000033100110b3b33510001330003013013ee0750ee
00000000000000000000000eee0000ee00010010000000000010110e00080000b3110110001000000200133000020303033335510110131000030030ee060eee
000000000000000000000000ee0000eee0000000000000000000110e00808000b31100000110000003000130b3000001303535100311101001000000ee060eee
000000000000000000000000ee0110ee0d511000000000000100000e00000000031033100100010000000000b310220011011111e00031011000130eee050eee
000000000000000000000000ee0100ee051101000000000000015100000000000000010000001000012001300113003303011033eee003030301300eee00eeee
00000000e000000ee000000eee0000eee01000000000000000001100000000000b33002000000000011011330011133000033000eeee0000000000eeee00eeee
eeeeeeeeeeeeeeeeeeeeeeeee0eeee0e000100100000000000000000000000000b31000000002110000200300000000000003110e0000000000000000000000e
eeeeeeeeeeeeeeee0eeee0eee00ee00ee05100000000000000011510d6666d51083130000220000001001080000033000110000000dddddddddddddddddd5100
eeeeeeeeeeeeeeee00ee00ee000000000051000000000000010015000155551009013300000003010301309000033103022000010d5555555555555555555510
0eeeeeeeeeeeeee00000000ee00ee00e00000000000000000000000e000000008008131001103303000380080000110100001100050000000000000000000010
00eeeeeeeeeeee0000000000e00ee00e0011100000111000001110001b10b3030089001033311101010098000310000011003300050000000000000000000010
00eeeeeeeeeeee0000000000e00ee00e00000000000000000000000011103300e0900881111080081880090e3110220033100003050000000000000000000010
0000eeeeeeee000000000000e00ee00e051111000511110005111100003011030800090308009009009000800100210011133301001111111111111111111100
0000eeeeeeee000000000000e00ee00e0000000000000000000000000111000000e0800009000008e0080e000000000000011100e0000000000000000000000e
663855106638003046563358001023785610663800304656335800102388566065004556563358001023785670663300235757335800102378561066b8001023
78561066b80010467856706655757555554358001046d856106658001046d8561066480030455555000000000000000000000000000000000000000000000000
c856106648f030475757685689061056990630565606795730065606795770565606660000063800100678001006380040060000463856406600000638001006
78001006380040060000463856406600000638001006780010063800400600004638564066000006000000000000000000000000000000000000000000000000
38001006780010063800b00600004656565767000006380010067800100638007006000046565667380010063800100678001006380070060000465656c03800
10063800100678001006380001060000475757c00000170607001706075800701706070017060738000000000000000000000000000000000000000000000000
0030d0c0009806300212229806300000d0a975a955a95600205656c8574856506691718142380640718191463856205767480030427181380060475756566653
a800505346565767c80030475765e80030456724d8002047666800209aaa68002046666800209bab000000000000000000000000000000000000000000000000
680030465665380060068b06068a0638007045565767007b7a6806a07b7a006757200000062668065026060000203800a806500000d06500c806b03545555575
75555575755538752055752955000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
0000000000000000000000d7d0000000000000000000000000000000eeee0eee0eeeeeeeeeeeeee00eeeeeee00000000eeeb0e00e03eeeeeeeeeee0000e0eeee
00000000000077777dd000707000dd77777000000000000000000000e0ee0e0e00eeeeeeeeee0ee00ee0eeee00000000eee0306d030eeeeeeeeee0306503eeee
0000000001d7d000007777777777700000d7d1000000000000000000e00e000e000eeeeeeeee0ee00ee0eeee00000000eeee065550eeeeeeeeeeee065500eeee
00000000000000000000000000000000000000000000000000000000e000000e0000eeeeeeee0e0000e0eeee00000000eeee0d0500eeeeeeeeeeee0d500eeeee
007000177107000700070070700707770077707007077700000000000000000000000000eeee0e0000e0eeee00000000eeee0d5550eeeeeeeeeee00d550eeeee
007000700707000700070070770700700700007007007000000000000220022000000000eee000e00e000eee00000000eee13015100eeeeeeeee13015100eeee
00700070070700070007070070770070070000777700700000000000e000000e00000000eee0000000000eee00000000ee13b3000330eeeeeee13b3000330eee
00700070070707070007700070070070070770700700700000000000ee0000ee00000000eeee00000000eeee00000000e13b3b3b3b550eeeeee1b3b3b3b50eee
00700070070770770007070070070070070070700700700000000000e0eeee0eeeeeeee0eeee00000000eeeee000eeeee133b55335510eeeeee1b35533550eee
00777017710700070007007070070777007770700700700000000000ee0ee0eeeeeeee00eeee02000020eeee006d000eee11511151500eeeeee1151115150eee
00000000000000000000000000000000000000000000000000000000e000000eeeeee000eeee02200220eeeed07776d0eee1115d111d0eeeeeee1115d110eeee
000001d0000d777777dd000d000dd777777d0000d100000000000000e020020eeeee0000eeee00200200eeee00000000eeee06d551050eeeeee06d5510eeeeee
0000000d7777000000077770777700000007777d0000000000000000e000000e00000000eeee00000000eeeeeeeeeeeeeeee0d555100eeeeeee055550eeeeeee
0000000000000d0777000077700007770d0000000000000000000000ee0000ee00000000e00000000000000eeeeeeeeeeeeee06d10eeeeeeee06d510eeeeeeee
000000000000107d0dd777707777dd0d701000000000000000000000e000000e000000000000000000000000eeeeeeeeeeeee05510eeeeeeee05510eeeeeeeee
00000000000000000000000d0000000000000000000000000000000000000000000000000000000000000000eeeeeeeeeeeeee000eeeeeeeeee000eeeeeeeeee
ee5555eee777eeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000eeeeeeeeeeeeeeeeeeeee0ee0eeeeeeeeeeeeeeeeeeeeeeee0e00eee
e5d6dd1e7775eeeeeee99eeeeeeeeeeeeeeeeeee00000000000000000000000000000000eeee77881122eeeeeeee570060eeeeeeeeeeeeeeee00eeee0b0b30ee
57755771775eeeeeee9aa9eeeee99eeeeeeeeeee00000000000000000000000000000000ee66eeeeeeee33eeeee5dd1d00eeeeeeeeee0eeee0b30eeebbbabb0e
1607706155eeeeeee9a77a9eee9aa9eeeee99eee00000000000000000000000000000000e55eeeeeeeeee44eee557d10660eeeeeeee0b0ee03b330ee33b222b0
e066660eeeeeeeeee9a77a9eee9a99eeeee99eee00000000000000000000000000000000e44eeeeeeeeee55ee56dd1067760eeeeee033b0eb133b50e3b2909b0
e207702eeeeeeeeee29aa92eee2992eeeeeeeeee00000000000000000000000000000000ee33eeeeeeee66eee07561060700eeeee0bb13503bb3550e5b2000b0
e490042eeeeeeeeeee2992eeeee22eeeeeeeeeee00000000000000000000000000000000eeee22118877eeeeee05110d7760eeee035115103515550e35bbbb30
ee2222eeeeeeeeeeeee22eeeeeeeeeeeeeeeeeee00000000000000000000000000000000eeeeeeeeeeeeeeeeeee00000000eeeee000000000000000e0000000e
ee5555eeeee555eeeeeeeeeeee0700eeeeeeeeeeeee0760eeeeeeeee0000000000000000eeeee5ee5eeeeeeeeeeeeee5eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
e5d66d1eee5777deee55555ee050550eeeeeeeeeeee07770eeeeeeee0000000000000000eeeee555eeeeeeeeeeeeee5ee5eeeeeeeeeeeeeeeeeeeeeeeeeeeeee
55dddd51e5700700e577777005dd5650eee55eeee0e070070eeeeeee0000000000000000eeee57770eeeeeeeeeeeee555eeeeeeeeeeeeeeeeeeeeeeee5eeeeee
1656d561577097905770070070dd5510ee500dee0607700760000eee0000000000000000eeee577d70eeeeeeeeeee57770eeeeeeeeeeeeeeeeeeeeee5ee5eeee
e065560e577d0000577097900557010dee5006ee007777776015d0ee0000000000000000e5eee077570eeeeeeeeee577d70eeeeeeeeeeeeeeeeeeee5555eeeee
e407702e07d000000077766006551110eeed6eeee000777601515d0e0000000000000000570ee506660eeeeeeeeee5077570eeeeeeeeeeeeeeeeee57770eeeee
ee0770ee007776605066660ee011010eeeeeeeeeee0066600000015000000000000000005770e57000e0eeeeeeeeee506660eeeeeeeeeeeeeeeeee577d70eeee
eee00eee5066660e50000000ee00d0eeeeeeeeeeeee00000000000000000000000000000570ee570ee060eeeeeeeee57000eeeeeeeeeeeeeeeeeeee077570eee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000e570e160e560eeeeeeeeee570eeeeeeeeeeeeeeeeeeeee0706660eee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000e570e1d0e5660eeeeeeeee160eee555eeeeeeeeeeeeee060e000eeee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000eeeeeeeeeeeeeeeeeeeee00000000e570e010e5d0eeeeeeeeee0d0ee56770eeeeeeeeeeee070eeeeeeeee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0ddd50eeeeeeeeee11111eeeee00000000ee0700500d0eeeeeeeeeee010e56070eeeeeeeeeeee000e555555eee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0d00000eeeeeeeee111111eeeee00000000eee0705150eeeeeeeeeee05510d0e0eeeeeeeeeeee01505d666770ee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee41d090950eeeeeee0011111eeeee00000000eee0055150eeeeeeeeee0551100eeeeeeeeeeeeee05510d00007070e
eee000eeeeeeeeeeeeeee000eeeeeeeeeee441dd55550eeeeee05011111eeeee00000000ee05511d50eeeeee0ee05511700eeeeeeeeeeee00551100eeee0e0ee
ee0d50eeeeeeeeeeeeee0d50eeeeeeeeee4941dd11110eeeee0d5011111eeeee00000000005511dd50eeeeeed005511dd70eeeeeee0000055511700eeeeeeeee
e0d150000000eeeeeee01550000000eeee49a41555550eeee0d15000011eeeeee000000edd511dd50eeeeeee1dd511dd507555eee0ddddd5111dd7055555eeee
e050006ddd000eeeee05511000ddd000ee49aa400000eeeee055106ddd50eeee00776d501111dd50eeeeeeee01111dd50e07670eee0001111dd5007777670eee
e01070dd55070eeeee01551070555070eee4aa99992eeeeee01550dd5550eeee0d000000666dd50eeeeeeeee6666dd50eee0070eee06666dd500ee0006070eee
e050000000000eeeee05110000000000eeee499442eeeeeee05000000000eeee05000000066d505eeeeeeeee066d5005eeeee0eeeee0000000eeeeeee0e0eeee
e011066dd550eeeeee011066dd550eeeeeeee2222eeeeeeee011066dd550eeee00009090e0000e5eeeeeeeeee00005e5eeeeeeeeeeeeee5e5eeeeeeeeeeeeeee
ee010ddd5550eeeeee010ddd5550eeeeeeeeeeeeeeeeeeeeee010ddd5550eeee10000000eeee5e5eeeeeeeeeeeeee5e5eeeeeeeeeeeee5ee5eeeeeeeeeeeeeee
ee011011111eeeeeee011011111eeeeeeeeeeeeeeeeeeeeeee011011111eeeee10d55501eeee5e5eeeeeeeeeeeeee5e5eeeeeeeeeeee5ee5eeeeeeeeeeeeeeee
eee00000000eeeeeeee00000000eeeeeeeeeeeeeeeeeeeeeeee00000000eeeee10000001eeee5e5eeeeeeeeeeeeee5e5eeeeeeeeeee5ee5eeeeeeeeeeeeeeeee
__label__
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000066660000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
0000775555dd00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00075500001150000067760067760067760067760000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00750000000005000077760077760077760077760001100000000000000000000000000000000000000000000000000000000000000000000000000000000000
007d77777777150000d77d00d77d00d77d00d77d0015510000000000000000000000000000000000000000000000000000000000000000000000000000000000
06577777777761500077760077760077760077760055550000000000000000000000000000000000000000000000000000000000000000000000000000000000
06577777777761500006600006600006600006600005500000000000000000000000000000000000000000000000000000000000000000000000000000000000
06577777777661500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
065777777776d1500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00d17777776615000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00d1d777666515000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000d11666d1150000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
0000dd11115500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000055550000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001100100000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001101100000000000000000000000000000
00000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000011111110000000000000000000000000000
00000010000001000000000000000000000000000000000000000000000000000000000000000000000000100000011111111100000000000000000000000000
00000011000101000000000000000000000000000000000000000000000000000000000000000000000000110001011111111100000000000000000000000000
00000011001101000000000000000000000000000000000000000000000000000000000000000000000000110011011111111110000000000000000000000000
00000011101111000000010000000000000000000000000000000000000000000000000000000000000000111011111111111110000000000000000000000000
00000011111111100000010000000000000000000000000000000000000000000000000000000000000000111111111111111110000000000000000000000000
00000111111111110001010000000010000000000000000000000000000000000000000000000000000000111111111111111111001000000000000000000000
00001111111111110011010000000010000010000000000000000000000000000000000000000000000000111111111111111111011000000000000000000000
00001111111111111011110000000111000011000000000000000000000000000000000000000000000001111111111111111111111100000000000000000000
00001111111111111111111000000111000011000000000000000000000000000000000000000010000001111111111111111111111111000000000000000000
10011111111111111111111100010111100111000000000000000000000000000000000000000011000101111111111111111111111111000000000000000000
10111111111111111111111100110111101111000000000000000000000000000000000000000011001101111111111111111111111111000000000000000000
11111111111111111111111110111111111111000000010000000000000000000000000000000011101111111111111111111111111111000000000000000000
11111111111111111111111111111111111111100000010000000000000000000000000000000011111111111111111111111111111111000000000000000000
11111111111111111111111111111111111111110001010000000010000000000000001000000111111111111111111111111111111111000000000000000000
11111111111111111111111111111111111111110011010000000010001100000000001000001111111111111111111111111111111111000000000000000000
11111111111111111111111111111111111111111011110000000111001100000000011100001111111111111111111111111111111111000000000000000000
11111111111111111111111111111111111111111111111000000111011110100000011100001111111111111111111111111111111111000000000000000010
11111111111111111111111101111011111111111111111100010111111110110001011110011111111111111111111111111111111111100000010000000011
11111111111111111111111100110011111111111111111100110111111110110011011110111111111111111111111111111111111111100000110000000011
11111111111111111111111100000001111111111111111110111111111111111011111111111111111111111111111111111111111111110000110000000011
11111111111111111111111100000000111111111111111111111111111111111111111111111111111111111111111111111111111111110000110000000011
11111111111111111111111100000000111111111111111111111111111111111111111111111111111111111111111111111111111111111001111000000111
11111111111111111111111100000000111111111111111111111111111111111111111111111111111111111111111111111111111111111011111000001111
11111111111111111111111100000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100001111
11111111111111111111111100000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100001111
11111111111111111111111100000000111111111111111111111111111111110111101111111111111111111111111111111111111111111111111110011111
11111111111111111111111100000000111111111111111111111111111111110011001111111111111111111111111111111111111111111111111110111111
11111111111111111111111100000000111111111111111111111111111111110000000111111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111011110111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111001100111111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000011111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000011111111111111111111111111111111000000001111111111111111
11111111111111111111111100000000111111111111111111111111111111110000000111111111111111111111111111111111000000001111111111111111
111111111111111111111111000000001111111111111111111111111111111100000013b1b11111111111111111111111111111000000001111111111111111
1111111111111111111111110000000011111111111111111111111111111111000001bbabb10111111111111111111111111111000000001111111111111111
111111111111111111111110000000000111111111111111111111111111111000001b222b33b111111111111111111111111111000000001111111111111111
111111111111111111111100000000000011111111111111111111111111110000001b9092b33011111111111111111111111111000000001111111111111111
111111111111111111111100000000000011111111111111111111111111110000001b0002b53301111111111111111111111111000000001111111111111111
1111111111111111111100000000000000001111111111111111111111110000000013bbbb530001111111111111111111111111000000001111111111111111
11111111111111111111000000000000000011111111111111111111111100000000011111111111111111111111111111111111000000001111111111111111
11111111111111110000000000000000000000000000000000000000000000000000000000000000111111111111111111111111000000001111111111111111
111111111111111107d5511016dd511116dd51115511111016dd5111551111105511111011111550111111111111111111111111000000001111111111111111
11111111111111110000000000000000000000000000000000000000000000000000000000000000111111111111111111111111000000001111111111111111
11111111111111110011111000111100001111000011110000111100001111000011110000111100111111111111111111111111000000001111111111111111
11111111111111111100000000000000000000000000000000000000000000000000000000000000111111111111111111111111000700007011111111111111
111111111111111110d51001000000000000000000000000000000000000000000000000001011011111111111111111111111110007d0007011111111111111
11111111111111111051110000000000000000000000000000000000000000000000000000001100111101111111111111111111000777777011111111111111
11111111111111111101000000000000000000000000000000000000000000000000000001000000011001111111111111111111000711771011111111111111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111000700770011111111111111
07d551105511111016dd5111551111105511111016dd511116dd51115511111016dd511155111110551111101111155011111111000777777011111111111111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111001077771011111111111111
00111110001111000011110000111100001111000011110000111100001111000011110000111100001111000011110011111110001100000111111111111111
11000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111100000500001011111111111111
10d51001000000000000000000000000000000000000000000000000000000000000000000000000000000000010110111111100000dd1501011111111111111
10511100000000000000000000000000000000000000000000000000000000000000000000000000000000000000110111110000000d15010000111111111111
11010000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000111110000000150110000111111111111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000501100000000000000000
55111110551111105511111055111110551111105511111055111110551111105511111055111110551111105511111055111110550000005511111055111110
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00111100001111000011110000111100001111000011110000111100001111000011110000111100001111000011110000111100001111000011110000111100
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
01111000011110000111110000111100001111000011110000111100001111000001111000011110000111100001111000011110000111110000111100001111
11111101111111001111111011111110111111101111111001111111011111110111111101111111001111111011111110111111101100000001111111011111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010110000000000000
11010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000011111100000001101100001111111
01051100100000000000000000000000000000000000000000000000000000000000000000000000000000000000000010110111111110000055110101111111
01100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111110000001000010111111
00011111000011110000111110000111100001111100001111000001111000011110000011110000111100000111100001111100111111100011100000111111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111001066666101111
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011111111100060066600111
01111111111111111111101000000000000000000000000000000000000000000000000000000000010000000011001111111111111111111110006116661011
00111111111111111111101111000000000000000000000000000000000000000000000000000000000000110011111011111111111111111111100066666600
01111111111111111111100000000000000000000000000000000000000000000000000000000000000000000011111111111111111111111111000060000601
11111111111111111100111111000111110000111100000111100000111100000111100000111100000111100111111111111111111111111111000000000111
11111111111111110000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111110000000001111
11111111111111100000000000000000000000000000000000000000000000000000000000000000000000001111111111111111111111111110000000001111
11111111111111111111100000000000000000011111111111111111111111111100000000000111111111111111111111111111111111111111100000000011
11111111111111111111111000000000000000000111111111111111111111111111100000000013333331300001111111111111111111111111111000000000
00011111111111111111111111110000000000000011111111111111111111111111111111100000001300011313301111111111111111111111111111100000
00111111111111111111111111111000000000001111111111111111111111111111111111100000013111133333111111111111111111111111111111100000
11111111111111111111111111100000000001111111111111111111111111111111111111000000133443310111111111111111111111111111111110000000
11111111111111111111111100000000001111111111111111111111111111111111111100000001331311111111111111111111111111111111111000000000

__gff__
0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010101010000000000000000000000000000000000000000000000000000000000000101010101010100000000000000000001010103010101010001010000000000010101010100010101010101
0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
__map__
010c850e8900840e02640c920002640c920002640c920002640c9000047200640c840001728b00046000640c84000160850001728500046000640c8400016085000a6000006f00006000740c830002cc608500016085000460000d0c830009716070202122716070000000000060606060606060606060606060606060606060
8300057160700d0c830003545757835501578955060c00545557558e658455cc6585650166950e020d65847501769500030d65669900030d65668a00010385000147840001478300050d656630319700060d65555755569600020d65837501768600847383000273000000000060606060606060606060606060176060606060
738700030d7576890004545755568300025456830006737300000d0c8a0004746565768300027476830006545600000d0c8b00026466890006747600000d0c850003470000837302646683738a00020d0c8473840008545557656557555684008673060d555757550000000000606017196060606060606060171a2460606060
568400015486650156840004545557578355846501668400016486650166840001648b65843488658434a36502656a840e047865657b8365057a7879656a85000278698365067b00000d656a86000b786965656a00000d65777786000b787b657a00000d65697777000000000017181a1a17181960606060171a1a1a24606060
85000358656a8300270d595a6977775a0000587b657a00777759656a65657b6a00006d797a0000687b65797a6569696a87000978696565697a79797a8500086b0000787b7a797a8400021572850002586586000a15606015160015587b6585002625605877775a0000000000001a1a1a1a1a1a1a171917181a1a1a1a1a601718
6b696569303162160019587b65656a000078797b77775a6000006d6865697a84000b6865696a6014000078797a8300080a257859595a606b8700081572605865696a6087000415585959836515695a62151615721615587b655859595a65655a605883770560686900000000001a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a181a1a
7b6886650160846501608a65013484650134956504655a656a8b0e050d656a656a8b00050d7b7a656a8b00050d7a65656a8b00050d65657b7a8b00040d596b7a8c00050d656a24148b00070d656a002414168900070d656a00002460837701148500030d597a830000000000001a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a
05246865655a8500020d6a85000568595a6a5a8400020d6a850005787c7b6a7a8400020d6a86000368657a8500030d6a1684000c15687a0000202122000d7b5984000559595a15588359047777656a840f0468656559866586650166850e0164876586750176850000000000001a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a
01748775010c9200020d0c85000147850001478600050d151625148f00060d555755555689000654555557555584750176890001748575046600006383000554555755568300096300006465660000638300017483750d760000376238006465660000638500016300000000001a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a
84000b7d7e7f54656566003862cc8400016385000a6300747575667d7e7e7f8400016385000963000064656600006385000263cc84000963000074756600006385000262378400016383000564660000638400037d7e7f840001638300076466373862373883000100000000001a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a
638400083762cc000074667d837e017f8300016384000a7d7e7f00000d6600006385000163850001638300050d6600006385000163850001638300070d6600006330318300016383000d3738633837380d553434545756830001638300075455575557555585650100000000001a1a1a1a1a1a1a1a1a1a25141a1a1a1a1a1a1a
6683000163830001648c6587349b65010c91000364650c8e00060b000064650c91000364650c8d00015883590364650c8a0011ac0058657c656574750c005859597759598377135959657a00787979740c006d797c65657c7979837c017a8500020d0c840002787a00000000001a1a1a1a25141a1a25156060161a1a1a1a1a1a
8c00020d0c9200020d0c8f0005777759590c8e00065859657b650c8e00066d657b69650c8f00086d6954550c1415148d00037864658359027714860001cf86000664657b79797a8300027759837702597784000374756e8600076d79696579796e8500020d0c880000000000001a1a251560601415606060606015161a1a1a1a
02787a8800080d0c0016cf14251488000225168314070c0077775977778600031514548455070c15786965657a8500045859597484758359057865697777830f015886650254658365017a837c017a830e0c78796865657a00006465657a8a000368657a83000364000000000016256060606060606060606060606014151615
697a8b00026d7a840002647a9000043031646a850004585977778700045455557a8300097759596565777700cf8400047475755a8300116d7c7969656577775977595a585a64656a86000e787c7a7879797c797c686a64656a8b000b78696565787a64656a595a8a000000000060606060606060606060606060606060606060
00016d84650164836502695a8a0001788379016484650577597759778a000164856504695a656a8a0001648665036a657a840001cf850001588665087a65777759597759840001588665017a88650177830f0368656586650166850e01648d650166850001648d65000000000060606060606060606060606060606060606060
016685000164866501558565035555568400017487758565037575768b00010d866501668c00010d866501668c00010d8665036600478a00010d86650166850002545583578355866501668500016487658675017683000347006487658575017685000247648765000000000060606060606060606060606060606060606060
010c8b0001648765010c8b0001648765010c8b00016487650677775a003031860001648865067b6a55575556850001648765037b657a8365016685000164876502797a84650166850001648d650166850f0164876583659a7584650175840e01748975836501668d000000000060606060606060606060606060606060606060
000364653388000132846501668d000164836501668d000364653388000154846501668d00016483650266098c000864653300005455338300016484650666000020212288000164836501668d000874653300006465338300017484658455075755555755563383000000000060606060606060606060606060606060606060
0001648365835508560000545555343483000832757600006465568300033265658b75027633830003646575846504330000328365016688000364657683000132846501768500016387000364656484750833000032757565668800036465338300015483650176000000000060606060606060606060606060606060606060
86000163870003646566830001638600026466880003646533830004747575768600037d7e7f850004545565668300016386000664663434575684000364655695000474756566830001638600857501668434056465663031940003647576830001638600016384000000000000000000000000000000000000000000000000
00017485750165835501568c0001f8860002640c84000163830004d2000063840001638300026374847501768500025457845583578655010c840001638600016384000163830001638400016385000454555557875501578455010c8300017d887e017f83000163000000000000000000000000000000000000000000000000
8300016384000163840001549075035557568e0001638300016384000163870001648765096600080000646565668d00017d857e067f00007d7e7f8600016487650166840003646565835501569c0f017487750176840f0164a46587758765037575768500037475000000000000000000000000000000000000000000000000
7584650266428a000164836501668b000164836501768b000564656575768b00056465650c128b00046465650c84000c54555755560000536465655783550157855503575555d365f200025555880002555585000107a70005202122cf009055c065ab658f758e65000000000000000000000000000000000000000000000000
016683000142890001648e6501668d0001648e6501668d0001648e6501668d0001648b55836501668d0001648c75036565668d0006640c60000060860004646565668d0006640c6000006086000574756555568b000754550c6000006088000274768d0006640c60000000000000000000000000000000000000000000000000
000060890001028d00076471607071607095000253648555015688000a54555755555757555757855585650255568600015483550257578a558665025556840f01548b75856502656596758465016691000407000064846501669400016484650566000054558334000000000000000000000000000000000000000000000000
8455843486558365057576000074927583650166950001648365016695000164836501669500016483650166860001c0870001c085000154835502656694000174837503555556950005600d757576950003600d0c970003600d0c8b00056100d200618300016183000000000000000000000000000000000000000000000000
0003600d0c830001618300056100d20060837301608373066073737160708473016083730160837301548455015784550157845503575557865501578355a66583650169887901698565016a830e05686565697a876503787a788465016a8300077865696a65657b000000000000000000000000000000000000000000000000
877c067a696565696a8300095865657a657b79797a84650778797a6578797a83000968797a65697a007869836507697a00006d656a8400056865657b7a83000178847984000368695a8300066865696a0042840002787a85000b78656a000054556565695a8d0002000000000000000000000000000000000000000000000000
687a83000158835501568c000b54555600005869657575768c000b74757600007879661300028d000102840002786683000b711615167216721416005388000d66000054555677595977775959837702545783550957556600006465666889650164876508575565000000000000000027272627272726272727262727272627
65587b595a876505646558595a866502587b8365015a8465015883590569657b5a65d00001068f000215168e000377775a8d000365656a8d000365656a8d000365657a8d0004797a655a8c008365016a8c008365016a8c008365016a8c00045a65656a8c0fa86501000000000000000000003600000036000000360000003600
668b35886501668b000132876501668b000132876501668b000132876507555600545557568500057475753535837507656600646565338c00080d657600746565338c00090d65330032656533008334840006343400000d6683000d646533006475660054555764000000000000000000003600000036000000360000003600
