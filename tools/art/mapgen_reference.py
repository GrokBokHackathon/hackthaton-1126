"""Flag Raid reference map generator (seeded). Placeholder art, rules per sprite-spec.md 'Procedural map rules'.
usage: python3 mapgen_reference.py [seed ...]   (default: 1 2)"""
import random, json, sys, heapq
from collections import deque
from PIL import Image, ImageDraw
W,H=64,40
# tile kinds
GRASS,PATH,WALL,WATER,BRIDGE,BUSH,TALL,FLOWER,ROCK_S,ROCK_B,TREE,DESK,PIZZA,KEG,RACK,MUD,CRATE,PEB,SIGN,CABLE=range(20)
BLOCK={WALL,WATER,ROCK_S,ROCK_B,TREE,DESK,PIZZA,KEG,RACK,CRATE}
NEI=[(0,-1,1),(1,0,2),(0,1,4),(-1,0,8)]
def mirror(x,y):return W-1-x,H-1-y
class Map:
  def __init__(s,seed):
    s.r=random.Random(seed);s.t=[[GRASS]*W for _ in range(H)];s.tree_root=set();s.lock=set()
    s.red=(4,4);s.bot=mirror(*s.red);s.flags=[]
  def ok(s,x,y):return 1<=x<W-1 and 1<=y<H-1
  def set(s,x,y,k,force=False):
    """set a tile and its 180-degree mirror (symmetry)"""
    for (a,b) in {(x,y),mirror(x,y)}:
      if s.ok(a,b) and (force or (a,b) not in s.lock):s.t[b][a]=k
  def near_base(s,x,y,r):return any(abs(x-bx)<=r and abs(y-by)<=r for bx,by in (s.red,s.bot))
  # ---- noise-bent A*, no straight run > 5 ----
  def astar(s,a,b,noise,avoid=(),d0=-1,r0=0):
    start=(a,d0,r0);pq=[(0,0,start)];g={start:0};prev={}
    while pq:
      _,c,st=heapq.heappop(pq);(x,y),dr,run=st
      if (x,y)==b:
        out=[]
        while st in prev:out.append(st[0]);st=prev[st]
        return [a]+out[::-1]
      if c>g.get(st,1e9):continue
      for di,(dx,dy,_) in enumerate(NEI):
        nx,ny=x+dx,y+dy
        if not(2<=nx<W-2 and 2<=ny<H-2):continue
        nr=run+1 if di==dr else 1
        if nr>4:continue  # 4 moves = 5 tiles max
        k=s.t[ny][nx];cost=1+noise[ny][nx]+(30 if k in BLOCK and k!=WATER else 0)+(12 if k==WATER else 0)+(20 if (nx,ny) in avoid else 0)
        ns=((nx,ny),di,nr);nc=c+cost
        if nc<g.get(ns,1e9):
          g[ns]=nc;prev[ns]=st;heapq.heappush(pq,(nc+abs(nx-b[0])+abs(ny-b[1]),nc,ns))
    return []
  def noise(s,amp):
    n=[[s.r.random()*amp for _ in range(W)] for _ in range(H)]
    for _ in range(2):n=[[sum(n[min(H-1,max(0,y+j))][min(W-1,max(0,x+i))] for i in (-1,0,1) for j in (-1,0,1))/9 for x in range(W)] for y in range(H)]
    return [[v*3 for v in row] for row in n]
  def wiggle(s,a,b,n=3,spread=6):
    """random-walk waypoints between a and b, each joined by noisy A*"""
    pts=[a]
    for i in range(1,n+1):
      t=i/(n+1);pts.append((int(a[0]+(b[0]-a[0])*t+s.r.randint(-spread,spread)),int(a[1]+(b[1]-a[1])*t+s.r.randint(-spread,spread))))
    pts=[(min(W-4,max(3,x)),min(H-4,max(3,y))) for x,y in pts]+[b];path=[]
    d0,r0=-1,0
    for p,q in zip(pts,pts[1:]):
      seg=s.astar(p,q,s.noise(6),d0=d0,r0=r0)
      if not seg:continue
      full=path+seg;path=full[:-1]
      # recompute trailing direction/run so the next segment respects the 5-tile cap
      d0,r0=-1,0
      for u,v in zip(full,full[1:]):
        di=[(dx,dy) for dx,dy,_ in NEI].index((v[0]-u[0],v[1]-u[1])) if abs(v[0]-u[0])+abs(v[1]-u[1])==1 else -1
        r0=r0+1 if di==d0 else 1;d0=di
    return path+[b]
  def build(s):
    r=s.r;cx,cy=W//2,H//2
    # 1 pond + stream (water route); mirrored
    px,py=r.randint(16,22),r.randint(26,31)
    for y in range(py-3,py+4):
      for x in range(px-4,px+5):
        if ((x-px)/4.3)**2+((y-py)/3.2)**2<1+r.random()*0.25:s.set(x,y,WATER)
    sx,sy=px+4,py   # stream wanders east/north toward the middle, 1 wide
    for _ in range(14):
      s.set(sx,sy,WATER);sx+=1
      if r.random()<0.4:sy+=r.choice((-1,1));s.set(sx-1,sy,WATER)
    # 2 objectives: centre + 2 side camps (hackathon props)
    camp=(r.randint(26,30),r.randint(6,9));camp2=mirror(*camp)
    s.objs=[(cx,cy),camp,(px+2,py-5)]
    # 3 routes from red base (mirror completes the other half)
    s.paths=[]
    s.paths.append(s.wiggle((s.red[0]+3,s.red[1]),(W-6,5),4,4))          # long safe: top lane to far corner
    s.paths.append(s.wiggle((s.red[0]+2,s.red[1]+2),(cx,cy),3,5))         # short risky: through the middle
    s.paths.append(s.wiggle((s.red[0],s.red[1]+3),(sx-6,min(H-4,sy+5)),3,4))  # water route: crosses stream/pond edge
    s.paths.append(s.wiggle((cx,cy),camp,2,3))                               # side objective spur
    for p in s.paths:
      for x,y in p:
        k=s.t[y][x]
        s.set(x,y,BRIDGE if k in (WATER,BRIDGE) else PATH)
    # bridges only on 1-wide crossings: widen-check -> if a bridge has water on both path-perpendicular sides, keep; else turn that cell into path + fill
    for y in range(H):
      for x in range(W):
        if s.t[y][x]==BRIDGE:
          h=s.t[y][x-1] in (WATER,) and s.t[y][x+1] in (WATER,);v=s.t[y-1][x]==WATER and s.t[y+1][x]==WATER
          if not(h or v) and not any(s.t[y+dy][x+dx] in (PATH,BRIDGE) and s.t[y-dy][x-dx] in (PATH,BRIDGE) for dx,dy,_ in NEI[:2]):pass
    for x,y in [p for path in s.paths for p in path]:s.lock|={(x,y),mirror(x,y)}
    # mud on the risky route near the centre
    for x,y in s.paths[1][-8:-2:2]:s.set(x,y,MUD,True)
    # 3 base clear zones (5x5) + border
    for bx,by in (s.red,s.bot):
      for y in range(by-2,by+3):
        for x in range(bx-2,bx+3):s.t[y][x]=GRASS;s.lock.add((x,y))
    # 4 hedge maze (bushes, walkable) near centre: DFS maze 4x3 cells
    mx,my=cx-12,cy-6
    cells=[(i,j) for i in range(4) for j in range(3)];seen={(0,0)};st=[(0,0)];open_=set()
    for i in range(9):
      for j in range(7):s.set(mx+i,my+j,BUSH)
    while st:
      i,j=st[-1];nb=[(i+a,j+b) for a,b in ((1,0),(-1,0),(0,1),(0,-1)) if (i+a,j+b) in cells and (i+a,j+b) not in seen]
      if not nb:st.pop();continue
      n=r.choice(nb);seen.add(n);st.append(n);open_|={(1+2*i,1+2*j),(1+2*n[0],1+2*n[1]),(1+i+n[0],1+j+n[1])}
    for i,j in open_|{(0,1),(8,5)}:s.set(mx+i,my+j,GRASS)
    # 5 hackathon camp clusters
    for (ox,oy) in [camp]:
      for k,(dx,dy) in zip([DESK,DESK,RACK,KEG,PIZZA,CRATE,SIGN,CABLE,CABLE],[(-2,-1),(-1,-1),(2,-1),(2,1),(-2,1),(3,0),(0,2),(1,-2),(-1,2)]):
        if s.t[oy+dy][ox+dx]==GRASS:s.set(ox+dx,oy+dy,k)
    # 6 clusters: trees (2x2), rocks, tall grass, flowers, walls, crates
    def cluster(kind,n,size,spread=2):
      for _ in range(n):
        x0,y0=r.randint(3,W-4),r.randint(3,H//2+6)
        for _ in range(size):
          x,y=x0+r.randint(-spread,spread),y0+r.randint(-spread,spread)
          if not s.ok(x,y) or s.t[y][x]!=GRASS or (x,y) in s.lock:continue
          if kind==TREE:
            if s.near_base(x,y,5) or any(not s.ok(x+a,y+b) or s.t[y+b][x+a]!=GRASS or (x+a,y+b) in s.lock or (W-1-x-a,H-1-y-b) in s.lock for a in (0,1) for b in (0,1)):continue
            if abs(x-(W-2-x))<3 and abs(y-(H-2-y))<3:continue
            for a in (0,1):
              for b in (0,1):s.set(x+a,y+b,TREE)
            s.tree_root|={(x,y),(W-2-x,H-2-y)}
          else:s.set(x,y,kind)
    cluster(TREE,9,5,3);cluster(ROCK_B,6,3);cluster(ROCK_S,10,3);cluster(TALL,10,7);cluster(FLOWER,8,5);cluster(CRATE,5,2,1)
    cluster(PEB,14,2);cluster(SIGN,2,1,0);cluster(CABLE,4,2,1)
    # wall segments until blocking density 25-35%
    tries=0
    while s.density()<0.27 and tries<400:
      tries+=1;x,y=r.randint(3,W-4),r.randint(3,H-4);dx,dy=r.choice([(1,0),(0,1)]);L=r.randint(3,6)
      seg=[(x+dx*i,y+dy*i) for i in range(L)]
      if r.random()<0.5:seg+=[(seg[-1][0]+dy*j,seg[-1][1]+dx*j) for j in range(1,3)]   # L-shape
      if all(s.ok(a,b) and s.t[b][a] in (GRASS,PEB,TALL,FLOWER) and (a,b) not in s.lock and not s.near_base(a,b,3) for a,b in seg):
        for a,b in seg:s.set(a,b,WALL)
        if not s.connected():
          for a,b in seg:s.set(a,b,GRASS)
    for x in range(W):s.t[0][x]=s.t[H-1][x]=WALL
    for y in range(H):s.t[y][0]=s.t[y][W-1]=WALL
    s.flags=[(s.red[0],s.red[1]),(s.bot[0],s.bot[1])]
  def density(s):return sum(s.t[y][x] in BLOCK for y in range(1,H-1) for x in range(1,W-1))/((W-2)*(H-2))
  def connected(s):
    """flood fill from red base; every walkable tile + bot base + objectives reachable"""
    q=deque([s.red]);seen={s.red}
    while q:
      x,y=q.popleft()
      for dx,dy,_ in NEI:
        n=(x+dx,y+dy)
        if s.ok(*n) and n not in seen and s.t[n[1]][n[0]] not in BLOCK:seen.add(n);q.append(n)
    walk=sum(s.t[y][x] not in BLOCK for y in range(1,H-1) for x in range(1,W-1))
    s.reach=len(seen)/max(1,walk)
    return s.bot in seen and s.reach>0.97
  def longest_straight(s):
    best=0
    for p in s.paths:
      run=1
      for a,b,c in zip(p,p[1:],p[2:]):
        run=run+1 if (b[0]-a[0],b[1]-a[1])==(c[0]-b[0],c[1]-b[1]) else 1;best=max(best,run+1)
    return best
# ---------------- render ----------------
A=json.load(open("atlas.json"))
IM={k:Image.open(f).convert("RGBA") for k,f in [("tiles","tiles_placeholder.png"),("tiles2","tiles2_placeholder.png"),("fx","fx_props_placeholder.png"),("ui_orders","ui_orders_placeholder.png"),("fx_command","fx_command_placeholder.png"),("powerups","powerups_placeholder.png")]}
CH={t:Image.open("char_%s_sheet_placeholder.png"%t).convert("RGBA") for t in ("red","bot")}
def fr(sheet,n,img=None):
  f=A[sheet]["frames"][n];im=img or IM[sheet];return im.crop((f["x"],f["y"],f["x"]+f["w"],f["y"]+f["h"]))
SIMPLE={GRASS:None,BUSH:"bush",TALL:"tall_grass",FLOWER:"flowers",ROCK_S:"rock_small",ROCK_B:"rock_big",DESK:"laptop_desk",PIZZA:"pizza_box",KEG:"beer_keg",RACK:"server_rack",MUD:"mud",CRATE:"crate_beer",PEB:"pebbles",SIGN:"sign",CABLE:"cable"}
def render(m):
  t=m.t;img=Image.new("RGBA",(W*32,H*32))
  def mask(x,y,ks):return sum(b for dx,dy,b in NEI if 0<=x+dx<W and 0<=y+dy<H and t[y+dy][x+dx] in ks)
  for y in range(H):
    for x in range(W):
      img.paste(fr("tiles","grass_a" if (x*7+y*3)%5 else "grass_b"),(x*32,y*32))
  for y in range(H):
    for x in range(W):
      k=t[y][x];P=(x*32,y*32)
      if k==PATH:img.alpha_composite(fr("tiles2","path_%02d"%mask(x,y,(PATH,BRIDGE,MUD))),P)
      elif k==WATER:img.alpha_composite(fr("tiles2","water_%02d"%mask(x,y,(WATER,BRIDGE))),P)
      elif k==BRIDGE:img.alpha_composite(fr("tiles2","bridge_h" if t[y][x-1] in (PATH,BRIDGE,MUD) or t[y][x+1] in (PATH,BRIDGE,MUD) else "bridge_v"),P)
      elif k==WALL:img.alpha_composite(fr("tiles","wall_%02d"%mask(x,y,(WALL,))),P)
      elif k==MUD:img.alpha_composite(fr("tiles2","path_%02d"%mask(x,y,(PATH,BRIDGE,MUD))),P);img.alpha_composite(fr("tiles2","mud"),P)
      elif k in SIMPLE and SIMPLE[k]:
        sh="tiles" if SIMPLE[k] in ("bush","crate_beer") else "tiles2";img.alpha_composite(fr(sh,SIMPLE[k]),P)
  for x,y in sorted(m.tree_root,key=lambda p:p[1]):img.alpha_composite(fr("tiles2","tree"),(x*32,y*32))
  for (bx,by),tm in ((m.red,"red"),(m.bot,"bot")):img.alpha_composite(fr("tiles","base_"+tm),(bx*32-16,by*32-16))
  img.alpha_composite(fr("fx","flag_red_0"),(m.red[0]*32,m.red[1]*32-8));img.alpha_composite(fr("fx","flag_bot_1"),(m.bot[0]*32,m.bot[1]*32-8))
  return img
def snap(im):
  pal=[tuple(int(l[i:i+2],16) for i in (0,2,4)) for l in open("palette.hex").read().split()]
  px=im.load();cache={}
  for y in range(im.height):
    for x in range(im.width):
      c=px[x,y]
      if c[3]==255:
        if c not in cache:cache[c]=min(pal,key=lambda p:sum((a-b)**2 for a,b in zip(c[:3],p)))+(255,)
        px[x,y]=cache[c]
  return im
def crop_preview(m,img):
  cx,cy=W//2-10,H//2-6;sub=img.crop((cx*32,cy*32,(cx+20)*32,(cy+12)*32)).copy()
  walk=[(x,y) for y in range(cy+1,cy+11) for x in range(cx+1,cx+19) if m.t[y][x] in (PATH,GRASS,MUD,TALL,PEB)]
  r=random.Random(7);r.shuffle(walk);pick=walk[:9]
  units=[("red","char_right_run1","rally"),("red","char_down_idle","defend"),("red","char_left_run2","attack"),("red","char_dizzy_1",None),
         ("bot","char_left_run2","attack"),("bot","char_up_idle","scout"),("bot","char_carry_0","escort"),("bot","char_down_idle","tag")]
  for (tm,n,b),(x,y) in zip(units,pick):
    X,Y=(x-cx)*32,(y-cy)*32;sub.alpha_composite(fr("char",n,CH[tm]),(X,Y))
    if b:sub.alpha_composite(fr("ui_orders","badge_"+b),(X+8,Y-12))
    if n=="char_carry_0":sub.alpha_composite(fr("fx","flag_carried_indicator"),(X+8,Y-26))
  x,y=pick[8];sub.alpha_composite(fr("powerups","pu_speed_0"),((x-cx)*32,(y-cy)*32))
  return snap(sub.resize((sub.width*2,sub.height*2),Image.NEAREST))
if __name__=="__main__":
  seeds=[int(a) for a in sys.argv[1:]] or [1,2]
  for sd in seeds:
    m=Map(sd);m.build();m.connected()
    img=render(m)
    print("seed %d: blocking %.1f%%, reachable %.1f%%, bases connected %s, longest straight path run %d"%(sd,m.density()*100,m.reach*100,m.connected(),m.longest_straight()))
    half=snap(img.resize((W*16,H*16),Image.NEAREST));half.save("preview_map_seed%d.png"%sd)
    if sd==seeds[0]:
      snap(img).save("preview_map_full.png");crop_preview(m,img).save("preview_x2.png")
